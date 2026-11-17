import {
  BasicScheduleConfig,
  FixedCommitment,
  Goal,
  GoalTimeTarget,
  Habit,
  LifeArea,
  PersonalActivityInput,
  PreferredTimeOfDay,
  TaskCategory,
  TaskPriority,
  TemplateTask,
  WeeklyTimetable,
} from '../types';
import { createId, LIFE_AREAS } from '../data/starterData';
import { minutesToTime, timeToMinutes } from './dateUtils';

export const DEFAULT_BASIC_SCHEDULE: BasicScheduleConfig = {
  wakeTime: '07:00',
  bedTime: '23:00',
  preferredSleepHours: 8,
  activeDaysOfWeek: [1, 2, 3, 4, 5],
  preferredWorkStart: '09:00',
  preferredWorkEnd: '18:00',
  breakDurationMinutes: 15,
  breakFrequencyMinutes: 90,
  maxDailyFocusHours: 8,
};

export interface ActivityPreset {
  name: string;
  category: TaskCategory;
  preferredDurationMinutes: number;
  priority: TaskPriority;
  preferredTimeOfDay: PreferredTimeOfDay;
  weeklyFrequency: number;
}

export const SUGGESTED_ACTIVITY_PRESETS: ActivityPreset[] = [
  {
    name: 'Exercise and fitness',
    category: 'Exercise',
    preferredDurationMinutes: 45,
    priority: 'High',
    preferredTimeOfDay: 'morning',
    weeklyFrequency: 4,
  },
  {
    name: 'Programming',
    category: 'Programming',
    preferredDurationMinutes: 90,
    priority: 'High',
    preferredTimeOfDay: 'morning',
    weeklyFrequency: 5,
  },
  {
    name: 'Academic study',
    category: 'University',
    preferredDurationMinutes: 90,
    priority: 'High',
    preferredTimeOfDay: 'afternoon',
    weeklyFrequency: 5,
  },
  {
    name: 'Business development',
    category: 'Entrepreneurship',
    preferredDurationMinutes: 60,
    priority: 'Medium',
    preferredTimeOfDay: 'afternoon',
    weeklyFrequency: 3,
  },
  {
    name: 'English communication',
    category: 'English communication',
    preferredDurationMinutes: 30,
    priority: 'Medium',
    preferredTimeOfDay: 'evening',
    weeklyFrequency: 4,
  },
  {
    name: 'Reading',
    category: 'Creative projects',
    preferredDurationMinutes: 30,
    priority: 'Medium',
    preferredTimeOfDay: 'evening',
    weeklyFrequency: 5,
  },
  {
    name: 'Skill development',
    category: 'Programming',
    preferredDurationMinutes: 60,
    priority: 'High',
    preferredTimeOfDay: 'flexible',
    weeklyFrequency: 4,
  },
  {
    name: 'Personal projects',
    category: 'Creative projects',
    preferredDurationMinutes: 60,
    priority: 'Medium',
    preferredTimeOfDay: 'evening',
    weeklyFrequency: 3,
  },
  {
    name: 'Relaxation',
    category: 'Rest and entertainment',
    preferredDurationMinutes: 45,
    priority: 'Low',
    preferredTimeOfDay: 'night',
    weeklyFrequency: 7,
  },
  {
    name: 'Hobbies',
    category: 'Creative projects',
    preferredDurationMinutes: 45,
    priority: 'Low',
    preferredTimeOfDay: 'evening',
    weeklyFrequency: 3,
  },
];

export interface GoalPreset {
  title: string;
  area: LifeArea;
  suggestedHoursPerWeek: number;
}

export const SUGGESTED_GOAL_PRESETS: GoalPreset[] = [
  {
    title: 'Academic improvement',
    area: 'Academic and technical development',
    suggestedHoursPerWeek: 10,
  },
  {
    title: 'Career development',
    area: 'Entrepreneurship and innovation',
    suggestedHoursPerWeek: 6,
  },
  {
    title: 'Physical fitness',
    area: 'Physical health and appearance',
    suggestedHoursPerWeek: 4,
  },
  {
    title: 'Financial independence',
    area: 'Entrepreneurship and innovation',
    suggestedHoursPerWeek: 5,
  },
  {
    title: 'Technical skills',
    area: 'Academic and technical development',
    suggestedHoursPerWeek: 8,
  },
  {
    title: 'Personal development',
    area: 'Mental strength and discipline',
    suggestedHoursPerWeek: 4,
  },
];

