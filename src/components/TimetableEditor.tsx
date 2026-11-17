import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Coffee,
  Copy,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ALL_CATEGORIES } from '../data/starterData';
import {
  BasicScheduleConfig,
  FixedCommitment,
  GoalTimeTarget,
  PersonalActivityInput,
  TaskCategory,
  TaskPriority,
  TemplateTask,
  WeeklyTimetable,
} from '../types';
import {
  formatDuration,
  formatTime12h,
  getDurationMinutes,
  timeToMinutes,
} from '../utils/dateUtils';

interface TimetableEditorProps {
  timetable: WeeklyTimetable;
  onChange: (next: WeeklyTimetable) => void;
  basicSchedule?: BasicScheduleConfig;
  commitments?: FixedCommitment[];
  activities?: PersonalActivityInput[];
  goalTargets?: GoalTimeTarget[];
}

const WEEKDAY_TABS: Array<{ dow: number; short: string; label: string }> = [
  { dow: 1, short: 'Mon', label: 'Monday' },
  { dow: 2, short: 'Tue', label: 'Tuesday' },
  { dow: 3, short: 'Wed', label: 'Wednesday' },
  { dow: 4, short: 'Thu', label: 'Thursday' },
  { dow: 5, short: 'Fri', label: 'Friday' },
  { dow: 6, short: 'Sat', label: 'Saturday' },
  { dow: 0, short: 'Sun', label: 'Sunday' },
];

const PRIORITIES: TaskPriority[] = ['Critical', 'High', 'Medium', 'Low'];

function sortDayBlocks(blocks: TemplateTask[]): TemplateTask[] {
  return [...blocks].sort(
    (a, b) =>
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
      timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
  );
}

function findOverlaps(blocks: TemplateTask[]): Array<{ a: TemplateTask; b: TemplateTask }> {
  const sorted = sortDayBlocks(blocks);
  const overlaps: Array<{ a: TemplateTask; b: TemplateTask }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const aStart = timeToMinutes(sorted[i].startTime);
    const aEnd =
      timeToMinutes(sorted[i].endTime) <= aStart
        ? 1440
        : timeToMinutes(sorted[i].endTime);
    for (let j = i + 1; j < sorted.length; j++) {
      const bStart = timeToMinutes(sorted[j].startTime);
      const bEnd =
        timeToMinutes(sorted[j].endTime) <= bStart
          ? 1440
          : timeToMinutes(sorted[j].endTime);
      if (aStart < bEnd && bStart < aEnd) {
        overlaps.push({ a: sorted[i], b: sorted[j] });
      }
    }
  }
  return overlaps;
}

