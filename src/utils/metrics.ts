import {
  AppState,
  DayPlan,
  Habit,
  RoutineTask,
  RoutineUpdateScope,
  ScheduleType,
  TaskCategory,
} from '../types';
import {
  ALL_CATEGORIES,
  createId,
  instantiateTasksFromTemplate,
  PRODUCTIVE_CATEGORIES,
} from '../data/starterData';
import {
  addDaysToDateStr,
  formatShortDate,
  formatTime12h,
  getDayOfWeekFromDateStr,
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
  minutesToTime,
  sortTasksChronologically,
  timeToMinutes,
} from './dateUtils';

export interface DayStats {
  total: number;
  completed: number;
  pending: number;
  missed: number;
  skipped: number;
  completionRate: number; // 0..100: completed / total scheduled * 100
  plannedProductiveMinutes: number;
  completedProductiveMinutes: number;
}

export function isScheduledActiveTask(task: RoutineTask | undefined | null): task is RoutineTask {
  if (!task || task.deleted) return false;
  if (typeof task.title !== 'string' || !task.title.trim()) return false;
  if (typeof task.startTime !== 'string' || !task.startTime.includes(':')) return false;
  if (typeof task.endTime !== 'string' || !task.endTime.includes(':')) return false;
  return true;
}

export function computeDayStats(day: DayPlan | undefined, now: KarachiNow): DayStats {
  if (!day || !Array.isArray(day.tasks) || day.tasks.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      missed: 0,
      skipped: 0,
      completionRate: 0,
      plannedProductiveMinutes: 0,
      completedProductiveMinutes: 0,
    };
  }

  const scheduledTasks = day.tasks.filter(isScheduledActiveTask);
  if (scheduledTasks.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      missed: 0,
      skipped: 0,
      completionRate: 0,
      plannedProductiveMinutes: 0,
      completedProductiveMinutes: 0,
    };
  }

  let completed = 0;
  let pending = 0;
  let missed = 0;
  let skipped = 0;
  let plannedProductiveMinutes = 0;
  let completedProductiveMinutes = 0;

  for (const task of scheduledTasks) {
    const state = getEffectiveTaskState(task, day.date, now);
    const dur = getDurationMinutes(task.startTime, task.endTime);
    const isCountedProductive = !task.isBreak || PRODUCTIVE_CATEGORIES.has(task.category);

    if (isCountedProductive && !task.isBreak) {
      plannedProductiveMinutes += dur;
    }

    if (state === 'completed') {
      completed++;
      if (!task.isBreak) completedProductiveMinutes += dur;
    } else if (state === 'missed') {
      missed++;
    } else if (state === 'skipped') {
      skipped++;
    } else {
      pending++;
    }
  }

  const total = scheduledTasks.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    pending,
    missed,
    skipped,
    completionRate,
    plannedProductiveMinutes,
    completedProductiveMinutes,
  };
}

export function getSortedDays(state: AppState): DayPlan[] {
  return Object.values(state.days).sort((a, b) => a.dayNumber - b.dayNumber);
}

export function getCurrentChallengeDay(state: AppState, todayDateStr: string): DayPlan | undefined {
  if (state.days[todayDateStr]) return state.days[todayDateStr];
  const sorted = getSortedDays(state);
  if (sorted.length === 0) return undefined;
  if (todayDateStr < sorted[0].date) return sorted[0];
  return sorted[sorted.length - 1];
}

