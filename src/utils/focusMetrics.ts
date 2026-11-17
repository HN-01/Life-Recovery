import {
  AppState,
  DashboardPreferences,
  DashboardWidgetId,
  DayPlan,
  FocusSession,
  RoutineTask,
} from '../types';
import {
  addDaysToDateStr,
  formatTime12h,
  getEffectiveTaskState,
  KarachiNow,
  timeToMinutes,
} from './dateUtils';
import { computeBestActiveHabitStreak, computeDayStats } from './metrics';

export const DEFAULT_WIDGET_ORDER: DashboardWidgetId[] = [
  'metrics',
  'timeline',
  'ai_coach',
  'priorities',
  'progress',
  'quick_actions',
];

export const WIDGET_CATALOG: Array<{
  id: DashboardWidgetId;
  title: string;
  description: string;
}> = [
  {
    id: 'metrics',
    title: 'Focus & Attention Metrics',
    description: 'Deep Work Time, Attention Quality, and Focus Stability across time windows.',
  },
  {
    id: 'timeline',
    title: 'Daily Timeline (8 AM – 8 PM)',
    description: 'Interactive horizontal block view of scheduled routines with priority coding.',
  },
  {
    id: 'ai_coach',
    title: 'Your AI Life Coach',
    description: 'Personalized daily insights grounded in your live Firestore execution history.',
  },
  {
    id: 'priorities',
    title: 'Today’s Top Priorities',
    description: 'Highest-priority actionable blocks ranked for focused completion.',
  },
  {
    id: 'progress',
    title: '30-Day Progress Overview',
    description: 'Daily completion, 7-day average, 30-day total progress, and active habit streak.',
  },
  {
    id: 'quick_actions',
    title: 'Execution Quick Actions',
    description: 'One-click shortcuts to add tasks, run Smart Plan, or complete reviews.',
  },
];

export function normalizeDashboardPreferences(
  prefs?: DashboardPreferences
): DashboardPreferences {
  const seen = new Set<DashboardWidgetId>();
  const validIds = new Set<DashboardWidgetId>(DEFAULT_WIDGET_ORDER);
  const order: DashboardWidgetId[] = [];

  for (const id of prefs?.widgetOrder || []) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  for (const id of DEFAULT_WIDGET_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }

  const hidden = Array.from(
    new Set((prefs?.hiddenWidgets || []).filter((id) => validIds.has(id)))
  );

  return {
    widgetOrder: order,
    hiddenWidgets: hidden,
    compactTimeline: Boolean(prefs?.compactTimeline),
    updatedAt: prefs?.updatedAt,
  };
}

export interface DeepWorkSummary {
  totalSeconds: number;
  formattedDuration: string;
  completedCount: number;
  totalSessions: number;
}

export function formatSecondsCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return safe > 0 ? `${safe}s` : '0m';
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function computeDeepWorkMetrics(
  sessions: FocusSession[] = [],
  liveElapsedSeconds = 0
): DeepWorkSummary {
  const recordedSeconds = sessions.reduce(
    (sum, s) => sum + Math.max(0, Number(s.durationSeconds) || 0),
    0
  );
  const totalSeconds = recordedSeconds + Math.max(0, Math.floor(liveElapsedSeconds));
  const completedCount = sessions.filter((s) => s.completedNaturally).length;

  return {
    totalSeconds,
    formattedDuration: formatSecondsCompact(totalSeconds),
    completedCount,
    totalSessions: sessions.length,
  };
}

export interface AttentionQualityResult {
  available: boolean;
  score: number | null;
  label: string;
  explanation: string;
}

/**
 * Computes Attention Quality strictly from recorded focus sessions.
 * Requires at least 2 recorded sessions OR >= 30 total focused minutes so scores
 * never hallucinate confidence from empty or trivial clicks.
 */
