import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  LayoutGrid,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Target,
} from 'lucide-react';
import {
  AppState,
  DashboardPreferences,
  DashboardWidgetId,
  DayPlan,
  FocusSession,
  NavSection,
  RoutineTask,
  TaskPriority,
} from '../../types';
import { createId, SCHEDULE_TYPE_LABELS } from '../../data/starterData';
import {
  formatDuration,
  formatShortDate,
  formatTime12h,
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
} from '../../utils/dateUtils';
import {
  computeBestActiveHabitStreak,
  computeDayStats,
  computeOverallProgress,
  getSortedDays,
} from '../../utils/metrics';
import {
  assignTimelineLanes,
  computeAttentionQuality,
  computeCoachDailyInsight,
  computeDeepWorkMetrics,
  computeFocusStability,
  deduplicateDayTasks,
  DEFAULT_WIDGET_ORDER,
  formatTimerClock,
  normalizeDashboardPreferences,
  WIDGET_CATALOG,
} from '../../utils/focusMetrics';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface DashboardViewProps {
  state: AppState;
  viewedDay: DayPlan | undefined;
  viewedDate: string;
  todayDateStr: string;
  now: KarachiNow;
  onSelectDate: (dateStr: string) => void;
  onToggleTaskStatus: (dateStr: string, taskId: string) => void;
  onQuickAddTask: () => void;
  onQuickAddHabit: () => void;
  onNavigate: (section: NavSection) => void;
  onOpenCoachWithPrompt: (prompt: string) => void;
  onDuplicateYesterday: () => void;
  onStartNewPlan: () => void;
  onOpenDailyReview: () => void;
  onOpenSmartPlan: () => void;
  onEditTask: (task: RoutineTask) => void;
  onDeduplicateDayTasks?: (dateStr: string) => void;
  onAddFocusSession: (dateStr: string, session: FocusSession) => void;
  onUpdateDashboardPreferences: (prefs: DashboardPreferences) => void;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const TIMELINE_AXIS_TICKS: Array<{ label: string; pct: number }> = [
  { label: '8 AM', pct: 0 },
  { label: '10 AM', pct: 16.6667 },
  { label: '12 PM', pct: 33.3333 },
  { label: '2 PM', pct: 50 },
  { label: '4 PM', pct: 66.6667 },
  { label: '6 PM', pct: 83.3333 },
  { label: '8 PM', pct: 100 },
];

function getPriorityVisuals(priority: TaskPriority, effectiveState: ReturnType<typeof getEffectiveTaskState>) {
  const priorityTone =
    priority === 'Critical'
      ? { dot: 'bg-rose-400', label: 'text-rose-300', bar: 'bg-rose-500/25 border-rose-500/50 hover:bg-rose-500/35' }
      : priority === 'High'
      ? { dot: 'bg-amber-400', label: 'text-amber-300', bar: 'bg-amber-500/25 border-amber-500/50 hover:bg-amber-500/35' }
      : priority === 'Medium'
      ? { dot: 'bg-sky-400', label: 'text-sky-300', bar: 'bg-sky-500/25 border-sky-500/50 hover:bg-sky-500/35' }
      : { dot: 'bg-slate-400', label: 'text-slate-300', bar: 'bg-slate-500/25 border-slate-500/45 hover:bg-slate-500/35' };

  if (effectiveState === 'completed') {
    return {
      ...priorityTone,
      bar: 'bg-emerald-500/25 border-emerald-500/50 hover:bg-emerald-500/35',
      statusText: 'Completed',
      statusClass: 'text-emerald-400',
    };
  }
  if (effectiveState === 'missed') {
    return {
      ...priorityTone,
      statusText: 'Missed',
      statusClass: 'text-rose-400',
    };
  }
  if (effectiveState === 'skipped') {
    return {
      ...priorityTone,
      statusText: 'Skipped',
      statusClass: 'text-slate-500',
    };
  }
  if (effectiveState === 'active') {
    return {
      ...priorityTone,
      statusText: 'Pending · Active',
      statusClass: 'text-amber-300',
    };
  }
  return {
    ...priorityTone,
    statusText: 'Pending',
    statusClass: 'text-slate-300',
  };
}

export function DashboardView({
  state,
  viewedDay,
  viewedDate,
  todayDateStr,
  now,
  onSelectDate,
  onToggleTaskStatus,
  onQuickAddTask,
  onQuickAddHabit,
  onNavigate,
  onOpenCoachWithPrompt,
  onDuplicateYesterday,
  onStartNewPlan,
  onOpenDailyReview,
  onOpenSmartPlan,
  onEditTask,
  onDeduplicateDayTasks,
  onAddFocusSession,
  onUpdateDashboardPreferences,
}: DashboardViewProps) {
  const [customizeMode, setCustomizeMode] = useState(false);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);
  const [deduplicateConfirmOpen, setDeduplicateConfirmOpen] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Interactive Deep Work Focus Timer State (persists real FocusSession records to Firestore)
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerElapsedSeconds, setTimerElapsedSeconds] = useState(0);
  const [timerPauseCount, setTimerPauseCount] = useState(0);
  const [selectedFocusTaskId, setSelectedFocusTaskId] = useState<string>('');

  useEffect(() => {
    if (timerStatus !== 'running') return;
    const interval = window.setInterval(() => {
      setTimerElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerStatus]);

  const sortedDays = useMemo(() => getSortedDays(state), [state]);
  const currentIdx = sortedDays.findIndex((d) => d.date === viewedDate);
  const prevDay = currentIdx > 0 ? sortedDays[currentIdx - 1] : undefined;
  const nextDay =
    currentIdx >= 0 && currentIdx < sortedDays.length - 1
      ? sortedDays[currentIdx + 1]
      : undefined;

  const dayStats = useMemo(() => computeDayStats(viewedDay, now), [viewedDay, now]);
  const overall = useMemo(() => computeOverallProgress(state, now), [state, now]);
  const bestStreak = useMemo(
    () => computeBestActiveHabitStreak(state.habits, now.dateStr),
    [state.habits, now.dateStr]
  );

  const sessions = viewedDay?.focusSessions || [];
  const liveTimerBonus =
    viewedDate === todayDateStr && timerStatus !== 'idle' ? timerElapsedSeconds : 0;
  const deepWork = useMemo(
    () => computeDeepWorkMetrics(sessions, liveTimerBonus),
    [sessions, liveTimerBonus]
  );
  const attentionQuality = useMemo(() => computeAttentionQuality(sessions), [sessions]);
  const focusStability = useMemo(() => computeFocusStability(sessions), [sessions]);
  const coachInsight = useMemo(
    () => computeCoachDailyInsight(state, viewedDay, now),
    [state, viewedDay, now]
  );

  const rawTasks = viewedDay?.tasks ?? [];
  const {
    tasks,
    duplicateCount,
    duplicateTitles,
  } = useMemo(() => deduplicateDayTasks(rawTasks), [rawTasks]);
  const timelineLayout = useMemo(() => assignTimelineLanes(tasks, 480, 1200), [tasks]);

  const updateCarouselScrollButtons = useCallback(() => {
    const el = carouselRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (el) {
      el.scrollLeft = 0;
    }
    setHighlightedTaskId(null);
  }, [viewedDate]);

  useEffect(() => {
    const el = carouselRef.current;
    updateCarouselScrollButtons();
    if (!el) return;

    const handleResize = () => updateCarouselScrollButtons();
    el.addEventListener('scroll', updateCarouselScrollButtons, { passive: true });
    window.addEventListener('resize', handleResize);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleResize);
      observer.observe(el);
    }
    const raf = window.requestAnimationFrame(updateCarouselScrollButtons);

    return () => {
      el.removeEventListener('scroll', updateCarouselScrollButtons);
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [tasks.length, viewedDate, updateCarouselScrollButtons]);

  const scrollCarouselBy = (direction: -1 | 1) => {
    const el = carouselRef.current;
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const step = Math.max(280, Math.round(el.clientWidth * 0.78));
    el.scrollBy({
      left: direction * step,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  const focusCarouselCard = (taskId: string) => {
    const container = carouselRef.current;
    const card = cardRefs.current[taskId];
    if (container && card) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const targetLeft =
        card.offsetLeft - Math.max(0, (container.clientWidth - card.offsetWidth) / 2);
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
    setHighlightedTaskId(taskId);
    window.setTimeout(() => {
      setHighlightedTaskId((prev) => (prev === taskId ? null : prev));
    }, 2200);
  };

  const topPriorities = useMemo(
    () =>
      [...tasks]
        .filter((t) => !t.isBreak)
        .sort((a, b) => {
          const pDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
          if (pDiff !== 0) return pDiff;
          return a.startTime.localeCompare(b.startTime);
        })
        .slice(0, 5),
    [tasks]
  );

  const actionableTotal = Math.max(0, dayStats.total - dayStats.skipped);
  const prefs = useMemo(
    () => normalizeDashboardPreferences(state.profile.dashboardPreferences),
    [state.profile.dashboardPreferences]
  );
  const hiddenSet = new Set(prefs.hiddenWidgets);
  const visibleWidgets = prefs.widgetOrder.filter((id) => !hiddenSet.has(id));

  const savePrefs = (next: DashboardPreferences) => {
    onUpdateDashboardPreferences({
      ...next,
      updatedAt: new Date().toISOString(),
    });
  };

  const moveWidget = (id: DashboardWidgetId, dir: -1 | 1) => {
    const visible = [...visibleWidgets];
    const idx = visible.indexOf(id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= visible.length) return;
    [visible[idx], visible[swapIdx]] = [visible[swapIdx], visible[idx]];
    const nextOrder: DashboardWidgetId[] = [
      ...visible,
      ...prefs.widgetOrder.filter((w) => hiddenSet.has(w)),
    ];
    savePrefs({ ...prefs, widgetOrder: nextOrder });
  };

  const toggleWidgetVisibility = (id: DashboardWidgetId) => {
    const isHidden = hiddenSet.has(id);
    const nextHidden = isHidden
      ? prefs.hiddenWidgets.filter((w) => w !== id)
      : [...prefs.hiddenWidgets, id];
    savePrefs({ ...prefs, hiddenWidgets: nextHidden });
  };

  const resetWidgetLayout = () => {
    savePrefs({
      widgetOrder: [...DEFAULT_WIDGET_ORDER],
      hiddenWidgets: [],
      compactTimeline: false,
    });
  };

  // Focus timer controls
  const startFocusTimer = () => {
    setTimerStartedAt(new Date().toISOString());
    setTimerElapsedSeconds(0);
    setTimerPauseCount(0);
    setTimerStatus('running');
  };

  const pauseFocusTimer = () => {
    setTimerStatus('paused');
    setTimerPauseCount((c) => c + 1);
  };

  const resumeFocusTimer = () => {
    setTimerStatus('running');
  };

  const finishAndSaveFocusSession = () => {
    if (timerElapsedSeconds < 10) {
      // Avoid polluting Firestore with accidental 1-second clicks; reset cleanly
      setTimerStatus('idle');
      setTimerElapsedSeconds(0);
      setTimerStartedAt(null);
      setTimerPauseCount(0);
      return;
    }
    const targetTask = tasks.find((t) => t.id === selectedFocusTaskId);
    const session: FocusSession = {
      id: createId('focus'),
      taskId: targetTask?.id,
      taskTitle: targetTask?.title || 'Deep Work Session',
      startedAt: timerStartedAt || new Date(Date.now() - timerElapsedSeconds * 1000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: timerElapsedSeconds,
      pauseCount: timerPauseCount,
      completedNaturally: true,
    };
    onAddFocusSession(viewedDate, session);
    setTimerStatus('idle');
    setTimerElapsedSeconds(0);
    setTimerStartedAt(null);
    setTimerPauseCount(0);
  };

  const renderWidgetWrapper = (id: DashboardWidgetId, content: React.ReactNode) => {
    const meta = WIDGET_CATALOG.find((w) => w.id === id);
    const visibleIdx = visibleWidgets.indexOf(id);

    return (
      <div key={id} className="relative">
        {customizeMode && (
          <div className="mb-2 px-3.5 py-2 rounded-xl bg-[#15171E] border border-amber-500/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{meta?.title || id}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={visibleIdx <= 0}
                onClick={() => moveWidget(id, -1)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-200 bg-[#0A0A0C] border border-white/10 rounded-lg hover:border-amber-500/40 disabled:opacity-35"
                aria-label={`Move ${meta?.title} up`}
              >
                <ArrowUp className="w-3 h-3" />
                Up
              </button>
              <button
                type="button"
                disabled={visibleIdx < 0 || visibleIdx >= visibleWidgets.length - 1}
                onClick={() => moveWidget(id, 1)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-200 bg-[#0A0A0C] border border-white/10 rounded-lg hover:border-amber-500/40 disabled:opacity-35"
                aria-label={`Move ${meta?.title} down`}
              >
                <ArrowDown className="w-3 h-3" />
                Down
              </button>
              <button
                type="button"
                onClick={() => toggleWidgetVisibility(id)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-300 hover:text-rose-300 bg-[#0A0A0C] border border-white/10 rounded-lg"
                aria-label={`Hide ${meta?.title}`}
              >
                <EyeOff className="w-3 h-3" />
                Hide
              </button>
            </div>
          </div>
        )}
        {content}
      </div>
    );
  };

  const renderWidgetBody = (id: DashboardWidgetId) => {
    switch (id) {
      case 'metrics':
        return (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {/* CARD 1: DEEP WORK TIME */}
            <div className="relative overflow-hidden bg-[#111216] border border-white/8 rounded-2xl p-5 flex flex-col justify-between">
              <div
                className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full bg-amber-500/15 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-400">
                    Deep Work Time
                  </p>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {deepWork.totalSessions} session{deepWork.totalSessions === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-3xl font-semibold font-mono tabular-nums text-white tracking-tight">
                  {deepWork.formattedDuration}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {deepWork.totalSeconds > 0
                    ? `Focused work logged on ${formatShortDate(viewedDate)}.`
                    : 'No focus sessions recorded for this day yet.'}
                </p>
              </div>

              {/* Interactive Focus Timer synced to Firestore */}
              <div className="relative mt-4 pt-3.5 border-t border-white/8 space-y-2.5">
                {timerStatus === 'idle' ? (
                  <div className="space-y-2">
                    {tasks.filter((t) => !t.isBreak).length > 0 && (
                      <select
                        aria-label="Select task for Deep Work timer"
                        value={selectedFocusTaskId}
                        onChange={(e) => setSelectedFocusTaskId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#0A0A0C] border border-white/10 rounded-lg text-xs text-slate-300 truncate focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">General Deep Work</option>
                        {tasks
                          .filter((t) => !t.isBreak)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={startFocusTimer}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start Focus Session
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-300 font-medium">
                        {timerStatus === 'running' ? 'Focusing now' : 'Paused'}
                      </span>
                      <span className="font-mono tabular-nums text-sm font-semibold text-white">
                        {formatTimerClock(timerElapsedSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {timerStatus === 'running' ? (
                        <button
                          type="button"
                          onClick={pauseFocusTimer}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#0A0A0C] border border-white/10 hover:border-amber-500/40 rounded-lg"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={resumeFocusTimer}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={finishAndSaveFocusSession}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 rounded-lg"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        {timerElapsedSeconds >= 10 ? 'Log' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 2: ATTENTION QUALITY */}
            <div className="relative overflow-hidden bg-[#111216] border border-amber-500/20 rounded-2xl p-5 flex flex-col justify-between">
              <div
                className="pointer-events-none absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-amber-500/12 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-400">
                    Attention Quality
                  </p>
                  {attentionQuality.available && (
                    <span className="text-[11px] font-medium text-amber-300">
                      {attentionQuality.label}
                    </span>
                  )}
                </div>
                {attentionQuality.available && attentionQuality.score !== null ? (
                  <p className="text-3xl font-semibold font-mono tabular-nums text-white tracking-tight">
                    {attentionQuality.score}%
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-slate-200 pt-1">
                    Not enough data
                  </p>
                )}
                <p className="text-xs text-slate-400 leading-relaxed">
                  {attentionQuality.explanation}
                </p>
              </div>

              <div className="relative mt-4 pt-3.5 border-t border-white/8">
                <div className="h-2 bg-[#0A0A0C] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                    style={{
                      width: `${
                        attentionQuality.available && attentionQuality.score !== null
                          ? attentionQuality.score
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Uninterrupted continuity across logged Deep Work blocks
                </p>
              </div>
            </div>

            {/* CARD 3: FOCUS STABILITY (Wider 2-col card) */}
            <div className="relative overflow-hidden md:col-span-2 bg-[#111216] border border-white/8 rounded-2xl p-5 flex flex-col justify-between">
              <div
                className="pointer-events-none absolute -top-14 right-8 w-48 h-32 rounded-full bg-sky-500/10 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-400">
                    Focus Stability
                  </p>
                  <div className="flex items-baseline gap-3 mt-1.5">
                    {focusStability.hasScore && focusStability.score !== null ? (
                      <span className="text-3xl font-semibold font-mono tabular-nums text-white">
                        {focusStability.score}%
                      </span>
                    ) : (
                      <span className="text-lg font-semibold text-slate-200">
                        Not enough data
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      Current Score
                    </span>
                  </div>
                </div>

                {focusStability.hasData && focusStability.peakWindowLabel && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300">
                      <Sparkles className="w-3 h-3" />
                      {focusStability.peakPeriodName}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      Peak Time: {focusStability.peakWindowLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* 2-hour Vertical Bar Chart across 8AM - 8PM */}
              <div className="relative mt-5">
                <div className="grid grid-cols-6 gap-3 items-end h-24 px-1">
                  {focusStability.buckets.map((bucket) => {
                    const barHeightPct =
                      bucket.minutes > 0 ? Math.max(16, bucket.intensityPct) : 6;
                    return (
                      <div
                        key={bucket.label}
                        onMouseEnter={() => setHoveredBucket(bucket.label)}
                        onMouseLeave={() => setHoveredBucket(null)}
                        className="relative flex flex-col items-center justify-end h-full group"
                      >
                        {hoveredBucket === bucket.label && (
                          <div className="absolute -top-7 px-2 py-0.5 rounded bg-[#0A0A0C] border border-white/15 text-[10px] font-mono tabular-nums text-white whitespace-nowrap z-10">
                            {bucket.minutes}m
                          </div>
                        )}
                        <div className="w-full max-w-[34px] flex-1 flex items-end justify-center">
                          <div
                            className={`w-full rounded-t-lg transition-all duration-300 ${
                              bucket.minutes === 0
                                ? 'bg-white/[0.06]'
                                : bucket.isPeak
                                ? 'bg-gradient-to-t from-amber-600 to-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.45)]'
                                : 'bg-gradient-to-t from-sky-600/70 to-amber-400/80'
                            }`}
                            style={{ height: `${barHeightPct}%` }}
                          />
                        </div>
                        <span
                          className={`mt-2 text-[11px] font-mono tabular-nums ${
                            bucket.isPeak ? 'text-amber-300 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          {bucket.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-3">{focusStability.explanation}</p>
              </div>
            </div>
          </section>
        );

      case 'ai_coach':
        return (
          <section className="relative overflow-hidden bg-[#111216] border border-amber-500/25 rounded-2xl p-6">
            <div
              className="pointer-events-none absolute -top-20 -right-12 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-24 left-12 w-56 h-56 rounded-full bg-sky-500/10 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Your AI Life Coach</h2>
                    <p className="text-xs text-slate-400">
                      Your personal intelligence partner for planning, productivity, discipline and personal growth.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0A0A0C]/90 border border-white/8 space-y-1.5">
                  <p className="text-xs font-medium text-amber-300">{coachInsight.headline}</p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {coachInsight.recommendation}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('coach')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors whitespace-nowrap shadow-[0_0_24px_rgba(245,158,11,0.22)]"
                >
                  <Sparkles className="w-4 h-4" />
                  Open AI Coach
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCoachWithPrompt(coachInsight.focusPrompt)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap"
                >
                  Discuss Today&apos;s Insight
                </button>
              </div>
            </div>
          </section>
        );

      case 'timeline': {
        const showLiveNowMarker =
          viewedDate === todayDateStr &&
          now.minutesSinceMidnight >= 480 &&
          now.minutesSinceMidnight <= 1200;
        const liveNowPct = showLiveNowMarker
          ? ((now.minutesSinceMidnight - 480) / 720) * 100
          : 0;

        return (
          <section className="bg-[#111216] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Daily Timeline</h2>
                <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                  8 AM – 8 PM time scale &amp; scheduled task carousel · {tasks.length} block{tasks.length === 1 ? '' : 's'} for {formatShortDate(viewedDate)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Priority Color Legend */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    Critical
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    High
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    Medium
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Low
                  </span>
                </div>

                {/* Carousel Controls */}
                {tasks.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => scrollCarouselBy(-1)}
                      disabled={!canScrollLeft}
                      aria-label="Scroll tasks left"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-[#0A0A0C] border border-white/10 text-slate-200 hover:border-amber-500/45 hover:text-amber-300 disabled:opacity-35 disabled:hover:border-white/10 disabled:hover:text-slate-200 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollCarouselBy(1)}
                      disabled={!canScrollRight}
                      aria-label="Scroll tasks right"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-[#0A0A0C] border border-white/10 text-slate-200 hover:border-amber-500/45 hover:text-amber-300 disabled:opacity-35 disabled:hover:border-white/10 disabled:hover:text-slate-200 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onNavigate('routine')}
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap"
                >
                  Open Full Routine
                </button>
              </div>
            </div>

            {duplicateCount > 0 && (
              <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {duplicateCount} duplicate task record{duplicateCount === 1 ? '' : 's'} detected in Firestore
                      {duplicateTitles.length > 0 ? ` (${duplicateTitles.join(', ')})` : ''}.
                    </p>
                    <p className="text-[11px] text-amber-200/80 mt-0.5">
                      Duplicate rendering is suppressed automatically. Clean up stored records only if you confirm.
                    </p>
                  </div>
                </div>
                {onDeduplicateDayTasks && (
                  <button
                    type="button"
                    onClick={() => setDeduplicateConfirmOpen(true)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Clean Up Duplicates
                  </button>
                )}
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-400">
                  No tasks scheduled for {formatShortDate(viewedDate)}.
                </p>
                <button
                  type="button"
                  onClick={onQuickAddTask}
                  className="mt-3 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors"
                >
                  Add First Task
                </button>
              </div>
            ) : (
              <div className="p-5 sm:p-6 space-y-5">
                {/* Accurate Proportional 8 AM - 8 PM Time Scale Ruler (Desktop & Tablet) */}
                <div className="hidden md:block">
                  <div className="relative h-5 border-b border-white/8 text-[11px] font-mono tabular-nums text-slate-500">
                    {TIMELINE_AXIS_TICKS.map((tick, idx) => (
                      <span
                        key={tick.label}
                        style={{ left: `${tick.pct}%` }}
                        className={`absolute top-0 whitespace-nowrap ${
                          idx === 0
                            ? 'translate-x-0'
                            : idx === TIMELINE_AXIS_TICKS.length - 1
                            ? '-translate-x-full'
                            : '-translate-x-1/2'
                        }`}
                      >
                        {tick.label}
                      </span>
                    ))}
                  </div>

                  {timelineLayout.positioned.length === 0 ? (
                    <div className="mt-3 py-3 px-4 rounded-xl bg-[#0A0A0C] border border-white/8 text-center text-xs text-slate-400">
                      All scheduled blocks for {formatShortDate(viewedDate)} fall outside the 8 AM – 8 PM window. Browse them in the carousel below.
                    </div>
                  ) : (
                    <div
                      className="relative mt-2.5 rounded-xl bg-[#0A0A0C] border border-white/8 overflow-hidden"
                      style={{ height: `${Math.max(1, timelineLayout.laneCount) * 24 + 12}px` }}
                    >
                      {/* Exact 2-hour vertical guide grid */}
                      <div
                        className="pointer-events-none absolute inset-0 grid grid-cols-6"
                        aria-hidden="true"
                      >
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <div
                            key={idx}
                            className="border-r border-white/[0.05] last:border-r-0 h-full"
                          />
                        ))}
                      </div>

                      {/* Live Current Time Hairline (Today 8 AM - 8 PM) */}
                      {showLiveNowMarker && (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-400/80 z-10"
                          style={{ left: `${liveNowPct}%` }}
                          aria-hidden="true"
                        />
                      )}

                      {timelineLayout.positioned.map((item) => {
                        const eff = getEffectiveTaskState(item.task, viewedDate, now);
                        const visuals = getPriorityVisuals(item.task.priority, eff);
                        const dur = getDurationMinutes(item.task.startTime, item.task.endTime);
                        return (
                          <button
                            key={item.task.id}
                            type="button"
                            onClick={() => focusCarouselCard(item.task.id)}
                            title={`${item.task.title} · ${formatTime12h(
                              item.task.startTime
                            )} – ${formatTime12h(item.task.endTime)} (${formatDuration(dur)}) · ${
                              item.task.priority
                            } · ${visuals.statusText}`}
                            aria-label={`Jump to ${item.task.title} (${formatTime12h(
                              item.task.startTime
                            )} to ${formatTime12h(item.task.endTime)})`}
                            style={{
                              left: `${item.leftPct}%`,
                              width: `${item.widthPct}%`,
                              top: `${item.lane * 24 + 6}px`,
                              height: '16px',
                            }}
                            className={`absolute rounded-md border transition-colors ${visuals.bar} ${
                              highlightedTaskId === item.task.id
                                ? 'ring-1 ring-amber-400 border-amber-400'
                                : ''
                            }`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Horizontal Scrolling Task Card Carousel */}
                <div
                  ref={carouselRef}
                  role="region"
                  aria-label={`Scheduled tasks carousel for ${formatShortDate(viewedDate)}`}
                  className="flex items-stretch gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2"
                >
                  {tasks.map((task) => {
                    const eff = getEffectiveTaskState(task, viewedDate, now);
                    const isDone = eff === 'completed';
                    const visuals = getPriorityVisuals(task.priority, eff);
                    const durationMins = getDurationMinutes(task.startTime, task.endTime);
                    const isHighlighted = highlightedTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        ref={(el) => {
                          cardRefs.current[task.id] = el;
                        }}
                        className={`w-[88%] sm:w-[300px] lg:w-[320px] shrink-0 snap-start rounded-2xl bg-[#0A0A0C] border p-4 flex flex-col justify-between gap-4 transition-colors ${
                          isHighlighted
                            ? 'border-amber-400/75 ring-1 ring-amber-400/30'
                            : isDone
                            ? 'border-emerald-500/25 hover:border-emerald-400/50'
                            : 'border-white/10 hover:border-amber-500/40'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Top Row: Completion Checkbox + Priority Indicator & Completion Status */}
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleTaskStatus(viewedDate, task.id);
                              }}
                              aria-label={`Mark ${task.title} as ${
                                isDone ? 'pending' : 'completed'
                              }`}
                              aria-pressed={isDone}
                              className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                                isDone
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                  : 'bg-[#111216] border-white/25 hover:border-amber-400 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>

                            <div className="flex items-center gap-2 text-[11px] font-medium whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 ${visuals.label}`}>
                                <span className={`w-2 h-2 rounded-full ${visuals.dot}`} />
                                {task.priority}
                              </span>
                              <span className="text-slate-600" aria-hidden="true">·</span>
                              <span className={visuals.statusClass}>{visuals.statusText}</span>
                            </div>
                          </div>

                          {/* Complete Untruncated Task Title */}
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            className="w-full text-left group focus:outline-none"
                          >
                            <h3
                              className={`text-sm font-semibold leading-snug whitespace-normal break-words transition-colors ${
                                isDone
                                  ? 'line-through text-slate-400 group-hover:text-slate-200'
                                  : 'text-white group-hover:text-amber-300'
                              }`}
                            >
                              {task.title}
                            </h3>
                          </button>
                        </div>

                        {/* Bottom Metadata & View/Edit Action */}
                        <div className="pt-3 border-t border-white/8 space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-300">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                              {formatTime12h(task.startTime)} – {formatTime12h(task.endTime)}
                            </span>
                            <span className="text-amber-300 font-medium shrink-0">
                              {formatDuration(durationMins)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400 truncate">{task.category}</span>
                            <button
                              type="button"
                              onClick={() => onEditTask(task)}
                              className="inline-flex items-center gap-1 font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0"
                            >
                              <Edit3 className="w-3 h-3" />
                              View / Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      }

      case 'priorities':
        return (
          <section className="bg-[#111216] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-semibold text-white">
                  Top Priorities · {formatShortDate(viewedDate)}
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {topPriorities.filter((t) => t.status === 'completed').length}/{topPriorities.length} done
              </span>
            </div>

            {topPriorities.length === 0 ? (
              <div className="p-6 text-xs text-slate-400">
                Add high-priority tasks to surface your top 5 blocks here.
              </div>
            ) : (
              <div className="divide-y divide-white/8">
                {topPriorities.map((task, idx) => {
                  const isDone = task.status === 'completed';
                  const eff = viewedDay
                    ? getEffectiveTaskState(task, viewedDay.date, now)
                    : 'upcoming';
                  const dur = getDurationMinutes(task.startTime, task.endTime);
                  return (
                    <div
                      key={task.id}
                      className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleTaskStatus(viewedDate, task.id)}
                          aria-label={`Toggle ${task.title}`}
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isDone
                              ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                              : 'border-slate-600 hover:border-amber-400 bg-[#0A0A0C]'
                          }`}
                        >
                          {isDone && <Check className="w-3 h-3 stroke-[2.5]" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          className="min-w-0 text-left"
                        >
                          <p
                            className={`text-sm font-medium truncate ${
                              isDone
                                ? 'line-through text-slate-500'
                                : 'text-slate-100 hover:text-amber-300'
                            }`}
                          >
                            {idx + 1}. {task.title}
                          </p>
                          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                            {formatTime12h(task.startTime)} · {formatDuration(dur)} · {task.category}
                          </p>
                        </button>
                      </div>

                      <span
                        className={`text-[11px] font-medium shrink-0 ${
                          eff === 'missed'
                            ? 'text-rose-400'
                            : task.priority === 'Critical'
                            ? 'text-rose-300'
                            : task.priority === 'High'
                            ? 'text-amber-300'
                            : 'text-sky-300'
                        }`}
                      >
                        {eff === 'missed' ? 'Missed' : task.priority}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );

      case 'progress':
        return (
          <section className="bg-[#111216] border border-white/8 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white">30-Day Progress Overview</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Computed live from your recorded tasks and habit logs
                </p>
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                Best Habit Streak:{' '}
                <strong className="text-amber-400">
                  {bestStreak} {bestStreak === 1 ? 'day' : 'days'}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-300">Selected Day Rate</span>
                  <span className="font-mono tabular-nums font-semibold text-white">
                    {dayStats.completionRate}%
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${dayStats.completionRate}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-300">7-Day Average</span>
                  <span className="font-mono tabular-nums font-semibold text-white">
                    {overall.weeklyAvg}%
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 transition-all duration-300"
                    style={{ width: `${overall.weeklyAvg}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-300">30-Day Total</span>
                  <span className="font-mono tabular-nums font-semibold text-white">
                    {overall.thirtyDayProgress}% ({overall.completedTasks30}/{overall.totalTasks30})
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${overall.thirtyDayProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </section>
        );

      case 'quick_actions':
        return (
          <section className="bg-[#111216] border border-white/8 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onQuickAddTask}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
              <button
                type="button"
                onClick={onQuickAddHabit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#0A0A0C] hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap"
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Add Habit
              </button>
              <button
                type="button"
                onClick={() => onNavigate('routine')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#0A0A0C] hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                Edit Today&apos;s Routine
              </button>
              <button
                type="button"
                onClick={onDuplicateYesterday}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#0A0A0C] hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                Duplicate Yesterday
              </button>
              <button
                type="button"
                onClick={onOpenDailyReview}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#0A0A0C] hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" />
                Complete Daily Review
              </button>
              <button
                type="button"
                onClick={onOpenSmartPlan}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 rounded-xl transition-colors whitespace-nowrap"
              >
                <CalendarClock className="w-3.5 h-3.5 text-sky-400" />
                Generate Tomorrow&apos;s Smart Plan
              </button>
              <button
                type="button"
                onClick={onStartNewPlan}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-transparent hover:bg-white/5 border border-white/10 rounded-xl transition-colors whitespace-nowrap ml-auto"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                Start New 30-Day Plan
              </button>
            </div>
          </section>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Header + Progress Banner + Widget Controls */}
      <section className="relative overflow-hidden bg-[#111216] border border-white/8 rounded-2xl p-6">
        <div
          className="pointer-events-none absolute -top-24 left-1/3 w-80 h-48 rounded-full bg-amber-500/[0.07] blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Stay on Track Today
            </h1>
            <p className="text-sm text-slate-400">
              Small consistent actions create meaningful progress.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setAddWidgetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-100 bg-[#0A0A0C] hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              Add Widget
            </button>
            <button
              type="button"
              onClick={() => setCustomizeMode((c) => !c)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
                customizeMode
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                  : 'text-slate-100 bg-[#0A0A0C] hover:bg-white/10 border-white/10'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {customizeMode ? 'Done Customizing' : 'Customize'}
            </button>
          </div>
        </div>

        {/* Keep it going! Live Progress Banner */}
        <div className="relative mt-5 p-4 rounded-xl bg-[#0A0A0C] border border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-300">Keep it going!</span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {dayStats.completed}/{actionableTotal} tasks completed ({dayStats.completionRate}%)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {dayStats.missed > 0
                ? `${dayStats.missed} missed block${dayStats.missed === 1 ? '' : 's'} can be rescheduled cleanly.`
                : dayStats.pending > 0
                ? `${dayStats.pending} block${dayStats.pending === 1 ? '' : 's'} remaining on your schedule.`
                : 'Every scheduled block for this day is accounted for.'}
            </p>
          </div>
          <div className="w-full sm:w-56 shrink-0">
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                style={{ width: `${dayStats.completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Daily Progress Sub-header with Day Navigation */}
        <div className="relative mt-5 pt-4 border-t border-white/8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-white">
              {formatShortDate(viewedDate)}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-amber-400">
              Day {viewedDay?.dayNumber ?? 1} of 30
            </span>
            {viewedDay && (
              <>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-400">
                  {SCHEDULE_TYPE_LABELS[viewedDay.scheduleType]}
                </span>
              </>
            )}
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-200">
              Daily Goals: {dayStats.completed}/{actionableTotal} completed
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {viewedDate !== todayDateStr && (
              <button
                type="button"
                onClick={() => onSelectDate(todayDateStr)}
                className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg hover:bg-amber-500/20 mr-1"
              >
                Today
              </button>
            )}
            <button
              type="button"
              disabled={!prevDay}
              onClick={() => prevDay && onSelectDate(prevDay.date)}
              aria-label="Previous day"
              className="p-1.5 text-slate-300 hover:text-white bg-[#0A0A0C] border border-white/10 rounded-lg disabled:opacity-35 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!nextDay}
              onClick={() => nextDay && onSelectDate(nextDay.date)}
              aria-label="Next day"
              className="p-1.5 text-slate-300 hover:text-white bg-[#0A0A0C] border border-white/10 rounded-lg disabled:opacity-35 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Customizable Widgets Stack */}
      {visibleWidgets.length === 0 ? (
        <div className="bg-[#111216] border border-white/8 rounded-2xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-400">All dashboard widgets are currently hidden.</p>
          <button
            type="button"
            onClick={resetWidgetLayout}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore Default Widgets
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleWidgets.map((widgetId) =>
            renderWidgetWrapper(widgetId, renderWidgetBody(widgetId))
          )}
        </div>
      )}

      {/* Add / Manage Widgets Modal */}
      <Modal
        open={addWidgetOpen}
        onClose={() => setAddWidgetOpen(false)}
        title="Manage Dashboard Widgets"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Toggle dashboard widgets on or off. Changes save automatically to your Cloud Firestore profile.
          </p>

          <div className="space-y-2.5">
            {WIDGET_CATALOG.map((item) => {
              const isVisible = !hiddenSet.has(item.id);
              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#0A0A0C] border border-white/10 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleWidgetVisibility(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border shrink-0 transition-colors ${
                      isVisible
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {isVisible ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Visible
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Hidden
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/8">
            <button
              type="button"
              onClick={resetWidgetLayout}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Default Order
            </button>
            <button
              type="button"
              onClick={() => setAddWidgetOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deduplicateConfirmOpen}
        onClose={() => setDeduplicateConfirmOpen(false)}
        onConfirm={() => onDeduplicateDayTasks?.(viewedDate)}
        title="Remove Duplicate Tasks from Firestore"
        message={`Remove ${duplicateCount} duplicate task record${
          duplicateCount === 1 ? '' : 's'
        }${
          duplicateTitles.length > 0 ? ` (${duplicateTitles.join(', ')})` : ''
        } for ${formatShortDate(
          viewedDate
        )}? Completed statuses will be preserved and only redundant copies will be removed.`}
        confirmLabel="Remove Duplicates"
        danger={false}
      />
    </div>
  );
}