export const COMMITMENT_CATEGORY_PRESETS: Array<{ label: string; category: TaskCategory }> = [
  { label: 'University', category: 'University' },
  { label: 'School', category: 'University' },
  { label: 'Job', category: 'Entrepreneurship' },
  { label: 'Business', category: 'Entrepreneurship' },
  { label: 'Classes', category: 'University' },
  { label: 'Prayer times', category: 'Prayer and spirituality' },
  { label: 'Family responsibilities', category: 'Family' },
  { label: 'Other commitments', category: 'Morning & Personal Care' },
];

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

interface TimeWindow {
  start: number;
  end: number;
}

function getPreferredWindowRanges(
  pref: PreferredTimeOfDay,
  wakeMins: number,
  bedMins: number,
  workStartMins?: number,
  workEndMins?: number
): TimeWindow[] {
  const clamp = (s: number, e: number): TimeWindow | null => {
    const start = Math.max(wakeMins, s);
    const end = Math.min(bedMins, e);
    return end - start >= 15 ? { start, end } : null;
  };

  const candidates: Array<TimeWindow | null> = [];
  switch (pref) {
    case 'early_morning':
      candidates.push(clamp(wakeMins, Math.min(bedMins, 9 * 60)));
      candidates.push(clamp(9 * 60, 12 * 60));
      break;
    case 'morning':
      candidates.push(clamp(Math.max(wakeMins, 8 * 60), 12 * 60));
      candidates.push(clamp(wakeMins, 13 * 60));
      break;
    case 'afternoon':
      candidates.push(clamp(12 * 60, 17 * 60));
      break;
    case 'evening':
      candidates.push(clamp(17 * 60, 21 * 60));
      break;
    case 'night':
      candidates.push(clamp(20 * 60, bedMins));
      break;
    case 'flexible':
    default:
      if (workStartMins !== undefined && workEndMins !== undefined && workEndMins > workStartMins) {
        candidates.push(clamp(workStartMins, workEndMins));
      }
      candidates.push(clamp(wakeMins, bedMins));
      break;
  }

  // Always add full waking window as fallback so valid activities find a safe non-overlapping slot
  candidates.push(clamp(wakeMins, bedMins));

  return candidates.filter((w): w is TimeWindow => w !== null);
}

function overlapsExisting(blocks: TemplateTask[], start: number, end: number): boolean {
  return blocks.some((b) => {
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);
    if (bEnd <= bStart) return false;
    return start < bEnd && end > bStart;
  });
}

function findFirstAvailableSlot(
  blocks: TemplateTask[],
  durationMins: number,
  windows: TimeWindow[],
  bufferMins: number
): TimeWindow | null {
  const step = 15;
  for (const win of windows) {
    for (let cursor = win.start; cursor + durationMins <= win.end; cursor += step) {
      const slotEnd = cursor + durationMins;
      // Leave tiny breathing room if bufferMins > 0 when checking adjacency
      const paddedStart = Math.max(win.start, cursor - Math.min(bufferMins, 10));
      const paddedEnd = Math.min(win.end, slotEnd + Math.min(bufferMins, 10));
      if (!overlapsExisting(blocks, paddedStart, paddedEnd) && !overlapsExisting(blocks, cursor, slotEnd)) {
        return { start: cursor, end: slotEnd };
      }
    }
  }
  // Retry without padding requirement if tight schedule
  for (const win of windows) {
    for (let cursor = win.start; cursor + durationMins <= win.end; cursor += step) {
      const slotEnd = cursor + durationMins;
      if (!overlapsExisting(blocks, cursor, slotEnd)) {
        return { start: cursor, end: slotEnd };
      }
    }
  }
  return null;
}

export interface TimetableGenerationResult {
  weeklyTimetable: WeeklyTimetable;
  warnings: string[];
  summary: string;
}

