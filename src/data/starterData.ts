import {
  AppState,
  DayPlan,
  Goal,
  Habit,
  LifeArea,
  PrayerTimes,
  Project,
  RoutineTask,
  RoutineTemplates,
  ScheduleType,
  SchedulingPreferences,
  TaskCategory,
  TemplateTask,
  UserProfile,
  WeeklyReview,
} from '../types';

export const DEFAULT_PRAYER_TIMES: PrayerTimes = {
  fajr: '05:50',
  zuhr: '13:30',
  asr: '16:15',
  maghrib: '17:45',
  isha: '21:30',
};

export const DEFAULT_SCHEDULING_PREFERENCES: SchedulingPreferences = {
  energyPreference: 'morning_peak',
  maxProductiveHoursPerDay: 9,
  includeBufferMinutes: 15,
  protectPrayerWindows: true,
};
import { addDaysToDateStr, getDayOfWeekFromDateStr, getKarachiNow, sortTasksChronologically } from '../utils/dateUtils';

export const ALL_CATEGORIES: TaskCategory[] = [
  'University',
  'Programming',
  'Mathematics',
  'English communication',
  'Exercise',
  'Haircare and skincare',
  'Prayer and spirituality',
  'Family',
  'Entrepreneurship',
  'Creative projects',
  'Rest and entertainment',
  'Morning & Personal Care',
  'Meals & Nutrition',
  'Break & Buffer',
];

export const PRODUCTIVE_CATEGORIES: Set<TaskCategory> = new Set([
  'University',
  'Programming',
  'Mathematics',
  'English communication',
  'Exercise',
  'Haircare and skincare',
  'Prayer and spirituality',
  'Entrepreneurship',
  'Creative projects',
  'Morning & Personal Care',
]);

export const LIFE_AREAS: LifeArea[] = [
  'Physical health and appearance',
  'Mental strength and discipline',
  'Academic and technical development',
  'Communication and personality',
  'Entrepreneurship and innovation',
];

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  normal: 'Normal Day',
  university: 'University Day',
  weekend: 'Weekend',
  holiday: 'Holiday / Free Day',
  exam: 'Exam Day',
};

export const MOTIVATIONAL_MESSAGES: string[] = [
  'Discipline is built in the quiet hours before anyone is watching.',
  'Execute the next block on your timeline. Momentum follows action.',
  'Consistency beats intensity. Win the current hour cleanly.',
  'Your future self is shaped by the routine you honor today.',
  'Protect your focus blocks. Small daily reps compound into mastery.',
  'Clarity comes from execution, not overthinking.',
];