export function TimetableEditor({
  timetable,
  onChange,
  basicSchedule,
  commitments,
  activities,
  goalTargets,
}: TimetableEditorProps) {
  const [selectedDow, setSelectedDow] = useState<number>(1);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [aiError, setAiError] = useState('');

  // New block draft
  const [newTitle, setNewTitle] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('10:00');
  const [newCategory, setNewCategory] = useState<TaskCategory>('Programming');
  const [newPriority, setNewPriority] = useState<TaskPriority>('High');
  const [newDescription, setNewDescription] = useState('');
  const [newIsBreak, setNewIsBreak] = useState(false);

  const dayBlocks = timetable[selectedDow] || [];
  const overlaps = useMemo(() => findOverlaps(dayBlocks), [dayBlocks]);

  const setDayBlocks = (dow: number, nextBlocks: TemplateTask[]) => {
    onChange({
      ...timetable,
      [dow]: nextBlocks,
    });
  };

  const handleAddBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (timeToMinutes(newEnd) <= timeToMinutes(newStart) && newEnd !== '23:59') {
      setAiError('End time must be after start time.');
      return;
    }
    setAiError('');
    const nextBlock: TemplateTask = {
      templateKey: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: newTitle.trim(),
      startTime: newStart,
      endTime: newEnd,
      category: newIsBreak ? 'Break & Buffer' : newCategory,
      priority: newPriority,
      description: newDescription.trim(),
      isBreak: newIsBreak,
    };
    setDayBlocks(selectedDow, sortDayBlocks([...dayBlocks, nextBlock]));
    setNewTitle('');
    setNewDescription('');
    setNewIsBreak(false);
  };

  const updateBlock = (idx: number, patch: Partial<TemplateTask>) => {
    const next = dayBlocks.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    setDayBlocks(selectedDow, next);
  };

  const removeBlock = (idx: number) => {
    setDayBlocks(
      selectedDow,
      dayBlocks.filter((_, i) => i !== idx)
    );
  };

  const moveBlock = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= dayBlocks.length || fromIdx === toIdx) return;
    const copy = [...dayBlocks];
    const [item] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, item);
    setDayBlocks(selectedDow, copy);
  };

  const copyDayTo = (targetDows: number[], label: string) => {
    const cloned = dayBlocks.map((b) => ({ ...b }));
    const next: WeeklyTimetable = { ...timetable };
    for (const d of targetDows) {
      next[d] = cloned.map((b) => ({ ...b }));
    }
    onChange(next);
    setAiStatus(`Copied ${WEEKDAY_TABS.find((t) => t.dow === selectedDow)?.label}'s schedule to ${label}.`);
    setAiError('');
  };

  const requestAiSuggestion = async () => {
    setAiLoading(true);
    setAiError('');
    setAiStatus('');
    try {
      const resp = await fetch('/api/onboarding/recommend-timetable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          basicSchedule: basicSchedule || {},
          commitments: commitments || [],
          activities: activities || [],
          goalTargets: goalTargets || [],
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success || !Array.isArray(data.weeklyBlocks)) {
        throw new Error(data.error || 'Unable to generate AI timetable recommendation.');
      }

      const next: WeeklyTimetable = {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      };
      const validCats = new Set<string>(ALL_CATEGORIES);
      const validPrios = new Set<string>(PRIORITIES);

      for (const blk of data.weeklyBlocks) {
        const dow = Number(blk.dayOfWeek);
        if (dow < 0 || dow > 6 || !blk.title || !blk.startTime || !blk.endTime) continue;
        next[dow].push({
          templateKey: `ai_tt_${dow}_${next[dow].length}`,
          title: String(blk.title).trim(),
          startTime: String(blk.startTime).slice(0, 5),
          endTime: String(blk.endTime).slice(0, 5),
          category: validCats.has(blk.category) ? (blk.category as TaskCategory) : 'Programming',
          priority: validPrios.has(blk.priority) ? (blk.priority as TaskPriority) : 'High',
          description: String(blk.description || ''),
          isBreak: Boolean(blk.isBreak),
        });
      }

      for (let d = 0; d <= 6; d++) {
        next[d] = sortDayBlocks(next[d]);
      }

      onChange(next);
      setAiStatus(data.rationale || 'AI schedule suggestion loaded. Review and adjust freely.');
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'AI schedule generator unavailable. Continue customizing manually below.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: Weekday Tabs + Optional AI Suggest */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-surface border border-subtle rounded-xl">
          {WEEKDAY_TABS.map((tab) => {
            const count = (timetable[tab.dow] || []).length;
            const isActive = selectedDow === tab.dow;
            return (
              <button
                key={tab.dow}
                type="button"
                onClick={() => setSelectedDow(tab.dow)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-gold text-on-gold font-semibold'
                    : 'text-muted hover:text-main'
                }`}
              >
                {tab.short}{' '}
                <span className="font-mono tabular-nums opacity-80">({count})</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={aiLoading}
          onClick={requestAiSuggestion}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gold bg-gold-soft border border-gold-border hover:opacity-90 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          {aiLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {aiLoading ? 'Generating...' : 'AI Suggest Weekly Layout'}
        </button>
      </div>

      {aiStatus && (
        <div className="p-3 rounded-xl bg-slate-soft border border-slate-border text-xs text-slate-accent">
          {aiStatus}
        </div>
      )}
      {aiError && (
        <div className="p-3 rounded-xl bg-rose-soft border border-rose-border text-xs text-rose-muted">
          {aiError}
        </div>
      )}

      {/* Copy Day Shortcuts */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-surface border border-subtle rounded-xl px-3.5 py-2.5">
        <span className="text-muted">
          Editing{' '}
          <strong className="text-main">
            {WEEKDAY_TABS.find((t) => t.dow === selectedDow)?.label}
          </strong>{' '}
          · {dayBlocks.length} block{dayBlocks.length === 1 ? '' : 's'}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copyDayTo([1, 2, 3, 4, 5], 'all weekdays (Mon–Fri)')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-main bg-card border border-subtle hover:border-gold-border rounded-lg"
          >
            <Copy className="w-3 h-3 text-gold" />
            Copy to Mon–Fri
          </button>
          <button
            type="button"
            onClick={() => copyDayTo([0, 6], 'weekend (Sat–Sun)')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-main bg-card border border-subtle hover:border-gold-border rounded-lg"
          >
            <Copy className="w-3 h-3 text-slate-accent" />
            Copy to Weekend
          </button>
          <button
            type="button"
            onClick={() => copyDayTo([0, 1, 2, 3, 4, 5, 6], 'all 7 days')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-main bg-card border border-subtle hover:border-gold-border rounded-lg"
          >
            <Copy className="w-3 h-3 text-muted" />
            Copy to All 7 Days
          </button>
        </div>
      </div>

      {/* Overlap Warning */}
      {overlaps.length > 0 && (
        <div className="p-3 rounded-xl bg-gold-soft border border-gold-border flex items-start gap-2.5 text-xs text-main">
          <AlertTriangle className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-gold">
              {overlaps.length} time overlap{overlaps.length === 1 ? '' : 's'} detected on{' '}
              {WEEKDAY_TABS.find((t) => t.dow === selectedDow)?.label}
            </p>
            <p className="text-muted mt-0.5">
              &ldquo;{overlaps[0].a.title}&rdquo; ({formatTime12h(overlaps[0].a.startTime)}–
              {formatTime12h(overlaps[0].a.endTime)}) overlaps &ldquo;{overlaps[0].b.title}&rdquo; (
              {formatTime12h(overlaps[0].b.startTime)}–{formatTime12h(overlaps[0].b.endTime)}).
            </p>
          </div>
        </div>
      )}

      {/* Drag & Drop / Reorderable Block List */}
      {dayBlocks.length === 0 ? (
        <div className="p-6 rounded-xl bg-surface border border-subtle text-center text-xs text-muted">
          No blocks scheduled for {WEEKDAY_TABS.find((t) => t.dow === selectedDow)?.label}. Add custom blocks below or copy from another day.
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {dayBlocks.map((block, idx) => {
            const dur = getDurationMinutes(block.startTime, block.endTime);
            return (
              <div
                key={`${block.templateKey || block.title}-${idx}`}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) moveBlock(dragIdx, idx);
                  setDragIdx(null);
                }}
                onDragEnd={() => setDragIdx(null)}
                className={`p-2.5 rounded-xl bg-surface border transition-colors flex flex-wrap items-center gap-2 ${
                  dragIdx === idx ? 'border-gold opacity-70' : 'border-subtle'
                }`}
              >
                <span
                  className="text-muted cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4" />
                </span>

                <input
                  type="time"
                  value={block.startTime}
                  onChange={(e) => updateBlock(idx, { startTime: e.target.value })}
                  className="px-2 py-1.5 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                />
                <input
                  type="time"
                  value={block.endTime}
                  onChange={(e) => updateBlock(idx, { endTime: e.target.value })}
                  className="px-2 py-1.5 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                />

                <input
                  type="text"
                  value={block.title}
                  onChange={(e) => updateBlock(idx, { title: e.target.value })}
                  className="flex-1 min-w-[140px] px-2.5 py-1.5 bg-card border border-subtle rounded-lg text-xs text-main"
                />

                <select
                  value={block.category}
                  onChange={(e) =>
                    updateBlock(idx, { category: e.target.value as TaskCategory })
                  }
                  className="px-2 py-1.5 bg-card border border-subtle rounded-lg text-xs text-main"
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <span className="text-[11px] font-mono tabular-nums text-gold shrink-0 px-1">
                  {formatDuration(dur)}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveBlock(idx, idx - 1)}
                    className="p-1 text-muted hover:text-main disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === dayBlocks.length - 1}
                    onClick={() => moveBlock(idx, idx + 1)}
                    className="p-1 text-muted hover:text-main disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(idx)}
                    className="p-1 text-muted hover:text-rose-muted"
                    aria-label="Remove block"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Block Form */}
      <form
        onSubmit={handleAddBlock}
        className="p-3.5 rounded-xl bg-surface border border-subtle space-y-2.5"
      >
        <p className="text-xs font-semibold text-main">
          Add Activity to {WEEKDAY_TABS.find((t) => t.dow === selectedDow)?.label}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Activity title (e.g., Study, Coding, Gym, Class)"
            className="sm:col-span-5 px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main placeholder:text-muted/70"
          />
          <input
            type="time"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            className="sm:col-span-2 px-2 py-2 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
          />
          <input
            type="time"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
            className="sm:col-span-2 px-2 py-2 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
            className="sm:col-span-3 px-2 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
          >
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              className="px-2.5 py-1.5 bg-card border border-subtle rounded-lg text-xs text-main"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p} Priority
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-main cursor-pointer">
              <input
                type="checkbox"
                checked={newIsBreak}
                onChange={(e) => setNewIsBreak(e.target.checked)}
                className="rounded border-subtle bg-card accent-[var(--accent-gold)]"
              />
              <Coffee className="w-3.5 h-3.5 text-muted" />
              <span>Break / Recovery</span>
            </label>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Block
          </button>
        </div>
      </form>
    </div>
  );
}