export function computeAttentionQuality(
  sessions: FocusSession[] = []
): AttentionQualityResult {
  const totalMinutes = sessions.reduce(
    (sum, s) => sum + Math.max(0, s.durationSeconds) / 60,
    0
  );

  if (sessions.length === 0) {
    return {
      available: false,
      score: null,
      label: 'Not enough data',
      explanation:
        'Measured from Deep Work session continuity (natural completions minus pauses). Start a focus session to track.',
    };
  }

  if (sessions.length < 2 && totalMinutes < 30) {
    return {
      available: false,
      score: null,
      label: 'Not enough data',
      explanation: `Logged ${Math.round(totalMinutes)}m across 1 session. Complete 2 sessions or 30m of Deep Work to score attention quality.`,
    };
  }

  let weightedScoreSum = 0;
  let totalWeight = 0;

  for (const s of sessions) {
    const mins = Math.max(1, s.durationSeconds / 60);
    const completionFactor = s.completedNaturally ? 1 : 0.72;
    const pausePenalty = Math.min(35, Math.max(0, s.pauseCount) * 8);
    const sessionScore = Math.max(20, Math.min(100, Math.round(100 * completionFactor - pausePenalty)));
    weightedScoreSum += sessionScore * mins;
    totalWeight += mins;
  }

  const score = totalWeight > 0 ? Math.round(weightedScoreSum / totalWeight) : 0;

  return {
    available: true,
    score,
    label: score >= 85 ? 'High Continuity' : score >= 65 ? 'Steady Focus' : 'Fragmented',
    explanation: `Calculated from ${sessions.length} recorded session${sessions.length === 1 ? '' : 's'} (${Math.round(totalMinutes)}m total, interruptions weighted).`,
  };
}

export interface FocusWindowBucket {
  label: string;
  startHour: number;
  endHour: number;
  minutes: number;
  intensityPct: number; // 0..100 relative to day's peak window
  isPeak: boolean;
}

export interface FocusStabilityResult {
  hasData: boolean;
  hasScore: boolean;
  score: number | null;
  peakWindowLabel: string | null;
  peakPeriodName: string | null;
  buckets: FocusWindowBucket[];
  explanation: string;
}

const FOCUS_WINDOWS: Array<{ label: string; startHour: number; endHour: number; period: string }> = [
  { label: '8AM', startHour: 8, endHour: 10, period: 'Morning Deep Focus' },
  { label: '10AM', startHour: 10, endHour: 12, period: 'Late Morning Peak' },
  { label: '12PM', startHour: 12, endHour: 14, period: 'Midday Window' },
  { label: '2PM', startHour: 14, endHour: 16, period: 'Afternoon Block' },
  { label: '4PM', startHour: 16, endHour: 18, period: 'Late Afternoon' },
  { label: '6PM', startHour: 18, endHour: 20, period: 'Evening Session' },
];

function getKarachiHourDecimal(isoStr: string): number {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return 12;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '12', 10) % 24;
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h + m / 60;
}

