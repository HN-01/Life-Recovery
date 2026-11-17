import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AppState,
  CoachConversation,
  DayPlan,
  Goal,
  Habit,
  Project,
  PushSubscriptionRecord,
  SmartNotification,
  WeeklyReview,
} from '../types';
import {
  createInitialAppState,
  DEFAULT_PRAYER_TIMES,
  DEFAULT_SCHEDULING_PREFERENCES,
  DEFAULT_TEMPLATES,
  getDefaultNotificationPreferences,
} from '../data/starterData';
import { db, handleFirestoreError, OperationType } from './firebase';

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'item';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function ensureNonEmptyDate(val: unknown, fallback = '2026-11-15'): string {
  if (typeof val === 'string' && val.trim().length >= 8 && val.trim().length <= 20) {
    return val.trim();
  }
  return fallback;
}

function ensureTimeStr(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim().length >= 4 && val.trim().length <= 10) {
    return val.trim();
  }
  return fallback;
}

/**
 * Strip `undefined` keys deeply so Firestore setDoc never rejects optional undefined fields.
 */
function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return obj;
}

function buildProfileDoc(uid: string, profile: AppState['profile'], updatedAt: string) {
  return stripUndefined({
    uid,
    name: (profile.name || 'Student Builder').trim().slice(0, 120) || 'Student Builder',
    email: (profile.email || '').slice(0, 200),
    photoUrl: (profile.photoUrl || '').slice(0, 2000),
    startDate: ensureNonEmptyDate(profile.startDate),
    wakeTime: ensureTimeStr(profile.wakeTime, '05:30'),
    sleepTime: ensureTimeStr(profile.sleepTime, '22:30'),
    fixedCommitments: (profile.fixedCommitments || []).slice(0, 40),
    primaryGoalAreas: (profile.primaryGoalAreas || []).slice(0, 10),
    prayerTimes: profile.prayerTimes || { ...DEFAULT_PRAYER_TIMES },
    schedulingPreferences:
      profile.schedulingPreferences || { ...DEFAULT_SCHEDULING_PREFERENCES },
    dashboardPreferences: profile.dashboardPreferences,
    notificationPreferences:
      profile.notificationPreferences ||
      getDefaultNotificationPreferences(profile.wakeTime, profile.sleepTime),
    basicSchedule: profile.basicSchedule,
    personalActivities: profile.personalActivities
      ? profile.personalActivities.slice(0, 40)
      : undefined,
    goalTargets: profile.goalTargets ? profile.goalTargets.slice(0, 30) : undefined,
    weeklyTimetable: profile.weeklyTimetable,
    onboardingDraft: profile.onboardingDraft,
    onboardingSkipped: profile.onboardingSkipped,
    onboardingCompleted: Boolean(profile.onboardingCompleted),
    updatedAt,
  });
}

function buildDayDoc(uid: string, day: DayPlan, updatedAt: string) {
  return stripUndefined({
    uid,
    dayNumber: clampInt(day.dayNumber, 1, 60, 1),
    date: ensureNonEmptyDate(day.date),
    scheduleType: day.scheduleType,
    tasks: (day.tasks || []).slice(0, 100),
    dailyReview: day.dailyReview,
    focusSessions: day.focusSessions ? day.focusSessions.slice(-50) : undefined,
    updatedAt,
  });
}

function buildHabitDoc(uid: string, hid: string, habit: Habit, updatedAt: string) {
  return stripUndefined({
    uid,
    id: hid,
    title: (habit.title || 'Habit').trim().slice(0, 200) || 'Habit',
    category: (habit.category || 'Morning & Personal Care').slice(0, 80),
    frequency: habit.frequency || 'daily',
    customDays: habit.customDays ? habit.customDays.slice(0, 7) : undefined,
    targetPerWeek: clampInt(habit.targetPerWeek, 1, 7, 5),
    logs: habit.logs || {},
    createdAt: (habit.createdAt || updatedAt).slice(0, 40),
    updatedAt,
  });
}

