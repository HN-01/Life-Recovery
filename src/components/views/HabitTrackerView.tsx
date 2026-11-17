import React, { useState } from 'react';
import { Check, Edit2, Flame, Plus, Trash2 } from 'lucide-react';
import { AppState, Habit, TaskCategory } from '../../types';
import { ALL_CATEGORIES, createId } from '../../data/starterData';
import { addDaysToDateStr, KarachiNow } from '../../utils/dateUtils';
import { computeHabitCompletionRate, computeHabitStreak, getSortedDays } from '../../utils/metrics';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface HabitTrackerViewProps {
  state: AppState;
  now: KarachiNow;
  onToggleHabitDay: (habitId: string, dateStr: string) => void;
  onAddHabit: (habit: Habit) => void;
  onUpdateHabit: (habit: Habit) => void;
  onDeleteHabit: (habitId: string) => void;
  addModalOpen: boolean;
  onSetAddModalOpen: (open: boolean) => void;
}

export function HabitTrackerView({
  state,
  now,
  onToggleHabitDay,
  onAddHabit,
  onUpdateHabit,
  onDeleteHabit,
  addModalOpen,
  onSetAddModalOpen,
}: HabitTrackerViewProps) {
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Morning & Personal Care');
  const [frequency, setFrequency] = useState<Habit['frequency']>('daily');
  const [targetPerWeek, setTargetPerWeek] = useState(7);

  // Last 7 days ending today in Asia/Karachi
  const last7Dates = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(now.dateStr, i - 6));

  const sortedDays = getSortedDays(state);
  const challengeDatesUpToToday = sortedDays
    .filter((d) => d.date <= now.dateStr)
    .map((d) => d.date);
  const rateDates =
    challengeDatesUpToToday.length > 0 ? challengeDatesUpToToday : [now.dateStr];

  const todayDoneCount = state.habits.filter((h) => h.logs[now.dateStr]).length;
  const overallConsistency =
    state.habits.length > 0
      ? Math.round(
          state.habits.reduce(
            (acc, h) => acc + computeHabitCompletionRate(h, rateDates),
            0
          ) / state.habits.length
        )
      : 0;

  const openCreateModal = () => {
    setEditingHabit(null);
    setTitle('');
    setCategory('Morning & Personal Care');
    setFrequency('daily');
    setTargetPerWeek(7);
    onSetAddModalOpen(true);
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setTitle(habit.title);
    setCategory(habit.category);
    setFrequency(habit.frequency);
    setTargetPerWeek(habit.targetPerWeek);
    onSetAddModalOpen(true);
  };

  const handleSaveHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (editingHabit) {
      onUpdateHabit({
        ...editingHabit,
        title: title.trim(),
        category,
        frequency,
        targetPerWeek,
      });
    } else {
      onAddHabit({
        id: createId('habit'),
        title: title.trim(),
        category,
        frequency,
        targetPerWeek,
        logs: {},
        createdAt: now.dateStr,
      });
    }
    onSetAddModalOpen(false);
    setEditingHabit(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-subtle rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-main">
            Daily Habit Discipline
          </h1>
          <p className="text-xs text-muted mt-1">
            Honest progress tracking without punishment. Miss a day? Simply resume today.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right font-mono tabular-nums">
            <p className="text-xs text-muted">Today&apos;s Habits</p>
            <p className="text-sm font-semibold text-main">
              {todayDoneCount}/{state.habits.length} · {overallConsistency}% avg
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Habit
          </button>
        </div>
      </div>

      {/* Habit Matrix Table */}
      <div className="bg-card border border-subtle rounded-xl overflow-hidden">
        {state.habits.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-muted">
              No habits tracked yet.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
            >
              Create First Habit
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-subtle text-xs text-muted bg-surface">
                  <th className="py-3.5 px-5 font-medium">Habit</th>
                  {last7Dates.map((d) => {
                    const isToday = d === now.dateStr;
                    const dayNum = d.slice(8);
                    return (
                      <th
                        key={d}
                        className={`py-3.5 px-2 text-center font-mono tabular-nums font-medium ${
                          isToday ? 'text-gold font-semibold' : 'text-muted'
                        }`}
                      >
                        {isToday ? 'Today' : dayNum}
                      </th>
                    );
                  })}
                  <th className="py-3.5 px-4 text-right font-medium">Streak</th>
                  <th className="py-3.5 px-4 text-right font-medium">Consistency</th>
                  <th className="py-3.5 px-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {state.habits.map((habit) => {
                  const streak = computeHabitStreak(habit, now.dateStr);
                  const rate = computeHabitCompletionRate(habit, rateDates);

                  return (
                    <tr
                      key={habit.id}
                      className="hover:bg-surface/60 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <p className="text-sm font-medium text-main">
                          {habit.title}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {habit.category} · {habit.targetPerWeek}x/week ({habit.frequency})
                        </p>
                      </td>

                      {last7Dates.map((dateStr) => {
                        const checked = Boolean(habit.logs[dateStr]);
                        const isToday = dateStr === now.dateStr;
                        return (
                          <td key={dateStr} className="py-3.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => onToggleHabitDay(habit.id, dateStr)}
                              aria-label={`Toggle ${habit.title} on ${dateStr}`}
                              className={`w-7 h-7 rounded-md border inline-flex items-center justify-center transition-colors ${
                                checked
                                  ? 'bg-slate-accent border-slate-accent text-on-slate'
                                  : isToday
                                  ? 'bg-surface border-gold-border hover:border-gold'
                                  : 'bg-surface border-subtle hover:border-gold-border'
                              }`}
                            >
                              {checked && <Check className="w-4 h-4 stroke-[2.5]" />}
                            </button>
                          </td>
                        );
                      })}

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                        <span className="inline-flex items-center gap-1 text-gold font-medium">
                          <Flame className="w-3.5 h-3.5" />
                          {streak}d
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                        <span className="text-main font-medium">
                          {rate}%
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(habit)}
                            className="p-1.5 text-muted hover:text-main rounded hover:bg-surface transition-colors"
                            aria-label={`Edit ${habit.title}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingHabit(habit)}
                            className="p-1.5 text-muted hover:text-rose-muted rounded hover:bg-rose-soft transition-colors"
                            aria-label={`Delete ${habit.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Habit Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => {
          onSetAddModalOpen(false);
          setEditingHabit(null);
        }}
        title={editingHabit ? 'Edit Habit' : 'Add Custom Habit'}
        subtitle="Define a clear, repeatable daily or weekly discipline."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveHabit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Habit Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Practice programming 60 min"
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main placeholder:text-muted/70 focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            >
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => {
                  const f = e.target.value as Habit['frequency'];
                  setFrequency(f);
                  if (f === 'daily') setTargetPerWeek(7);
                  else if (f === 'weekdays') setTargetPerWeek(5);
                  else if (f === 'weekends') setTargetPerWeek(2);
                }}
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
              >
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekends">Weekends</option>
                <option value="custom">Custom Target</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Target Days / Week
              </label>
              <input
                type="number"
                min={1}
                max={7}
                value={targetPerWeek}
                onChange={(e) =>
                  setTargetPerWeek(Math.min(7, Math.max(1, Number(e.target.value) || 1)))
                }
                className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-subtle">
            <button
              type="button"
              onClick={() => {
                onSetAddModalOpen(false);
                setEditingHabit(null);
              }}
              className="px-4 py-2 text-sm font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
            >
              {editingHabit ? 'Save Habit' : 'Create Habit'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingHabit)}
        onClose={() => setDeletingHabit(null)}
        onConfirm={() => deletingHabit && onDeleteHabit(deletingHabit.id)}
        title="Delete Habit?"
        message={`Are you sure you want to remove "${deletingHabit?.title}" and its completion history?`}
        confirmLabel="Delete Habit"
      />
    </div>
  );
}
