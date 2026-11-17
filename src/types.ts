export type NavSection =
  | 'dashboard'
  | 'routine'
  | 'planner'
  | 'habits'
  | 'goals'
  | 'analytics'
  | 'review'
  | 'coach'
  | 'settings';

export type TaskCategory =
  | 'University'
  | 'Programming'
  | 'Mathematics'
  | 'English communication'
  | 'Exercise'
  | 'Haircare and skincare'
  | 'Prayer and spirituality'
  | 'Family'
  | 'Entrepreneurship'
  | 'Creative projects'
  | 'Rest and entertainment'
  | 'Morning & Personal Care'
  | 'Meals & Nutrition'
  | 'Break & Buffer';

export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type TaskStatus = 'pending' | 'completed' | 'skipped' | 'missed';

export type ScheduleType = 'normal' | 'university' | 'weekend' | 'holiday' | 'exam';

export type LifeArea =
  | 'Physical health and appearance'
  | 'Mental strength and discipline'
  | 'Academic and technical development'
  | 'Communication and personality'
  | 'Entrepreneurship and innovation';

export interface RoutineTask {
  id: string;
  templateKey?: string;
  title: string;
  startTime: string; // HH:mm (24h)
  endTime: string;   // HH:mm (24h)
  category: TaskCategory;
  priority: TaskPriority;
  description: string;
  status: TaskStatus;
  isBreak?: boolean;
  goalId?: string;
  isFixedCommitment?: boolean;
  reminderMinutesBefore?: NotificationTimingOption[];
  deleted?: boolean;
}

export interface DailyReviewEntry {
  mood: 'Focused' | 'Steady' | 'Struggling' | 'Energized';
  reflection: string;
  wins: string;
  completedAt: string;
}

export interface FocusSession {
  id: string;
  taskId?: string;
  taskTitle?: string;
  startedAt: string; // ISO string
  endedAt?: string;  // ISO string
  durationSeconds: number;
  pauseCount: number;
  completedNaturally: boolean;
  note?: string;
}

export interface DayPlan {
  dayNumber: number; // 1..30
  date: string;      // YYYY-MM-DD in Asia/Karachi
  scheduleType: ScheduleType;
  tasks: RoutineTask[];
  dailyReview?: DailyReviewEntry;
  focusSessions?: FocusSession[];
}

export interface Habit {
  id: string;
  title: string;
  category: TaskCategory;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
  customDays?: number[]; // 0=Sun..6=Sat
  targetPerWeek: number;
  logs: Record<string, boolean>; // YYYY-MM-DD -> completed
  createdAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  area: LifeArea;
  title: string;
  description: string;
  deadline: string; // YYYY-MM-DD
  status: 'not_started' | 'in_progress' | 'completed' | 'paused';
  milestones: Milestone[];
  notes: string;
  linkedTaskTitles: string[];
}

export interface ProjectTaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface Project {
  id: string;
  title: string;
  type: 'technical' | 'creative';
  description: string;
  status: 'planning' | 'active' | 'completed' | 'on_hold';
  deadline: string;
  tasks: ProjectTaskItem[];
  notes: string;
  link?: string;
}

export interface WeeklyReview {
  weekNumber: number; // 1..5
  startDate: string;
  endDate: string;
  accomplished: string;
  failedToComplete: string;
  distractions: string;
  improved: string;
  needsImprovement: string;
  nextWeekPriorities: string[];
  updatedAt?: string;
}

export interface FixedCommitment {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[]; // 0..6
  category: TaskCategory;
  location?: string;
  description?: string;
  recurrence?: 'recurring' | 'one_time';
  oneTimeDate?: string; // YYYY-MM-DD when recurrence === 'one_time'
}

export type PreferredTimeOfDay =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'flexible';

export interface BasicScheduleConfig {
  wakeTime: string; // HH:mm
  bedTime: string; // HH:mm
  preferredSleepHours: number;
  activeDaysOfWeek: number[]; // 0=Sun..6=Sat
  preferredWorkStart?: string; // HH:mm
  preferredWorkEnd?: string; // HH:mm
  breakDurationMinutes: number;
  breakFrequencyMinutes: number;
  maxDailyFocusHours: number;
}

export interface PersonalActivityInput {
  id: string;
  name: string;
  category: TaskCategory;
  preferredDurationMinutes: number;
  priority: TaskPriority;
  preferredTimeOfDay: PreferredTimeOfDay;
  weeklyFrequency: number; // 1..7
  description?: string;
}

export interface GoalTimeTarget {
  id: string;
  title: string;
  area: LifeArea;
  targetHoursPerWeek: number;
  deadline?: string;
  notes?: string;
}

/** 0=Sun .. 6=Sat personalized weekly routine blocks */
export type WeeklyTimetable = Record<number, TemplateTask[]>;

export interface OnboardingDraft {
  currentStep: 1 | 2 | 3 | 4 | 5;
  name: string;
  startDate: string;
  basicSchedule: BasicScheduleConfig;
  commitments: FixedCommitment[];
  activities: PersonalActivityInput[];
  goalTargets: GoalTimeTarget[];
  weeklyTimetable?: WeeklyTimetable;
  updatedAt: string;
}