export function createId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export const DEFAULT_TEMPLATES: RoutineTemplates = {
  university: [
    {
      templateKey: 'wake_care',
      title: 'Morning Wake-Up & Personal Care',
      startTime: '05:30',
      endTime: '05:50',
      category: 'Morning & Personal Care',
      priority: 'High',
      description: 'Hydrate with 500ml water, wash face, brush teeth, and make bed immediately.',
    },
    {
      templateKey: 'fajr_prayer',
      title: 'Fajr Prayer & Mindful Stillness',
      startTime: '05:50',
      endTime: '06:15',
      category: 'Prayer and spirituality',
      priority: 'Critical',
      description: 'Offer Fajr prayer, recite Quran/dhikr, and set clear intention for the day.',
    },
    {
      templateKey: 'skincare_am',
      title: 'Morning Skincare & Haircare Routine',
      startTime: '06:15',
      endTime: '06:35',
      category: 'Haircare and skincare',
      priority: 'Medium',
      description: 'Gentle cleanser, moisturizer, sunscreen, and prescribed morning haircare routine.',
    },
    {
      templateKey: 'breakfast',
      title: 'High-Protein Breakfast & Prep',
      startTime: '06:35',
      endTime: '07:10',
      category: 'Meals & Nutrition',
      priority: 'High',
      description: 'Balanced breakfast (eggs/oats), pack university bag, water bottle, and charger.',
    },
    {
      templateKey: 'uni_lectures',
      title: 'University Classes & Active Note-Taking',
      startTime: '08:00',
      endTime: '13:30',
      category: 'University',
      priority: 'Critical',
      description: 'Attend scheduled lectures attentively, sit near front, capture structured notes and questions.',
    },
    {
      templateKey: 'zuhr_lunch',
      title: 'Zuhr Prayer, Lunch & Recovery Buffer',
      startTime: '13:30',
      endTime: '14:45',
      category: 'Break & Buffer',
      priority: 'High',
      description: 'Offer Zuhr prayer, eat a clean lunch, decompress away from screens.',
      isBreak: true,
    },
    {
      templateKey: 'math_block',
      title: 'Mathematics Deep Problem Solving',
      startTime: '14:45',
      endTime: '16:15',
      category: 'Mathematics',
      priority: 'High',
      description: 'Solve calculus, linear algebra, or discrete math problem sets without phone distractions.',
    },
    {
      templateKey: 'asr_walk',
      title: 'Asr Prayer & Exercise / Brisk Walk',
      startTime: '16:15',
      endTime: '17:30',
      category: 'Exercise',
      priority: 'High',
      description: 'Offer Asr prayer followed by 45 minutes of strength training, running, or brisk walking.',
    },
    {
      templateKey: 'programming_block',
      title: 'Programming Practice & Data Structures',
      startTime: '17:45',
      endTime: '19:30',
      category: 'Programming',
      priority: 'Critical',
      description: 'Build real code, practice algorithmic problem-solving, and push daily commits.',
    },
    {
      templateKey: 'maghrib_family',
      title: 'Maghrib Prayer, Dinner & Family Time',
      startTime: '19:30',
      endTime: '20:45',
      category: 'Family',
      priority: 'High',
      description: 'Offer Maghrib, eat dinner with family, and stay present with parents/siblings.',
    },
    {
      templateKey: 'english_comm',
      title: 'English Communication & Speaking Practice',
      startTime: '20:45',
      endTime: '21:30',
      category: 'English communication',
      priority: 'Medium',
      description: 'Read aloud for 15 min, practice structured speaking prompts, and review vocabulary.',
    },
    {
      templateKey: 'isha_reflection',
      title: 'Isha Prayer, Night Skincare & Daily Reflection',
      startTime: '21:30',
      endTime: '22:15',
      category: 'Haircare and skincare',
      priority: 'High',
      description: 'Offer Isha, apply prescribed night hair/skincare, review completed tasks, prep tomorrow.',
    },
    {
      templateKey: 'sleep_block',
      title: 'Lights Out & Sleep',
      startTime: '22:30',
      endTime: '23:59',
      category: 'Rest and entertainment',
      priority: 'Critical',
      description: 'Phone outside reach, dark room, 7 hours quality sleep.',
    },
  ],

  normal: [
    {
      templateKey: 'wake_care',
      title: 'Morning Wake-Up & Hydration',
      startTime: '06:00',
      endTime: '06:20',
      category: 'Morning & Personal Care',
      priority: 'High',
      description: 'Wake on first alarm, hydrate, stretch, and reset workspace.',
    },
    {
      templateKey: 'fajr_prayer',
      title: 'Fajr Prayer & Morning Clarity',
      startTime: '06:20',
      endTime: '06:45',
      category: 'Prayer and spirituality',
      priority: 'Critical',
      description: 'Morning prayer and quiet mental grounding before checking notifications.',
    },
    {
      templateKey: 'exercise_am',
      title: 'Morning Workout & Mobility',
      startTime: '06:45',
      endTime: '07:45',
      category: 'Exercise',
      priority: 'High',
      description: 'Strength circuit or outdoor run + cool-down stretching.',
    },
    {
      templateKey: 'skincare_breakfast',
      title: 'Shower, Hair/Skincare & Breakfast',
      startTime: '07:45',
      endTime: '08:45',
      category: 'Haircare and skincare',
      priority: 'Medium',
      description: 'Complete morning grooming protocol and nourishing breakfast.',
    },
    {
      templateKey: 'programming_deep',
      title: 'Deep Programming Sprint',
      startTime: '09:00',
      endTime: '11:30',
      category: 'Programming',
      priority: 'Critical',
      description: '2.5 hours uninterrupted coding on core technical stack or project architecture.',
    },
    {
      templateKey: 'uni_study',
      title: 'University Coursework & Revisions',
      startTime: '11:45',
      endTime: '13:30',
      category: 'University',
      priority: 'High',
      description: 'Review lecture slides, summarize key concepts, and stay ahead on assignments.',
    },
    {
      templateKey: 'zuhr_rest',
      title: 'Zuhr Prayer, Lunch & Rest Buffer',
      startTime: '13:30',
      endTime: '14:45',
      category: 'Break & Buffer',
      priority: 'Medium',
      description: 'Lunch, prayer, and 25-minute recharge.',
      isBreak: true,
    },
    {
      templateKey: 'math_practice',
      title: 'Mathematics Conceptual Mastery',
      startTime: '14:45',
      endTime: '16:15',
      category: 'Mathematics',
      priority: 'High',
      description: 'Work through proofs, problem sheets, and weak areas systematically.',
    },
    {
      templateKey: 'creative_entrepreneur',
      title: 'Personal Project & Entrepreneurship Lab',
      startTime: '16:30',
      endTime: '18:30',
      category: 'Entrepreneurship',
      priority: 'High',
      description: 'Build portfolio project features, research startup ideas, or ship product iterations.',
    },
    {
      templateKey: 'english_practice',
      title: 'English Communication & Writing',
      startTime: '18:45',
      endTime: '19:30',
      category: 'English communication',
      priority: 'Medium',
      description: 'Record a 5-minute spoken summary and write concise technical notes.',
    },
    {
      templateKey: 'family_dinner',
      title: 'Maghrib, Dinner & Family Connection',
      startTime: '19:30',
      endTime: '21:00',
      category: 'Family',
      priority: 'High',
      description: 'Quality screen-free dinner and conversation with family.',
    },
    {
      templateKey: 'evening_review',
      title: 'Night Skincare, Isha & Evening Reflection',
      startTime: '21:15',
      endTime: '22:15',
      category: 'Prayer and spirituality',
      priority: 'High',
      description: 'Review today’s execution score, log habits, and set tomorrow’s top 3 priorities.',
    },
    {
      templateKey: 'sleep_block',
      title: 'Sleep & Recovery',
      startTime: '22:30',
      endTime: '23:59',
      category: 'Rest and entertainment',
      priority: 'Critical',
      description: 'Consistent sleep window for cognitive recovery.',
    },
  ],

  weekend: [
    {
      templateKey: 'wake_care',
      title: 'Morning Wake-Up & Prayer',
      startTime: '06:30',
      endTime: '07:15',
      category: 'Prayer and spirituality',
      priority: 'Critical',
      description: 'Wake smoothly, hydrate, pray Fajr, and take 15 quiet minutes.',
    },
    {
      templateKey: 'exercise_long',
      title: 'Weekend Outdoor Run / Strength Session',
      startTime: '07:30',
      endTime: '08:45',
      category: 'Exercise',
      priority: 'High',
      description: 'Longer endurance walk, run, or full-body gym session.',
    },
    {
      templateKey: 'grooming_breakfast',
      title: 'Haircare Protocol & Relaxed Breakfast',
      startTime: '08:45',
      endTime: '10:00',
      category: 'Haircare and skincare',
      priority: 'Medium',
      description: 'Weekly scalp/haircare treatment, skincare, and healthy breakfast.',
    },
    {
      templateKey: 'creative_project',
      title: 'Creative & Technical Build Block',
      startTime: '10:15',
      endTime: '13:00',
      category: 'Creative projects',
      priority: 'High',
      description: 'Deep work on side project, open-source contribution, or creative writing.',
    },
    {
      templateKey: 'zuhr_family',
      title: 'Prayer, Lunch & Family Time',
      startTime: '13:00',
      endTime: '15:30',
      category: 'Family',
      priority: 'High',
      description: 'Extended lunch and conversation with family; step away from study desk.',
    },
    {
      templateKey: 'weekly_audit',
      title: 'Weekly Review & Next-Week Routine Audit',
      startTime: '16:00',
      endTime: '17:30',
      category: 'Entrepreneurship',
      priority: 'Critical',
      description: 'Inspect weekly analytics, complete Weekly Review reflection, and refine next week.',
    },
    {
      templateKey: 'rest_recharge',
      title: 'Guilt-Free Rest & Leisure',
      startTime: '18:00',
      endTime: '20:30',
      category: 'Rest and entertainment',
      priority: 'Low',
      description: 'Read fiction, watch a film, or socialize with friends intentionally.',
      isBreak: true,
    },
    {
      templateKey: 'night_winddown',
      title: 'Night Skincare, Prayer & Prep Week Ahead',
      startTime: '21:00',
      endTime: '22:15',
      category: 'Haircare and skincare',
      priority: 'High',
      description: 'Prepare clothes, review Monday classes, and wind down before 10:30 PM.',
    },
  ],

  holiday: [
    {
      templateKey: 'wake_prayer',
      title: 'Morning Wake-Up, Prayer & Gratitude',
      startTime: '06:30',
      endTime: '07:15',
      category: 'Prayer and spirituality',
      priority: 'Critical',
      description: 'Calm start without rushing; hydrate and reflect.',
    },
    {
      templateKey: 'grooming_breakfast',
      title: 'Personal Care, Skincare & Family Breakfast',
      startTime: '07:30',
      endTime: '09:00',
      category: 'Family',
      priority: 'High',
      description: 'Full morning routine and unhurried breakfast with family.',
    },
    {
      templateKey: 'light_coding',
      title: 'Focused Skill Practice (Programming / English)',
      startTime: '09:30',
      endTime: '11:30',
      category: 'Programming',
      priority: 'Medium',
      description: 'Keep streak alive with 2 focused hours of coding or reading.',
    },
    {
      templateKey: 'exercise_walk',
      title: 'Outdoor Walk & Mobility',
      startTime: '16:45',
      endTime: '17:45',
      category: 'Exercise',
      priority: 'High',
      description: '45–60 min walk in fresh air.',
    },
    {
      templateKey: 'leisure_family',
      title: 'Rest, Family Outing & Entertainment',
      startTime: '18:00',
      endTime: '21:00',
      category: 'Rest and entertainment',
      priority: 'Low',
      description: 'Recharge mentally so discipline stays sustainable over 30 days.',
      isBreak: true,
    },
    {
      templateKey: 'night_care',
      title: 'Night Haircare/Skincare & Early Sleep',
      startTime: '21:30',
      endTime: '22:30',
      category: 'Haircare and skincare',
      priority: 'High',
      description: 'Maintain baseline sleep and grooming habits even on free days.',
    },
  ],

  exam: [
    {
      templateKey: 'wake_prayer',
      title: 'Early Wake-Up, Prayer & Exam Mindset',
      startTime: '05:15',
      endTime: '05:50',
      category: 'Prayer and spirituality',
      priority: 'Critical',
      description: 'Calm, focused start. Avoid frantic cramming.',
    },
    {
      templateKey: 'morning_prep',
      title: 'Quick Grooming & Brain-Fuel Breakfast',
      startTime: '05:50',
      endTime: '06:30',
      category: 'Meals & Nutrition',
      priority: 'High',
      description: 'Light protein breakfast, hydration, pack exam stationery and ID.',
    },
    {
      templateKey: 'exam_sprint_1',
      title: 'High-Yield Active Recall & Past Papers',
      startTime: '06:30',
      endTime: '09:00',
      category: 'University',
      priority: 'Critical',
      description: 'Simulate exam questions under timed conditions; review weak formulas.',
    },
    {
      templateKey: 'buffer_break',
      title: 'Decompression Break & Light Snack',
      startTime: '09:00',
      endTime: '09:30',
      category: 'Break & Buffer',
      priority: 'Medium',
      description: 'Step away from notes, stretch, breathe.',
      isBreak: true,
    },
    {
      templateKey: 'exam_sprint_2',
      title: 'Core Subject / Mathematics Consolidation',
      startTime: '09:30',
      endTime: '12:30',
      category: 'Mathematics',
      priority: 'Critical',
      description: 'Review key derivations, past errors, and core concepts.',
    },
    {
      templateKey: 'zuhr_nap',
      title: 'Prayer, Lunch & 20-Min Power Reset',
      startTime: '12:30',
      endTime: '14:00',
      category: 'Break & Buffer',
      priority: 'High',
      description: 'Protect memory consolidation with real food and short rest.',
      isBreak: true,
    },
    {
      templateKey: 'exam_sprint_3',
      title: 'Afternoon Mock Revision & Summary Sheets',
      startTime: '14:00',
      endTime: '17:00',
      category: 'University',
      priority: 'Critical',
      description: 'Summarize tough topics onto one-page cheat sheets from memory.',
    },
    {
      templateKey: 'walk_reset',
      title: 'Asr Prayer & 30-Min Stress-Relief Walk',
      startTime: '17:00',
      endTime: '17:45',
      category: 'Exercise',
      priority: 'High',
      description: 'Clear cortisol and restore focus.',
    },
    {
      templateKey: 'light_review',
      title: 'Final Formula & Definition Scan',
      startTime: '19:30',
      endTime: '21:00',
      category: 'University',
      priority: 'High',
      description: 'Gentle review only—no heavy new topics before sleep.',
    },
    {
      templateKey: 'sleep_exam',
      title: 'Mandatory Pre-Exam Sleep',
      startTime: '21:45',
      endTime: '23:59',
      category: 'Rest and entertainment',
      priority: 'Critical',
      description: '7.5 hours of sleep improves recall far more than late cramming.',
    },
  ],
};