export function computeHabitStreak(habit: Habit, todayDateStr: string): number {
  let streak = 0;
  // Count backwards starting from today if done, otherwise start from yesterday
  let cursor = habit.logs[todayDateStr] ? todayDateStr : addDaysToDateStr(todayDateStr, -1);
  for (let i = 0; i < 60; i++) {
    if (habit.logs[cursor]) {
      streak++;
      cursor = addDaysToDateStr(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

export function computeHabitCompletionRate(habit: Habit, challengeDates: string[]): number {
  if (challengeDates.length === 0) return 0;
  let completed = 0;
  for (const d of challengeDates) {
    if (habit.logs[d]) completed++;
  }
  return Math.round((completed / challengeDates.length) * 100);
}

export function computeBestActiveHabitStreak(habits: Habit[], todayDateStr: string): number {
  if (habits.length === 0) return 0;
  return Math.max(...habits.map((h) => computeHabitStreak(h, todayDateStr)));
}

export function computeOverallProgress(state: AppState, now: KarachiNow) {
  const days = getSortedDays(state);
  const pastAndToday = days.filter((d) => d.date <= now.dateStr);

  let totalTasks30 = 0;
  let completedTasks30 = 0;
  for (const d of days) {
    const stats = computeDayStats(d, now);
    totalTasks30 += stats.total;
    completedTasks30 += stats.completed;
  }

  const thirtyDayProgress = totalTasks30 > 0 ? Math.round((completedTasks30 / totalTasks30) * 100) : 0;

  // Weekly average: last 7 days up to today that actually have scheduled tasks
  const last7WithTasks = pastAndToday
    .slice(-7)
    .filter((d) => computeDayStats(d, now).total > 0);
  let weeklyAvg = 0;
  if (last7WithTasks.length > 0) {
    const sum = last7WithTasks.reduce((acc, d) => acc + computeDayStats(d, now).completionRate, 0);
    weeklyAvg = Math.round(sum / last7WithTasks.length);
  }

  return {
    thirtyDayProgress,
    weeklyAvg,
    completedTasks30,
    totalTasks30,
  };
}

export function isHabitDueOnDate(habit: Habit, dateStr: string): boolean {
  const dow = getDayOfWeekFromDateStr(dateStr);
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return dow >= 1 && dow <= 5;
  if (habit.frequency === 'weekends') return dow === 0 || dow === 6;
  if (habit.frequency === 'custom' && Array.isArray(habit.customDays) && habit.customDays.length > 0) {
    return habit.customDays.includes(dow);
  }
  return true;
}

export interface DailyHabitProgress {
  completed: number;
  total: number;
  pct: number;
}

export function computeDailyHabitProgress(habits: Habit[], dateStr: string): DailyHabitProgress {
  const due = habits.filter((h) => isHabitDueOnDate(h, dateStr));
  const targetList = due.length > 0 ? due : habits;
  if (targetList.length === 0) {
    return { completed: 0, total: 0, pct: 0 };
  }
  const completed = targetList.filter((h) => Boolean(h.logs[dateStr])).length;
  return {
    completed,
    total: targetList.length,
    pct: Math.round((completed / targetList.length) * 100),
  };
}

export interface GoalsProgressSummary {
  totalGoals: number;
  progressingGoals: number;
  completedGoals: number;
  completedMilestones: number;
  totalMilestones: number;
  items: Array<{
    id: string;
    title: string;
    area: string;
    status: string;
    deadline: string;
    milestonesDone: number;
    milestonesTotal: number;
    pct: number;
    weeklyLoggedHours: number;
    weeklyTargetHours: number | null;
  }>;
}

export function computeGoalsProgressSummary(state: AppState, now: KarachiNow): GoalsProgressSummary {
  const weekStart = addDaysToDateStr(now.dateStr, -6);
  const weekDays = getSortedDays(state).filter(
    (d) => d.date >= weekStart && d.date <= now.dateStr
  );

  let completedMilestones = 0;
  let totalMilestones = 0;
  let completedGoals = 0;
  let progressingGoals = 0;

  const items = state.goals.map((g) => {
    const doneMs = g.milestones.filter((m) => m.completed).length;
    const totalMs = g.milestones.length;
    completedMilestones += doneMs;
    totalMilestones += totalMs;
    if (g.status === 'completed') completedGoals++;
    if (g.status === 'in_progress' || (g.status !== 'paused' && doneMs > 0 && doneMs < totalMs)) {
      progressingGoals++;
    }

    // Match completed tasks linked by goalId, linkedTaskTitles, or goal title keywords
    let loggedMins = 0;
    const linkedSet = new Set(g.linkedTaskTitles.map((t) => t.trim().toLowerCase()));
    const titleLower = g.title.trim().toLowerCase();

    for (const day of weekDays) {
      for (const t of day.tasks.filter(isScheduledActiveTask)) {
        if (t.status !== 'completed') continue;
        const tLower = t.title.trim().toLowerCase();
        const matches =
          t.goalId === g.id ||
          linkedSet.has(tLower) ||
          (titleLower.length >= 4 && tLower.includes(titleLower));
        if (matches) {
          loggedMins += getDurationMinutes(t.startTime, t.endTime);
        }
      }
    }

    const matchingTarget = state.profile.goalTargets?.find(
      (gt) => gt.title.trim().toLowerCase() === titleLower || gt.area === g.area
    );

    const pct =
      g.status === 'completed'
        ? 100
        : totalMs > 0
        ? Math.round((doneMs / totalMs) * 100)
        : g.status === 'in_progress'
        ? 25
        : 0;

    return {
      id: g.id,
      title: g.title,
      area: g.area,
      status: g.status,
      deadline: g.deadline,
      milestonesDone: doneMs,
      milestonesTotal: totalMs,
      pct,
      weeklyLoggedHours: Number((loggedMins / 60).toFixed(1)),
      weeklyTargetHours: matchingTarget ? matchingTarget.targetHoursPerWeek : null,
    };
  });

  return {
    totalGoals: state.goals.length,
    progressingGoals,
    completedGoals,
    completedMilestones,
    totalMilestones,
    items,
  };
}

export interface ProgressInsightsData {
  weeklyTrend: Array<{
    date: string;
    label: string;
    dayNumber: number;
    completionRate: number;
    completed: number;
    total: number;
  }>;
  weeklyCompletionAvg: number | null;
  todayVsYesterday: {
    available: boolean;
    deltaPct: number | null;
    previousRate: number | null;
    previousDate: string;
  };
  weekOverWeek: {
    available: boolean;
    deltaPct: number | null;
    currentAvg: number | null;
    previousAvg: number | null;
  };
  consistentActivities: Array<{
    title: string;
    kind: 'task' | 'habit';
    category: string;
    completedCount: number;
    totalCount: number;
    rate: number;
  }>;
  frequentlyMissedActivities: Array<{
    title: string;
    category: string;
    missedCount: number;
    totalCount: number;
  }>;
  hasSufficientHistory: boolean;
}

export function computeProgressInsights(
  state: AppState,
  viewedDate: string,
  now: KarachiNow
): ProgressInsightsData {
  const allDays = getSortedDays(state);
  const pastAndToday = allDays.filter((d) => d.date <= now.dateStr);

  // Last 7 days ending at now.dateStr
  const last7Start = addDaysToDateStr(now.dateStr, -6);
  const prev7Start = addDaysToDateStr(now.dateStr, -13);
  const prev7End = addDaysToDateStr(now.dateStr, -7);

  const current7Days = pastAndToday.filter((d) => d.date >= last7Start && d.date <= now.dateStr);
  const prev7Days = pastAndToday.filter((d) => d.date >= prev7Start && d.date <= prev7End);

  const weeklyTrend = current7Days.map((d) => {
    const s = computeDayStats(d, now);
    return {
      date: d.date,
      label: formatShortDate(d.date).split(',')[0],
      dayNumber: d.dayNumber,
      completionRate: s.completionRate,
      completed: s.completed,
      total: s.total,
    };
  });

  const activeCurrent7 = weeklyTrend.filter((d) => d.total > 0);
  const weeklyCompletionAvg =
    activeCurrent7.length > 0
      ? Math.round(
          activeCurrent7.reduce((sum, d) => sum + d.completionRate, 0) / activeCurrent7.length
        )
      : null;

  const activePrev7 = prev7Days
    .map((d) => computeDayStats(d, now))
    .filter((s) => s.total > 0);
  const previousWeekAvg =
    activePrev7.length >= 3
      ? Math.round(activePrev7.reduce((sum, s) => sum + s.completionRate, 0) / activePrev7.length)
      : null;

  const yesterdayStr = addDaysToDateStr(viewedDate, -1);
  const viewedStats = computeDayStats(state.days[viewedDate], now);
  const yesterdayStats = computeDayStats(state.days[yesterdayStr], now);
  const todayVsYesterdayAvailable = viewedStats.total > 0 && yesterdayStats.total > 0;

  // Consistent & Missed Activities from real scheduled task records up to now.dateStr
  const taskMap = new Map<
    string,
    { title: string; category: string; completed: number; missed: number; total: number }
  >();

  for (const day of pastAndToday) {
    for (const task of day.tasks.filter(isScheduledActiveTask)) {
      if (task.isBreak) continue;
      const key = `${task.title.trim().toLowerCase()}::${task.category}`;
      const entry = taskMap.get(key) || {
        title: task.title.trim(),
        category: task.category,
        completed: 0,
        missed: 0,
        total: 0,
      };
      const eff = getEffectiveTaskState(task, day.date, now);
      if (eff === 'skipped') continue;
      entry.total++;
      if (eff === 'completed') entry.completed++;
      else if (eff === 'missed') entry.missed++;
      taskMap.set(key, entry);
    }
  }

  const consistentActivities: ProgressInsightsData['consistentActivities'] = [];
  for (const item of taskMap.values()) {
    if (item.total >= 2 && item.completed > 0) {
      consistentActivities.push({
        title: item.title,
        kind: 'task',
        category: item.category,
        completedCount: item.completed,
        totalCount: item.total,
        rate: Math.round((item.completed / item.total) * 100),
      });
    }
  }

  // Include consistent habits
  const recentDates = pastAndToday.map((d) => d.date);
  if (recentDates.length >= 2) {
    for (const h of state.habits) {
      const hits = recentDates.filter((d) => Boolean(h.logs[d])).length;
      if (hits > 0) {
        consistentActivities.push({
          title: h.title,
          kind: 'habit',
          category: h.category,
          completedCount: hits,
          totalCount: recentDates.length,
          rate: Math.round((hits / recentDates.length) * 100),
        });
      }
    }
  }

  consistentActivities.sort(
    (a, b) => b.rate - a.rate || b.completedCount - a.completedCount || a.title.localeCompare(b.title)
  );

  const frequentlyMissedActivities = Array.from(taskMap.values())
    .filter((item) => item.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.total - a.total)
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      category: item.category,
      missedCount: item.missed,
      totalCount: item.total,
    }));

  return {
    weeklyTrend,
    weeklyCompletionAvg,
    todayVsYesterday: {
      available: todayVsYesterdayAvailable,
      deltaPct: todayVsYesterdayAvailable
        ? viewedStats.completionRate - yesterdayStats.completionRate
        : null,
      previousRate: yesterdayStats.total > 0 ? yesterdayStats.completionRate : null,
      previousDate: yesterdayStr,
    },
    weekOverWeek: {
      available: weeklyCompletionAvg !== null && previousWeekAvg !== null,
      deltaPct:
        weeklyCompletionAvg !== null && previousWeekAvg !== null
          ? weeklyCompletionAvg - previousWeekAvg
          : null,
      currentAvg: weeklyCompletionAvg,
      previousAvg: previousWeekAvg,
    },
    consistentActivities: consistentActivities.slice(0, 5),
    frequentlyMissedActivities,
    hasSufficientHistory: pastAndToday.filter((d) => computeDayStats(d, now).total > 0).length >= 2,
  };
}

export interface NextActivityOverview {
  status: 'active' | 'upcoming' | 'clear_today' | 'empty';
  headline: string;
  subline: string;
  countdownText: string;
  task?: RoutineTask;
  dateStr: string;
  freeWindowText?: string;
}

export function getNextActivityOverview(state: AppState, now: KarachiNow): NextActivityOverview {
  const todayDay = state.days[now.dateStr];
  const tasksToday = sortTasksChronologically(
    (todayDay?.tasks || []).filter(isScheduledActiveTask)
  );

  if (tasksToday.length === 0) {
    // Check tomorrow for next activity or free time
    const tomorrowStr = addDaysToDateStr(now.dateStr, 1);
    const tomorrowTasks = sortTasksChronologically(
      (state.days[tomorrowStr]?.tasks || []).filter(isScheduledActiveTask)
    );
    const firstTomorrow = tomorrowTasks.find((t) => t.status === 'pending' && !t.isBreak);
    return {
      status: 'empty',
      headline: 'Your schedule is clear today',
      subline: firstTomorrow
        ? `Next scheduled block tomorrow: ${firstTomorrow.title} at ${formatTime12h(firstTomorrow.startTime)}.`
        : 'All hours today are open free time. Add a task or open the Timetable Builder anytime.',
      countdownText: 'Free schedule',
      dateStr: now.dateStr,
      freeWindowText: `Open free time until ${formatTime12h(state.profile.sleepTime || '22:30')}`,
    };
  }

  // 1. Check active pending non-break task right now
  const activeTask = tasksToday.find((t) => {
    if (t.status !== 'pending') return false;
    const eff = getEffectiveTaskState(t, now.dateStr, now);
    return eff === 'active';
  });

  // 2. Next upcoming pending task later today
  const upcomingTask = tasksToday.find((t) => {
    if (t.status !== 'pending') return false;
    const startMin = timeToMinutes(t.startTime);
    return startMin > now.minutesSinceMidnight;
  });

  if (activeTask) {
    const endMin = timeToMinutes(activeTask.endTime);
    const startMin = timeToMinutes(activeTask.startTime);
    const effectiveEnd = endMin <= startMin ? 1440 : endMin;
    const remainingMins = Math.max(1, effectiveEnd - now.minutesSinceMidnight);
    const countdownText =
      remainingMins >= 60
        ? `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m left`
        : `${remainingMins}m left`;

    return {
      status: 'active',
      headline: `In progress: ${activeTask.title}`,
      subline: upcomingTask
        ? `Up next: ${upcomingTask.title} at ${formatTime12h(upcomingTask.startTime)} (${activeTask.category})`
        : `${formatTime12h(activeTask.startTime)} – ${formatTime12h(activeTask.endTime)} · ${activeTask.category}`,
      countdownText,
      task: activeTask,
      dateStr: now.dateStr,
    };
  }

  if (upcomingTask) {
    const startMin = timeToMinutes(upcomingTask.startTime);
    const minsUntil = Math.max(1, startMin - now.minutesSinceMidnight);
    const countdownText =
      minsUntil >= 60
        ? `Starts in ${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m`
        : `Starts in ${minsUntil}m`;

    const dur = getDurationMinutes(upcomingTask.startTime, upcomingTask.endTime);
    return {
      status: 'upcoming',
      headline: `Your next activity: ${upcomingTask.title} at ${formatTime12h(upcomingTask.startTime)}.`,
      subline: `${formatTime12h(upcomingTask.startTime)} – ${formatTime12h(upcomingTask.endTime)} (${Math.round(dur)}m) · ${upcomingTask.category} · ${upcomingTask.priority} priority`,
      countdownText,
      task: upcomingTask,
      dateStr: now.dateStr,
    };
  }

  // No more pending tasks today -> find next free-time period or tomorrow's first task
  const sleepMin = timeToMinutes(state.profile.sleepTime || '22:30');
  const freeMinutesLeft =
    sleepMin > now.minutesSinceMidnight ? sleepMin - now.minutesSinceMidnight : 0;
  const freeWindowText =
    freeMinutesLeft > 15
      ? `Next free window: Now until ${formatTime12h(state.profile.sleepTime || '22:30')} (${Math.floor(freeMinutesLeft / 60)}h ${freeMinutesLeft % 60}m)`
      : `Evening wind-down window before ${formatTime12h(state.profile.sleepTime || '22:30')}`;

  const tomorrowStr = addDaysToDateStr(now.dateStr, 1);
  const tomorrowFirst = sortTasksChronologically(
    (state.days[tomorrowStr]?.tasks || []).filter(isScheduledActiveTask)
  ).find((t) => t.status === 'pending' && !t.isBreak);

  return {
    status: 'clear_today',
    headline: 'Your schedule is clear for the rest of today.',
    subline: tomorrowFirst
      ? `Next scheduled activity tomorrow: ${tomorrowFirst.title} at ${formatTime12h(tomorrowFirst.startTime)}.`
      : freeWindowText,
    countdownText: freeMinutesLeft > 15 ? `${minutesToTime(now.minutesSinceMidnight)} – ${formatTime12h(state.profile.sleepTime || '22:30')}` : 'Clear',
    dateStr: now.dateStr,
    freeWindowText,
  };
}

export interface AnalyticsSummary {
  dailyAvgCompletion: number;
  weeklyCompletion: number;
  monthlyCompletion: number;
  habitConsistency: number;
  plannedHours: number;
  completedHours: number;
  dailySeries: Array<{
    date: string;
    dayNumber: number;
    completionRate: number;
    plannedHours: number;
    completedHours: number;
  }>;
  categoryDistribution: Array<{
    category: TaskCategory;
    plannedMinutes: number;
    completedMinutes: number;
    sharePercent: number;
  }>;
  mostConsistentHabits: Array<{
    id: string;
    title: string;
    rate: number;
    streak: number;
  }>;
  frequentlyMissedTasks: Array<{
    title: string;
    category: TaskCategory;
    missedCount: number;
  }>;
}

export function computeAnalytics(
  state: AppState,
  now: KarachiNow,
  startDate: string,
  endDate: string
): AnalyticsSummary {
  const allDays = getSortedDays(state);
  const rangeDays = allDays.filter((d) => d.date >= startDate && d.date <= endDate);

  let sumRates = 0;
  let totalActionable = 0;
  let totalCompleted = 0;
  let totalPlannedMins = 0;
  let totalCompletedMins = 0;

  const categoryMap: Record<string, { planned: number; completed: number }> = {};
  ALL_CATEGORIES.forEach((c) => {
    categoryMap[c] = { planned: 0, completed: 0 };
  });

  const missedCounter: Record<string, { title: string; category: TaskCategory; count: number }> = {};

  const dailySeries = rangeDays.map((day) => {
    const stats = computeDayStats(day, now);
    sumRates += stats.completionRate;
    totalActionable += Math.max(0, stats.total - stats.skipped);
    totalCompleted += stats.completed;

    let dayPlannedMins = 0;
    let dayCompletedMins = 0;

    day.tasks.forEach((task) => {
      const dur = getDurationMinutes(task.startTime, task.endTime);
      const eff = getEffectiveTaskState(task, day.date, now);

      dayPlannedMins += dur;
      if (!categoryMap[task.category]) categoryMap[task.category] = { planned: 0, completed: 0 };
      categoryMap[task.category].planned += dur;

      if (eff === 'completed') {
        dayCompletedMins += dur;
        categoryMap[task.category].completed += dur;
      } else if (eff === 'missed') {
        const key = `${task.title}::${task.category}`;
        if (!missedCounter[key]) {
          missedCounter[key] = { title: task.title, category: task.category, count: 0 };
        }
        missedCounter[key].count++;
      }
    });

    totalPlannedMins += dayPlannedMins;
    totalCompletedMins += dayCompletedMins;

    return {
      date: day.date,
      dayNumber: day.dayNumber,
      completionRate: stats.completionRate,
      plannedHours: Number((dayPlannedMins / 60).toFixed(1)),
      completedHours: Number((dayCompletedMins / 60).toFixed(1)),
    };
  });

  const dailyAvgCompletion = rangeDays.length > 0 ? Math.round(sumRates / rangeDays.length) : 0;
  const monthlyCompletion = totalActionable > 0 ? Math.round((totalCompleted / totalActionable) * 100) : 0;

  const last7Days = allDays.filter((d) => d.date <= now.dateStr).slice(-7);
  const weeklyCompletion =
    last7Days.length > 0
      ? Math.round(last7Days.reduce((acc, d) => acc + computeDayStats(d, now).completionRate, 0) / last7Days.length)
      : 0;

  // Habit consistency over selected range up to today
  const habitDates = rangeDays.filter((d) => d.date <= now.dateStr).map((d) => d.date);
  const effectiveHabitDates = habitDates.length > 0 ? habitDates : [now.dateStr];
  const habitScores = state.habits.map((h) => ({
    id: h.id,
    title: h.title,
    rate: computeHabitCompletionRate(h, effectiveHabitDates),
    streak: computeHabitStreak(h, now.dateStr),
  }));

  const habitConsistency =
    habitScores.length > 0
      ? Math.round(habitScores.reduce((acc, h) => acc + h.rate, 0) / habitScores.length)
      : 0;

  const mostConsistentHabits = [...habitScores].sort((a, b) => b.rate - a.rate || b.streak - a.streak);

  const categoryDistribution = Object.entries(categoryMap)
    .filter(([, v]) => v.planned > 0)
    .map(([category, v]) => ({
      category: category as TaskCategory,
      plannedMinutes: v.planned,
      completedMinutes: v.completed,
      sharePercent: totalPlannedMins > 0 ? Math.round((v.planned / totalPlannedMins) * 100) : 0,
    }))
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);

  const frequentlyMissedTasks = Object.values(missedCounter)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((item) => ({
      title: item.title,
      category: item.category,
      missedCount: item.count,
    }));

  return {
    dailyAvgCompletion,
    weeklyCompletion,
    monthlyCompletion,
    habitConsistency,
    plannedHours: Number((totalPlannedMins / 60).toFixed(1)),
    completedHours: Number((totalCompletedMins / 60).toFixed(1)),
    dailySeries,
    categoryDistribution,
    mostConsistentHabits,
    frequentlyMissedTasks,
  };
}

