import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnswerNumber,
  QuestionStat,
  QuizMode,
  QuizSession,
  ReviewFilter,
  SaveQuizSessionInput,
} from '../domain/types';
import type { RecordAnswerInput, StudyRepository } from './types';

interface QuestionStatRow {
  quiz_id: string;
  question_id: string;
  attempts_count: number;
  correct_count: number;
  last_is_correct: boolean;
  last_answered_at: string;
}

interface QuizSessionRow {
  quiz_id: string;
  mode: QuizMode;
  target_filter: ReviewFilter;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  question_ids: string[];
  choices_order: Record<string, AnswerNumber[]>;
  answers: Record<string, AnswerNumber>;
  current_index: number;
  updated_at: string;
}

const STAT_COLUMNS =
  'quiz_id, question_id, attempts_count, correct_count, last_is_correct, last_answered_at';
const SESSION_COLUMNS =
  'quiz_id, mode, target_filter, shuffle_questions, shuffle_choices, question_ids, choices_order, answers, current_index, updated_at';

/** Postgres "invalid_text_representation" — e.g. a malformed UUID in the URL. */
const INVALID_TEXT_REPRESENTATION = '22P02';

function toQuestionStat(row: QuestionStatRow): QuestionStat {
  return {
    quizId: row.quiz_id,
    questionId: row.question_id,
    attemptsCount: row.attempts_count,
    correctCount: row.correct_count,
    lastIsCorrect: row.last_is_correct,
    lastAnsweredAt: row.last_answered_at,
  };
}

function toQuizSession(row: QuizSessionRow): QuizSession {
  return {
    quizId: row.quiz_id,
    mode: row.mode,
    targetFilter: row.target_filter,
    shuffleQuestions: row.shuffle_questions,
    shuffleChoices: row.shuffle_choices,
    questionIds: row.question_ids,
    choicesOrder: row.choices_order,
    answers: row.answers ?? {},
    currentIndex: row.current_index,
    updatedAt: row.updated_at,
  };
}

export class SupabaseStudyRepository implements StudyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async recordAnswer(_userId: string, input: RecordAnswerInput): Promise<void> {
    const { error } = await this.client.rpc('record_question_answer', {
      p_quiz_id: input.quizId,
      p_question_id: input.questionId,
      p_is_correct: input.isCorrect,
    });
    if (error) throw new Error(error.message);
  }

  async listStats(userId: string, quizId?: string): Promise<QuestionStat[]> {
    let query = this.client.from('question_stats').select(STAT_COLUMNS).eq('user_id', userId);
    if (quizId !== undefined) {
      query = query.eq('quiz_id', quizId);
    }
    const { data, error } = await query;
    if (error) {
      if (error.code === INVALID_TEXT_REPRESENTATION) return [];
      throw new Error(error.message);
    }
    return ((data ?? []) as QuestionStatRow[]).map(toQuestionStat);
  }

  async getSession(userId: string, quizId: string): Promise<QuizSession | null> {
    const { data, error } = await this.client
      .from('quiz_sessions')
      .select(SESSION_COLUMNS)
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .maybeSingle();
    if (error) {
      if (error.code === INVALID_TEXT_REPRESENTATION) return null;
      throw new Error(error.message);
    }
    return data ? toQuizSession(data as QuizSessionRow) : null;
  }

  async listSessions(userId: string): Promise<QuizSession[]> {
    const { data, error } = await this.client
      .from('quiz_sessions')
      .select(SESSION_COLUMNS)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as QuizSessionRow[]).map(toQuizSession);
  }

  async saveSession(userId: string, session: SaveQuizSessionInput): Promise<void> {
    const { error } = await this.client.from('quiz_sessions').upsert(
      {
        user_id: userId,
        quiz_id: session.quizId,
        mode: session.mode,
        target_filter: session.targetFilter,
        shuffle_questions: session.shuffleQuestions,
        shuffle_choices: session.shuffleChoices,
        question_ids: session.questionIds,
        choices_order: session.choicesOrder,
        answers: session.answers,
        current_index: session.currentIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,quiz_id' },
    );
    if (error) throw new Error(error.message);
  }

  async deleteSession(userId: string, quizId: string): Promise<void> {
    const { error } = await this.client
      .from('quiz_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('quiz_id', quizId);
    if (error) throw new Error(error.message);
  }
}