export function computeFocusStability(
  sessions: FocusSession[] = []
): FocusStabilityResult {
  const windowMinutes = FOCUS_WINDOWS.map(() => 0);

  for (const s of sessions) {
    const startHour = getKarachiHourDecimal(s.startedAt);
    const durMins = Math.max(0, s.durationSeconds / 60);
    if (durMins <= 0) continue;

    // Distribute duration proportionally or assign to matching 2h window(s)
    const sessionEnd = startHour + durMins / 60;
    let matched = false;
    FOCUS_WINDOWS.forEach((win, idx) => {
      const overlap = Math.min(sessionEnd, win.endHour) - Math.max(startHour, win.startHour);
      if (overlap > 0) {
        windowMinutes[idx] += overlap * 60;
        matched = true;
      }
    });

    // Fallback for sessions recorded outside 8AM-8PM: clamp to nearest boundary if within reasonable daytime or keep out of 8AM-8PM bars cleanly
    if (!matched) {
      if (startHour >= 5 && startHour < 8) windowMinutes[0] += durMins;
      else if (startHour >= 20 && startHour <= 23) windowMinutes[5] += durMins;
    }
  }

  const maxMinutes = Math.max(...windowMinutes);
  const totalTrackedMins = windowMinutes.reduce((a, b) => a + b, 0);

  if (sessions.length === 0 || totalTrackedMins <= 0) {
    return {
      hasData: false,
      hasScore: false,
      score: null,
      peakWindowLabel: null,
      peakPeriodName: null,
      buckets: FOCUS_WINDOWS.map((w) => ({
        label: w.label,
        startHour: w.startHour,
        endHour: w.endHour,
        minutes: 0,
        intensityPct: 0,
        isPeak: false,
      })),
      explanation:
        'Not enough data. Track Deep Work sessions across the day to map your real focus stability and peak hours.',
    };
  }

  const peakIdx = windowMinutes.indexOf(maxMinutes);
  const peakWindow = FOCUS_WINDOWS[peakIdx];
  const peakRangeText = `${peakWindow.startHour > 12 ? peakWindow.startHour - 12 : peakWindow.startHour} ${
    peakWindow.startHour >= 12 ? 'PM' : 'AM'
  } – ${peakWindow.endHour > 12 ? peakWindow.endHour - 12 : peakWindow.endHour} ${
    peakWindow.endHour >= 12 ? 'PM' : 'AM'
  }`;

  const buckets: FocusWindowBucket[] = FOCUS_WINDOWS.map((w, idx) => ({
    label: w.label,
    startHour: w.startHour,
    endHour: w.endHour,
    minutes: Math.round(windowMinutes[idx]),
    intensityPct: maxMinutes > 0 ? Math.round((windowMinutes[idx] / maxMinutes) * 100) : 0,
    isPeak: idx === peakIdx && maxMinutes > 0,
  }));

  const hasScore = sessions.length >= 2 && totalTrackedMins >= 30;
  let score: number | null = null;
  if (hasScore) {
    const activeWindows = windowMinutes.filter((m) => m > 0).length;
    const naturalRate =
      sessions.filter((s) => s.completedNaturally).length / sessions.length;
    const avgPauses =
      sessions.reduce((sum, s) => sum + Math.max(0, s.pauseCount), 0) / sessions.length;
    const spreadBonus = Math.min(20, activeWindows * 7);
    const raw = Math.round(60 * naturalRate + spreadBonus + Math.max(0, 20 - avgPauses * 6));
    score = Math.max(25, Math.min(100, raw));
  }

  return {
    hasData: true,
    hasScore,
    score,
    peakWindowLabel: peakRangeText,
    peakPeriodName: peakWindow.period,
    buckets,
    explanation: hasScore
      ? `Based on ${sessions.length} Deep Work sessions across ${windowMinutes.filter((m) => m > 0).length} time block(s).`
      : `1 session logged (${Math.round(totalTrackedMins)}m). Log 2+ sessions (30m+ total) to unlock Focus Stability score.`,
  };
}

export interface DeduplicatedTasksResult {
  tasks: RoutineTask[];
  duplicateCount: number;
  duplicateTitles: string[];
}

const STATUS_PRECEDENCE: Record<RoutineTask['status'], number> = {
  completed: 4,
  skipped: 3,
  missed: 2,
  pending: 1,
};

function normalizeTaskTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Deduplicates tasks retrieved from Firestore by exact task ID and canonical
 * schedule signature (normalized title + startTime + endTime), preserving
 * completed status and sorting chronologically without mutating Firestore.
 */
export function deduplicateDayTasks(tasks: RoutineTask[]): DeduplicatedTasksResult {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { tasks: [], duplicateCount: 0, duplicateTitles: [] };
  }

  const duplicateTitleSet = new Set<string>();
  let duplicateCount = 0;

  // Pass 1: Collapse duplicate IDs (keeping highest status precedence)
  const idOrder: string[] = [];
  const byId = new Map<string, RoutineTask>();
  const noIdTasks: RoutineTask[] = [];

  for (const rawTask of tasks) {
    if (!rawTask || typeof rawTask.title !== 'string') continue;
    if (!rawTask.id) {
      noIdTasks.push(rawTask);
      continue;
    }
    const existing = byId.get(rawTask.id);
    if (!existing) {
      idOrder.push(rawTask.id);
      byId.set(rawTask.id, rawTask);
    } else {
      duplicateCount++;
      duplicateTitleSet.add(rawTask.title.trim().replace(/\s+/g, ' '));
      if (STATUS_PRECEDENCE[rawTask.status] > STATUS_PRECEDENCE[existing.status]) {
        byId.set(rawTask.id, {
          ...rawTask,
          description: rawTask.description || existing.description,
          goalId: rawTask.goalId || existing.goalId,
        });
      }
    }
  }

  const pass1Tasks = [...idOrder.map((id) => byId.get(id)!), ...noIdTasks];

  // Pass 2: Collapse duplicate schedule signatures (normalized title + startTime + endTime)
  const signatureOrder: string[] = [];
  const bySignature = new Map<string, RoutineTask>();

  for (const task of pass1Tasks) {
    const sig = `${normalizeTaskTitle(task.title)}::${task.startTime}::${task.endTime}`;
    const existing = bySignature.get(sig);
    if (!existing) {
      signatureOrder.push(sig);
      bySignature.set(sig, task);
    } else {
      duplicateCount++;
      duplicateTitleSet.add(task.title.trim().replace(/\s+/g, ' '));
      const keepIncoming =
        STATUS_PRECEDENCE[task.status] > STATUS_PRECEDENCE[existing.status] ||
        (STATUS_PRECEDENCE[task.status] === STATUS_PRECEDENCE[existing.status] &&
          (task.description || '').length > (existing.description || '').length);
      if (keepIncoming) {
        bySignature.set(sig, {
          ...task,
          title: task.title.trim().replace(/\s+/g, ' '),
          description: task.description || existing.description,
          goalId: task.goalId || existing.goalId,
        });
      }
    }
  }

  const deduped = signatureOrder
    .map((sig) => bySignature.get(sig)!)
    .sort(
      (a, b) =>
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
        timeToMinutes(a.endTime) - timeToMinutes(b.endTime) ||
        a.title.localeCompare(b.title)
    );

  return {
    tasks: deduped,
    duplicateCount,
    duplicateTitles: Array.from(duplicateTitleSet),
  };
}

