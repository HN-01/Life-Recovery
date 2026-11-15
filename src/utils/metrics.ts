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
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
  sortTasksChronologically,
} from './dateUtils';

export interface DayStats {
  total: number;
  completed: number;
  pending: number;
  missed: number;
  skipped: number;
  completionRate: number; // 0..100
  plannedProductiveMinutes: number;
  completedProductiveMinutes: number;
}

export function computeDayStats(day: DayPlan | undefined, now: KarachiNow): DayStats {
  if (!day || day.tasks.length === 0) {
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

  for (const task of day.tasks) {
    const state = getEffectiveTaskState(task, day.date, now);
    const dur = getDurationMinutes(task.startTime, task.endTime);
    const isProductive = !task.isBreak && PRODUCTIVE_CATEGORIES.has(task.category);

    if (isProductive) {
      plannedProductiveMinutes += dur;
    }

    if (state === 'completed') {
      completed++;
      if (isProductive) completedProductiveMinutes += dur;
    } else if (state === 'missed') {
      missed++;
    } else if (state === 'skipped') {
      skipped++;
    } else {
      // active or upcoming
      pending++;
    }
  }

  const actionableTotal = Math.max(0, day.tasks.length - skipped);
  const completionRate = actionableTotal > 0 ? Math.round((completed / actionableTotal) * 100) : 0;

  return {
    total: day.tasks.length,
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
    totalTasks30 += Math.max(0, stats.total - stats.skipped);
    completedTasks30 += stats.completed;
  }

  const thirtyDayProgress = totalTasks30 > 0 ? Math.round((completedTasks30 / totalTasks30) * 100) : 0;

  // Weekly average: last 7 days up to today (or active days up to today)
  const last7 = pastAndToday.slice(-7);
  let weeklyAvg = 0;
  if (last7.length > 0) {
    const sum = last7.reduce((acc, d) => acc + computeDayStats(d, now).completionRate, 0);
    weeklyAvg = Math.round(sum / last7.length);
  }

  return {
    thirtyDayProgress,
    weeklyAvg,
    completedTasks30,
    totalTasks30,
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
