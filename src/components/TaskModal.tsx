import React, { useEffect, useState } from 'react';
import { AlertTriangle, Coffee } from 'lucide-react';
import { Modal } from './ui/Modal';
import {
  Goal,
  NotificationTimingOption,
  RoutineTask,
  RoutineUpdateScope,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '../types';
import { ALL_CATEGORIES } from '../data/starterData';
import { findConflictingTasks, formatTime12h, timeToMinutes } from '../utils/dateUtils';
import { ALL_TIMING_OPTIONS, NOTIFICATION_TIMING_LABELS } from '../utils/notificationEngine';

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  existingTasksOnDay: RoutineTask[];
  goals: Goal[];
  initialTask?: RoutineTask | null;
  defaultIsBreak?: boolean;
  showScopeSelector?: boolean;
  onSave: (
    taskData: Omit<RoutineTask, 'id'>,
    scope: RoutineUpdateScope,
    existingTaskId?: string
  ) => void;
}

const PRIORITIES: TaskPriority[] = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES: TaskStatus[] = ['pending', 'completed', 'skipped', 'missed'];

export function TaskModal({
  open,
  onClose,
  existingTasksOnDay,
  goals,
  initialTask,
  defaultIsBreak = false,
  showScopeSelector = true,
  onSave,
}: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState<TaskCategory>('Programming');
  const [priority, setPriority] = useState<TaskPriority>('High');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [description, setDescription] = useState('');
  const [isBreak, setIsBreak] = useState(false);
  const [goalId, setGoalId] = useState<string>('');
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<NotificationTimingOption[]>([]);
  const [scope, setScope] = useState<RoutineUpdateScope>('this_day');
  const [overrideConflict, setOverrideConflict] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setOverrideConflict(false);
    setScope('this_day');

    if (initialTask) {
      setTitle(initialTask.title);
      setStartTime(initialTask.startTime);
      setEndTime(initialTask.endTime);
      setCategory(initialTask.category);
      setPriority(initialTask.priority);
      setStatus(initialTask.status);
      setDescription(initialTask.description);
      setIsBreak(Boolean(initialTask.isBreak));
      setGoalId(initialTask.goalId || '');
      setReminderMinutesBefore(initialTask.reminderMinutesBefore || []);
    } else if (defaultIsBreak) {
      setTitle('Rest & Recovery Buffer');
      setStartTime('13:30');
      setEndTime('14:00');
      setCategory('Break & Buffer');
      setPriority('Medium');
      setStatus('pending');
      setDescription('Step away from desk, hydrate, and reset mental energy.');
      setIsBreak(true);
      setGoalId('');
      setReminderMinutesBefore([]);
    } else {
      setTitle('');
      setStartTime('09:00');
      setEndTime('10:00');
      setCategory('Programming');
      setPriority('High');
      setStatus('pending');
      setDescription('');
      setIsBreak(false);
      setGoalId('');
      setReminderMinutesBefore([]);
    }
  }, [open, initialTask, defaultIsBreak]);

  const conflicts = findConflictingTasks(
    existingTasksOnDay,
    startTime,
    endTime,
    initialTask?.id
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a task title.');
      return;
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime) && endTime !== '23:59') {
      setError('End time must be later than start time.');
      return;
    }
    if (conflicts.length > 0 && !overrideConflict) {
      setError('This time slot overlaps with an existing activity. Adjust the time or check "Override scheduling conflict".');
      return;
    }

    onSave(
      {
        templateKey: initialTask?.templateKey,
        title: title.trim(),
        startTime,
        endTime,
        category,
        priority,
        description: description.trim(),
        status,
        isBreak,
        goalId: goalId || undefined,
        reminderMinutesBefore:
          reminderMinutesBefore.length > 0 ? reminderMinutesBefore : undefined,
      },
      scope,
      initialTask?.id
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialTask ? 'Edit Routine Task' : isBreak ? 'Add Break / Buffer Time' : 'Add Routine Task'}
      subtitle="Schedule a focused block with clear timing, category, and scope."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-subtle">
          <label className="inline-flex items-center gap-2 text-sm text-main cursor-pointer">
            <input
              type="checkbox"
              checked={isBreak}
              onChange={(e) => {
                setIsBreak(e.target.checked);
                if (e.target.checked && category !== 'Break & Buffer') {
                  setCategory('Break & Buffer');
                }
              }}
              className="rounded border-subtle bg-surface text-gold focus:ring-gold"
            />
            <Coffee className="w-4 h-4 text-muted" />
            <span>Mark as Break / Buffer Time</span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">
            Activity Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Data Structures & Algorithms Practice"
            className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main placeholder:text-muted/70 focus:outline-none focus:border-gold"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Start Time (Asia/Karachi)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main font-mono tabular-nums focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              End Time (Asia/Karachi)
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main font-mono tabular-nums focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        {conflicts.length > 0 && (
          <div className="p-3.5 rounded-lg bg-gold-soft border border-gold-border space-y-2">
            <div className="flex items-start gap-2 text-gold text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>Scheduling conflict detected with:</p>
                <ul className="mt-1 space-y-0.5 text-main font-normal">
                  {conflicts.map((c) => (
                    <li key={c.id} className="font-mono tabular-nums">
                      {formatTime12h(c.startTime)} – {formatTime12h(c.endTime)}: {c.title}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-main cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={overrideConflict}
                onChange={(e) => setOverrideConflict(e.target.checked)}
                className="rounded border-gold-border bg-card text-gold focus:ring-gold"
              />
              <span>Override scheduling conflict and allow overlapping time</span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main capitalize focus:outline-none focus:border-gold"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">
            Link to Goal (Optional)
          </label>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
          >
            <option value="">No linked goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.area})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">
            Detailed Instructions / Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Exact steps, chapter targets, or execution rules..."
            className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main placeholder:text-muted/70 focus:outline-none focus:border-gold resize-none"
          />
        </div>

        {/* Per-Activity Reminder Timing Override */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs font-medium text-muted">
              Notification Timing Override (Optional)
            </label>
            <span className="text-[11px] text-muted">
              {reminderMinutesBefore.length === 0 ? 'Using global default' : 'Custom per-task'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ALL_TIMING_OPTIONS.map((opt) => {
              const active = reminderMinutesBefore.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    setReminderMinutesBefore((prev) =>
                      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                    )
                  }
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                    active
                      ? 'bg-gold-soft border-gold-border text-gold'
                      : 'bg-surface border-subtle text-muted hover:text-main'
                  }`}
                >
                  {NOTIFICATION_TIMING_LABELS[opt]}
                </button>
              );
            })}
            {reminderMinutesBefore.length > 0 && (
              <button
                type="button"
                onClick={() => setReminderMinutesBefore([])}
                className="px-2 py-1 text-[11px] text-muted hover:text-main underline"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>

        {showScopeSelector && (
          <div className="pt-2 border-t border-subtle">
            <label className="block text-xs font-medium text-muted mb-2">
              Apply Changes To
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'this_day', label: 'This day only' },
                { id: 'this_and_future', label: 'This & future days' },
                { id: 'all_30_days', label: 'All 30 days' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScope(opt.id as RoutineUpdateScope)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-center whitespace-nowrap ${
                    scope === opt.id
                      ? 'bg-gold-soft border-gold-border text-gold'
                      : 'bg-surface border-subtle text-muted hover:text-main'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mt-1.5">
              Completed historical tasks on past days are automatically preserved.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-rose-muted font-medium">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {initialTask ? 'Save Changes' : 'Add to Routine'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
