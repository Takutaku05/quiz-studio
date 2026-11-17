-- CSV Quiz Studio: quiz sharing via share URL / QR code and copy-on-import

create table public.quiz_shares (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null unique references public.quizzes (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quiz_shares_token_idx on public.quiz_shares (token);

create table public.quiz_share_imports (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.quiz_shares (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  imported_quiz_id uuid references public.quizzes (id) on delete set null,
  imported_at timestamptz not null default now(),
  unique (share_id, recipient_user_id)
);

alter table public.quiz_shares enable row level security;
alter table public.quiz_share_imports enable row level security;

create policy "quiz_shares_select_own" on public.quiz_shares
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "quiz_shares_insert_own" on public.quiz_shares
  for insert to authenticated with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_shares.quiz_id and q.user_id = (select auth.uid())
    )
  );

create policy "quiz_shares_update_own" on public.quiz_shares
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_shares.quiz_id and q.user_id = (select auth.uid())
    )
  );

create policy "quiz_shares_delete_own" on public.quiz_shares
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "quiz_share_imports_select_own" on public.quiz_share_imports
  for select to authenticated using ((select auth.uid()) = recipient_user_id);

create or replace function public.quiz_share_to_jsonb(p_row public.quiz_shares)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'quizId', p_row.quiz_id,
    'token', p_row.token,
    'isActive', p_row.is_active,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
$$;

create or replace function public.enable_quiz_share(p_quiz_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.quiz_shares%rowtype;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and q.user_id = v_user_id
  ) then
    raise exception '問題集が見つかりません。';
  end if;

  insert into public.quiz_shares (quiz_id, owner_id, is_active, updated_at)
  values (p_quiz_id, v_user_id, true, now())
  on conflict (quiz_id) do update
    set is_active = true,
        updated_at = now()
  returning * into v_share;

  return public.quiz_share_to_jsonb(v_share);
end;
$$;

create or replace function public.disable_quiz_share(p_quiz_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.quiz_shares%rowtype;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  update public.quiz_shares s
  set is_active = false,
      updated_at = now()
  where s.quiz_id = p_quiz_id
    and s.owner_id = v_user_id
  returning * into v_share;

  if not found then
    raise exception '共有設定が見つかりません。';
  end if;

  return public.quiz_share_to_jsonb(v_share);
end;
$$;

create or replace function public.regenerate_quiz_share(p_quiz_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.quiz_shares%rowtype;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and q.user_id = v_user_id
  ) then
    raise exception '問題集が見つかりません。';
  end if;

  insert into public.quiz_shares (quiz_id, owner_id, token, is_active, updated_at)
  values (p_quiz_id, v_user_id, replace(gen_random_uuid()::text, '-', ''), true, now())
  on conflict (quiz_id) do update
    set token = replace(gen_random_uuid()::text, '-', ''),
        is_active = true,
        updated_at = now()
  returning * into v_share;

  return public.quiz_share_to_jsonb(v_share);
end;
$$;

-- Return only non-sensitive preview metadata (title & question count) for active links.
create or replace function public.get_shared_quiz_summary(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean_token text := btrim(coalesce(p_token, ''));
  v_result jsonb;
begin
  if v_clean_token = '' then
    return null;
  end if;

  select jsonb_build_object(
    'title', q.title,
    'questionCount', (select count(*)::integer from public.questions qs where qs.quiz_id = q.id)
  )
  into v_result
  from public.quiz_shares s
  join public.quizzes q on q.id = s.quiz_id
  where s.token = v_clean_token
    and s.is_active = true
  limit 1;

  return v_result;
end;
$$;

-- Clone a shared quiz into the authenticated caller's account.
create or replace function public.import_shared_quiz(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_clean_token text := btrim(coalesce(p_token, ''));
  v_share public.quiz_shares%rowtype;
  v_source_quiz public.quizzes%rowtype;
  v_question_count integer;
  v_existing_quiz public.quizzes%rowtype;
  v_new_quiz_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  if v_clean_token = '' then
    raise exception '共有リンクが見つからないか、共有が停止されています。';
  end if;

  select *
  into v_share
  from public.quiz_shares s
  where s.token = v_clean_token
    and s.is_active = true
  limit 1;

  if not found then
    raise exception '共有リンクが見つからないか、共有が停止されています。';
  end if;

  select *
  into v_source_quiz
  from public.quizzes q
  where q.id = v_share.quiz_id;

  if not found then
    raise exception '共有元の問題集が見つかりません。';
  end if;

  select count(*)::integer
  into v_question_count
  from public.questions qs
  where qs.quiz_id = v_source_quiz.id;

  if v_source_quiz.user_id = v_user_id then
    return jsonb_build_object(
      'quizId', v_source_quiz.id,
      'title', v_source_quiz.title,
      'questionCount', v_question_count,
      'status', 'own_quiz'
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_share.id::text), hashtext(v_user_id::text));

  select q.*
  into v_existing_quiz
  from public.quiz_share_imports i
  join public.quizzes q on q.id = i.imported_quiz_id
  where i.share_id = v_share.id
    and i.recipient_user_id = v_user_id
    and q.user_id = v_user_id
  limit 1;

  if found then
    return jsonb_build_object(
      'quizId', v_existing_quiz.id,
      'title', v_existing_quiz.title,
      'questionCount', (select count(*)::integer from public.questions qs where qs.quiz_id = v_existing_quiz.id),
      'status', 'already_imported'
    );
  end if;

  if v_question_count = 0 then
    raise exception '問題が1問も含まれていないためインポートできません。';
  end if;

  insert into public.quizzes (title, user_id)
  values (v_source_quiz.title, v_user_id)
  returning id into v_new_quiz_id;

  insert into public.questions
    (quiz_id, order_index, question, choice1, choice2, choice3, choice4, answer, explanation)
  select
    v_new_quiz_id,
    qs.order_index,
    qs.question,
    qs.choice1,
    qs.choice2,
    qs.choice3,
    qs.choice4,
    qs.answer,
    qs.explanation
  from public.questions qs
  where qs.quiz_id = v_source_quiz.id
  order by qs.order_index;

  insert into public.quiz_share_imports (share_id, recipient_user_id, imported_quiz_id, imported_at)
  values (v_share.id, v_user_id, v_new_quiz_id, now())
  on conflict (share_id, recipient_user_id) do update
    set imported_quiz_id = excluded.imported_quiz_id,
        imported_at = excluded.imported_at;

  return jsonb_build_object(
    'quizId', v_new_quiz_id,
    'title', v_source_quiz.title,
    'questionCount', v_question_count,
    'status', 'imported'
  );
end;
$$;

revoke execute on function public.quiz_share_to_jsonb(public.quiz_shares) from public, anon;
grant execute on function public.quiz_share_to_jsonb(public.quiz_shares) to authenticated;

revoke execute on function public.enable_quiz_share(uuid) from public, anon;
grant execute on function public.enable_quiz_share(uuid) to authenticated;

revoke execute on function public.disable_quiz_share(uuid) from public, anon;
grant execute on function public.disable_quiz_share(uuid) to authenticated;

revoke execute on function public.regenerate_quiz_share(uuid) from public, anon;
grant execute on function public.regenerate_quiz_share(uuid) to authenticated;

revoke execute on function public.get_shared_quiz_summary(text) from public;
grant execute on function public.get_shared_quiz_summary(text) to anon, authenticated;

revoke execute on function public.import_shared_quiz(text) from public, anon;
grant execute on function public.import_shared_quiz(text) to authenticated;