export interface TimelinePositionedTask {
  task: RoutineTask;
  startMin: number;
  endMin: number;
  clippedStartMin: number;
  clippedEndMin: number;
  leftPct: number;
  widthPct: number;
  lane: number;
}

export interface TimelineLayoutResult {
  positioned: TimelinePositionedTask[];
  laneCount: number;
  outsideWindowTasks: RoutineTask[];
}

/**
 * Maps tasks onto the horizontal 8 AM (480) to 8 PM (1200) timeline without overlaps.
 * Clamps tasks that partially overlap the window, and returns outside-window tasks separately.
 */
export function assignTimelineLanes(
  tasks: RoutineTask[],
  windowStartMin = 480,
  windowEndMin = 1200
): TimelineLayoutResult {
  const { tasks: cleanTasks } = deduplicateDayTasks(tasks);
  const windowSpan = Math.max(60, windowEndMin - windowStartMin);
  const inWindow: Array<{
    task: RoutineTask;
    startMin: number;
    endMin: number;
    clippedStartMin: number;
    clippedEndMin: number;
  }> = [];
  const outsideWindowTasks: RoutineTask[] = [];

  for (const task of cleanTasks) {
    const s = timeToMinutes(task.startTime);
    let e = timeToMinutes(task.endTime);
    if (e <= s) e += 1440;

    if (e <= windowStartMin || s >= windowEndMin) {
      outsideWindowTasks.push(task);
      continue;
    }

    const clippedStartMin = Math.max(windowStartMin, s);
    const clippedEndMin = Math.min(windowEndMin, e);
    if (clippedEndMin - clippedStartMin < 5) {
      outsideWindowTasks.push(task);
      continue;
    }

    inWindow.push({
      task,
      startMin: s,
      endMin: e,
      clippedStartMin,
      clippedEndMin,
    });
  }

  inWindow.sort(
    (a, b) =>
      a.clippedStartMin - b.clippedStartMin ||
      b.clippedEndMin - a.clippedEndMin
  );

  const laneEndTimes: number[] = [];
  const positioned: TimelinePositionedTask[] = [];

  for (const item of inWindow) {
    let assignedLane = laneEndTimes.findIndex((endMin) => endMin <= item.clippedStartMin);
    if (assignedLane === -1) {
      assignedLane = laneEndTimes.length;
      laneEndTimes.push(item.clippedEndMin);
    } else {
      laneEndTimes[assignedLane] = item.clippedEndMin;
    }

    const leftPct = ((item.clippedStartMin - windowStartMin) / windowSpan) * 100;
    const rawWidthPct = ((item.clippedEndMin - item.clippedStartMin) / windowSpan) * 100;
    const widthPct = Math.max(0.75, Math.min(100 - leftPct, rawWidthPct));

    positioned.push({
      task: item.task,
      startMin: item.startMin,
      endMin: item.endMin,
      clippedStartMin: item.clippedStartMin,
      clippedEndMin: item.clippedEndMin,
      leftPct,
      widthPct,
      lane: assignedLane,
    });
  }

  return {
    positioned,
    laneCount: Math.max(1, laneEndTimes.length),
    outsideWindowTasks,
  };
}

