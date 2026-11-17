import {
  AppState,
  NotificationPreferences,
  NotificationTimingOption,
  NotificationType,
  RoutineTask,
  SmartNotification,
} from '../types';
import { getDefaultNotificationPreferences } from '../data/starterData';
import {
  addDaysToDateStr,
  formatTime12h,
  getEffectiveTaskState,
  KARACHI_TZ,
  KarachiNow,
  timeToMinutes,
} from './dateUtils';
import { computeDailyHabitProgress, computeDayStats, isScheduledActiveTask } from './metrics';

export const NOTIFICATION_TIMING_LABELS: Record<NotificationTimingOption, string> = {
  0: 'At activity start',
  5: '5 minutes before',
  10: '10 minutes before',
  15: '15 minutes before',
  30: '30 minutes before',
};

export const ALL_TIMING_OPTIONS: NotificationTimingOption[] = [30, 15, 10, 5, 0];

export const NOTIFICATION_TYPE_LABELS: Record<
  NotificationType,
  { label: string; description: string }
> = {
  upcoming_activity: {
    label: 'Upcoming Activity Reminders',
    description: 'Notify ahead of scheduled tasks based on your timing preferences.',
  },
  activity_starting: {
    label: 'Activity Starting Now',
    description: 'Alert right when a scheduled activity window begins.',
  },
  missed_activity: {
    label: 'Missed Activity Reminders',
    description: 'Single follow-up alert if a scheduled activity ends while still pending.',
  },
  upcoming_deadline: {
    label: 'Upcoming Goal & Project Deadlines',
    description: 'Alert when goals or project deadlines are within 48 hours or due today.',
  },
  daily_routine_reminder: {
    label: 'Daily Routine Start Reminder',
    description: 'Morning prompt summarizing today’s scheduled activities.',
  },
  daily_summary: {
    label: 'Daily Progress Summary',
    description: 'Evening summary of completed tasks and habits for the day.',
  },
  weekly_summary: {
    label: 'Weekly Progress Summary',
    description: 'Weekly execution rollup across your last 7 days of activity.',
  },
};

export function normalizeNotificationPreferences(
  prefs: Partial<NotificationPreferences> | undefined,
  wakeTime = '06:30',
  sleepTime = '22:30'
): NotificationPreferences {
  const base = getDefaultNotificationPreferences(wakeTime, sleepTime);
  if (!prefs) return base;
  return {
    ...base,
    ...prefs,
    defaultTimings:
      Array.isArray(prefs.defaultTimings) && prefs.defaultTimings.length > 0
        ? prefs.defaultTimings
        : base.defaultTimings,
    activityTimingOverrides: prefs.activityTimingOverrides || {},
    enabledTypes: {
      ...base.enabledTypes,
      ...(prefs.enabledTypes || {}),
    },
  };
}

export interface ZonedClock {
  dateStr: string;
  timeStr: string;
  minutesSinceMidnight: number;
  dayOfWeek: number;
  timezone: string;
  isoNow: string;
}

export function getZonedClock(timezone?: string, dateObj: Date = new Date()): ZonedClock {
  const tz = timezone?.trim() || KARACHI_TZ;
  let safeTz = tz;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(dateObj);
  } catch {
    safeTz = KARACHI_TZ;
  }

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dateObj);

  const hourStr = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minStr = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minStr, 10);

  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    weekday: 'short',
  }).format(dateObj);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dateStr,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutesSinceMidnight: hour * 60 + minute,
    dayOfWeek: weekdayMap[weekdayShort] ?? 0,
    timezone: safeTz,
    isoNow: dateObj.toISOString(),
  };
}