function buildGoalDoc(uid: string, gid: string, goal: Goal, updatedAt: string) {
  return stripUndefined({
    uid,
    id: gid,
    area: (goal.area || 'Academic and technical development').slice(0, 120),
    title: (goal.title || 'Goal').trim().slice(0, 240) || 'Goal',
    description: (goal.description || '').slice(0, 2000),
    deadline: ensureNonEmptyDate(goal.deadline, '2026-12-31'),
    status: goal.status || 'in_progress',
    milestones: (goal.milestones || []).slice(0, 50),
    notes: (goal.notes || '').slice(0, 2000),
    linkedTaskTitles: (goal.linkedTaskTitles || []).slice(0, 30),
    updatedAt,
  });
}

function buildProjectDoc(uid: string, pid: string, project: Project, updatedAt: string) {
  return stripUndefined({
    uid,
    id: pid,
    title: (project.title || 'Project').trim().slice(0, 240) || 'Project',
    type: project.type || 'technical',
    description: (project.description || '').slice(0, 2000),
    status: project.status || 'active',
    deadline: ensureNonEmptyDate(project.deadline, '2026-12-31'),
    tasks: (project.tasks || []).slice(0, 100),
    notes: (project.notes || '').slice(0, 2000),
    link: project.link ? project.link.slice(0, 500) : undefined,
    updatedAt,
  });
}

function buildWeeklyReviewDoc(uid: string, review: WeeklyReview, updatedAt: string) {
  return stripUndefined({
    uid,
    weekNumber: clampInt(review.weekNumber, 1, 10, 1),
    startDate: ensureNonEmptyDate(review.startDate),
    endDate: ensureNonEmptyDate(review.endDate),
    accomplished: (review.accomplished || '').slice(0, 3000),
    failedToComplete: (review.failedToComplete || '').slice(0, 3000),
    distractions: (review.distractions || '').slice(0, 3000),
    improved: (review.improved || '').slice(0, 3000),
    needsImprovement: (review.needsImprovement || '').slice(0, 3000),
    nextWeekPriorities: (review.nextWeekPriorities || ['', '', '']).slice(0, 10),
    updatedAt,
  });
}

function buildCoachConversationDoc(
  uid: string,
  cid: string,
  conv: CoachConversation,
  updatedAt: string
) {
  return stripUndefined({
    uid,
    id: cid,
    title: (conv.title || 'Coach Session').trim().slice(0, 200) || 'Coach Session',
    messages: (conv.messages || []).slice(-200),
    createdAt: (conv.createdAt || updatedAt).slice(0, 40),
    updatedAt: (conv.updatedAt || updatedAt).slice(0, 40),
  });
}

function buildNotificationDoc(
  uid: string,
  nid: string,
  notif: SmartNotification,
  updatedAt: string
) {
  return stripUndefined({
    uid,
    id: nid,
    dedupeKey: (notif.dedupeKey || nid).slice(0, 240),
    type: notif.type,
    title: (notif.title || 'Notification').slice(0, 240),
    body: (notif.body || '').slice(0, 1000),
    createdAt: (notif.createdAt || updatedAt).slice(0, 40),
    scheduledFor: notif.scheduledFor ? notif.scheduledFor.slice(0, 40) : undefined,
    dateStr: ensureNonEmptyDate(notif.dateStr),
    taskId: notif.taskId ? notif.taskId.slice(0, 128) : undefined,
    taskTitle: notif.taskTitle ? notif.taskTitle.slice(0, 240) : undefined,
    taskStartTime: notif.taskStartTime ? notif.taskStartTime.slice(0, 16) : undefined,
    taskEndTime: notif.taskEndTime ? notif.taskEndTime.slice(0, 16) : undefined,
    goalId: notif.goalId ? notif.goalId.slice(0, 128) : undefined,
    read: Boolean(notif.read),
    dismissed: notif.dismissed !== undefined ? Boolean(notif.dismissed) : undefined,
    snoozedUntil: notif.snoozedUntil ? notif.snoozedUntil.slice(0, 40) : undefined,
    deliveredChannels: (notif.deliveredChannels || ['in_app']).slice(0, 5),
    targetSection: (notif.targetSection || 'dashboard').slice(0, 40),
    updatedAt,
  });
}

function buildPushSubscriptionDoc(
  uid: string,
  sid: string,
  sub: PushSubscriptionRecord,
  updatedAt: string
) {
  return stripUndefined({
    uid,
    id: sid,
    endpoint: (sub.endpoint || '').slice(0, 2000),
    keys: sub.keys,
    userAgent: sub.userAgent ? sub.userAgent.slice(0, 300) : undefined,
    timezone: sub.timezone ? sub.timezone.slice(0, 80) : undefined,
    createdAt: (sub.createdAt || updatedAt).slice(0, 40),
    updatedAt,
  });
}

