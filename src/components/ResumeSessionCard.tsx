import { History } from 'lucide-react';
import type { QuizMode, QuizSession } from '../domain/types';
import { REVIEW_FILTER_LABELS } from './ReviewFilterSelector';

const MODE_LABELS: Record<QuizMode, string> = {
  one_by_one: '一問一答モード',
  test: 'テストモード',
};

export function describeSessionProgress(session: QuizSession): string {
  const total = session.questionIds.length;
  const position = Math.min(session.currentIndex + 1, total);
  const target = session.targetFilter === 'all' ? '' : `${REVIEW_FILTER_LABELS[session.targetFilter]}・`;
  return `${target}${position} / ${total} 問目から・${MODE_LABELS[session.mode]}`;
}

interface ResumeSessionCardProps {
  session: QuizSession;
  onResume: () => void;
}

export function ResumeSessionCard({ session, onResume }: ResumeSessionCardProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <History className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900">中断中のセッションがあります</p>
          <p className="text-xs text-amber-800 mt-0.5">{describeSessionProgress(session)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onResume}
        className="shrink-0 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 cursor-pointer"
      >
        続きから再開する
      </button>
    </div>
  );
}
