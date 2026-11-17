import { useMemo, useState } from 'react';
import { AppState } from '../../types';
import { addDaysToDateStr, formatShortDate, KarachiNow } from '../../utils/dateUtils';
import {
  computeAnalytics,
  computeGoalsProgressSummary,
  computeProgressInsights,
  getSortedDays,
} from '../../utils/metrics';

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
  const progressInsights = useMemo(
    () => computeProgressInsights(state, now.dateStr, now),
    [state, now]
  );
  const goalsProgress = useMemo(
    () => computeGoalsProgressSummary(state, now),
    [state, now]
  );

  const maxHoursInSeries = Math.max(
    1,
    ...analytics.dailySeries.map((d) => Math.max(d.plannedHours, d.completedHours))
  );

  return (
    <div className="space-y-6">
      {/* Header & Date Range Filter */}
      <div className="bg-card border border-subtle rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-main">
            Progress Analytics
          </h1>
          <p className="text-xs text-muted mt-1">
            Computed directly from your recorded routine tasks, time blocks, and habit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-surface border border-subtle rounded-lg">
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
                    ? 'bg-gold text-on-gold font-semibold'
                    : 'text-muted hover:text-main'
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
                className="px-2.5 py-1.5 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
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
            className="bg-card border border-subtle rounded-xl p-4"
          >
            <p className="text-xs text-muted">{kpi.label}</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-main mt-1.5">
              {kpi.value}
            </p>
            <p className="text-xs text-muted mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Period Comparisons & Goal Velocity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-subtle rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted">Today vs. Yesterday</p>
          {progressInsights.todayVsYesterday.available &&
          progressInsights.todayVsYesterday.deltaPct !== null ? (
            <>
              <p
                className={`text-xl font-semibold font-mono tabular-nums ${
                  progressInsights.todayVsYesterday.deltaPct >= 0
                    ? 'text-slate-accent'
                    : 'text-rose-muted'
                }`}
              >
                {progressInsights.todayVsYesterday.deltaPct >= 0 ? '+' : ''}
                {progressInsights.todayVsYesterday.deltaPct}%
              </p>
              <p className="text-xs text-muted">
                Compared to {progressInsights.todayVsYesterday.previousRate}% on{' '}
                {formatShortDate(progressInsights.todayVsYesterday.previousDate)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted pt-1">
              Insufficient prior-day task records to compare today vs. yesterday.
            </p>
          )}
        </div>

        <div className="bg-card border border-subtle rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted">Week-over-Week Trend</p>
          {progressInsights.weekOverWeek.available &&
          progressInsights.weekOverWeek.deltaPct !== null ? (
            <>
              <p
                className={`text-xl font-semibold font-mono tabular-nums ${
                  progressInsights.weekOverWeek.deltaPct >= 0
                    ? 'text-slate-accent'
                    : 'text-rose-muted'
                }`}
              >
                {progressInsights.weekOverWeek.deltaPct >= 0 ? '+' : ''}
                {progressInsights.weekOverWeek.deltaPct}%
              </p>
              <p className="text-xs text-muted">
                {progressInsights.weekOverWeek.currentAvg}% current 7d vs{' '}
                {progressInsights.weekOverWeek.previousAvg}% prior 7d
              </p>
            </>
          ) : (
            <p className="text-xs text-muted pt-1">
              Insufficient multi-week history (needs 3+ active days in prior week).
            </p>
          )}
        </div>

        <div className="bg-card border border-subtle rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted">Goals &amp; Milestones Progressing</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-gold">
            {goalsProgress.completedMilestones}/{goalsProgress.totalMilestones} milestones
          </p>
          <p className="text-xs text-muted">
            {goalsProgress.progressingGoals} active · {goalsProgress.completedGoals} completed
          </p>
        </div>
      </div>

      {/* Interactive Daily Completion & Hours Chart */}
      <section className="bg-card border border-subtle rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-main">
              Daily Execution &amp; Planned vs. Completed Hours
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Hover or tap any day bar to inspect exact completion rate and logged hours
            </p>
          </div>

          {hoveredDayIdx !== null && analytics.dailySeries[hoveredDayIdx] ? (
            <div className="text-xs font-mono tabular-nums text-main bg-surface border border-subtle px-3 py-1.5 rounded-lg">
              Day {analytics.dailySeries[hoveredDayIdx].dayNumber} (
              {formatShortDate(analytics.dailySeries[hoveredDayIdx].date)}):{' '}
              <span className="text-gold font-semibold">
                {analytics.dailySeries[hoveredDayIdx].completionRate}%
              </span>{' '}
              · {analytics.dailySeries[hoveredDayIdx].completedHours}h /{' '}
              {analytics.dailySeries[hoveredDayIdx].plannedHours}h
            </div>
          ) : (
            <div className="flex items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-subtle inline-block" />
                Planned Hours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-gold inline-block" />
                Completed Hours
              </span>
            </div>
          )}
        </div>

        {analytics.dailySeries.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">
            No days fall inside the selected date range.
          </p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[520px] h-52 flex items-end gap-2 pt-6 border-b border-subtle">
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
                    <span className="text-[10px] font-mono tabular-nums text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.completionRate}%
                    </span>
                    <div className="w-full max-w-[34px] h-36 bg-surface rounded-t relative flex items-end justify-center overflow-hidden border border-subtle">
                      {/* Planned hours background bar */}
                      <div
                        className="w-full bg-subtle transition-all"
                        style={{ height: `${plannedPct}%` }}
                      />
                      {/* Completed hours foreground bar */}
                      <div
                        className={`absolute bottom-0 left-0 right-0 transition-all ${
                          isHovered ? 'bg-gold-hover' : 'bg-gold'
                        }`}
                        style={{ height: `${completedPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-muted pb-1">
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
        <section className="bg-card border border-subtle rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-main">
              Category Time Distribution
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Completed vs planned hours per domain
            </p>
          </div>
          {analytics.categoryDistribution.length === 0 ? (
            <p className="text-xs text-muted">
              No category hours logged in range.
            </p>
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
                      <span className="text-main truncate pr-2">
                        {item.category}
                      </span>
                      <span className="font-mono tabular-nums text-muted shrink-0">
                        {completedHrs}h / {plannedHrs}h ({item.sharePercent}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-accent"
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
        <section className="bg-card border border-subtle rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-main">
              Habit Consistency Ranking
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Ordered by completion rate in selected window
            </p>
          </div>
          {analytics.mostConsistentHabits.length === 0 ? (
            <p className="text-xs text-muted">No habits created yet.</p>
          ) : (
            <div className="divide-y divide-subtle">
              {analytics.mostConsistentHabits.map((h) => (
                <div key={h.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-main truncate">{h.title}</p>
                    <p className="text-xs text-muted font-mono tabular-nums">
                      Current streak: {h.streak}d
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${
                      h.rate >= 75
                        ? 'text-slate-accent'
                        : h.rate >= 40
                        ? 'text-gold'
                        : 'text-muted'
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
        <section className="bg-card border border-subtle rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-main">
              Frequently Missed Tasks
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Tasks with repeated missed windows to adjust or reschedule
            </p>
          </div>
          {analytics.frequentlyMissedTasks.length === 0 ? (
            <div className="p-4 rounded-lg bg-slate-soft border border-slate-border text-xs text-slate-accent font-medium">
              Zero missed tasks recorded in this date range.
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {analytics.frequentlyMissedTasks.map((m) => (
                <div
                  key={`${m.title}-${m.category}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-main truncate">{m.title}</p>
                    <p className="text-xs text-muted">{m.category}</p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-rose-muted font-medium shrink-0">
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