export function instantiateTasksFromTemplate(
  template: TemplateTask[],
  dayDate: string,
  fixedCommitments: UserProfile['fixedCommitments'] = []
): RoutineTask[] {
  const dow = getDayOfWeekFromDateStr(dayDate);

  const baseTasks: RoutineTask[] = template.map((t) => ({
    ...t,
    id: createId('task'),
    status: 'pending',
  }));

  const commitmentTasks: RoutineTask[] = fixedCommitments
    .filter((c) => c.daysOfWeek.includes(dow))
    .map((c) => ({
      id: createId('commit'),
      templateKey: `commitment_${c.id}`,
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
      category: c.category,
      priority: 'Critical',
      description: 'Fixed weekly commitment from profile setup.',
      status: 'pending',
      isFixedCommitment: true,
    }));

  const seenKeys = new Set<string>();
  const uniqueTasks: RoutineTask[] = [];
  for (const task of [...baseTasks, ...commitmentTasks]) {
    const key = `${task.title.trim().replace(/\s+/g, ' ').toLowerCase()}::${task.startTime}::${task.endTime}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueTasks.push(task);
  }

  return sortTasksChronologically(uniqueTasks);
}

export function build30DaysSchedule(
  startDate: string,
  templates: RoutineTemplates,
  fixedCommitments: UserProfile['fixedCommitments'] = []
): Record<string, DayPlan> {
  const days: Record<string, DayPlan> = {};

  for (let i = 0; i < 30; i++) {
    const date = addDaysToDateStr(startDate, i);
    const dow = getDayOfWeekFromDateStr(date);
    let scheduleType: ScheduleType = 'university';
    if (dow === 0 || dow === 6) {
      scheduleType = 'weekend';
    } else if (dow === 5) {
      scheduleType = 'normal';
    }

    const template = templates[scheduleType] || templates.normal;
    days[date] = {
      dayNumber: i + 1,
      date,
      scheduleType,
      tasks: instantiateTasksFromTemplate(template, date, fixedCommitments),
    };
  }

  return days;
}

export function createStarterHabits(todayDateStr: string): Habit[] {
  const yesterday = addDaysToDateStr(todayDateStr, -1);
  const twoDaysAgo = addDaysToDateStr(todayDateStr, -2);
  const threeDaysAgo = addDaysToDateStr(todayDateStr, -3);

  const starterList: Array<{ title: string; category: TaskCategory; targetPerWeek: number; seedDays: string[] }> = [
    { title: 'Wake up on time', category: 'Morning & Personal Care', targetPerWeek: 7, seedDays: [threeDaysAgo, twoDaysAgo, yesterday] },
    { title: 'Complete morning routine', category: 'Prayer and spirituality', targetPerWeek: 7, seedDays: [threeDaysAgo, twoDaysAgo, yesterday] },
    { title: 'Exercise', category: 'Exercise', targetPerWeek: 5, seedDays: [twoDaysAgo, yesterday] },
    { title: 'Practice programming', category: 'Programming', targetPerWeek: 6, seedDays: [threeDaysAgo, twoDaysAgo, yesterday] },
    { title: 'Study university subjects', category: 'University', targetPerWeek: 6, seedDays: [threeDaysAgo, yesterday] },
    { title: 'Practice English', category: 'English communication', targetPerWeek: 6, seedDays: [twoDaysAgo, yesterday] },
    { title: 'Follow skincare routine', category: 'Haircare and skincare', targetPerWeek: 7, seedDays: [threeDaysAgo, twoDaysAgo, yesterday] },
    { title: 'Follow prescribed haircare routine', category: 'Haircare and skincare', targetPerWeek: 7, seedDays: [threeDaysAgo, twoDaysAgo, yesterday] },
    { title: 'Limit mobile usage', category: 'Rest and entertainment', targetPerWeek: 7, seedDays: [yesterday] },
    { title: 'Sleep on time', category: 'Rest and entertainment', targetPerWeek: 7, seedDays: [twoDaysAgo, yesterday] },
  ];

  return starterList.map((item) => {
    const logs: Record<string, boolean> = {};
    item.seedDays.forEach((d) => {
      logs[d] = true;
    });
    return {
      id: createId('habit'),
      title: item.title,
      category: item.category,
      frequency: item.targetPerWeek === 7 ? 'daily' : 'custom',
      targetPerWeek: item.targetPerWeek,
      logs,
      createdAt: threeDaysAgo,
    };
  });
}

export function createStarterGoals(startDate: string): Goal[] {
  const endDate = addDaysToDateStr(startDate, 29);
  return [
    {
      id: createId('goal'),
      area: 'Physical health and appearance',
      title: 'Consistent Fitness, Haircare & Skincare Discipline',
      description: 'Complete at least 22 workouts and adhere strictly to morning/night skin and haircare protocols for 30 days.',
      deadline: endDate,
      status: 'in_progress',
      milestones: [
        { id: createId('ms'), title: 'Complete 7 consecutive days of haircare & skincare', completed: true },
        { id: createId('ms'), title: 'Hit 12 strength or cardio sessions in first 2 weeks', completed: false },
        { id: createId('ms'), title: 'Maintain 10:30 PM sleep window for 20+ days', completed: false },
      ],
      notes: 'Focus on consistency over intensity. Never skip two workouts in a row.',
      linkedTaskTitles: ['Asr Prayer & Exercise / Brisk Walk', 'Morning Skincare & Haircare Routine'],
    },
    {
      id: createId('goal'),
      area: 'Mental strength and discipline',
      title: 'Zero-Drift Morning Execution & Screen Control',
      description: 'Eliminate morning scrolling and maintain under 90 minutes recreational mobile usage daily.',
      deadline: endDate,
      status: 'in_progress',
      milestones: [
        { id: createId('ms'), title: 'Wake up on first alarm for 10 days', completed: false },
        { id: createId('ms'), title: 'Complete 4 weekly reviews honestly', completed: false },
      ],
      notes: 'Keep phone outside arm’s reach after 10:15 PM.',
      linkedTaskTitles: ['Fajr Prayer & Mindful Stillness', 'Morning Wake-Up & Personal Care'],
    },
    {
      id: createId('goal'),
      area: 'Academic and technical development',
      title: 'Master Semester Core + 45 Hours of Coding',
      description: 'Stay ahead on university coursework, solve 60 math problems, and log 90 minutes of daily programming.',
      deadline: endDate,
      status: 'in_progress',
      milestones: [
        { id: createId('ms'), title: 'Organize all semester lecture notes cleanly', completed: true },
        { id: createId('ms'), title: 'Solve 30 Calculus / Linear Algebra exercises', completed: false },
        { id: createId('ms'), title: 'Push 25 daily coding commits', completed: false },
      ],
      notes: 'Deep focus blocks only: close social tabs before starting Mathematics or Programming.',
      linkedTaskTitles: ['Programming Practice & Data Structures', 'Mathematics Deep Problem Solving'],
    },
    {
      id: createId('goal'),
      area: 'Communication and personality',
      title: 'Confident & Articulate English Communication',
      description: 'Build clear, structured spoken and written English through daily 30-minute deliberate practice.',
      deadline: endDate,
      status: 'in_progress',
      milestones: [
        { id: createId('ms'), title: 'Record 15 structured 3-minute speaking drills', completed: false },
        { id: createId('ms'), title: 'Read 2 non-fiction chapters per week aloud', completed: false },
      ],
      notes: 'Focus on slowing down speech pace and eliminating filler words.',
      linkedTaskTitles: ['English Communication & Speaking Practice'],
    },
    {
      id: createId('goal'),
      area: 'Entrepreneurship and innovation',
      title: 'Ship One Functional Digital Product Prototype',
      description: 'Identify a concrete campus/student pain point, validate with 5 peers, and ship an MVP.',
      deadline: endDate,
      status: 'in_progress',
      milestones: [
        { id: createId('ms'), title: 'Document 3 real student workflow problems', completed: true },
        { id: createId('ms'), title: 'Build clickable MVP and test with 5 peers', completed: false },
      ],
      notes: 'Treat evening entrepreneurship blocks like client deadlines.',
      linkedTaskTitles: ['Personal Project & Entrepreneurship Lab'],
    },
  ];
}

export function createStarterProjects(startDate: string): Project[] {
  return [
    {
      id: createId('proj'),
      title: 'Full-Stack Student Focus & Flashcard Engine',
      type: 'technical',
      description: 'A spaced-repetition web app built with React and TypeScript to retain university CS & Math definitions.',
      status: 'active',
      deadline: addDaysToDateStr(startDate, 21),
      tasks: [
        { id: createId('pt'), title: 'Design deck & card TypeScript interfaces', completed: true },
        { id: createId('pt'), title: 'Implement SM-2 spaced repetition algorithm', completed: true },
        { id: createId('pt'), title: 'Build keyboard-first review mode', completed: false },
        { id: createId('pt'), title: 'Deploy live demo & write README', completed: false },
      ],
      notes: 'Work on this during the 17:45 Programming block on alternate days.',
      link: 'https://github.com',
    },
    {
      id: createId('proj'),
      title: '30-Day Discipline & Systems Journal',
      type: 'creative',
      description: 'Write four concise weekly essays documenting lessons from rebuilding daily academic and physical habits.',
      status: 'active',
      deadline: addDaysToDateStr(startDate, 29),
      tasks: [
        { id: createId('pt'), title: 'Draft Week 1: Designing Friction Against Distraction', completed: true },
        { id: createId('pt'), title: 'Draft Week 2: Energy Management vs Time Management', completed: false },
        { id: createId('pt'), title: 'Compile final 30-day reflection essay', completed: false },
      ],
      notes: 'Draft during Sunday creative blocks to sharpen English expression.',
    },
  ];
}

export function createStarterWeeklyReviews(startDate: string): WeeklyReview[] {
  const weeks: WeeklyReview[] = [];
  for (let w = 1; w <= 5; w++) {
    const offset = (w - 1) * 7;
    const endOffset = Math.min(29, offset + 6);
    weeks.push({
      weekNumber: w,
      startDate: addDaysToDateStr(startDate, offset),
      endDate: addDaysToDateStr(startDate, endOffset),
      accomplished: '',
      failedToComplete: '',
      distractions: '',
      improved: '',
      needsImprovement: '',
      nextWeekPriorities: ['', '', ''],
    });
  }
  return weeks;
}

export function createInitialAppState(options?: {
  startDate?: string;
  wakeTime?: string;
  sleepTime?: string;
  name?: string;
  fixedCommitments?: UserProfile['fixedCommitments'];
  primaryGoalAreas?: LifeArea[];
  onboardingCompleted?: boolean;
  customNormalTemplate?: TemplateTask[];
}): AppState {
  const now = getKarachiNow();
  // Default startDate 2 days before today so user immediately sees Day 3 of 30 with realistic history + active today!
  const defaultStart = options?.startDate ?? addDaysToDateStr(now.dateStr, -2);
  const templates: RoutineTemplates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  if (options?.customNormalTemplate && options.customNormalTemplate.length > 0) {
    templates.normal = options.customNormalTemplate;
  }

  // Adjust wake/sleep times in templates if custom provided
  if (options?.wakeTime) {
    Object.values(templates).forEach((tpl) => {
      if (tpl[0]) tpl[0].startTime = options.wakeTime!;
    });
  }
  if (options?.sleepTime) {
    Object.values(templates).forEach((tpl) => {
      const last = tpl[tpl.length - 1];
      if (last && last.title.toLowerCase().includes('sleep')) {
        last.startTime = options.sleepTime!;
      }
    });
  }

  const fixedCommitments = options?.fixedCommitments ?? [];
  const days = build30DaysSchedule(defaultStart, templates, fixedCommitments);

  // Seed realistic completion history ONLY for days strictly before today in default starter mode
  Object.values(days).forEach((day) => {
    if (day.date < now.dateStr) {
      day.tasks = day.tasks.map((task, idx) => {
        // Complete ~75% of tasks on historical days so analytics and trends are immediately meaningful
        const status = idx % 5 === 4 ? 'missed' : 'completed';
        return { ...task, status };
      });
    } else if (day.date === now.dateStr) {
      // On today, mark early morning tasks already past current Karachi time as completed if early, else leave pending
      day.tasks = day.tasks.map((task) => {
        if (task.endTime <= '08:00' && now.timeStr > '08:00') {
          return { ...task, status: 'completed' };
        }
        return task;
      });
    }
  });

  return {
    version: 1,
    profile: {
      name: options?.name?.trim() || 'Student Builder',
      startDate: defaultStart,
      wakeTime: options?.wakeTime || '05:30',
      sleepTime: options?.sleepTime || '22:30',
      fixedCommitments,
      primaryGoalAreas: options?.primaryGoalAreas ?? [...LIFE_AREAS],
      prayerTimes: { ...DEFAULT_PRAYER_TIMES },
      schedulingPreferences: { ...DEFAULT_SCHEDULING_PREFERENCES },
      onboardingCompleted: options?.onboardingCompleted ?? false,
    },
    days,
    templates,
    habits: createStarterHabits(now.dateStr),
    goals: createStarterGoals(defaultStart),
    projects: createStarterProjects(defaultStart),
    weeklyReviews: createStarterWeeklyReviews(defaultStart),
    coachConversations: [],
  };
}