export async function initializeUserFirestoreIfEmpty(
  user: User,
  seedState?: AppState
): Promise<{ hadExistingCloudData: boolean }> {
  const uid = user.uid;
  const profilePath = `users/${uid}/private/profile`;
  const daysPath = `users/${uid}/days`;
  const habitsPath = `users/${uid}/habits`;

  let profileSnap;
  try {
    profileSnap = await getDoc(doc(db, profilePath));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, profilePath);
  }

  let daysSnap;
  try {
    daysSnap = await getDocs(query(collection(db, daysPath), where('uid', '==', uid)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, daysPath);
  }

  let habitsSnap;
  try {
    habitsSnap = await getDocs(query(collection(db, habitsPath), where('uid', '==', uid)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, habitsPath);
  }

  const hasExisting = profileSnap.exists() || !daysSnap.empty || !habitsSnap.empty;

  const base =
    seedState ??
    createInitialAppState({
      name: user.displayName || user.email?.split('@')[0] || 'Student Builder',
      onboardingCompleted: false,
    });

  const enriched: AppState = {
    ...base,
    profile: {
      ...base.profile,
      name: base.profile.name || user.displayName || 'Student Builder',
      email: user.email || base.profile.email || '',
      photoUrl: user.photoURL || base.profile.photoUrl || '',
      prayerTimes: base.profile.prayerTimes || { ...DEFAULT_PRAYER_TIMES },
      schedulingPreferences:
        base.profile.schedulingPreferences || { ...DEFAULT_SCHEDULING_PREFERENCES },
    },
  };

  if (hasExisting) {
    // Ensure profile document exists if user already had days/habits from an earlier session
    if (!profileSnap.exists()) {
      try {
        await setDoc(
          doc(db, profilePath),
          buildProfileDoc(uid, enriched.profile, nowIso())
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, profilePath);
      }
    }
    return { hadExistingCloudData: true };
  }

  await writeFullAppStateToFirestore(uid, enriched);
  return { hadExistingCloudData: false };
}

export async function writeFullAppStateToFirestore(
  uid: string,
  state: AppState
): Promise<void> {
  const updatedAt = nowIso();
  const batch = writeBatch(db);

  const profileRef = doc(db, `users/${uid}/private/profile`);
  batch.set(profileRef, buildProfileDoc(uid, state.profile, updatedAt));

  const templatesRef = doc(db, `users/${uid}/templates/all`);
  batch.set(
    templatesRef,
    stripUndefined({
      uid,
      templates: state.templates || DEFAULT_TEMPLATES,
      updatedAt,
    })
  );

  for (const day of Object.values(state.days)) {
    const dayId = sanitizeId(day.date);
    const dayRef = doc(db, `users/${uid}/days/${dayId}`);
    batch.set(dayRef, buildDayDoc(uid, day, updatedAt));
  }

  for (const habit of state.habits) {
    const hid = sanitizeId(habit.id);
    const habitRef = doc(db, `users/${uid}/habits/${hid}`);
    batch.set(habitRef, buildHabitDoc(uid, hid, habit, updatedAt));
  }

  for (const goal of state.goals) {
    const gid = sanitizeId(goal.id);
    const goalRef = doc(db, `users/${uid}/goals/${gid}`);
    batch.set(goalRef, buildGoalDoc(uid, gid, goal, updatedAt));
  }

  for (const project of state.projects) {
    const pid = sanitizeId(project.id);
    const projRef = doc(db, `users/${uid}/projects/${pid}`);
    batch.set(projRef, buildProjectDoc(uid, pid, project, updatedAt));
  }

  for (const review of state.weeklyReviews) {
    const wid = `week_${clampInt(review.weekNumber, 1, 10, 1)}`;
    const reviewRef = doc(db, `users/${uid}/weeklyReviews/${wid}`);
    batch.set(reviewRef, buildWeeklyReviewDoc(uid, review, updatedAt));
  }

  for (const conv of state.coachConversations || []) {
    const cid = sanitizeId(conv.id);
    const convRef = doc(db, `users/${uid}/coachConversations/${cid}`);
    batch.set(convRef, buildCoachConversationDoc(uid, cid, conv, updatedAt));
  }

  for (const notif of (state.notifications || []).slice(-100)) {
    const nid = sanitizeId(notif.id);
    const notifRef = doc(db, `users/${uid}/notifications/${nid}`);
    batch.set(notifRef, buildNotificationDoc(uid, nid, notif, updatedAt));
  }

  for (const sub of state.pushSubscriptions || []) {
    const sid = sanitizeId(sub.id);
    const subRef = doc(db, `users/${uid}/pushSubscriptions/${sid}`);
    batch.set(subRef, buildPushSubscriptionDoc(uid, sid, sub, updatedAt));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

/**
 * Diff-based incremental sync from previous state to next state so edits
 * sync quickly, stay within Firestore limits, and support deletions cleanly.
 */
export async function syncAppStateDiffToFirestore(
  uid: string,
  prev: AppState,
  next: AppState
): Promise<void> {
  const updatedAt = nowIso();
  const operations: Array<Promise<void>> = [];

  if (JSON.stringify(prev.profile) !== JSON.stringify(next.profile)) {
    const pPath = `users/${uid}/private/profile`;
    operations.push(
      setDoc(doc(db, pPath), buildProfileDoc(uid, next.profile, updatedAt)).catch((e) =>
        handleFirestoreError(e, OperationType.WRITE, pPath)
      )
    );
  }

  if (JSON.stringify(prev.templates) !== JSON.stringify(next.templates)) {
    const tPath = `users/${uid}/templates/all`;
    operations.push(
      setDoc(
        doc(db, tPath),
        stripUndefined({
          uid,
          templates: next.templates,
          updatedAt,
        })
      ).catch((e) => handleFirestoreError(e, OperationType.WRITE, tPath))
    );
  }

  // Days diff
  const prevDayKeys = new Set(Object.keys(prev.days));
  const nextDayKeys = new Set(Object.keys(next.days));
  for (const key of nextDayKeys) {
    if (JSON.stringify(prev.days[key]) !== JSON.stringify(next.days[key])) {
      const day = next.days[key];
      const dayPath = `users/${uid}/days/${sanitizeId(day.date)}`;
      operations.push(
        setDoc(doc(db, dayPath), buildDayDoc(uid, day, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, dayPath)
        )
      );
    }
  }
  for (const key of prevDayKeys) {
    if (!nextDayKeys.has(key)) {
      const dayPath = `users/${uid}/days/${sanitizeId(key)}`;
      operations.push(
        deleteDoc(doc(db, dayPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, dayPath)
        )
      );
    }
  }

  // Habits diff
  const prevHabits = new Map(prev.habits.map((h) => [h.id, h]));
  const nextHabits = new Map(next.habits.map((h) => [h.id, h]));
  for (const [id, habit] of nextHabits) {
    if (JSON.stringify(prevHabits.get(id)) !== JSON.stringify(habit)) {
      const hid = sanitizeId(id);
      const hPath = `users/${uid}/habits/${hid}`;
      operations.push(
        setDoc(doc(db, hPath), buildHabitDoc(uid, hid, habit, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, hPath)
        )
      );
    }
  }
  for (const id of prevHabits.keys()) {
    if (!nextHabits.has(id)) {
      const hPath = `users/${uid}/habits/${sanitizeId(id)}`;
      operations.push(
        deleteDoc(doc(db, hPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, hPath)
        )
      );
    }
  }

  // Goals diff
  const prevGoals = new Map(prev.goals.map((g) => [g.id, g]));
  const nextGoals = new Map(next.goals.map((g) => [g.id, g]));
  for (const [id, goal] of nextGoals) {
    if (JSON.stringify(prevGoals.get(id)) !== JSON.stringify(goal)) {
      const gid = sanitizeId(id);
      const gPath = `users/${uid}/goals/${gid}`;
      operations.push(
        setDoc(doc(db, gPath), buildGoalDoc(uid, gid, goal, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, gPath)
        )
      );
    }
  }
  for (const id of prevGoals.keys()) {
    if (!nextGoals.has(id)) {
      const gPath = `users/${uid}/goals/${sanitizeId(id)}`;
      operations.push(
        deleteDoc(doc(db, gPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, gPath)
        )
      );
    }
  }

  // Projects diff
  const prevProjects = new Map(prev.projects.map((p) => [p.id, p]));
  const nextProjects = new Map(next.projects.map((p) => [p.id, p]));
  for (const [id, proj] of nextProjects) {
    if (JSON.stringify(prevProjects.get(id)) !== JSON.stringify(proj)) {
      const pid = sanitizeId(id);
      const pPath = `users/${uid}/projects/${pid}`;
      operations.push(
        setDoc(doc(db, pPath), buildProjectDoc(uid, pid, proj, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, pPath)
        )
      );
    }
  }
  for (const id of prevProjects.keys()) {
    if (!nextProjects.has(id)) {
      const pPath = `users/${uid}/projects/${sanitizeId(id)}`;
      operations.push(
        deleteDoc(doc(db, pPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, pPath)
        )
      );
    }
  }

  // Weekly reviews diff
  const prevReviews = new Map(prev.weeklyReviews.map((r) => [r.weekNumber, r]));
  for (const review of next.weeklyReviews) {
    if (JSON.stringify(prevReviews.get(review.weekNumber)) !== JSON.stringify(review)) {
      const wPath = `users/${uid}/weeklyReviews/week_${clampInt(review.weekNumber, 1, 10, 1)}`;
      operations.push(
        setDoc(doc(db, wPath), buildWeeklyReviewDoc(uid, review, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, wPath)
        )
      );
    }
  }

  // Coach conversations diff
  const prevConvs = new Map((prev.coachConversations || []).map((c) => [c.id, c]));
  const nextConvs = new Map((next.coachConversations || []).map((c) => [c.id, c]));
  for (const [id, conv] of nextConvs) {
    if (JSON.stringify(prevConvs.get(id)) !== JSON.stringify(conv)) {
      const cid = sanitizeId(id);
      const cPath = `users/${uid}/coachConversations/${cid}`;
      operations.push(
        setDoc(doc(db, cPath), buildCoachConversationDoc(uid, cid, conv, updatedAt)).catch(
          (e) => handleFirestoreError(e, OperationType.WRITE, cPath)
        )
      );
    }
  }
  for (const id of prevConvs.keys()) {
    if (!nextConvs.has(id)) {
      const cPath = `users/${uid}/coachConversations/${sanitizeId(id)}`;
      operations.push(
        deleteDoc(doc(db, cPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, cPath)
        )
      );
    }
  }

  // Notifications diff
  const prevNotifs = new Map((prev.notifications || []).map((n) => [n.id, n]));
  const nextNotifs = new Map((next.notifications || []).map((n) => [n.id, n]));
  for (const [id, notif] of nextNotifs) {
    if (JSON.stringify(prevNotifs.get(id)) !== JSON.stringify(notif)) {
      const nid = sanitizeId(id);
      const nPath = `users/${uid}/notifications/${nid}`;
      operations.push(
        setDoc(doc(db, nPath), buildNotificationDoc(uid, nid, notif, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, nPath)
        )
      );
    }
  }
  for (const id of prevNotifs.keys()) {
    if (!nextNotifs.has(id)) {
      const nPath = `users/${uid}/notifications/${sanitizeId(id)}`;
      operations.push(
        deleteDoc(doc(db, nPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, nPath)
        )
      );
    }
  }

  // Push subscriptions diff
  const prevSubs = new Map((prev.pushSubscriptions || []).map((s) => [s.id, s]));
  const nextSubs = new Map((next.pushSubscriptions || []).map((s) => [s.id, s]));
  for (const [id, sub] of nextSubs) {
    if (JSON.stringify(prevSubs.get(id)) !== JSON.stringify(sub)) {
      const sid = sanitizeId(id);
      const sPath = `users/${uid}/pushSubscriptions/${sid}`;
      operations.push(
        setDoc(doc(db, sPath), buildPushSubscriptionDoc(uid, sid, sub, updatedAt)).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, sPath)
        )
      );
    }
  }
  for (const id of prevSubs.keys()) {
    if (!nextSubs.has(id)) {
      const sPath = `users/${uid}/pushSubscriptions/${sanitizeId(id)}`;
      operations.push(
        deleteDoc(doc(db, sPath)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, sPath)
        )
      );
    }
  }

  await Promise.all(operations);
}

