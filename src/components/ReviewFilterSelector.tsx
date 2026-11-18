import type { StatsBasedFilter } from '../domain/studyFilters';
import type { ReviewFilter } from '../domain/types';

export const REVIEW_FILTER_LABELS: Record<ReviewFilter, string> = {
  all: 'すべての問題',
  recent_wrong: '直近で間違えた問題',
  low_accuracy: '正答率60%以下の問題',
  retry_wrong: '間違えた問題の再挑戦',
};

const SELECTABLE_FILTERS: StatsBasedFilter[] = ['all', 'recent_wrong', 'low_accuracy'];

interface ReviewFilterSelectorProps {
  value: StatsBasedFilter;
  counts: Record<StatsBasedFilter, number>;
  onChange: (filter: StatsBasedFilter) => void;
}

export function ReviewFilterSelector({ value, counts, onChange }: ReviewFilterSelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">出題対象</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {SELECTABLE_FILTERS.map((filter) => {
          const count = counts[filter];
          const disabled = count === 0;
          const selected = value === filter;
          return (
            <label
              key={filter}
              className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 transition-colors ${
                disabled
                  ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                  : selected
                    ? 'border-indigo-600 bg-indigo-50/70 cursor-pointer'
                    : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="reviewFilter"
                  value={filter}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(filter)}
                  className="accent-indigo-600"
                />
                <span className="text-sm font-medium">{REVIEW_FILTER_LABELS[filter]}</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {count}問
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