export function isWithinQuietHours(
  minutesSinceMidnight: number,
  prefs: NotificationPreferences,
  wakeTime: string,
  sleepTime: string
): boolean {
  const checkWindow = (startStr: string, endStr: string): boolean => {
    const startMin = timeToMinutes(startStr);
    const endMin = timeToMinutes(endStr);
    if (startMin === endMin) return false;
    if (startMin < endMin) {
      return minutesSinceMidnight >= startMin && minutesSinceMidnight < endMin;
    }
    // Overnight wrap (e.g. 22:30 to 06:00)
    return minutesSinceMidnight >= startMin || minutesSinceMidnight < endMin;
  };

  if (prefs.quietHoursEnabled && checkWindow(prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return true;
  }
  if (prefs.respectSleepSchedule && checkWindow(sleepTime, wakeTime)) {
    return true;
  }
  return false;
}

export function getTaskReminderTimings(
  task: RoutineTask,
  prefs: NotificationPreferences
): NotificationTimingOption[] {
  if (Array.isArray(task.reminderMinutesBefore) && task.reminderMinutesBefore.length > 0) {
    return task.reminderMinutesBefore;
  }
  const byTitle = prefs.activityTimingOverrides[task.title.trim().toLowerCase()];
  if (Array.isArray(byTitle) && byTitle.length > 0) {
    return byTitle;
  }
  const byCategory = prefs.activityTimingOverrides[task.category];
  if (Array.isArray(byCategory) && byCategory.length > 0) {
    return byCategory;
  }
  return prefs.defaultTimings;
}

function makeNotifId(dedupeKey: string): string {
  // Firestore-safe alphanumeric + underscore ID
  return (
    'notif_' +
    dedupeKey
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 110)
  );
}

export interface NotificationEvaluationResult {
  newNotifications: SmartNotification[];
  supersededIds: string[];
  unsnoozedIds: string[];
  quietHoursActive: boolean;
}