/**
 * Applies a task add/edit/delete across the chosen scope while STRICTLY preserving
 * completed historical tasks (any task with status === 'completed' on days < today or target day).
 */
export function applyTaskUpdateWithScope(
  state: AppState,
  targetDate: string,
  action:
    | { type: 'add'; task: Omit<RoutineTask, 'id'> }
    | { type: 'edit'; originalTask: RoutineTask; updated: Omit<RoutineTask, 'id'> }
    | { type: 'delete'; originalTask: RoutineTask },
  scope: RoutineUpdateScope,
  todayDateStr: string
): AppState {
  const newDays: Record<string, DayPlan> = { ...state.days };

  const targetDates = Object.keys(newDays)
    .sort()
    .filter((date) => {
      if (scope === 'this_day') return date === targetDate;
      if (scope === 'this_and_future') return date >= targetDate;
      return true; // all_30_days
    });

  for (const date of targetDates) {
    const day = newDays[date];
    if (!day) continue;

    const isHistoricalDay = date < todayDateStr && date !== targetDate;

    if (action.type === 'add') {
      // Do not retroactively add unfinished tasks onto historical completed days when using all_30_days
      if (scope === 'all_30_days' && isHistoricalDay) continue;

      const added: RoutineTask = {
        ...action.task,
        id: createId('task'),
        templateKey: action.task.templateKey || createId('tpl'),
        status: date === targetDate ? action.task.status : 'pending',
      };
      newDays[date] = {
        ...day,
        tasks: sortTasksChronologically([...day.tasks, added]),
      };
    } else if (action.type === 'edit') {
      const matchFn = (t: RoutineTask) => {
        if (date === targetDate) return t.id === action.originalTask.id;
        if (action.originalTask.templateKey && t.templateKey) {
          return t.templateKey === action.originalTask.templateKey;
        }
        return (
          t.title === action.originalTask.title &&
          t.startTime === action.originalTask.startTime
        );
      };

      let found = false;
      const updatedTasks = day.tasks.map((t) => {
        if (!matchFn(t)) return t;
        found = true;
        // CRITICAL: Never overwrite completed historical tasks when updating future/all routines
        if (date !== targetDate && (t.status === 'completed' || isHistoricalDay)) {
          return t;
        }
        return {
          ...t,
          title: action.updated.title,
          startTime: action.updated.startTime,
          endTime: action.updated.endTime,
          category: action.updated.category,
          priority: action.updated.priority,
          description: action.updated.description,
          isBreak: action.updated.isBreak,
          goalId: action.updated.goalId,
          reminderMinutesBefore: action.updated.reminderMinutesBefore,
          status: date === targetDate ? action.updated.status : t.status,
        };
      });

      newDays[date] = {
        ...day,
        tasks: sortTasksChronologically(updatedTasks),
      };

      if (!found && date === targetDate) {
        // Fallback safety
        newDays[date].tasks = sortTasksChronologically([
          ...newDays[date].tasks,
          { ...action.updated, id: action.originalTask.id },
        ]);
      }
    } else if (action.type === 'delete') {
      const matchFn = (t: RoutineTask) => {
        if (date === targetDate) return t.id === action.originalTask.id;
        if (action.originalTask.templateKey && t.templateKey) {
          return t.templateKey === action.originalTask.templateKey;
        }
        return (
          t.title === action.originalTask.title &&
          t.startTime === action.originalTask.startTime
        );
      };

      newDays[date] = {
        ...day,
        tasks: day.tasks.filter((t) => {
          if (!matchFn(t)) return true;
          // CRITICAL: Never delete completed historical tasks
          if (date !== targetDate && (t.status === 'completed' || isHistoricalDay)) {
            return true;
          }
          return false;
        }),
      };
    }
  }

  return {
    ...state,
    days: newDays,
  };
}

export function applyScheduleTypeToDay(
  state: AppState,
  targetDate: string,
  scheduleType: ScheduleType,
  preserveCompleted = true
): AppState {
  const day = state.days[targetDate];
  if (!day) return state;

  const template = state.templates[scheduleType] || state.templates.normal;
  const newTasks = instantiateTasksFromTemplate(template, targetDate, state.profile.fixedCommitments);

  if (preserveCompleted) {
    const completedTitles = new Set(
      day.tasks.filter((t) => t.status === 'completed').map((t) => t.title)
    );
    const merged = newTasks.map((t) =>
      completedTitles.has(t.title) ? { ...t, status: 'completed' as const } : t
    );
    return {
      ...state,
      days: {
        ...state.days,
        [targetDate]: {
          ...day,
          scheduleType,
          tasks: merged,
        },
      },
    };
  }

  return {
    ...state,
    days: {
      ...state.days,
      [targetDate]: {
        ...day,
        scheduleType,
        tasks: newTasks,
      },
    },
  };
}