export interface CoachDailyInsight {
  headline: string;
  recommendation: string;
  focusPrompt: string;
}

export function computeCoachDailyInsight(
  state: AppState,
  viewedDay: DayPlan | undefined,
  now: KarachiNow
): CoachDailyInsight {
  const stats = computeDayStats(viewedDay, now);
  const deepWork = computeDeepWorkMetrics(viewedDay?.focusSessions || []);
  const bestStreak = computeBestActiveHabitStreak(state.habits, now.dateStr);
  const firstName = (state.profile.name || 'Builder').split(' ')[0];

  const yesterdayStr = addDaysToDateStr(now.dateStr, -1);
  const yesterdayStats = computeDayStats(state.days[yesterdayStr], now);

  const nextTask = viewedDay?.tasks.find((t) => {
    if (!viewedDay) return false;
    const eff = getEffectiveTaskState(t, viewedDay.date, now);
    return !t.isBreak && (eff === 'active' || eff === 'upcoming');
  });

  if (!viewedDay || stats.total === 0) {
    return {
      headline: `${firstName}, no schedule blocks are logged for this date yet.`,
      recommendation:
        'Generate tomorrow’s Smart Plan or ask me to structure focused blocks around your university schedule and prayer times.',
      focusPrompt: 'Help me build a balanced schedule for today around my priorities.',
    };
  }

  if (stats.missed > 0) {
    const missedTasks = viewedDay.tasks
      .filter((t) => getEffectiveTaskState(t, viewedDay.date, now) === 'missed')
      .map((t) => t.title);
    const topMissed = missedTasks[0];
    return {
      headline: `${stats.completed}/${Math.max(1, stats.total - stats.skipped)} tasks done (${stats.completionRate}%) · ${stats.missed} block${stats.missed === 1 ? '' : 's'} missed so far.`,
      recommendation: topMissed
        ? `Prioritize recovering "${topMissed}" or let me reschedule unfinished work cleanly without cutting into sleep (${formatTime12h(state.profile.sleepTime)}).`
        : 'Review missed blocks and adjust remaining time windows cleanly.',
      focusPrompt: `I missed ${stats.missed} task(s) including "${topMissed || 'a key block'}". Which tasks should I prioritize or reschedule next?`,
    };
  }

  if (stats.completed > 0 && stats.completionRate >= 70) {
    return {
      headline: `${firstName}, strong momentum: ${stats.completionRate}% complete${deepWork.totalSeconds > 0 ? ` with ${deepWork.formattedDuration} of Deep Work logged` : ''}.`,
      recommendation: nextTask
        ? `Keep locking in "${nextTask.title}" at ${formatTime12h(nextTask.startTime)}. ${bestStreak > 0 ? `Your top habit streak stands at ${bestStreak} days.` : ''}`
        : 'All major blocks for this view are on track. Review tomorrow’s priorities or run a daily reflection.',
      focusPrompt: 'How productive was I this week and what should I optimize tomorrow?',
    };
  }

  if (nextTask) {
    return {
      headline: `${stats.completed}/${Math.max(1, stats.total - stats.skipped)} completed today · ${yesterdayStats.total > 0 ? `Yesterday finished at ${yesterdayStats.completionRate}%.` : 'Ready to execute.'}`,
      recommendation: `Next priority block is "${nextTask.title}" (${formatTime12h(nextTask.startTime)} – ${formatTime12h(nextTask.endTime)}). Start the Deep Work timer to measure attention quality.`,
      focusPrompt: 'Which tasks should I prioritize next and how can I protect my focus?',
    };
  }

  return {
    headline: `${stats.completed}/${Math.max(1, stats.total - stats.skipped)} tasks completed (${stats.completionRate}%) on Day ${viewedDay.dayNumber}.`,
    recommendation:
      'Ask your AI Life Coach to analyze habit consistency, break down a goal milestone, or plan tomorrow.',
    focusPrompt: 'Analyze my recent routine performance and suggest improvements.',
  };
}
