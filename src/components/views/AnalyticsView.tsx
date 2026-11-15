import { useMemo, useState } from 'react';
import { AppState } from '../../types';
import { addDaysToDateStr, formatShortDate, KarachiNow } from '../../utils/dateUtils';
import { computeAnalytics, getSortedDays } from '../../utils/metrics';

interface AnalyticsViewProps {
  state: AppState;
  now: KarachiNow;
}

type RangePreset = '7d' | '14d' | '30d' | 'custom';

export function AnalyticsView({ state, now }: AnalyticsViewProps) {
  const sortedDays = getSortedDays(state);
  const firstDate = sortedDays[0]?.date ?? now.dateStr;
  const lastDate = sortedDays[sortedDays.length - 1]?.date ?? now.dateStr;

  const [preset, setPreset] = useState<RangePreset>('7d');
  const [customStart, setCustomStart] = useState(firstDate);
  const [customEnd, setCustomEnd] = useState(lastDate);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  const { startDate, endDate } = useMemo(() => {
    if (preset === '7d') {
      const end = now.dateStr > lastDate ? lastDate : now.dateStr;
      const start = addDaysToDateStr(end, -6);
      return { startDate: start < firstDate ? firstDate : start, endDate: end };
    }
    if (preset === '14d') {
      const end = now.dateStr > lastDate ? lastDate : now.dateStr;
      const start = addDaysToDateStr(end, -13);
      return { startDate: start < firstDate ? firstDate : start, endDate: end };
    }
    if (preset === '30d') {
      return { startDate: firstDate, endDate: lastDate };
    }
    return {
      startDate: customStart <= customEnd ? customStart : customEnd,
      endDate: customEnd >= customStart ? customEnd : customStart,
    };
  }, [preset, customStart, customEnd, firstDate, lastDate, now.dateStr]);

  const analytics = useMemo(
    () => computeAnalytics(state, now, startDate, endDate),
    [state, now, startDate, endDate]
  );

  const maxHoursInSeries = Math.max(
    1,
    ...analytics.dailySeries.map((d) => Math.max(d.plannedHours, d.completedHours))
  );

  return (
    <div className="space-y-6">
      {/* Header & Date Range Filter */}
      <div className="bg-[#111827] border border-white/8 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Progress Analytics</h1>
          <p className="text-xs text-slate-400 mt-1">
            Computed directly from your recorded routine tasks, time blocks, and habit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-[#0B101B] border border-white/10 rounded-lg">
            {[
              { id: '7d', label: 'Last 7 Days' },
              { id: '14d', label: 'Last 14 Days' },
              { id: '30d', label: 'All 30 Days' },
              { id: 'custom', label: 'Custom' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPreset(item.id as RangePreset)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  preset === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs font-mono tabular-nums text-slate-200"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs font-mono tabular-nums text-slate-200"
              />
            </div>
          )}
        </div>
      </div>

      {/* Top KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: 'Daily Avg Completion',
            value: `${analytics.dailyAvgCompletion}%`,
            sub: `${analytics.dailySeries.length} days in range`,
          },
          {
            label: 'Weekly Completion',
            value: `${analytics.weeklyCompletion}%`,
            sub: 'Last 7 active days',
          },
          {
            label: 'Range / 30-Day Rate',
            value: `${analytics.monthlyCompletion}%`,
            sub: 'Completed / actionable tasks',
          },
          {
            label: 'Habit Consistency',
            value: `${analytics.habitConsistency}%`,
            sub: `${state.habits.length} tracked habits`,
          },
          {
            label: 'Completed vs Planned',
            value: `${analytics.completedHours}h / ${analytics.plannedHours}h`,
            sub: `${
              analytics.plannedHours > 0
                ? Math.round((analytics.completedHours / analytics.plannedHours) * 100)
                : 0
            }% hours executed`,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#111827] border border-white/8 rounded-xl p-4"
          >
            <p className="text-xs text-slate-400">{kpi.label}</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-white mt-1.5">
              {kpi.value}
            </p>
            <p className="text-xs text-slate-500 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Interactive Daily Completion & Hours Chart */}
      <section className="bg-[#111827] border border-white/8 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">
              Daily Execution &amp; Planned vs. Completed Hours
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Hover or tap any day bar to inspect exact completion rate and logged hours
            </p>
          </div>

          {hoveredDayIdx !== null && analytics.dailySeries[hoveredDayIdx] ? (
            <div className="text-xs font-mono tabular-nums text-slate-200 bg-[#0B101B] border border-white/10 px-3 py-1.5 rounded-lg">
              Day {analytics.dailySeries[hoveredDayIdx].dayNumber} (
              {formatShortDate(analytics.dailySeries[hoveredDayIdx].date)}):{' '}
              <span className="text-blue-400 font-semibold">
                {analytics.dailySeries[hoveredDayIdx].completionRate}%
              </span>{' '}
              · {analytics.dailySeries[hoveredDayIdx].completedHours}h /{' '}
              {analytics.dailySeries[hoveredDayIdx].plannedHours}h
            </div>
          ) : (
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-700 inline-block" />
                Planned Hours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block" />
                Completed Hours
              </span>
            </div>
          )}
        </div>

        {analytics.dailySeries.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            No days fall inside the selected date range.
          </p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[520px] h-52 flex items-end gap-2 pt-6 border-b border-white/10">
              {analytics.dailySeries.map((d, idx) => {
                const plannedPct = Math.round((d.plannedHours / maxHoursInSeries) * 100);
                const completedPct = Math.round((d.completedHours / maxHoursInSeries) * 100);
                const isHovered = hoveredDayIdx === idx;

                return (
                  <div
                    key={d.date}
                    onMouseEnter={() => setHoveredDayIdx(idx)}
                    onMouseLeave={() => setHoveredDayIdx(null)}
                    onClick={() => setHoveredDayIdx(idx)}
                    className="flex-1 min-w-[18px] h-full flex flex-col justify-end items-center gap-1.5 cursor-pointer group"
                  >
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.completionRate}%
                    </span>
                    <div className="w-full max-w-[34px] h-36 bg-[#0B101B] rounded-t relative flex items-end justify-center overflow-hidden border border-white/5">
                      {/* Planned hours background bar */}
                      <div
                        className="w-full bg-slate-700/60 transition-all"
                        style={{ height: `${plannedPct}%` }}
                      />
                      {/* Completed hours foreground bar */}
                      <div
                        className={`absolute bottom-0 left-0 right-0 transition-all ${
                          isHovered ? 'bg-blue-400' : 'bg-blue-500'
                        }`}
                        style={{ height: `${completedPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 pb-1">
                      D{d.dayNumber}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Bottom 3-Column Insights: Category Time Distribution, Consistent Habits, Frequently Missed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category-wise Time Distribution */}
        <section className="bg-[#111827] border border-white/8 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Category Time Distribution
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Completed vs planned hours per domain
            </p>
          </div>
          {analytics.categoryDistribution.length === 0 ? (
            <p className="text-xs text-slate-400">No category hours logged in range.</p>
          ) : (
            <div className="space-y-3">
              {analytics.categoryDistribution.slice(0, 8).map((item) => {
                const plannedHrs = (item.plannedMinutes / 60).toFixed(1);
                const completedHrs = (item.completedMinutes / 60).toFixed(1);
                const execPct =
                  item.plannedMinutes > 0
                    ? Math.round((item.completedMinutes / item.plannedMinutes) * 100)
                    : 0;

                return (
                  <div key={item.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-200 truncate pr-2">{item.category}</span>
                      <span className="font-mono tabular-nums text-slate-400 shrink-0">
                        {completedHrs}h / {plannedHrs}h ({item.sharePercent}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#0B101B] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${execPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Most Consistent Habits */}
        <section className="bg-[#111827] border border-white/8 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Habit Consistency Ranking</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ordered by completion rate in selected window
            </p>
          </div>
          {analytics.mostConsistentHabits.length === 0 ? (
            <p className="text-xs text-slate-400">No habits created yet.</p>
          ) : (
            <div className="divide-y divide-white/8">
              {analytics.mostConsistentHabits.map((h) => (
                <div key={h.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{h.title}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      Current streak: {h.streak}d
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${
                      h.rate >= 75
                        ? 'text-emerald-400'
                        : h.rate >= 40
                        ? 'text-blue-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {h.rate}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Frequently Missed Tasks */}
        <section className="bg-[#111827] border border-white/8 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Frequently Missed Tasks</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tasks with repeated missed windows to adjust or reschedule
            </p>
          </div>
          {analytics.frequentlyMissedTasks.length === 0 ? (
            <div className="p-4 rounded-lg bg-[#0B101B] border border-white/8 text-xs text-emerald-400">
              Zero missed tasks recorded in this date range.
            </div>
          ) : (
            <div className="divide-y divide-white/8">
              {analytics.frequentlyMissedTasks.map((m) => (
                <div
                  key={`${m.title}-${m.category}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{m.title}</p>
                    <p className="text-xs text-slate-500">{m.category}</p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-rose-400 font-medium shrink-0">
                    {m.missedCount} missed
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