export function generatePersonalizedTimetable(options: {
  basicSchedule: BasicScheduleConfig;
  commitments: FixedCommitment[];
  activities: PersonalActivityInput[];
  goalTargets?: GoalTimeTarget[];
}): TimetableGenerationResult {
  const { basicSchedule, commitments, activities, goalTargets = [] } = options;
  const warnings: string[] = [];

  const wakeMins = Math.max(0, Math.min(22 * 60, timeToMinutes(basicSchedule.wakeTime || '07:00')));
  let bedMins = timeToMinutes(basicSchedule.bedTime || '23:00');
  if (bedMins <= wakeMins) {
    bedMins = 23 * 60 + 45; // Cap same-day timeline cleanly inside 23:45
  }

  const workStartMins = basicSchedule.preferredWorkStart
    ? timeToMinutes(basicSchedule.preferredWorkStart)
    : undefined;
  const workEndMins = basicSchedule.preferredWorkEnd
    ? timeToMinutes(basicSchedule.preferredWorkEnd)
    : undefined;

  const activeDaysSet = new Set(
    basicSchedule.activeDaysOfWeek.length > 0
      ? basicSchedule.activeDaysOfWeek
      : [1, 2, 3, 4, 5]
  );

  const maxDailyFocusMins = Math.max(120, Math.round((basicSchedule.maxDailyFocusHours || 8) * 60));
  const breakDur = Math.max(0, Math.min(45, basicSchedule.breakDurationMinutes ?? 15));
  const breakFreq = Math.max(45, basicSchedule.breakFrequencyMinutes ?? 90);

  const weeklyTimetable: WeeklyTimetable = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };

  // Track productive scheduled minutes per weekday
  const dailyProductiveMins: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };

  // 1. Place recurring fixed commitments first on their exact days
  for (let dow = 0; dow < 7; dow++) {
    const dayCommitments = commitments.filter(
      (c) => c.recurrence !== 'one_time' && c.daysOfWeek.includes(dow)
    );
    for (const c of dayCommitments) {
      const s = timeToMinutes(c.startTime);
      const e = timeToMinutes(c.endTime);
      if (e <= s) continue;
      if (overlapsExisting(weeklyTimetable[dow], s, e)) {
        warnings.push(`Commitment "${c.title}" overlaps another fixed commitment on weekday ${dow}.`);
      }
      const descParts = [
        c.location ? `Location: ${c.location}` : '',
        c.description || 'Fixed scheduled commitment.',
      ].filter(Boolean);

      weeklyTimetable[dow].push({
        templateKey: `commit_${c.id}`,
        title: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
        category: c.category,
        priority: 'Critical',
        description: descParts.join(' · '),
        isFixedCommitment: true,
      });

      if (c.category !== 'Break & Buffer' && c.category !== 'Rest and entertainment') {
        dailyProductiveMins[dow] += e - s;
      }
    }
  }

  // 2. Prioritize personal activities (boost priority slightly if aligned with user's goals)
  const goalWords = new Set(
    goalTargets
      .flatMap((g) => g.title.toLowerCase().split(/\s+/))
      .filter((w) => w.length > 3)
  );

  const sortedActivities = [...activities].sort((a, b) => {
    const pDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pDiff !== 0) return pDiff;
    const aAligned = goalWords.has(a.name.toLowerCase().split(' ')[0]) ? 1 : 0;
    const bAligned = goalWords.has(b.name.toLowerCase().split(' ')[0]) ? 1 : 0;
    return bAligned - aAligned;
  });

  // Order days so active days receive focused tasks first, then remaining days
  const orderedDays = [1, 2, 3, 4, 5, 6, 0].sort((a, b) => {
    const aActive = activeDaysSet.has(a) ? 0 : 1;
    const bActive = activeDaysSet.has(b) ? 0 : 1;
    return aActive - bActive;
  });

  // 3. Distribute each activity across its weeklyFrequency
  let activityStartOffset = 0;
  for (const act of sortedActivities) {
    const freq = Math.max(1, Math.min(7, act.weeklyFrequency || 3));
    const isLightActivity =
      act.category === 'Rest and entertainment' ||
      act.category === 'Break & Buffer' ||
      act.category === 'Family' ||
      act.category === 'Prayer and spirituality';

    const candidateDays = isLightActivity
      ? orderedDays
      : orderedDays.filter((d) => activeDaysSet.has(d));

    const pool = candidateDays.length >= freq ? candidateDays : orderedDays;

    // Rotate starting offset to spread activities evenly rather than packing Mon-Wed
    const rotatedPool = [
      ...pool.slice(activityStartOffset % pool.length),
      ...pool.slice(0, activityStartOffset % pool.length),
    ];
    activityStartOffset++;

    // Sort candidate days by lowest current productive load first so days stay balanced
    const balancedPool = [...rotatedPool].sort(
      (a, b) => dailyProductiveMins[a] - dailyProductiveMins[b]
    );

    const dur = Math.max(15, Math.min(240, act.preferredDurationMinutes || 60));
    const windows = getPreferredWindowRanges(
      act.preferredTimeOfDay,
      wakeMins,
      bedMins,
      workStartMins,
      workEndMins
    );

    let scheduledCount = 0;
    for (const dow of balancedPool) {
      if (scheduledCount >= freq) break;

      if (!isLightActivity && dailyProductiveMins[dow] + dur > maxDailyFocusMins) {
        continue;
      }

      const slot = findFirstAvailableSlot(weeklyTimetable[dow], dur, windows, breakDur);
      if (!slot) continue;

      weeklyTimetable[dow].push({
        templateKey: `act_${act.id}`,
        title: act.name,
        startTime: minutesToTime(slot.start),
        endTime: minutesToTime(slot.end),
        category: act.category,
        priority: act.priority,
        description: act.description || `${act.name} (${act.preferredTimeOfDay.replace('_', ' ')})`,
        isBreak: act.category === 'Break & Buffer',
      });

      if (!isLightActivity) {
        dailyProductiveMins[dow] += dur;
      }
      scheduledCount++;

      // Insert a structured recovery break after long blocks if configured and space exists
      if (breakDur > 0 && dur >= breakFreq) {
        const breakStart = slot.end;
        const breakEnd = slot.end + breakDur;
        if (
          breakEnd <= bedMins &&
          !overlapsExisting(weeklyTimetable[dow], breakStart, breakEnd)
        ) {
          weeklyTimetable[dow].push({
            templateKey: `break_${act.id}_${dow}`,
            title: 'Short Recovery Break',
            startTime: minutesToTime(breakStart),
            endTime: minutesToTime(breakEnd),
            category: 'Break & Buffer',
            priority: 'Low',
            description: 'Step away from desk, hydrate, and reset attention before next block.',
            isBreak: true,
          });
        }
      }
    }

    if (scheduledCount < freq) {
      warnings.push(
        `Scheduled "${act.name}" ${scheduledCount} of ${freq} requested days to avoid overlapping fixed commitments or exceeding ${basicSchedule.maxDailyFocusHours}h daily focus limit.`
      );
    }
  }

  // Sort every weekday chronologically
  for (let dow = 0; dow < 7; dow++) {
    weeklyTimetable[dow].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }

  const totalWeeklyBlocks = Object.values(weeklyTimetable).reduce((acc, list) => acc + list.length, 0);
  const totalWeeklyHours = (
    Object.values(dailyProductiveMins).reduce((a, b) => a + b, 0) / 60
  ).toFixed(1);

  return {
    weeklyTimetable,
    warnings,
    summary: `Generated ${totalWeeklyBlocks} conflict-free weekly blocks (${totalWeeklyHours}h focused time/week) respecting your wake (${basicSchedule.wakeTime}) to bed (${basicSchedule.bedTime}) window and fixed commitments.`,
  };
}