export function evaluateSmartNotifications(params: {
  state: AppState;
  clock: ZonedClock;
  existingNotifications: SmartNotification[];
}): NotificationEvaluationResult {
  const { state, clock, existingNotifications } = params;
  const prefs = normalizeNotificationPreferences(
    state.profile.notificationPreferences,
    state.profile.wakeTime,
    state.profile.sleepTime
  );

  const todayDay = state.days[clock.dateStr];
  const activeTasksToday = (todayDay?.tasks || []).filter(isScheduledActiveTask);
  const taskById = new Map(activeTasksToday.map((t) => [t.id, t]));

  const supersededIds: string[] = [];
  const unsnoozedIds: string[] = [];
  const existingByDedupe = new Map<string, SmartNotification>();

  for (const n of existingNotifications) {
    existingByDedupe.set(n.dedupeKey, n);

    // Reconcile notifications attached to tasks:
    // 1. Delete / auto-dismiss if task was deleted, completed, skipped, or rescheduled to a different time
    if (n.taskId && !n.dismissed) {
      if (n.dateStr < clock.dateStr) {
        supersededIds.push(n.id);
        continue;
      }
      if (n.dateStr === clock.dateStr) {
        const currentTask = taskById.get(n.taskId);
        if (
          !currentTask ||
          currentTask.status === 'completed' ||
          currentTask.status === 'skipped' ||
          (n.taskStartTime && currentTask.startTime !== n.taskStartTime)
        ) {
          supersededIds.push(n.id);
          continue;
        }
      }
    }

    // Wake snoozed notifications whose snooze timer has elapsed
    if (n.snoozedUntil && !n.dismissed && n.snoozedUntil <= clock.isoNow) {
      unsnoozedIds.push(n.id);
    }
  }

  const quietHoursActive = isWithinQuietHours(
    clock.minutesSinceMidnight,
    prefs,
    state.profile.wakeTime,
    state.profile.sleepTime
  );

  if (!prefs.enabled || quietHoursActive) {
    return {
      newNotifications: [],
      supersededIds,
      unsnoozedIds,
      quietHoursActive,
    };
  }

  const newNotifications: SmartNotification[] = [];
  const addIfFresh = (candidate: Omit<SmartNotification, 'id' | 'read' | 'deliveredChannels' | 'createdAt'>) => {
    if (existingByDedupe.has(candidate.dedupeKey)) return;
    if (newNotifications.some((x) => x.dedupeKey === candidate.dedupeKey)) return;
    const nowMs = Date.parse(clock.isoNow);
    // Respect active snooze on same task
    const snoozedForTask = existingNotifications.find(
      (n) =>
        n.taskId &&
        n.taskId === candidate.taskId &&
        n.snoozedUntil &&
        Date.parse(n.snoozedUntil) > nowMs
    );
    if (snoozedForTask) return;

    newNotifications.push({
      ...candidate,
      id: makeNotifId(candidate.dedupeKey),
      createdAt: clock.isoNow,
      read: false,
      deliveredChannels: ['in_app'],
    });
  };

  // Convert ZonedClock into KarachiNow-compatible view for getEffectiveTaskState
  const zonedAsNow: KarachiNow = {
    dateStr: clock.dateStr,
    timeStr: clock.timeStr,
    minutesSinceMidnight: clock.minutesSinceMidnight,
    dayOfWeek: clock.dayOfWeek,
    dayName: '',
    formattedDate: clock.dateStr,
    hour: Math.floor(clock.minutesSinceMidnight / 60),
    greeting: 'Hello',
  };

  // 1–3. Scheduled activity notifications (upcoming, starting now, missed)
  for (const task of activeTasksToday) {
    if (task.status === 'completed' || task.status === 'skipped') continue;
    if (task.isBreak) continue;

    const startMin = timeToMinutes(task.startTime);
    const endMin = timeToMinutes(task.endTime);
    const effectiveEnd = endMin <= startMin ? 1440 : endMin;
    const minsUntilStart = startMin - clock.minutesSinceMidnight;
    const timings = getTaskReminderTimings(task, prefs);

    // 1. Upcoming activity reminders (within lead window, strictly before start)
    if (prefs.enabledTypes.upcoming_activity && minsUntilStart > 0) {
      const leadOffsets = timings.filter((t) => t > 0).sort((a, b) => a - b);
      for (const offset of leadOffsets) {
        if (minsUntilStart <= offset && minsUntilStart > Math.max(0, offset - 10)) {
          addIfFresh({
            dedupeKey: `upcoming_${task.id}_${clock.dateStr}_${task.startTime}_${offset}m`,
            type: 'upcoming_activity',
            title: `Upcoming in ${minsUntilStart}m: ${task.title}`,
            body: `Scheduled ${formatTime12h(task.startTime)} – ${formatTime12h(task.endTime)} (${task.category}).`,
            scheduledFor: `${clock.dateStr} ${task.startTime}`,
            dateStr: clock.dateStr,
            taskId: task.id,
            taskTitle: task.title,
            taskStartTime: task.startTime,
            taskEndTime: task.endTime,
            targetSection: 'routine',
          });
          break; // Trigger the nearest matching lead alert cleanly
        }
      }
    }

    // 2. Activity starting now
    if (
      prefs.enabledTypes.activity_starting &&
      timings.includes(0) &&
      clock.minutesSinceMidnight >= startMin &&
      clock.minutesSinceMidnight < Math.min(effectiveEnd, startMin + 10)
    ) {
      addIfFresh({
        dedupeKey: `starting_${task.id}_${clock.dateStr}_${task.startTime}`,
        type: 'activity_starting',
        title: `Starting now: ${task.title}`,
        body: `Your ${task.category} block runs until ${formatTime12h(task.endTime)}. Ready to begin?`,
        scheduledFor: `${clock.dateStr} ${task.startTime}`,
        dateStr: clock.dateStr,
        taskId: task.id,
        taskTitle: task.title,
        taskStartTime: task.startTime,
        taskEndTime: task.endTime,
        targetSection: 'dashboard',
      });
    }

    // 3. Missed activity reminder (trigger AT MOST ONCE per missed task occurrence)
    const effState = getEffectiveTaskState(task, clock.dateStr, zonedAsNow);
    if (
      prefs.enabledTypes.missed_activity &&
      effState === 'missed' &&
      clock.minutesSinceMidnight >= effectiveEnd
    ) {
      addIfFresh({
        dedupeKey: `missed_${task.id}_${clock.dateStr}_${task.startTime}_${task.endTime}`,
        type: 'missed_activity',
        title: `Missed activity: ${task.title}`,
        body: `Was scheduled ${formatTime12h(task.startTime)} – ${formatTime12h(task.endTime)}. Mark done or reschedule cleanly.`,
        scheduledFor: `${clock.dateStr} ${task.endTime}`,
        dateStr: clock.dateStr,
        taskId: task.id,
        taskTitle: task.title,
        taskStartTime: task.startTime,
        taskEndTime: task.endTime,
        targetSection: 'routine',
      });
    }
  }

  // 4. Upcoming goal & project deadlines (within 48h or due today)
  if (prefs.enabledTypes.upcoming_deadline) {
    const twoDaysOut = addDaysToDateStr(clock.dateStr, 2);
    for (const goal of state.goals) {
      if (goal.status === 'completed' || goal.status === 'paused') continue;
      if (goal.deadline >= clock.dateStr && goal.deadline <= twoDaysOut) {
        const label = goal.deadline === clock.dateStr ? 'Due today' : `Due ${goal.deadline}`;
        addIfFresh({
          dedupeKey: `deadline_goal_${goal.id}_${clock.dateStr}`,
          type: 'upcoming_deadline',
          title: `Goal deadline (${label}): ${goal.title}`,
          body: `${goal.milestones.filter((m) => m.completed).length}/${goal.milestones.length} milestones completed.`,
          dateStr: clock.dateStr,
          goalId: goal.id,
          targetSection: 'goals',
        });
      }
    }
    for (const proj of state.projects) {
      if (proj.status === 'completed' || proj.status === 'on_hold') continue;
      if (proj.deadline >= clock.dateStr && proj.deadline <= twoDaysOut) {
        const label = proj.deadline === clock.dateStr ? 'Due today' : `Due ${proj.deadline}`;
        addIfFresh({
          dedupeKey: `deadline_proj_${proj.id}_${clock.dateStr}`,
          type: 'upcoming_deadline',
          title: `Project deadline (${label}): ${proj.title}`,
          body: `${proj.tasks.filter((t) => t.completed).length}/${proj.tasks.length} deliverables finished.`,
          dateStr: clock.dateStr,
          targetSection: 'goals',
        });
      }
    }
  }

  // 5. Daily routine morning reminder
  if (prefs.enabledTypes.daily_routine_reminder && activeTasksToday.length > 0) {
    const morningMin = timeToMinutes(prefs.dailyRoutineReminderTime || state.profile.wakeTime);
    if (
      clock.minutesSinceMidnight >= morningMin &&
      clock.minutesSinceMidnight < morningMin + 90
    ) {
      const nonBreakCount = activeTasksToday.filter((t) => !t.isBreak).length;
      addIfFresh({
        dedupeKey: `daily_routine_${clock.dateStr}`,
        type: 'daily_routine_reminder',
        title: `Today's routine is ready (${nonBreakCount} activities)`,
        body: `First block: ${activeTasksToday[0].title} at ${formatTime12h(activeTasksToday[0].startTime)}.`,
        dateStr: clock.dateStr,
        targetSection: 'dashboard',
      });
    }
  }

  // 6. Daily progress summary
  if (prefs.enabledTypes.daily_summary && todayDay && activeTasksToday.length > 0) {
    const summaryMin = timeToMinutes(prefs.dailySummaryTime || '21:00');
    if (clock.minutesSinceMidnight >= summaryMin) {
      const stats = computeDayStats(todayDay, zonedAsNow);
      const habitProg = computeDailyHabitProgress(state.habits, clock.dateStr);
      addIfFresh({
        dedupeKey: `daily_summary_${clock.dateStr}`,
        type: 'daily_summary',
        title: `Daily progress summary: ${stats.completionRate}% complete`,
        body: `${stats.completed}/${stats.total} tasks completed${
          habitProg.total > 0 ? ` · ${habitProg.completed}/${habitProg.total} habits logged` : ''
        }.`,
        dateStr: clock.dateStr,
        targetSection: 'analytics',
      });
    }
  }

  // 7. Weekly progress summary (Sundays or Day 7/14/21/28 evening)
  if (prefs.enabledTypes.weekly_summary) {
    const isWeeklyBoundary =
      clock.dayOfWeek === 0 || (todayDay && todayDay.dayNumber % 7 === 0);
    const summaryMin = timeToMinutes(prefs.dailySummaryTime || '20:00');
    if (isWeeklyBoundary && clock.minutesSinceMidnight >= summaryMin) {
      const last7Start = addDaysToDateStr(clock.dateStr, -6);
      const weekDays = Object.values(state.days).filter(
        (d) => d.date >= last7Start && d.date <= clock.dateStr
      );
      let weekTotal = 0;
      let weekCompleted = 0;
      for (const wd of weekDays) {
        const s = computeDayStats(wd, zonedAsNow);
        weekTotal += s.total;
        weekCompleted += s.completed;
      }
      if (weekTotal > 0) {
        const weekPct = Math.round((weekCompleted / weekTotal) * 100);
        addIfFresh({
          dedupeKey: `weekly_summary_${clock.dateStr}`,
          type: 'weekly_summary',
          title: `Weekly progress summary: ${weekPct}% execution`,
          body: `You completed ${weekCompleted} of ${weekTotal} scheduled tasks across the last 7 days.`,
          dateStr: clock.dateStr,
          targetSection: 'review',
        });
      }
    }
  }

  return {
    newNotifications,
    supersededIds,
    unsnoozedIds,
    quietHoursActive,
  };
}
