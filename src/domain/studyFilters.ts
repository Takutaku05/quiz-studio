import type { Question, QuestionStat, ReviewFilter } from './types';

/** 累積正答率がこの値以下の問題を「苦手」とする（ちょうど60%も含む）。 */
export const LOW_ACCURACY_THRESHOLD_PERCENT = 60;

export type StatsBasedFilter = Exclude<ReviewFilter, 'retry_wrong'>;

export function isLowAccuracy(stat: QuestionStat): boolean {
  if (stat.attemptsCount < 1) return false;
  return (stat.correctCount / stat.attemptsCount) * 100 <= LOW_ACCURACY_THRESHOLD_PERCENT;
}

function isRecentWrong(stat: QuestionStat): boolean {
  return stat.attemptsCount >= 1 && !stat.lastIsCorrect;
}

const PREDICATES: Record<Exclude<StatsBasedFilter, 'all'>, (stat: QuestionStat) => boolean> = {
  recent_wrong: isRecentWrong,
  low_accuracy: isLowAccuracy,
};

/** 出題対象で問題を絞り込む。元の並び順を保ち、成績のない（未回答の）問題は復習対象に含めない。 */
export function filterQuestionsByReview(
  questions: readonly Question[],
  stats: readonly QuestionStat[],
  filter: StatsBasedFilter,
): Question[] {
  if (filter === 'all') return [...questions];
  const predicate = PREDICATES[filter];
  const statsByQuestionId = new Map(stats.map((s) => [s.questionId, s]));
  return questions.filter((q) => {
    const stat = statsByQuestionId.get(q.id);
    return stat !== undefined && predicate(stat);
  });
}

export function countReviewTargets(
  questions: readonly Question[],
  stats: readonly QuestionStat[],
): Record<StatsBasedFilter, number> {
  return {
    all: questions.length,
    recent_wrong: filterQuestionsByReview(questions, stats, 'recent_wrong').length,
    low_accuracy: filterQuestionsByReview(questions, stats, 'low_accuracy').length,
  };
}

export function countWeakQuestions(stats: readonly QuestionStat[]): number {
  return stats.filter(isLowAccuracy).length;
}
