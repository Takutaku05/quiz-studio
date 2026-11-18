import { countWeakQuestions } from '../domain/studyFilters';
import type { QuestionStat, QuizSession } from '../domain/types';

interface QuizStudyBadgesProps {
  session: QuizSession | null;
  /** その問題集の成績のみ */
  stats: readonly QuestionStat[];
}

export function QuizStudyBadges({ session, stats }: QuizStudyBadgesProps) {
  const hasAnswers = stats.length > 0;
  if (!session && !hasAnswers) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
      {session && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium">
          進行中 ({session.currentIndex} / {session.questionIds.length}問)
        </span>
      )}
      {hasAnswers && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium">
          苦手（正答率60%以下）: {countWeakQuestions(stats)}問
        </span>
      )}
    </div>
  );
}
