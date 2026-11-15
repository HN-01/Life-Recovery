import { RoutineTask, TaskStatus } from '../types';

export const KARACHI_TZ = 'Asia/Karachi';

export interface KarachiNow {
  dateStr: string;      // YYYY-MM-DD
  timeStr: string;      // HH:mm
  minutesSinceMidnight: number;
  dayOfWeek: number;    // 0 (Sun) - 6 (Sat)
  dayName: string;      // e.g. "Sunday"
  formattedDate: string; // e.g. "Nov 15, 2026"
  hour: number;
  greeting: string;
}

export function getKarachiNow(): KarachiNow {
  const now = new Date();

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: KARACHI_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hourStr = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minStr = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minStr, 10);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: KARACHI_TZ,
    weekday: 'long',
  }).format(now);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: KARACHI_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now);

  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: KARACHI_TZ,
    weekday: 'short',
  }).format(now);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  let greeting = 'Good evening';
  if (hour >= 4 && hour < 12) greeting = 'Good morning';
  else if (hour >= 12 && hour < 17) greeting = 'Good afternoon';

  return {
    dateStr,
    timeStr,
    minutesSinceMidnight: hour * 60 + minute,
    dayOfWeek: weekdayMap[weekdayShort] ?? 0,
    dayName,
    formattedDate,
    hour,
    greeting,
  };
}

export function addDaysToDateStr(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getDayOfWeekFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCDay();
}

export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(totalMins: number): string {
  const clamped = ((totalMins % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12h(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 1440; // overnight task like Sleep
  const diff = end - start;
  return diff > 0 && diff <= 720 ? diff : Math.max(0, timeToMinutes(endTime) - start);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

export type EffectiveTaskDisplayState = 'completed' | 'active' | 'upcoming' | 'missed' | 'skipped';

export function getEffectiveTaskState(
  task: RoutineTask,
  taskDateStr: string,
  now: KarachiNow
): EffectiveTaskDisplayState {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'skipped') return 'skipped';
  if (task.status === 'missed') return 'missed';

  // Status is pending
  if (taskDateStr < now.dateStr) {
    return 'missed';
  }
  if (taskDateStr > now.dateStr) {
    return 'upcoming';
  }

  // Same day (today)
  const startMins = timeToMinutes(task.startTime);
  const endMins = timeToMinutes(task.endTime);
  // Handle late night tasks (e.g. 23:00 to 23:59 or 22:30 to 23:00)
  const effectiveEnd = endMins <= startMins ? 1440 : endMins;

  if (now.minutesSinceMidnight >= startMins && now.minutesSinceMidnight < effectiveEnd) {
    return 'active';
  }
  if (now.minutesSinceMidnight >= effectiveEnd) {
    return 'missed';
  }
  return 'upcoming';
}

export function isTaskScheduledForPastOrMissed(
  status: TaskStatus,
  taskDateStr: string,
  endTime: string,
  now: KarachiNow
): boolean {
  if (status === 'missed') return true;
  if (status !== 'pending') return false;
  if (taskDateStr < now.dateStr) return true;
  if (taskDateStr === now.dateStr) {
    return now.minutesSinceMidnight >= timeToMinutes(endTime);
  }
  return false;
}

export function findConflictingTasks(
  tasks: RoutineTask[],
  startTime: string,
  endTime: string,
  excludeTaskId?: string
): RoutineTask[] {
  const newStart = timeToMinutes(startTime);
  const newEnd = timeToMinutes(endTime);
  if (newEnd <= newStart) return [];

  return tasks.filter((t) => {
    if (excludeTaskId && t.id === excludeTaskId) return false;
    const tStart = timeToMinutes(t.startTime);
    const tEnd = timeToMinutes(t.endTime);
    if (tEnd <= tStart) return false;
    return newStart < tEnd && newEnd > tStart;
  });
}

export function sortTasksChronologically(tasks: RoutineTask[]): RoutineTask[] {
  return [...tasks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}
