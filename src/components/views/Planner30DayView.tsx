import { useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Edit2,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { AppState, RoutineTask, ScheduleType } from '../../types';
import { SCHEDULE_TYPE_LABELS } from '../../data/starterData';
import {
  formatDisplayDate,
  formatDuration,
  formatShortDate,
  formatTime12h,
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
} from '../../utils/dateUtils';
import { computeDayStats, getSortedDays } from '../../utils/metrics';
import { TaskStatusIndicator } from '../ui/TaskStatusIndicator';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface Planner30DayViewProps {
  state: AppState;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  now: KarachiNow;
  onToggleTaskStatus: (dateStr: string, taskId: string) => void;
  onSetTaskStatus: (dateStr: string, taskId: string, status: RoutineTask['status']) => void;
  onOpenAddTask: () => void;
  onOpenEditTask: (task: RoutineTask) => void;
  onDeleteTask: (task: RoutineTask) => void;
  onApplyScheduleType: (dateStr: string, type: ScheduleType) => void;
  onDuplicateDayIntoSelected: (sourceDateStr: string) => void;
  onReset30DayPlan: () => void;
  onOpenSmartPlan: () => void;
}

const SCHEDULE_TYPES: ScheduleType[] = [
  'university',
  'normal',
  'weekend',
  'holiday',
  'exam',
];

export function Planner30DayView({
  state,
  selectedDate,
  onSelectDate,
  now,
  onToggleTaskStatus,
  onSetTaskStatus,
  onOpenAddTask,
  onOpenEditTask,
  onDeleteTask,
  onApplyScheduleType,
  onDuplicateDayIntoSelected,
  onReset30DayPlan,
  onOpenSmartPlan,
}: Planner30DayViewProps) {
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [duplicateSourceDate, setDuplicateSourceDate] = useState<string>('');

  const sortedDays = getSortedDays(state);
  const activeDay = state.days[selectedDate] || sortedDays[0];

  if (!activeDay) return null;

  const activeStats = computeDayStats(activeDay, now);
  const previousDayIndex = sortedDays.findIndex((d) => d.date === activeDay.date) - 1;
  const previousDay = previousDayIndex >= 0 ? sortedDays[previousDayIndex] : null;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/8 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            30-Day Execution Planner
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Navigate any day, switch schedule templates (University, Weekend, Holiday, Exam), or propagate routine edits across future days.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenSmartPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Generate Tomorrow&apos;s Smart Plan
          </button>
          {previousDay && (
            <button
              type="button"
              onClick={() => onDuplicateDayIntoSelected(previousDay.date)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 hover:bg-slate-200/70 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Duplicate Day {previousDay.dayNumber}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset 30-Day Plan
          </button>
        </div>
      </div>

      {/* 30-Day Grid */}
      <section className="bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/8 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            All 30 Challenge Days
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {formatDisplayDate(sortedDays[0].date)} – {formatDisplayDate(sortedDays[sortedDays.length - 1].date)}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
          {sortedDays.map((day) => {
            const stats = computeDayStats(day, now);
            const isSelected = day.date === activeDay.date;
            const isToday = day.date === now.dateStr;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? 'bg-amber-500/12 border-amber-500'
                    : isToday
                    ? 'bg-amber-50 dark:bg-[#191712] border-amber-500/40 hover:border-amber-500/70'
                    : 'bg-slate-50 dark:bg-[#0A0A0C] border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                    Day {day.dayNumber}
                  </span>
                  {isToday && (
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      Today
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {formatShortDate(day.date)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  {SCHEDULE_TYPE_LABELS[day.scheduleType]}
                </p>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {stats.completed}/{stats.total}
                    </span>
                    <span
                      className={
                        stats.completionRate >= 80
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : stats.completionRate >= 40
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {stats.completionRate}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        stats.completionRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${stats.completionRate}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Selected Day Management Panel */}
      <section className="bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/8 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-white/8 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="text-amber-700 dark:text-amber-400 font-semibold font-mono tabular-nums">
                Day {activeDay.dayNumber} of 30
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatDisplayDate(activeDay.date)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeStats.completed}/{activeStats.total} completed ({activeStats.completionRate}%)
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-1">
              Day {activeDay.dayNumber} Routine &amp; Schedule Mode
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Schedule Template Switcher */}
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="day-schedule-type"
                className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Template:
              </label>
              <select
                id="day-schedule-type"
                value={activeDay.scheduleType}
                onChange={(e) =>
                  onApplyScheduleType(activeDay.date, e.target.value as ScheduleType)
                }
                className="px-3 py-1.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {SCHEDULE_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {SCHEDULE_TYPE_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            {/* Duplicate Any Day Dropdown */}
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Duplicate another day"
                value={duplicateSourceDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    onDuplicateDayIntoSelected(val);
                    setDuplicateSourceDate('');
                  }
                }}
                className="px-3 py-1.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="">Copy from another day...</option>
                {sortedDays
                  .filter((d) => d.date !== activeDay.date)
                  .map((d) => (
                    <option key={d.date} value={d.date}>
                      Day {d.dayNumber} ({formatShortDate(d.date)})
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onOpenAddTask}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Task
            </button>
          </div>
        </div>

        {/* Task Rows */}
        {activeDay.tasks.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No tasks scheduled for Day {activeDay.dayNumber}.
            </p>
            <button
              type="button"
              onClick={onOpenAddTask}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
            >
              Add First Task
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/8">
            {activeDay.tasks.map((task) => {
              const eff = getEffectiveTaskState(task, activeDay.date, now);
              const isDone = task.status === 'completed';
              const dur = getDurationMinutes(task.startTime, task.endTime);

              return (
                <div
                  key={task.id}
                  className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleTaskStatus(activeDay.date, task.id)}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isDone
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-slate-300 dark:border-slate-600 hover:border-amber-500 bg-white dark:bg-[#0A0A0C]'
                      }`}
                      aria-label={`Mark ${task.title} completed`}
                    >
                      {isDone && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            isDone
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <TaskStatusIndicator state={eff} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatTime12h(task.startTime)} – {formatTime12h(task.endTime)} ({formatDuration(dur)})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{task.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{task.priority}</span>
                      </div>
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-1">{task.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <select
                      aria-label={`Set status for ${task.title}`}
                      value={task.status}
                      onChange={(e) =>
                        onSetTaskStatus(
                          activeDay.date,
                          task.id,
                          e.target.value as RoutineTask['status']
                        )
                      }
                      className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-slate-200 capitalize"
                    >
                      <option value="pending">pending</option>
                      <option value="completed">completed</option>
                      <option value="skipped">skipped</option>
                      <option value="missed">missed</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onOpenEditTask(task)}
                      className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg transition-colors"
                      aria-label={`Edit ${task.title}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task)}
                      className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg transition-colors"
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={onReset30DayPlan}
        title="Reset 30-Day Plan?"
        message="This will regenerate all 30 days from your schedule templates starting from today (Asia/Karachi) and clear task completion history. Habits, goals, and weekly reviews can be preserved or reset in Settings."
        confirmLabel="Reset 30 Days"
      />
    </div>
  );
}