export interface PrayerTimes {
  fajr: string;
  zuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export type EnergyPreference = 'morning_peak' | 'afternoon_peak' | 'evening_peak';

export interface SchedulingPreferences {
  energyPreference: EnergyPreference;
  maxProductiveHoursPerDay: number;
  includeBufferMinutes: number;
  protectPrayerWindows: boolean;
}

export type DashboardWidgetId =
  | 'daily_progress'
  | 'timeline'
  | 'insights'
  | 'metrics'
  | 'ai_coach'
  | 'priorities'
  | 'progress'
  | 'quick_actions';

export interface DashboardPreferences {
  widgetOrder: DashboardWidgetId[];
  hiddenWidgets: DashboardWidgetId[];
  compactTimeline?: boolean;
  updatedAt?: string;
}

export type NotificationType =
  | 'upcoming_activity'
  | 'activity_starting'
  | 'missed_activity'
  | 'upcoming_deadline'
  | 'daily_routine_reminder'
  | 'daily_summary'
  | 'weekly_summary';

export type NotificationTimingOption = 0 | 5 | 10 | 15 | 30;

export type NotificationChannel = 'in_app' | 'browser' | 'web_push';

export interface NotificationPreferences {
  enabled: boolean;
  browserNotificationsEnabled: boolean;
  webPushEnabled: boolean;
  timezone: string;
  defaultTimings: NotificationTimingOption[];
  activityTimingOverrides: Record<string, NotificationTimingOption[]>;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm
  quietHoursEnd: string;   // HH:mm
  respectSleepSchedule: boolean;
  dailyRoutineReminderTime: string; // HH:mm
  dailySummaryTime: string; // HH:mm
  enabledTypes: Record<NotificationType, boolean>;
  updatedAt?: string;
}

export interface SmartNotification {
  id: string;
  dedupeKey: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  scheduledFor?: string;
  dateStr: string;
  taskId?: string;
  taskTitle?: string;
  taskStartTime?: string;
  taskEndTime?: string;
  goalId?: string;
  read: boolean;
  dismissed?: boolean;
  snoozedUntil?: string;
  deliveredChannels: NotificationChannel[];
  targetSection: NavSection;
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  timezone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  name: string;
  email?: string;
  photoUrl?: string;
  startDate: string; // YYYY-MM-DD
  wakeTime: string;  // HH:mm
  sleepTime: string; // HH:mm
  fixedCommitments: FixedCommitment[];
  primaryGoalAreas: LifeArea[];
  prayerTimes?: PrayerTimes;
  schedulingPreferences?: SchedulingPreferences;
  dashboardPreferences?: DashboardPreferences;
  notificationPreferences?: NotificationPreferences;
  basicSchedule?: BasicScheduleConfig;
  personalActivities?: PersonalActivityInput[];
  goalTargets?: GoalTimeTarget[];
  weeklyTimetable?: WeeklyTimetable;
  onboardingDraft?: OnboardingDraft;
  onboardingSkipped?: boolean;
  onboardingCompleted: boolean;
}

export type TemplateTask = Omit<RoutineTask, 'id' | 'status'>;

export type RoutineTemplates = Record<ScheduleType, TemplateTask[]>;

export interface ProposedScheduleChange {
  id: string;
  targetDate: string; // YYYY-MM-DD
  action: 'add' | 'reschedule';
  existingTaskId?: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  originalTime?: string; // e.g., "14:45 - 16:15"
  suggestedStartTime: string; // HH:mm
  suggestedEndTime: string;   // HH:mm
  durationMinutes: number;
  reason: string;
  description?: string;
  isBreak?: boolean;
  approvalState: 'pending' | 'accepted' | 'rejected';
}

export interface ProposedGoalAction {
  id: string;
  goalTitle: string;
  area: LifeArea;
  deadline: string;
  milestones: string[];
  reason: string;
  approvalState: 'pending' | 'accepted' | 'rejected';
}

export interface RoutineDiagnostic {
  id: string;
  severity: 'info' | 'warning';
  issue: string;
  evidence: string;
  recommendation: string;
}

export interface CoachCitation {
  title: string;
  uri: string;
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  suggestedChanges?: ProposedScheduleChange[];
  suggestedGoalActions?: ProposedGoalAction[];
  citations?: CoachCitation[];
  webSearchQueries?: string[];
  isWebGrounded?: boolean;
  modelUsed?: string;
  usedFallback?: boolean;
  fallbackNotice?: string;
}

export interface CoachConversation {
  id: string;
  title: string;
  messages: CoachMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AIDailyReviewReport {
  date: string;
  completedSummary: string;
  missedTasks: string[];
  plannedVsActual: string;
  patterns: string[];
  recommendations: string[];
  tomorrowPriorities: string[];
  generatedAt: string;
  modelUsed?: string;
  usedFallback?: boolean;
  fallbackNotice?: string;
}

export interface AIWeeklyPerformanceReport {
  weekLabel: string;
  overallCompletionPct: number;
  habitConsistencyPct: number;
  studyProgress: string;
  exerciseConsistency: string;
  timeAllocation: string;
  biggestAchievement: string;
  biggestWeakness: string;
  recommendedImprovements: string[];
  generatedAt: string;
  modelUsed?: string;
  usedFallback?: boolean;
  fallbackNotice?: string;
}

export interface AppState {
  version: number;
  profile: UserProfile;
  days: Record<string, DayPlan>; // keyed by YYYY-MM-DD
  templates: RoutineTemplates;
  habits: Habit[];
  goals: Goal[];
  projects: Project[];
  weeklyReviews: WeeklyReview[];
  coachConversations?: CoachConversation[];
  notifications?: SmartNotification[];
  pushSubscriptions?: PushSubscriptionRecord[];
}

export type RoutineUpdateScope = 'this_day' | 'this_and_future' | 'all_30_days';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface BackupEnvelope {
  app: 'PROJECT_REBUILD_ME';
  version: number;
  exportedAt: string;
  uid?: string;
  data: AppState;
}
