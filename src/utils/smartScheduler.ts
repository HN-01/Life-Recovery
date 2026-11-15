import {
  AppState,
  DayPlan,
  EnergyPreference,
  ProposedScheduleChange,
  RoutineDiagnostic,
  RoutineTask,
  TaskCategory,
  TaskPriority,
} from '../types';
import {
  createId,
  DEFAULT_PRAYER_TIMES,
  DEFAULT_SCHEDULING_PREFERENCES,
  PRODUCTIVE_CATEGORIES,
} from '../data/starterData';
import {
  addDaysToDateStr,
  formatTime12h,
  getDayOfWeekFromDateStr,
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
  minutesToTime,
  timeToMinutes,
} from './dateUtils';

interface TimeInterval {
  start: number; // minutes from midnight
  end: number;
}

const PRIORITY_SCORE: Record<TaskPriority, number> = {
  Critical: 100,
  High: 75,
  Medium: 45,
  Low: 20,
};

function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: TimeInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

function getBlockedIntervalsForDay(
  state: AppState,
  day: DayPlan | undefined,
  targetDateStr: string
): TimeInterval[] {
  const blocked: TimeInterval[] = [];
  const wakeMins = timeToMinutes(state.profile.wakeTime || '05:30');
  const sleepMins = timeToMinutes(state.profile.sleepTime || '22:30');

  // Sleep window protection
  if (wakeMins > 0) blocked.push({ start: 0, end: wakeMins });
  if (sleepMins > wakeMins) blocked.push({ start: sleepMins, end: 1440 });

  // Fixed commitments for that day of week
  const dow = getDayOfWeekFromDateStr(targetDateStr);
  for (const fc of state.profile.fixedCommitments || []) {
    if (fc.daysOfWeek.includes(dow)) {
      const s = timeToMinutes(fc.startTime);
      const e = timeToMinutes(fc.endTime);
      if (e > s) blocked.push({ start: s, end: e });
    }
  }

  // Prayer windows (15 min protected slot around each prayer time if enabled)
  const prefs = state.profile.schedulingPreferences || DEFAULT_SCHEDULING_PREFERENCES;
  if (prefs.protectPrayerWindows) {
    const pt = state.profile.prayerTimes || DEFAULT_PRAYER_TIMES;
    [pt.fajr, pt.zuhr, pt.asr, pt.maghrib, pt.isha].forEach((pTime) => {
      const m = timeToMinutes(pTime);
      if (m > 0) blocked.push({ start: m, end: Math.min(1440, m + 15) });
    });
  }

  // Existing scheduled tasks on target day
  if (day) {
    for (const t of day.tasks) {
      const s = timeToMinutes(t.startTime);
      const e = timeToMinutes(t.endTime);
      if (e > s) blocked.push({ start: s, end: e });
    }
  }

  return mergeIntervals(blocked);
}

