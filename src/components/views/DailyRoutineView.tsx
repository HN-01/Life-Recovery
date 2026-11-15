import { useState } from 'react';
import {
  Calendar,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Edit2,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppState, RoutineTask, TaskCategory } from '../../types';
import { ALL_CATEGORIES, SCHEDULE_TYPE_LABELS } from '../../data/starterData';
import {
  formatDisplayDate,
  formatDuration,
  formatTime12h,
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
} from '../../utils/dateUtils';
import { computeDayStats, getSortedDays } from '../../utils/metrics';
import { TaskStatusIndicator } from '../ui/TaskStatusIndicator';

interface DailyRoutineViewProps {
  state: AppState;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  now: KarachiNow;
  onToggleTaskStatus: (dateStr: string, taskId: string) => void;
  onSetTaskStatus: (dateStr: string, taskId: string, status: RoutineTask['status']) => void;
  onOpenAddTask: (isBreak?: boolean) => void;
  onOpenEditTask: (task: RoutineTask) => void;
  onDeleteTask: (task: RoutineTask) => void;
  onOpenSmartPlan: () => void;
}

export function DailyRoutineView({
  state,
  selectedDate,
  onSelectDate,
  now,
  onToggleTaskStatus,
  onSetTaskStatus,
  onOpenAddTask,
  onOpenEditTask,
  onDeleteTask,
  onOpenSmartPlan,
}: DailyRoutineViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<'All' | TaskCategory>('All');
  const sortedDays = getSortedDays(state);
  const currentDay = state.days[selectedDate] || sortedDays[0];

  if (!currentDay) {
    return (
      <div className="bg-[#111827] border border-white/8 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-400">No days found in your 30-day schedule.</p>
      </div>
    );
  }

  const currentIndex = sortedDays.findIndex((d) => d.date === currentDay.date);
  const prevDay = currentIndex > 0 ? sortedDays[currentIndex - 1] : null;
  const nextDay = currentIndex < sortedDays.length - 1 ? sortedDays[currentIndex + 1] : null;

  const stats = computeDayStats(currentDay, now);
  const filteredTasks =
    categoryFilter === 'All'
      ? currentDay.tasks
      : currentDay.tasks.filter((t) => t.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Header & Day Switcher */}
      <div className="bg-[#111827] border border-white/8 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-mono tabular-nums text-blue-400 font-medium">
              Day {currentDay.dayNumber} of 30
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatDisplayDate(currentDay.date)}</span>
            <span aria-hidden="true">·</span>
            <span>{SCHEDULE_TYPE_LABELS[currentDay.scheduleType]}</span>
          </div>
          <h1 className="text-xl font-semibold text-white mt-1">
            Detailed Daily Execution Timeline
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-[#0B101B] border border-white/10 rounded-lg p-1">
            <button
              type="button"
              disabled={!prevDay}
              onClick={() => prevDay && onSelectDate(prevDay.date)}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(now.dateStr)}
              className="px-3 py-1 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              disabled={!nextDay}
              onClick={() => nextDay && onSelectDate(nextDay.date)}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenAddTask(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Coffee className="w-3.5 h-3.5 text-slate-400" />
            Add Break / Buffer
          </button>

          <button
            type="button"
            onClick={onOpenSmartPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Generate Tomorrow&apos;s Smart Plan
          </button>

          <button
            type="button"
            onClick={() => onOpenAddTask(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Activity
          </button>
        </div>
      </div>

      {/* Filter & Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111827] border border-white/8 rounded-xl px-5 py-3.5">
        <div className="flex items-center gap-4 text-xs text-slate-300 font-mono tabular-nums">
          <span>
            Completed: <strong className="text-emerald-400">{stats.completed}/{stats.total}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">|</span>
          <span>
            Completion: <strong className="text-white">{stats.completionRate}%</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">|</span>
          <span>
            Productive: <strong className="text-indigo-400">{(stats.plannedProductiveMinutes / 60).toFixed(1)}h</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="routine-cat-filter" className="text-xs text-slate-400 whitespace-nowrap">
            Filter category:
          </label>
          <select
            id="routine-cat-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'All' | TaskCategory)}
            className="px-3 py-1.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="All">All Categories</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Vertical Timeline */}
      <div className="bg-[#111827] border border-white/8 rounded-xl overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-400">
              No activities match this filter for Day {currentDay.dayNumber}.
            </p>
            <button
              type="button"
              onClick={() => onOpenAddTask(false)}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Schedule Activity
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/8">
            {filteredTasks.map((task) => {
              const effState = getEffectiveTaskState(task, currentDay.date, now);
              const dur = getDurationMinutes(task.startTime, task.endTime);
              const isDone = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className={`p-5 flex flex-col md:flex-row md:items-start gap-4 transition-colors hover:bg-white/[0.02] ${
                    effState === 'active' ? 'bg-blue-500/[0.06]' : ''
                  }`}
                >
                  {/* Time & Checkbox */}
                  <div className="flex items-center md:items-start gap-3.5 md:w-52 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleTaskStatus(currentDay.date, task.id)}
                      aria-label={`Toggle completion for ${task.title}`}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isDone
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-slate-600 hover:border-blue-400 bg-[#0B101B]'
                      }`}
                    >
                      {isDone && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </button>

                    <div className="font-mono tabular-nums">
                      <p className="text-sm font-medium text-slate-100">
                        {formatTime12h(task.startTime)} – {formatTime12h(task.endTime)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Expected duration: {formatDuration(dur)}
                      </p>
                    </div>
                  </div>

                  {/* Main Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3
                        className={`text-base font-medium ${
                          isDone ? 'line-through text-slate-500' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </h3>
                      <TaskStatusIndicator state={effState} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                      <span className="text-slate-300">{task.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>Priority: {task.priority}</span>
                      {task.isBreak && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400">Recovery Buffer</span>
                        </>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Quick State & Edit Controls */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      onChange={(e) =>
                        onSetTaskStatus(
                          currentDay.date,
                          task.id,
                          e.target.value as RoutineTask['status']
                        )
                      }
                      className="px-2.5 py-1.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs text-slate-200 capitalize focus:outline-none focus:border-blue-500"
                    >
                      <option value="pending">pending</option>
                      <option value="completed">completed</option>
                      <option value="skipped">skipped</option>
                      <option value="missed">missed</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => onOpenEditTask(task)}
                      className="p-2 text-slate-400 hover:text-white bg-[#0B101B] border border-white/10 rounded-lg transition-colors"
                      aria-label={`Edit ${task.title}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task)}
                      className="p-2 text-slate-400 hover:text-rose-400 bg-[#0B101B] border border-white/10 rounded-lg transition-colors"
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
      </div>
    </div>
  );
}
