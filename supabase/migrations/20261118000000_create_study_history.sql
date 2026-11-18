-- CSV Quiz Studio: per-question cumulative stats and one in-progress session per quiz
-- See docs/requirements-review-and-resume.md (4. データベース設計)

create table public.question_stats (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  attempts_count integer not null default 0 check (attempts_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0 and correct_count <= attempts_count),
  last_is_correct boolean not null,
  last_answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index question_stats_user_quiz_idx on public.question_stats (user_id, quiz_id);
create index question_stats_quiz_id_idx on public.question_stats (quiz_id);

create table public.quiz_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  mode text not null check (mode in ('one_by_one', 'test')),
  target_filter text not null default 'all'
    check (target_filter in ('all', 'recent_wrong', 'low_accuracy', 'retry_wrong')),
  shuffle_questions boolean not null default false,
  shuffle_choices boolean not null default false,
  question_ids jsonb not null check (jsonb_typeof(question_ids) = 'array'),
  choices_order jsonb not null check (jsonb_typeof(choices_order) = 'object'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  current_index integer not null default 0 check (current_index >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, quiz_id)
);

create index quiz_sessions_quiz_id_idx on public.quiz_sessions (quiz_id);

alter table public.question_stats enable row level security;
alter table public.quiz_sessions enable row level security;

-- question_stats: owner only. Writes must target a question that belongs to the
-- given quiz, and that quiz must be the caller's own (FK checks bypass RLS).
create policy "question_stats_select_own" on public.question_stats
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "question_stats_insert_own" on public.question_stats
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.questions qs
      join public.quizzes qz on qz.id = qs.quiz_id
      where qs.id = question_stats.question_id
        and qs.quiz_id = question_stats.quiz_id
        and qz.user_id = (select auth.uid())
    )
  );
create policy "question_stats_update_own" on public.question_stats
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.questions qs
      join public.quizzes qz on qz.id = qs.quiz_id
      where qs.id = question_stats.question_id
        and qs.quiz_id = question_stats.quiz_id
        and qz.user_id = (select auth.uid())
    )
  );
create policy "question_stats_delete_own" on public.question_stats
  for delete to authenticated using ((select auth.uid()) = user_id);

-- quiz_sessions: owner only, and only for the caller's own quizzes.
create policy "quiz_sessions_select_own" on public.quiz_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "quiz_sessions_insert_own" on public.quiz_sessions
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quizzes qz
      where qz.id = quiz_sessions.quiz_id and qz.user_id = (select auth.uid())
    )
  );
create policy "quiz_sessions_update_own" on public.quiz_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.quizzes qz
      where qz.id = quiz_sessions.quiz_id and qz.user_id = (select auth.uid())
    )
  );
create policy "quiz_sessions_delete_own" on public.quiz_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Add one answer to the cumulative stats in a single statement.
-- security invoker: the RLS policies above apply to the caller.
create or replace function public.record_question_answer(
  p_quiz_id uuid,
  p_question_id uuid,
  p_is_correct boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.question_stats as s
    (user_id, quiz_id, question_id, attempts_count, correct_count, last_is_correct, last_answered_at)
  values
    (auth.uid(), p_quiz_id, p_question_id, 1, case when p_is_correct then 1 else 0 end, p_is_correct, now())
  on conflict (user_id, question_id) do update set
    attempts_count = s.attempts_count + 1,
    correct_count = s.correct_count + excluded.correct_count,
    last_is_correct = excluded.last_is_correct,
    last_answered_at = excluded.last_answered_at;
$$;

revoke execute on function public.record_question_answer(uuid, uuid, boolean) from public, anon;
grant execute on function public.record_question_answer(uuid, uuid, boolean) to authenticated;