export function findTemplateDayConflicts(blocks: TemplateTask[]): string[] {
  const conflicts: string[] = [];
  const sorted = [...blocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const currEnd = timeToMinutes(curr.endTime);
    const nextStart = timeToMinutes(next.startTime);
    if (currEnd > timeToMinutes(curr.startTime) && nextStart < currEnd) {
      conflicts.push(`"${curr.title}" overlaps with "${next.title}"`);
    }
  }
  return conflicts;
}

export function deriveGoalsAndHabitsFromOnboarding(options: {
  startDate: string;
  goalTargets: GoalTimeTarget[];
  activities: PersonalActivityInput[];
}): { goals: Goal[]; habits: Habit[] } {
  const { startDate, goalTargets, activities } = options;

  const goals: Goal[] = goalTargets.map((gt) => ({
    id: createId('goal'),
    area: LIFE_AREAS.includes(gt.area) ? gt.area : LIFE_AREAS[0],
    title: gt.title,
    description:
      gt.notes?.trim() ||
      `Target commitment: ${gt.targetHoursPerWeek}h/week dedicated toward ${gt.title}.`,
    deadline: gt.deadline || startDate,
    status: 'in_progress',
    milestones: [
      {
        id: createId('ms'),
        title: `Complete Week 1 target (${gt.targetHoursPerWeek}h)`,
        completed: false,
      },
      {
        id: createId('ms'),
        title: 'Sustain weekly cadence through Day 30',
        completed: false,
      },
    ],
    notes: gt.notes || '',
    linkedTaskTitles: activities
      .filter((a) => a.category !== 'Break & Buffer')
      .slice(0, 3)
      .map((a) => a.name),
  }));

  const habits: Habit[] = activities
    .filter((a) => a.category !== 'Break & Buffer')
    .slice(0, 10)
    .map((act) => ({
      id: createId('habit'),
      title: act.name,
      category: act.category,
      frequency: act.weeklyFrequency >= 7 ? 'daily' : 'custom',
      targetPerWeek: Math.max(1, Math.min(7, act.weeklyFrequency || 5)),
      logs: {},
      createdAt: startDate,
    }));

  return { goals, habits };
}