function findAvailableSlot(
  blocked: TimeInterval[],
  durationMins: number,
  energyPref: EnergyPreference,
  wakeMins: number,
  sleepMins: number,
  bufferMins: number
): TimeInterval | null {
  const merged = mergeIntervals(blocked);
  const gaps: TimeInterval[] = [];

  let cursor = wakeMins;
  for (const b of merged) {
    if (b.start > cursor) {
      gaps.push({ start: cursor, end: Math.min(b.start, sleepMins) });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < sleepMins) {
    gaps.push({ start: cursor, end: sleepMins });
  }

  const validGaps = gaps.filter((g) => g.end - g.start >= durationMins + bufferMins);
  if (validGaps.length === 0) {
    // Try without extra buffer if tight
    const tightGaps = gaps.filter((g) => g.end - g.start >= durationMins);
    if (tightGaps.length === 0) return null;
    return { start: tightGaps[0].start, end: tightGaps[0].start + durationMins };
  }

  // Rank gap by energy preference
  const preferredStartWindow =
    energyPref === 'morning_peak'
      ? { min: wakeMins, max: 12 * 60 }
      : energyPref === 'afternoon_peak'
      ? { min: 12 * 60, max: 17 * 60 }
      : { min: 17 * 60, max: sleepMins };

  const preferred = validGaps.find(
    (g) => g.start >= preferredStartWindow.min && g.start < preferredStartWindow.max
  );
  const chosen = preferred || validGaps[0];
  const paddedStart = chosen.start + (chosen.start > wakeMins ? Math.min(bufferMins, 10) : 0);
  return {
    start: paddedStart,
    end: paddedStart + durationMins,
  };
}

export function runRoutineDiagnostics(state: AppState, now: KarachiNow): RoutineDiagnostic[] {
  const diagnostics: RoutineDiagnostic[] = [];
  const days = Object.values(state.days).sort((a, b) => a.dayNumber - b.dayNumber);
  const recent7 = days.filter((d) => d.date <= now.dateStr).slice(-7);

  // 1. Repeatedly missed tasks
  const missedMap: Record<string, number> = {};
  recent7.forEach((day) => {
    day.tasks.forEach((t) => {
      if (getEffectiveTaskState(t, day.date, now) === 'missed') {
        missedMap[t.title] = (missedMap[t.title] || 0) + 1;
      }
    });
  });
  const repeatedMissed = Object.entries(missedMap)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (repeatedMissed.length > 0) {
    const [topTitle, count] = repeatedMissed[0];
    diagnostics.push({
      id: 'diag_missed',
      severity: 'warning',
      issue: `Repeatedly missed task: "${topTitle}"`,
      evidence: `Missed ${count} times in the last ${recent7.length} active days.`,
      recommendation: `Move "${topTitle}" into your peak energy window or shorten its duration by 25%.`,
    });
  }

  // 2. Unrealistic daily workload
  const todayDay = state.days[now.dateStr];
  if (todayDay) {
    const productiveMins = todayDay.tasks
      .filter((t) => !t.isBreak && PRODUCTIVE_CATEGORIES.has(t.category))
      .reduce((acc, t) => acc + getDurationMinutes(t.startTime, t.endTime), 0);
    const maxMins =
      (state.profile.schedulingPreferences?.maxProductiveHoursPerDay ?? 9) * 60;
    if (productiveMins > maxMins + 90) {
      diagnostics.push({
        id: 'diag_overload',
        severity: 'warning',
        issue: 'Unrealistic daily workload detected',
        evidence: `${(productiveMins / 60).toFixed(1)}h planned today vs ${(maxMins / 60).toFixed(1)}h sustainable cap.`,
        recommendation: 'Defer Low-priority blocks or add two 20-minute recovery buffers.',
      });
    }
  }

  // 3. Insufficient exercise
  const exerciseBlocks = recent7.reduce(
    (acc, d) =>
      acc +
      d.tasks.filter((t) => t.category === 'Exercise' && t.status === 'completed').length,
    0
  );
  if (recent7.length >= 3 && exerciseBlocks < 2) {
    diagnostics.push({
      id: 'diag_exercise',
      severity: 'warning',
      issue: 'Insufficient exercise consistency',
      evidence: `Only ${exerciseBlocks} completed exercise block(s) across the last ${recent7.length} days.`,
      recommendation: 'Lock a non-negotiable 35-minute walk or strength session after Asr or morning wake-up.',
    });
  }

  // 4. Poor study / programming distribution
  const progCompletedMins = recent7.reduce(
    (acc, d) =>
      acc +
      d.tasks
        .filter((t) => t.category === 'Programming' && t.status === 'completed')
        .reduce((s, t) => s + getDurationMinutes(t.startTime, t.endTime), 0),
    0
  );
  if (recent7.length >= 2 && progCompletedMins < 120) {
    diagnostics.push({
      id: 'diag_prog',
      severity: 'info',
      issue: 'Low programming execution time',
      evidence: `${(progCompletedMins / 60).toFixed(1)}h completed programming over the past ${recent7.length} days.`,
      recommendation: 'Protect one 60–90 minute uninterrupted programming sprint tomorrow.',
    });
  }

  // 5. Sleep schedule consistency
  const wakeM = timeToMinutes(state.profile.wakeTime || '05:30');
  const sleepM = timeToMinutes(state.profile.sleepTime || '22:30');
  const sleepDurationMins = (1440 - sleepM) + wakeM;
  if (sleepDurationMins < 390) {
    diagnostics.push({
      id: 'diag_sleep',
      severity: 'warning',
      issue: 'Insufficient sleep window configured',
      evidence: `Current window (${state.profile.sleepTime} to ${state.profile.wakeTime}) provides ${(sleepDurationMins / 60).toFixed(1)}h.`,
      recommendation: 'Shift sleep earlier by 30–45 minutes to protect cognitive focus.',
    });
  }

  return diagnostics;
}

export function buildDeterministicSmartPlan(
  state: AppState,
  now: KarachiNow,
  targetDateStr?: string
): {
  targetDate: string;
  proposals: ProposedScheduleChange[];
  diagnostics: RoutineDiagnostic[];
  contextSummary: string;
} {
  const todayStr = now.dateStr;
  const tomorrowStr = targetDateStr || addDaysToDateStr(todayStr, 1);
  const todayDay = state.days[todayStr];
  const tomorrowDay = state.days[tomorrowStr];

  const prefs = state.profile.schedulingPreferences || DEFAULT_SCHEDULING_PREFERENCES;
  const wakeMins = timeToMinutes(state.profile.wakeTime || '05:30');
  const sleepMins = timeToMinutes(state.profile.sleepTime || '22:30');
  const maxTomorrowProductiveMins = prefs.maxProductiveHoursPerDay * 60;

  const blocked = getBlockedIntervalsForDay(state, tomorrowDay, tomorrowStr);

  let currentTomorrowProductiveMins = (tomorrowDay?.tasks || [])
    .filter((t) => !t.isBreak && PRODUCTIVE_CATEGORIES.has(t.category))
    .reduce((acc, t) => acc + getDurationMinutes(t.startTime, t.endTime), 0);

  const existingTomorrowTitles = new Set(
    (tomorrowDay?.tasks || []).map((t) => t.title.toLowerCase())
  );

  const proposals: ProposedScheduleChange[] = [];

  // 1. Gather missed / unfinished high-priority tasks from today
  const candidates: Array<{
    task?: RoutineTask;
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
    duration: number;
    score: number;
    originalTime?: string;
    reason: string;
    description: string;
    isBreak?: boolean;
  }> = [];

  if (todayDay) {
    for (const t of todayDay.tasks) {
      if (t.isFixedCommitment || t.isBreak) continue;
      const eff = getEffectiveTaskState(t, todayDay.date, now);
      if (eff === 'missed' || (t.status === 'pending' && t.priority === 'Critical')) {
        const dur = Math.min(90, Math.max(30, getDurationMinutes(t.startTime, t.endTime)));
        // Check if linked to an approaching goal deadline
        const urgentGoal = state.goals.some(
          (g) =>
            g.status !== 'completed' &&
            g.deadline <= addDaysToDateStr(tomorrowStr, 7) &&
            (t.goalId === g.id || g.linkedTaskTitles.includes(t.title))
        );
        const score = PRIORITY_SCORE[t.priority] + (urgentGoal ? 25 : 0);

        if (t.priority === 'Critical' || t.priority === 'High' || urgentGoal) {
          candidates.push({
            task: t,
            title: t.title,
            category: t.category,
            priority: t.priority,
            duration: dur,
            score,
            originalTime: `${formatTime12h(t.startTime)} – ${formatTime12h(t.endTime)}`,
            reason: urgentGoal
              ? `Missed today and linked to an active goal deadline (${t.priority} priority).`
              : `Missed today (${t.priority} priority); rescheduled into an open tomorrow slot without exceeding daily capacity.`,
            description: t.description || 'Carry-over focus block from today.',
          });
        }
      }
    }
  }

  // 2. Ensure core pillar coverage tomorrow (Academic/University, Programming, Exercise, English, Buffer)
  const ensurePillar = (
    category: TaskCategory,
    fallbackTitle: string,
    duration: number,
    priority: TaskPriority,
    reason: string,
    isBreak = false
  ) => {
    const hasCat = (tomorrowDay?.tasks || []).some((t) => t.category === category);
    const alreadyQueued = candidates.some((c) => c.category === category);
    if (!hasCat && !alreadyQueued) {
      candidates.push({
        title: fallbackTitle,
        category,
        priority,
        duration,
        score: PRIORITY_SCORE[priority],
        reason,
        description: reason,
        isBreak,
      });
    }
  };

  ensurePillar(
    'Programming',
    'Focused Programming & Problem Solving',
    60,
    'High',
    'Tomorrow currently lacks a dedicated programming sprint.'
  );
  ensurePillar(
    'Exercise',
    'Exercise / Mobility & Brisk Walk',
    45,
    'High',
    'Includes physical training to protect energy and weekly exercise consistency.'
  );
  ensurePillar(
    'English communication',
    'English Communication & Speaking Drill',
    30,
    'Medium',
    'Keeps daily communication practice consistent without overloading your evening.'
  );

  // Check if tomorrow has >= 3 consecutive hours without a break
  const hasBreakTomorrow = (tomorrowDay?.tasks || []).some((t) => t.isBreak || t.category === 'Break & Buffer');
  if (!hasBreakTomorrow) {
    candidates.push({
      title: 'Midday Recovery & Buffer Block',
      category: 'Break & Buffer',
      priority: 'Medium',
      duration: 25,
      score: 55,
      reason: 'Adds an intentional recovery buffer between study and afternoon blocks.',
      description: 'Hydrate, stretch, and rest eyes away from screens.',
      isBreak: true,
    });
  }

  // Sort by priority score descending
  candidates.sort((a, b) => b.score - a.score);

  for (const cand of candidates) {
    if (proposals.length >= 5) break;
    // Skip duplicate title unless it's a carry-over missed task specifically named differently
    if (existingTomorrowTitles.has(cand.title.toLowerCase()) && !cand.originalTime) {
      continue;
    }

    const isProd = !cand.isBreak && PRODUCTIVE_CATEGORIES.has(cand.category);
    if (isProd && currentTomorrowProductiveMins + cand.duration > maxTomorrowProductiveMins) {
      continue; // Respect daily capacity cap — never overload tomorrow
    }

    const slot = findAvailableSlot(
      blocked,
      cand.duration,
      prefs.energyPreference,
      wakeMins,
      sleepMins,
      prefs.includeBufferMinutes
    );

    if (!slot) continue;

    blocked.push(slot);
    if (isProd) currentTomorrowProductiveMins += cand.duration;

    proposals.push({
      id: createId('prop'),
      targetDate: tomorrowStr,
      action: 'add',
      title: cand.originalTime ? `${cand.title} (Carry-Over)` : cand.title,
      category: cand.category,
      priority: cand.priority,
      originalTime: cand.originalTime,
      suggestedStartTime: minutesToTime(slot.start),
      suggestedEndTime: minutesToTime(slot.end),
      durationMinutes: cand.duration,
      reason: cand.reason,
      description: cand.description,
      isBreak: cand.isBreak,
      approvalState: 'pending',
    });
  }

  const diagnostics = runRoutineDiagnostics(state, now);
  const contextSummary = `Tomorrow (${tomorrowStr}) has ${(tomorrowDay?.tasks || []).length} existing tasks and ${(currentTomorrowProductiveMins / 60).toFixed(1)}h planned productive time (cap ${(maxTomorrowProductiveMins / 60).toFixed(1)}h). Proposed ${proposals.length} conflict-free adjustment(s).`;

  return {
    targetDate: tomorrowStr,
    proposals,
    diagnostics,
    contextSummary,
  };
}