/**
 * Subscribe to real-time Firestore collections for the authenticated user.
 * Aggregates slices into an AppState object and notifies React whenever any device updates data.
 */
export function subscribeUserAppState(
  user: User,
  onStateChange: (state: AppState, fromCache: boolean) => void,
  onSyncError: (err: Error) => void
): () => void {
  const uid = user.uid;
  const fallback = createInitialAppState({
    name: user.displayName || 'Student Builder',
    onboardingCompleted: true,
  });

  const liveState: AppState = {
    ...fallback,
    profile: {
      ...fallback.profile,
      email: user.email || '',
      photoUrl: user.photoURL || '',
    },
    days: {},
    habits: [],
    goals: [],
    projects: [],
    weeklyReviews: [],
    coachConversations: [],
    notifications: [],
    pushSubscriptions: [],
  };

  let readyProfile = false;
  let readyDays = false;

  const emit = (fromCache: boolean) => {
    if (!readyProfile || !readyDays) return;
    onStateChange(
      {
        ...liveState,
        profile: { ...liveState.profile },
        days: { ...liveState.days },
        templates: { ...liveState.templates },
        habits: [...liveState.habits],
        goals: [...liveState.goals],
        projects: [...liveState.projects],
        weeklyReviews: [...liveState.weeklyReviews].sort(
          (a, b) => a.weekNumber - b.weekNumber
        ),
        coachConversations: [...(liveState.coachConversations || [])].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        ),
        notifications: [...(liveState.notifications || [])].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        ),
        pushSubscriptions: [...(liveState.pushSubscriptions || [])],
      },
      fromCache
    );
  };

  const unsubs: Array<() => void> = [];

  const profilePath = `users/${uid}/private/profile`;
  unsubs.push(
    onSnapshot(
      doc(db, profilePath),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          liveState.profile = {
            name: data.name || user.displayName || 'Student Builder',
            email: data.email || user.email || '',
            photoUrl: data.photoUrl || user.photoURL || '',
            startDate: data.startDate,
            wakeTime: data.wakeTime,
            sleepTime: data.sleepTime,
            fixedCommitments: data.fixedCommitments || [],
            primaryGoalAreas: data.primaryGoalAreas || [],
            prayerTimes: data.prayerTimes || { ...DEFAULT_PRAYER_TIMES },
            schedulingPreferences:
              data.schedulingPreferences || { ...DEFAULT_SCHEDULING_PREFERENCES },
            dashboardPreferences: data.dashboardPreferences,
            notificationPreferences:
              data.notificationPreferences ||
              getDefaultNotificationPreferences(data.wakeTime, data.sleepTime),
            basicSchedule: data.basicSchedule,
            personalActivities: data.personalActivities,
            goalTargets: data.goalTargets,
            weeklyTimetable: data.weeklyTimetable,
            onboardingDraft: data.onboardingDraft,
            onboardingSkipped: Boolean(data.onboardingSkipped),
            onboardingCompleted: Boolean(data.onboardingCompleted),
          };
        }
        readyProfile = true;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.GET, profilePath);
      }
    )
  );

  const templatesPath = `users/${uid}/templates/all`;
  unsubs.push(
    onSnapshot(
      doc(db, templatesPath),
      (snap) => {
        if (snap.exists() && snap.data().templates) {
          liveState.templates = snap.data().templates;
        }
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.GET, templatesPath);
      }
    )
  );

  const daysPath = `users/${uid}/days`;
  unsubs.push(
    onSnapshot(
      query(collection(db, daysPath), where('uid', '==', uid)),
      { includeMetadataChanges: true },
      (snap) => {
        const nextDays: Record<string, DayPlan> = {};
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          nextDays[d.date] = {
            dayNumber: d.dayNumber,
            date: d.date,
            scheduleType: d.scheduleType,
            tasks: d.tasks || [],
            dailyReview: d.dailyReview,
            focusSessions: Array.isArray(d.focusSessions) ? d.focusSessions : undefined,
          };
        });
        liveState.days = nextDays;
        readyDays = true;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, daysPath);
      }
    )
  );

  const habitsPath = `users/${uid}/habits`;
  unsubs.push(
    onSnapshot(
      query(collection(db, habitsPath), where('uid', '==', uid)),
      (snap) => {
        const next: Habit[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            id: v.id,
            title: v.title,
            category: v.category,
            frequency: v.frequency,
            customDays: v.customDays,
            targetPerWeek: v.targetPerWeek,
            logs: v.logs || {},
            createdAt: v.createdAt,
          });
        });
        liveState.habits = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, habitsPath);
      }
    )
  );

  const goalsPath = `users/${uid}/goals`;
  unsubs.push(
    onSnapshot(
      query(collection(db, goalsPath), where('uid', '==', uid)),
      (snap) => {
        const next: Goal[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            id: v.id,
            area: v.area,
            title: v.title,
            description: v.description,
            deadline: v.deadline,
            status: v.status,
            milestones: v.milestones || [],
            notes: v.notes || '',
            linkedTaskTitles: v.linkedTaskTitles || [],
          });
        });
        liveState.goals = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, goalsPath);
      }
    )
  );

  const projectsPath = `users/${uid}/projects`;
  unsubs.push(
    onSnapshot(
      query(collection(db, projectsPath), where('uid', '==', uid)),
      (snap) => {
        const next: Project[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            id: v.id,
            title: v.title,
            type: v.type,
            description: v.description,
            status: v.status,
            deadline: v.deadline,
            tasks: v.tasks || [],
            notes: v.notes || '',
            link: v.link,
          });
        });
        liveState.projects = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, projectsPath);
      }
    )
  );

  const reviewsPath = `users/${uid}/weeklyReviews`;
  unsubs.push(
    onSnapshot(
      query(collection(db, reviewsPath), where('uid', '==', uid)),
      (snap) => {
        const next: WeeklyReview[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            weekNumber: v.weekNumber,
            startDate: v.startDate,
            endDate: v.endDate,
            accomplished: v.accomplished || '',
            failedToComplete: v.failedToComplete || '',
            distractions: v.distractions || '',
            improved: v.improved || '',
            needsImprovement: v.needsImprovement || '',
            nextWeekPriorities: v.nextWeekPriorities || ['', '', ''],
            updatedAt: v.updatedAt,
          });
        });
        liveState.weeklyReviews = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, reviewsPath);
      }
    )
  );

  const coachPath = `users/${uid}/coachConversations`;
  unsubs.push(
    onSnapshot(
      query(collection(db, coachPath), where('uid', '==', uid)),
      (snap) => {
        const next: CoachConversation[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            id: v.id,
            title: v.title,
            messages: v.messages || [],
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
          });
        });
        liveState.coachConversations = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, coachPath);
      }
    )
  );

  const notifsPath = `users/${uid}/notifications`;
  unsubs.push(
    onSnapshot(
      query(collection(db, notifsPath), where('uid', '==', uid)),
      (snap) => {
        const next: SmartNotification[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            id: v.id,
            dedupeKey: v.dedupeKey,
            type: v.type,
            title: v.title,
            body: v.body,
            createdAt: v.createdAt,
            scheduledFor: v.scheduledFor,
            dateStr: v.dateStr,
            taskId: v.taskId,
            taskTitle: v.taskTitle,
            taskStartTime: v.taskStartTime,
            taskEndTime: v.taskEndTime,
            goalId: v.goalId,
            read: Boolean(v.read),
            dismissed: Boolean(v.dismissed),
            snoozedUntil: v.snoozedUntil,
            deliveredChannels: v.deliveredChannels || ['in_app'],
            targetSection: v.targetSection || 'dashboard',
          });
        });
        liveState.notifications = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, notifsPath);
      }
    )
  );

  const pushPath = `users/${uid}/pushSubscriptions`;
  unsubs.push(
    onSnapshot(
      query(collection(db, pushPath), where('uid', '==', uid)),
      (snap) => {
        const next: PushSubscriptionRecord[] = [];
        snap.forEach((d) => {
          const v = d.data();
          next.push({
            id: v.id,
            endpoint: v.endpoint,
            keys: v.keys,
            userAgent: v.userAgent,
            timezone: v.timezone,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
          });
        });
        liveState.pushSubscriptions = next;
        emit(snap.metadata.fromCache);
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.LIST, pushPath);
      }
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}
