import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Plus } from 'lucide-react';
import { AppState, NavSection, WeeklyReview } from '../../types';
import { formatDisplayDate, KarachiNow } from '../../utils/dateUtils';
import { computeAnalytics } from '../../utils/metrics';

interface WeeklyReviewViewProps {
  state: AppState;
  now: KarachiNow;
  onSaveWeeklyReview: (review: WeeklyReview) => void;
  onSchedulePriorityInNextWeek: (
    nextWeekStartDate: string,
    title: string,
    startTime: string,
    endTime: string
  ) => void;
  onNavigate: (section: NavSection) => void;
}

export function WeeklyReviewView({
  state,
  now,
  onSaveWeeklyReview,
  onSchedulePriorityInNextWeek,
  onNavigate,
}: WeeklyReviewViewProps) {
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(1);
  const currentReview =
    state.weeklyReviews.find((r) => r.weekNumber === selectedWeekNum) ||
    state.weeklyReviews[0];

  const [accomplished, setAccomplished] = useState('');
  const [failedToComplete, setFailedToComplete] = useState('');
  const [distractions, setDistractions] = useState('');
  const [improved, setImproved] = useState('');
  const [needsImprovement, setNeedsImprovement] = useState('');
  const [priorities, setPriorities] = useState<string[]>(['', '', '']);
  const [savedNotice, setSavedNotice] = useState('');
  const [appliedNotice, setAppliedNotice] = useState('');

  useEffect(() => {
    if (!currentReview) return;
    setAccomplished(currentReview.accomplished);
    setFailedToComplete(currentReview.failedToComplete);
    setDistractions(currentReview.distractions);
    setImproved(currentReview.improved);
    setNeedsImprovement(currentReview.needsImprovement);
    setPriorities(
      currentReview.nextWeekPriorities.length >= 3
        ? currentReview.nextWeekPriorities
        : ['', '', '']
    );
    setSavedNotice('');
    setAppliedNotice('');
  }, [currentReview]);

  const weekSummary = useMemo(() => {
    if (!currentReview) return null;
    return computeAnalytics(state, now, currentReview.startDate, currentReview.endDate);
  }, [state, now, currentReview]);

  if (!currentReview || !weekSummary) return null;

  const nextWeek = state.weeklyReviews.find(
    (r) => r.weekNumber === currentReview.weekNumber + 1
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveWeeklyReview({
      ...currentReview,
      accomplished: accomplished.trim(),
      failedToComplete: failedToComplete.trim(),
      distractions: distractions.trim(),
      improved: improved.trim(),
      needsImprovement: needsImprovement.trim(),
      nextWeekPriorities: priorities.map((p) => p.trim()),
      updatedAt: new Date().toISOString(),
    });
    setSavedNotice('Weekly review saved.');
  };

  const handleApplyPrioritiesToNextWeek = () => {
    if (!nextWeek) return;
    const valid = priorities.map((p) => p.trim()).filter(Boolean);
    if (valid.length === 0) return;

    const slots: Array<[string, string]> = [
      ['16:30', '17:30'],
      ['17:45', '18:45'],
      ['20:45', '21:30'],
    ];

    valid.slice(0, 3).forEach((title, idx) => {
      const [start, end] = slots[idx] || ['17:00', '18:00'];
      onSchedulePriorityInNextWeek(nextWeek.startDate, title, start, end);
    });
    setAppliedNotice(
      `Added ${valid.slice(0, 3).length} priority block(s) into Week ${nextWeek.weekNumber} starting ${formatDisplayDate(nextWeek.startDate)}.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header + Week Selector */}
      <div className="bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/8 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Weekly Execution Review
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audit your weekly metrics honestly, diagnose distractions, and push adjustments into next week&apos;s routine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg">
          {state.weeklyReviews.map((w) => (
            <button
              key={w.weekNumber}
              type="button"
              onClick={() => setSelectedWeekNum(w.weekNumber)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedWeekNum === w.weekNumber
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Week {w.weekNumber}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Calculated Weekly Performance Summary */}
      <section className="bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/8 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Week {currentReview.weekNumber} Performance Summary
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {formatDisplayDate(currentReview.startDate)} – {formatDisplayDate(currentReview.endDate)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8">
            <p className="text-xs text-slate-500 dark:text-slate-400">Task Completion</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {weekSummary.monthlyCompletion}%
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8">
            <p className="text-xs text-slate-500 dark:text-slate-400">Hours Executed</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1">
              {weekSummary.completedHours}h / {weekSummary.plannedHours}h
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8">
            <p className="text-xs text-slate-500 dark:text-slate-400">Habit Consistency</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
              {weekSummary.habitConsistency}%
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8">
            <p className="text-xs text-slate-500 dark:text-slate-400">Missed Task Instances</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
              {weekSummary.frequentlyMissedTasks.reduce((a, b) => a + b.missedCount, 0)}
            </p>
          </div>
        </div>
      </section>

      {/* Structured Reflection Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/8 rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              1. What did I accomplish?
            </label>
            <textarea
              rows={3}
              value={accomplished}
              onChange={(e) => setAccomplished(e.target.value)}
              placeholder="List completed milestones, exams studied, or coding hours achieved..."
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              2. What did I fail to complete?
            </label>
            <textarea
              rows={3}
              value={failedToComplete}
              onChange={(e) => setFailedToComplete(e.target.value)}
              placeholder="Which planned tasks or habits slipped this week?"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              3. What distracted me?
            </label>
            <textarea
              rows={3}
              value={distractions}
              onChange={(e) => setDistractions(e.target.value)}
              placeholder="Phone scrolling, late sleep, unstructured breaks, or low energy..."
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              4. What improved?
            </label>
            <textarea
              rows={3}
              value={improved}
              onChange={(e) => setImproved(e.target.value)}
              placeholder="Where did consistency, speed, or focus get noticeably better?"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            5. What needs improvement?
          </label>
          <textarea
            rows={2}
            value={needsImprovement}
            onChange={(e) => setNeedsImprovement(e.target.value)}
            placeholder="Specific schedule timing, sleep discipline, or workload balance adjustments..."
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-white/8">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            6. Top Priorities for Next Week
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[0, 1, 2].map((idx) => (
              <input
                key={idx}
                type="text"
                value={priorities[idx] || ''}
                onChange={(e) => {
                  const next = [...priorities];
                  next[idx] = e.target.value;
                  setPriorities(next);
                }}
                placeholder={`Next week priority #${idx + 1}`}
                className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-white/8">
          <div className="flex flex-wrap items-center gap-3">
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {savedNotice}
              </span>
            )}
            {appliedNotice && (
              <span className="text-xs text-amber-700 dark:text-amber-400">{appliedNotice}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {nextWeek && (
              <button
                type="button"
                onClick={handleApplyPrioritiesToNextWeek}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 hover:bg-slate-200/70 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Schedule Priorities into Week {nextWeek.weekNumber}
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('planner')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              Edit Next Week in Planner
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
            >
              Save Weekly Review
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
