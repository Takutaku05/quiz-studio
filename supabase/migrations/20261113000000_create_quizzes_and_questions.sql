-- CSV Quiz Studio: quizzes / questions with owner-only RLS

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  created_at timestamptz not null default now()
);

create index quizzes_user_id_created_at_idx on public.quizzes (user_id, created_at desc);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  order_index integer not null,
  question text not null,
  choice1 text not null,
  choice2 text not null,
  choice3 text,
  choice4 text,
  answer smallint not null check (answer between 1 and 4),
  explanation text,
  unique (quiz_id, order_index)
);

alter table public.quizzes enable row level security;
alter table public.questions enable row level security;

create policy "quizzes_select_own" on public.quizzes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "quizzes_insert_own" on public.quizzes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "quizzes_delete_own" on public.quizzes
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "questions_select_own" on public.questions
  for select to authenticated using (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id and q.user_id = (select auth.uid())
    )
  );
create policy "questions_insert_own" on public.questions
  for insert to authenticated with check (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id and q.user_id = (select auth.uid())
    )
  );

-- Create a quiz and all its questions in one transaction.
-- security invoker: RLS policies above still apply to the caller.
create or replace function public.create_quiz_with_questions(p_title text, p_questions jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quiz_id uuid;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception '問題が1問も含まれていません。';
  end if;

  insert into public.quizzes (title, user_id)
  values (btrim(p_title), auth.uid())
  returning id into v_quiz_id;

  insert into public.questions
    (quiz_id, order_index, question, choice1, choice2, choice3, choice4, answer, explanation)
  select
    v_quiz_id,
    (e.ordinality - 1)::integer,
    e.value ->> 'question',
    e.value ->> 'choice1',
    e.value ->> 'choice2',
    e.value ->> 'choice3',
    e.value ->> 'choice4',
    (e.value ->> 'answer')::smallint,
    e.value ->> 'explanation'
  from jsonb_array_elements(p_questions) with ordinality as e(value, ordinality);

  return v_quiz_id;
end;
$$;

revoke execute on function public.create_quiz_with_questions(text, jsonb) from public, anon;
grant execute on function public.create_quiz_with_questions(text, jsonb) to authenticated;
