import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import {
  ALL_CATEGORIES,
  build30DaysSchedule,
  createId,
  createInitialAppState,
  createPersonalizedAppState,
  instantiateTasksFromTemplate,
  LIFE_AREAS,
} from '../data/starterData';
import {
  AppState,
  BasicScheduleConfig,
  FixedCommitment,
  Goal,
  GoalTimeTarget,
  Habit,
  LifeArea,
  OnboardingDraft,
  PersonalActivityInput,
  PreferredTimeOfDay,
  TaskCategory,
  TaskPriority,
  TemplateTask,
  WeeklyTimetable,
} from '../types';
import { getDayOfWeekFromDateStr, getKarachiNow, minutesToTime, sortTasksChronologically, timeToMinutes } from '../utils/dateUtils';
import { TimetableEditor } from './TimetableEditor';

interface OnboardingWizardProps {
  initialState?: AppState;
  mode?: 'onboarding' | 'builder';
  onSaveDraft?: (draft: OnboardingDraft) => void;
  onComplete: (result: { state: AppState }) => void;
  onSkip: () => void;
  onClose?: () => void;
}

const WEEKDAYS = [
  { idx: 1, label: 'Mon' },
  { idx: 2, label: 'Tue' },
  { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' },
  { idx: 5, label: 'Fri' },
  { idx: 6, label: 'Sat' },
  { idx: 0, label: 'Sun' },
];

const TIME_OF_DAY_OPTIONS: Array<{ id: PreferredTimeOfDay; label: string; defaultStartMin: number }> = [
  { id: 'early_morning', label: 'Early Morning (5–8 AM)', defaultStartMin: 360 },
  { id: 'morning', label: 'Morning (8 AM–12 PM)', defaultStartMin: 540 },
  { id: 'afternoon', label: 'Afternoon (12–5 PM)', defaultStartMin: 840 },
  { id: 'evening', label: 'Evening (5–9 PM)', defaultStartMin: 1080 },
  { id: 'night', label: 'Night (9 PM+)', defaultStartMin: 1260 },
  { id: 'flexible', label: 'Flexible / Any Open Slot', defaultStartMin: 600 },
];

const SUGGESTED_ACTIVITIES: Array<{
  name: string;
  category: TaskCategory;
  duration: number;
  priority: TaskPriority;
  timeOfDay: PreferredTimeOfDay;
}> = [
  { name: 'Exercise & Fitness', category: 'Exercise', duration: 45, priority: 'High', timeOfDay: 'evening' },
  { name: 'Programming & Projects', category: 'Programming', duration: 90, priority: 'High', timeOfDay: 'evening' },
  { name: 'Academic Study & Revision', category: 'University', duration: 90, priority: 'High', timeOfDay: 'afternoon' },
  { name: 'Business Development', category: 'Entrepreneurship', duration: 60, priority: 'High', timeOfDay: 'evening' },
  { name: 'English Communication', category: 'English communication', duration: 30, priority: 'Medium', timeOfDay: 'afternoon' },
  { name: 'Deep Reading', category: 'Creative projects', duration: 30, priority: 'Medium', timeOfDay: 'night' },
  { name: 'Skill Learning', category: 'Programming', duration: 60, priority: 'Medium', timeOfDay: 'flexible' },
  { name: 'Hobbies & Creative Rest', category: 'Rest and entertainment', duration: 45, priority: 'Low', timeOfDay: 'night' },
  { name: 'Mindfulness & Reflection', category: 'Prayer and spirituality', duration: 20, priority: 'Medium', timeOfDay: 'early_morning' },
];

function createEmptyWeeklyTimetable(): WeeklyTimetable {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function generateInitialWeeklyTimetable(
  basic: BasicScheduleConfig,
  commitments: FixedCommitment[],
  activities: PersonalActivityInput[]
): WeeklyTimetable {
  const tt = createEmptyWeeklyTimetable();
  const wakeMin = timeToMinutes(basic.wakeTime || '07:00');
  const bedMin = timeToMinutes(basic.bedTime || '23:00');
  const effectiveBedMin = bedMin <= wakeMin ? 1410 : bedMin;
  const breakDur = Math.max(0, basic.breakDurationMinutes || 15);

  for (let dow = 0; dow <= 6; dow++) {
    const blocks: TemplateTask[] = [];
    const occupied: Array<[number, number]> = [];

    // 1. Anchor fixed recurring commitments on this weekday
    for (const c of commitments) {
      if (c.recurrence === 'one_time') continue;
      if (!c.daysOfWeek.includes(dow)) continue;
      const s = timeToMinutes(c.startTime);
      const e = timeToMinutes(c.endTime) <= s ? s + 60 : timeToMinutes(c.endTime);
      occupied.push([s, e]);
      blocks.push({
        templateKey: `fc_${c.id}`,
        title: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
        category: c.category,
        priority: 'Critical',
        description: [c.description, c.location ? `Location: ${c.location}` : '']
          .filter(Boolean)
          .join(' · ') || 'Fixed responsibility',
        isFixedCommitment: true,
      });
    }

    // 2. Place user-chosen activities into non-overlapping open slots on active days
    const isDayActive =
      basic.activeDaysOfWeek.length === 0 || basic.activeDaysOfWeek.includes(dow);

    if (isDayActive) {
      for (const act of activities) {
        // Respect weeklyFrequency (spread across week deterministically)
        const activeList =
          basic.activeDaysOfWeek.length > 0
            ? basic.activeDaysOfWeek
            : [1, 2, 3, 4, 5, 6, 0];
        const pos = activeList.indexOf(dow);
        if (pos >= 0 && pos >= act.weeklyFrequency) continue;

        const prefOpt = TIME_OF_DAY_OPTIONS.find((o) => o.id === act.preferredTimeOfDay);
        let candidateStart = Math.max(wakeMin, prefOpt?.defaultStartMin ?? wakeMin + 60);
        const dur = Math.max(15, act.preferredDurationMinutes || 45);

        let placed = false;
        for (let step = 0; step < 30; step++) {
          const end = candidateStart + dur;
          if (end > effectiveBedMin) break;
          const overlaps = occupied.some(
            ([os, oe]) => candidateStart < oe + breakDur && end + breakDur > os
          );
          if (!overlaps) {
            occupied.push([candidateStart, end]);
            blocks.push({
              templateKey: `act_${act.id}`,
              title: act.name,
              startTime: minutesToTime(candidateStart),
              endTime: minutesToTime(end),
              category: act.category,
              priority: act.priority,
              description: act.description || 'Personalized activity block.',
            });
            placed = true;
            break;
          }
          candidateStart += 30;
        }
        if (!placed && candidateStart + dur > effectiveBedMin) {
          // Try earlier in day starting after wakeTime
          let fallbackStart = wakeMin;
          while (fallbackStart + dur <= effectiveBedMin) {
            const end = fallbackStart + dur;
            const overlaps = occupied.some(
              ([os, oe]) => fallbackStart < oe + breakDur && end + breakDur > os
            );
            if (!overlaps) {
              occupied.push([fallbackStart, end]);
              blocks.push({
                templateKey: `act_${act.id}`,
                title: act.name,
                startTime: minutesToTime(fallbackStart),
                endTime: minutesToTime(end),
                category: act.category,
                priority: act.priority,
                description: act.description || 'Personalized activity block.',
              });
              break;
            }
            fallbackStart += 30;
          }
        }
      }
    }

    tt[dow] = blocks.sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
  }

  return tt;
}

export function OnboardingWizard({
  initialState,
  mode = 'onboarding',
  onSaveDraft,
  onComplete,
  onSkip,
  onClose,
}: OnboardingWizardProps) {
  const now = getKarachiNow();
  const draft = initialState?.profile.onboardingDraft;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(
    mode === 'builder' ? 5 : draft?.currentStep || 1
  );

  const [name, setName] = useState(
    draft?.name || initialState?.profile.name || ''
  );
  const [startDate, setStartDate] = useState(
    draft?.startDate || initialState?.profile.startDate || now.dateStr
  );

  const [basicSchedule, setBasicSchedule] = useState<BasicScheduleConfig>(() =>
    draft?.basicSchedule ||
    initialState?.profile.basicSchedule || {
      wakeTime: initialState?.profile.wakeTime || '07:00',
      bedTime: initialState?.profile.sleepTime || '23:00',
      preferredSleepHours: 8,
      activeDaysOfWeek: [1, 2, 3, 4, 5, 6],
      preferredWorkStart: '09:00',
      preferredWorkEnd: '18:00',
      breakDurationMinutes: 15,
      breakFrequencyMinutes: 90,
      maxDailyFocusHours: 8,
    }
  );

  const [commitments, setCommitments] = useState<FixedCommitment[]>(
    () => draft?.commitments || initialState?.profile.fixedCommitments || []
  );

  // Add commitment form
  const [cTitle, setCTitle] = useState('');
  const [cCategory, setCCategory] = useState<TaskCategory>('University');
  const [cStart, setCStart] = useState('09:00');
  const [cEnd, setCEnd] = useState('12:00');
  const [cDays, setCDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [cRecurrence, setCRecurrence] = useState<'recurring' | 'one_time'>('recurring');
  const [cOneTimeDate, setCOneTimeDate] = useState(now.dateStr);
  const [cLocation, setCLocation] = useState('');
  const [cDesc, setCDesc] = useState('');

  const [activities, setActivities] = useState<PersonalActivityInput[]>(
    () => draft?.activities || initialState?.profile.personalActivities || []
  );

  // Custom activity form
  const [aName, setAName] = useState('');
  const [aCategory, setACategory] = useState<TaskCategory>('Programming');
  const [aDuration, setADuration] = useState(60);
  const [aPriority, setAPriority] = useState<TaskPriority>('High');
  const [aTimeOfDay, setATimeOfDay] = useState<PreferredTimeOfDay>('evening');
  const [aFreq, setAFreq] = useState(5);

  const [goalTargets, setGoalTargets] = useState<GoalTimeTarget[]>(
    () => draft?.goalTargets || initialState?.profile.goalTargets || []
  );
  const [gTitle, setGTitle] = useState('');
  const [gArea, setGArea] = useState<LifeArea>(LIFE_AREAS[2]);
  const [gHours, setGHours] = useState(8);
  const [gNotes, setGNotes] = useState('');

  const [weeklyTimetable, setWeeklyTimetable] = useState<WeeklyTimetable>(() => {
    if (draft?.weeklyTimetable) return draft.weeklyTimetable;
    if (initialState?.profile.weeklyTimetable) return initialState.profile.weeklyTimetable;
    if (mode === 'builder' && initialState) {
      return {
        0: initialState.templates.weekend || [],
        1: initialState.templates.university || initialState.templates.normal || [],
        2: initialState.templates.university || initialState.templates.normal || [],
        3: initialState.templates.university || initialState.templates.normal || [],
        4: initialState.templates.university || initialState.templates.normal || [],
        5: initialState.templates.normal || [],
        6: initialState.templates.weekend || [],
      };
    }
    return createEmptyWeeklyTimetable();
  });

  const [draftSavedNotice, setDraftSavedNotice] = useState('');

  const totalWeeklyPlannedHours = useMemo(() => {
    let mins = 0;
    for (let d = 0; d <= 6; d++) {
      for (const b of weeklyTimetable[d] || []) {
        if (b.isBreak) continue;
        const s = timeToMinutes(b.startTime);
        const e = timeToMinutes(b.endTime) <= s ? 1440 : timeToMinutes(b.endTime);
        mins += Math.max(0, e - s);
      }
    }
    return Number((mins / 60).toFixed(1));
  }, [weeklyTimetable]);

  const goToStep = (targetStep: 1 | 2 | 3 | 4 | 5) => {
    if (targetStep === 5 && mode === 'onboarding') {
      const hasAnyBlock = Object.values(weeklyTimetable).some((list) => list.length > 0);
      if (!hasAnyBlock && (commitments.length > 0 || activities.length > 0)) {
        setWeeklyTimetable(
          generateInitialWeeklyTimetable(basicSchedule, commitments, activities)
        );
      }
    }
    setStep(targetStep);
  };

  const addCommitment = () => {
    if (!cTitle.trim()) return;
    setCommitments((prev) => [
      ...prev,
      {
        id: createId('fc'),
        title: cTitle.trim(),
        category: cCategory,
        startTime: cStart,
        endTime: cEnd,
        daysOfWeek: cRecurrence === 'one_time' ? [] : cDays.length > 0 ? cDays : [1, 2, 3, 4, 5],
        recurrence: cRecurrence,
        oneTimeDate: cRecurrence === 'one_time' ? cOneTimeDate : undefined,
        location: cLocation.trim() || undefined,
        description: cDesc.trim() || undefined,
      },
    ]);
    setCTitle('');
    setCLocation('');
    setCDesc('');
  };

  const toggleSuggestedActivity = (item: (typeof SUGGESTED_ACTIVITIES)[number]) => {
    const exists = activities.some(
      (a) => a.name.toLowerCase() === item.name.toLowerCase()
    );
    if (exists) {
      setActivities((prev) =>
        prev.filter((a) => a.name.toLowerCase() !== item.name.toLowerCase())
      );
    } else {
      setActivities((prev) => [
        ...prev,
        {
          id: createId('act'),
          name: item.name,
          category: item.category,
          preferredDurationMinutes: item.duration,
          priority: item.priority,
          preferredTimeOfDay: item.timeOfDay,
          weeklyFrequency: Math.min(7, Math.max(1, basicSchedule.activeDaysOfWeek.length || 5)),
        },
      ]);
    }
  };

  const addCustomActivity = () => {
    if (!aName.trim()) return;
    setActivities((prev) => [
      ...prev,
      {
        id: createId('act'),
        name: aName.trim(),
        category: aCategory,
        preferredDurationMinutes: aDuration,
        priority: aPriority,
        preferredTimeOfDay: aTimeOfDay,
        weeklyFrequency: aFreq,
      },
    ]);
    setAName('');
  };

  const addGoalTarget = () => {
    if (!gTitle.trim()) return;
    setGoalTargets((prev) => [
      ...prev,
      {
        id: createId('gt'),
        title: gTitle.trim(),
        area: gArea,
        targetHoursPerWeek: gHours,
        notes: gNotes.trim() || undefined,
      },
    ]);
    setGTitle('');
    setGNotes('');
  };

  const handleSaveProgressLater = () => {
    if (!onSaveDraft) return;
    onSaveDraft({
      currentStep: step,
      name: name.trim() || 'Builder',
      startDate,
      basicSchedule,
      commitments,
      activities,
      goalTargets,
      weeklyTimetable,
      updatedAt: new Date().toISOString(),
    });
    setDraftSavedNotice('Setup progress saved. You can resume anytime from the dashboard banner.');
  };

  const handleFinish = () => {
    if (mode === 'builder' && initialState) {
      // Preserve existing user history, completed tasks, habits, goals, projects, notifications
      const updatedDays = { ...initialState.days };
      for (const [dStr, day] of Object.entries(updatedDays)) {
        if (dStr >= now.dateStr) {
          const dow = getDayOfWeekFromDateStr(dStr);
          const dayTpl = weeklyTimetable[dow] || [];
          const fresh = instantiateTasksFromTemplate(dayTpl, dStr, commitments);
          const completedBySig = new Set(
            day.tasks
              .filter((t) => t.status === 'completed')
              .map((t) => `${t.title.trim().toLowerCase()}::${t.startTime}`)
          );
          updatedDays[dStr] = {
            ...day,
            tasks: sortTasksChronologically(
              fresh.map((t) =>
                completedBySig.has(`${t.title.trim().toLowerCase()}::${t.startTime}`)
                  ? { ...t, status: 'completed' }
                  : t
              )
            ),
          };
        }
      }

      const updatedState: AppState = {
        ...initialState,
        profile: {
          ...initialState.profile,
          name: name.trim() || initialState.profile.name,
          wakeTime: basicSchedule.wakeTime,
          sleepTime: basicSchedule.bedTime,
          fixedCommitments: commitments,
          basicSchedule,
          personalActivities: activities,
          goalTargets,
          weeklyTimetable,
          onboardingCompleted: true,
          onboardingSkipped: false,
          onboardingDraft: undefined,
        },
        templates: {
          ...initialState.templates,
          normal: weeklyTimetable[5] || weeklyTimetable[1] || initialState.templates.normal,
          university: weeklyTimetable[1] || initialState.templates.university,
          weekend: weeklyTimetable[6] || weeklyTimetable[0] || initialState.templates.weekend,
        },
        days: updatedDays,
      };
      onComplete({ state: updatedState });
      return;
    }

    // First-time onboarding completion: build truly personalized plan without forcing defaults
    const habits: Habit[] = activities.slice(0, 8).map((act) => ({
      id: createId('habit'),
      title: act.name,
      category: act.category,
      frequency: act.weeklyFrequency >= 7 ? 'daily' : 'custom',
      customDays:
        act.weeklyFrequency >= 7
          ? undefined
          : (basicSchedule.activeDaysOfWeek.length > 0
              ? basicSchedule.activeDaysOfWeek
              : [1, 2, 3, 4, 5]
            ).slice(0, act.weeklyFrequency),
      targetPerWeek: act.weeklyFrequency,
      logs: {},
      createdAt: startDate,
    }));

    const goals: Goal[] = goalTargets.map((gt) => ({
      id: createId('goal'),
      area: gt.area,
      title: gt.title,
      description: gt.notes || `Weekly target: ${gt.targetHoursPerWeek}h/week`,
      deadline: gt.deadline || build30DayEndDate(startDate),
      status: 'in_progress',
      milestones: [
        { id: createId('ms'), title: `Complete Week 1 target (${gt.targetHoursPerWeek}h)`, completed: false },
        { id: createId('ms'), title: `Complete Week 2 consistency check`, completed: false },
      ],
      notes: gt.notes || '',
      linkedTaskTitles: [],
    }));

    const personalized = createPersonalizedAppState({
      name: name.trim() || 'Builder',
      startDate,
      basicSchedule,
      fixedCommitments: commitments,
      personalActivities: activities,
      goalTargets,
      weeklyTimetable,
      habits,
      goals,
    });

    onComplete({ state: personalized });
  };

  return (
    <div className="min-h-screen bg-app text-main flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-card border border-subtle rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden">
        {/* Hero Header */}
        <div className="px-6 sm:px-8 py-6 border-b border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gold tracking-wide uppercase">
              {mode === 'builder' ? 'Weekly Timetable Builder' : 'Project Rebuild Me · Personalization'}
            </p>
            <h1 className="text-2xl font-semibold text-main mt-1">
              {mode === 'builder' ? 'Customize Your Weekly Timetable' : 'Build Your Own Routine'}
            </h1>
            <p className="text-sm text-muted mt-1">
              Your life is different. Your timetable should be too.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {mode === 'onboarding' && onSaveDraft && (
              <button
                type="button"
                onClick={handleSaveProgressLater}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-xl transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5 text-gold" />
                Save &amp; Finish Later
              </button>
            )}
            {mode === 'onboarding' ? (
              <button
                type="button"
                onClick={onSkip}
                className="px-3.5 py-2 text-xs font-medium text-muted hover:text-main bg-surface border border-subtle rounded-xl transition-colors whitespace-nowrap"
              >
                Skip Setup
              </button>
            ) : (
              onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-muted hover:text-main bg-surface border border-subtle rounded-xl"
                  aria-label="Close timetable builder"
                >
                  <X className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        </div>

        {/* 5-Step Progress Indicator */}
        <div className="px-6 sm:px-8 py-3 bg-surface border-b border-subtle flex items-center gap-5 text-xs overflow-x-auto">
          {[
            { num: 1, label: '1. Basic Schedule' },
            { num: 2, label: '2. Fixed Commitments' },
            { num: 3, label: '3. Personal Activities' },
            { num: 4, label: '4. Goals & Targets' },
            { num: 5, label: '5. Timetable Builder' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              onClick={() => goToStep(item.num as 1 | 2 | 3 | 4 | 5)}
              className={`font-medium transition-colors whitespace-nowrap ${
                step === item.num
                  ? 'text-gold font-semibold'
                  : step > item.num
                  ? 'text-slate-accent'
                  : 'text-muted hover:text-main'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {draftSavedNotice && (
          <div className="mx-6 sm:mx-8 mt-4 p-3 rounded-xl bg-slate-soft border border-slate-border text-xs text-slate-accent">
            {draftSavedNotice}
          </div>
        )}

        <div className="p-6 sm:p-8 max-h-[66vh] overflow-y-auto space-y-6">
          {/* STEP 1: BASIC SCHEDULE */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Your Name or Handle
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Bilal, Sara, Alex"
                    className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main focus:outline-none focus:border-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Wake-up Time
                  </label>
                  <input
                    type="time"
                    value={basicSchedule.wakeTime}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({ ...p, wakeTime: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Bedtime
                  </label>
                  <input
                    type="time"
                    value={basicSchedule.bedTime}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({ ...p, bedTime: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Preferred Sleep (hours)
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={12}
                    step={0.5}
                    value={basicSchedule.preferredSleepHours}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({
                        ...p,
                        preferredSleepHours: Number(e.target.value) || 8,
                      }))
                    }
                    className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-2">
                  Active Days of the Week
                </label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((wd) => {
                    const active = basicSchedule.activeDaysOfWeek.includes(wd.idx);
                    return (
                      <button
                        key={wd.idx}
                        type="button"
                        onClick={() =>
                          setBasicSchedule((p) => ({
                            ...p,
                            activeDaysOfWeek: p.activeDaysOfWeek.includes(wd.idx)
                              ? p.activeDaysOfWeek.filter((d) => d !== wd.idx)
                              : [...p.activeDaysOfWeek, wd.idx],
                          }))
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          active
                            ? 'bg-gold-soft border-gold-border text-gold'
                            : 'bg-surface border-subtle text-muted hover:text-main'
                        }`}
                      >
                        {wd.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Preferred Work/Study Start
                  </label>
                  <input
                    type="time"
                    value={basicSchedule.preferredWorkStart || '09:00'}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({ ...p, preferredWorkStart: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Preferred Work/Study End
                  </label>
                  <input
                    type="time"
                    value={basicSchedule.preferredWorkEnd || '18:00'}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({ ...p, preferredWorkEnd: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Break Length (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={basicSchedule.breakDurationMinutes}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({
                        ...p,
                        breakDurationMinutes: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Max Focus Hours / Day
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={basicSchedule.maxDailyFocusHours}
                    onChange={(e) =>
                      setBasicSchedule((p) => ({
                        ...p,
                        maxDailyFocusHours: Math.max(1, Number(e.target.value) || 8),
                      }))
                    }
                    className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: FIXED COMMITMENTS */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-main">
                  Add Fixed Commitments
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  University lectures, school, job shifts, business meetings, prayer times, or family duties. Leave blank if you have no fixed blocks.
                </p>
              </div>

              {commitments.length > 0 && (
                <div className="space-y-2">
                  {commitments.map((fc) => (
                    <div
                      key={fc.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-surface border border-subtle rounded-xl"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-main truncate">
                          {fc.title}
                        </p>
                        <p className="text-xs text-muted font-mono tabular-nums">
                          {fc.startTime}–{fc.endTime} · {fc.category} ·{' '}
                          {fc.recurrence === 'one_time'
                            ? `One-time (${fc.oneTimeDate})`
                            : `${fc.daysOfWeek.length} day(s)/wk`}
                          {fc.location ? ` · ${fc.location}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCommitments((prev) => prev.filter((item) => item.id !== fc.id))
                        }
                        className="p-1.5 text-muted hover:text-rose-muted"
                        aria-label="Remove commitment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 bg-surface border border-subtle rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={cTitle}
                    onChange={(e) => setCTitle(e.target.value)}
                    placeholder="Activity name (e.g., Software Engineering Class, Shift, Zuhr)"
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main placeholder:text-muted/70"
                  />
                  <select
                    value={cCategory}
                    onChange={(e) => setCCategory(e.target.value as TaskCategory)}
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={cLocation}
                    onChange={(e) => setCLocation(e.target.value)}
                    placeholder="Location (Optional, e.g., Room 302 or Remote)"
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main placeholder:text-muted/70"
                  />
                  <input
                    type="text"
                    value={cDesc}
                    onChange={(e) => setCDesc(e.target.value)}
                    placeholder="Description / notes (Optional)"
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main placeholder:text-muted/70"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="time"
                    value={cStart}
                    onChange={(e) => setCStart(e.target.value)}
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                  />
                  <span className="text-xs text-muted">to</span>
                  <input
                    type="time"
                    value={cEnd}
                    onChange={(e) => setCEnd(e.target.value)}
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                  />

                  <select
                    value={cRecurrence}
                    onChange={(e) =>
                      setCRecurrence(e.target.value as 'recurring' | 'one_time')
                    }
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  >
                    <option value="recurring">Recurring Weekly</option>
                    <option value="one_time">One-Time Date</option>
                  </select>

                  {cRecurrence === 'one_time' ? (
                    <input
                      type="date"
                      value={cOneTimeDate}
                      onChange={(e) => setCOneTimeDate(e.target.value)}
                      className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs font-mono tabular-nums text-main"
                    />
                  ) : (
                    <div className="flex items-center gap-1 flex-wrap">
                      {WEEKDAYS.map((wd) => {
                        const active = cDays.includes(wd.idx);
                        return (
                          <button
                            key={wd.idx}
                            type="button"
                            onClick={() =>
                              setCDays((prev) =>
                                prev.includes(wd.idx)
                                  ? prev.filter((d) => d !== wd.idx)
                                  : [...prev, wd.idx]
                              )
                            }
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                              active
                                ? 'bg-gold-soft border-gold-border text-gold'
                                : 'bg-card border-subtle text-muted hover:text-main'
                            }`}
                          >
                            {wd.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addCommitment}
                    className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Commitment
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PERSONAL ACTIVITIES */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-main">
                  Select or Create Your Personal Activities
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Pick the habits, study sessions, fitness, business, or creative blocks you actually want in your life.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SUGGESTED_ACTIVITIES.map((item) => {
                  const selected = activities.some(
                    (a) => a.name.toLowerCase() === item.name.toLowerCase()
                  );
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => toggleSuggestedActivity(item)}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left text-xs transition-colors ${
                        selected
                          ? 'bg-gold-soft border-gold-border text-gold font-medium'
                          : 'bg-surface border-subtle text-main hover:border-gold-border'
                      }`}
                    >
                      <span className="truncate">{item.name}</span>
                      {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {activities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-main">
                    Selected Activities ({activities.length})
                  </p>
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-surface border border-subtle rounded-xl text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-main truncate">{act.name}</p>
                        <p className="text-muted mt-0.5">
                          {act.category} · {act.preferredDurationMinutes}m · {act.priority} ·{' '}
                          {act.weeklyFrequency}x/week · {act.preferredTimeOfDay.replace('_', ' ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setActivities((prev) => prev.filter((x) => x.id !== act.id))
                        }
                        className="p-1.5 text-muted hover:text-rose-muted"
                        aria-label="Remove activity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom Activity Creator */}
              <div className="p-4 bg-surface border border-subtle rounded-xl space-y-3">
                <p className="text-xs font-semibold text-main">Create Custom Activity</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={aName}
                    onChange={(e) => setAName(e.target.value)}
                    placeholder="Custom activity name"
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  />
                  <select
                    value={aCategory}
                    onChange={(e) => setACategory(e.target.value as TaskCategory)}
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={aTimeOfDay}
                    onChange={(e) =>
                      setATimeOfDay(e.target.value as PreferredTimeOfDay)
                    }
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  >
                    {TIME_OF_DAY_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-muted flex items-center gap-1.5">
                    Duration (m):
                    <input
                      type="number"
                      min={10}
                      max={240}
                      value={aDuration}
                      onChange={(e) => setADuration(Number(e.target.value) || 45)}
                      className="w-16 px-2 py-1.5 bg-card border border-subtle rounded-lg text-xs font-mono text-main"
                    />
                  </label>
                  <label className="text-xs text-muted flex items-center gap-1.5">
                    Days/wk:
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={aFreq}
                      onChange={(e) => setAFreq(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-14 px-2 py-1.5 bg-card border border-subtle rounded-lg text-xs font-mono text-main"
                    />
                  </label>
                  <select
                    value={aPriority}
                    onChange={(e) => setAPriority(e.target.value as TaskPriority)}
                    className="px-2.5 py-1.5 bg-card border border-subtle rounded-lg text-xs text-main"
                  >
                    {(['Critical', 'High', 'Medium', 'Low'] as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {p} Priority
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addCustomActivity}
                    className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Custom Activity
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: GOALS & WEEKLY TIME TARGETS */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-main">
                  Personal Goals &amp; Weekly Time Targets
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Define goals you want to track and how many hours per week you aim to dedicate to each.
                </p>
              </div>

              {goalTargets.length > 0 && (
                <div className="space-y-2">
                  {goalTargets.map((gt) => (
                    <div
                      key={gt.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-surface border border-subtle rounded-xl text-xs"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-main truncate">{gt.title}</p>
                        <p className="text-muted">
                          {gt.area} · Target: {gt.targetHoursPerWeek}h/week
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setGoalTargets((prev) => prev.filter((x) => x.id !== gt.id))
                        }
                        className="p-1.5 text-muted hover:text-rose-muted"
                        aria-label="Remove goal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 bg-surface border border-subtle rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={gTitle}
                    onChange={(e) => setGTitle(e.target.value)}
                    placeholder="Goal title (e.g., Ship SaaS MVP, Pass Calculus, Run 5K)"
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  />
                  <select
                    value={gArea}
                    onChange={(e) => setGArea(e.target.value as LifeArea)}
                    className="px-3 py-2 bg-card border border-subtle rounded-lg text-xs text-main"
                  >
                    {LIFE_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-muted flex items-center gap-1.5">
                    Weekly target hours:
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={gHours}
                      onChange={(e) => setGHours(Math.max(1, Number(e.target.value) || 5))}
                      className="w-16 px-2.5 py-1.5 bg-card border border-subtle rounded-lg text-xs font-mono text-main"
                    />
                  </label>
                  <input
                    type="text"
                    value={gNotes}
                    onChange={(e) => setGNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="flex-1 min-w-[160px] px-3 py-1.5 bg-card border border-subtle rounded-lg text-xs text-main"
                  />
                  <button
                    type="button"
                    onClick={addGoalTarget}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Goal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: INTERACTIVE TIMETABLE BUILDER */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-main">
                    Interactive Weekly Timetable Builder
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Drag blocks to reorder, edit times, copy days, or optionally request an AI layout. Total weekly planned work: <strong className="text-gold">{totalWeeklyPlannedHours}h</strong>
                  </p>
                </div>
                {mode === 'onboarding' && (commitments.length > 0 || activities.length > 0) && (
                  <button
                    type="button"
                    onClick={() =>
                      setWeeklyTimetable(
                        generateInitialWeeklyTimetable(basicSchedule, commitments, activities)
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-gold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Rebuild from Steps 1–3
                  </button>
                )}
              </div>

              <TimetableEditor
                timetable={weeklyTimetable}
                onChange={setWeeklyTimetable}
                basicSchedule={basicSchedule}
                commitments={commitments}
                activities={activities}
                goalTargets={goalTargets}
              />
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 sm:px-8 py-4 bg-surface border-t border-subtle flex items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5)}
                className="px-4 py-2 text-sm font-medium text-main bg-card hover:border-gold-border border border-subtle rounded-xl transition-colors"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 5 ? (
              <button
                type="button"
                onClick={() => goToStep((step + 1) as 1 | 2 | 3 | 4 | 5)}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-xl transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-xl transition-colors"
              >
                {mode === 'builder' ? 'Save & Apply Timetable' : 'Save & Launch My Plan'}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function build30DayEndDate(startDate: string): string {
  const days = build30DaysSchedule(startDate, {
    normal: [],
    university: [],
    weekend: [],
    holiday: [],
    exam: [],
  });
  const sorted = Object.keys(days).sort();
  return sorted[sorted.length - 1] || startDate;
}

export { createInitialAppState };
