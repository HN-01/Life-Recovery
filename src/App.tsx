import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  AlertCircle,
  AlarmClock,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Cloud,
  CloudOff,
  Flame,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Settings,
  Target,
  X,
} from 'lucide-react';
import {
  AppState,
  CoachConversation,
  DailyReviewEntry,
  DashboardPreferences,
  FocusSession,
  Goal,
  Habit,
  NavSection,
  OnboardingDraft,
  Project,
  ProposedGoalAction,
  ProposedScheduleChange,
  RoutineDiagnostic,
  RoutineTask,
  RoutineUpdateScope,
  ScheduleType,
  SmartNotification,
  SyncStatus,
  TemplateTask,
  WeeklyReview,
} from './types';
import {
  build30DaysSchedule,
  createId,
  createInitialAppState,
  createStarterGoals,
  createStarterHabits,
  createStarterProjects,
  createStarterWeeklyReviews,
  DEFAULT_PRAYER_TIMES,
  DEFAULT_SCHEDULING_PREFERENCES,
  instantiateTasksFromTemplate,
} from './data/starterData';
import { auth } from './services/firebase';
import {
  initializeUserFirestoreIfEmpty,
  subscribeUserAppState,
  syncAppStateDiffToFirestore,
  writeFullAppStateToFirestore,
} from './services/firestoreSync';
import { storageRepo } from './services/storage';
import {
  addDaysToDateStr,
  formatTime12h,
  getKarachiNow,
  KarachiNow,
  sortTasksChronologically,
} from './utils/dateUtils';
import {
  applyScheduleTypeToDay,
  applyTaskUpdateWithScope,
  getCurrentChallengeDay,
} from './utils/metrics';
import {
  evaluateSmartNotifications,
  getZonedClock,
  normalizeNotificationPreferences,
} from './utils/notificationEngine';
import {
  BrowserPermissionState,
  fetchServerVapidConfig,
  getBrowserNotificationPermission,
  registerAppServiceWorker,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  subscribeDeviceWebPush,
  triggerServerTestPush,
  unsubscribeDeviceWebPush,
} from './utils/pushNotifications';
import { buildDeterministicSmartPlan } from './utils/smartScheduler';
import { deduplicateDayTasks } from './utils/focusMetrics';
import { AuthGate } from './components/AuthGate';
import { MigrationModal } from './components/MigrationModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { TaskModal } from './components/TaskModal';
import { DailyReviewModal } from './components/DailyReviewModal';
import { SmartPlanModal } from './components/SmartPlanModal';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { DashboardView } from './components/views/DashboardView';
import { DailyRoutineView } from './components/views/DailyRoutineView';
import { Planner30DayView } from './components/views/Planner30DayView';
import { HabitTrackerView } from './components/views/HabitTrackerView';
import { GoalsProjectsView } from './components/views/GoalsProjectsView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { WeeklyReviewView } from './components/views/WeeklyReviewView';
import { AICoachView } from './components/views/AICoachView';
import { SettingsView } from './components/views/SettingsView';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'routine', label: 'My Daily Routine', icon: Clock },
  { id: 'planner', label: '30-Day Planner', icon: CalendarDays },
  { id: 'habits', label: 'Habit Tracker', icon: Flame },
  { id: 'goals', label: 'Goals & Projects', icon: Target },
  { id: 'analytics', label: 'Progress Analytics', icon: BarChart3 },
  { id: 'review', label: 'Weekly Review', icon: ClipboardList },
  { id: 'coach', label: 'AI Life Coach', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  const [state, setState] = useState<AppState>(() =>
    createInitialAppState({ onboardingCompleted: true })
  );
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');

  // Migration state
  const [localCandidate, setLocalCandidate] = useState<AppState | null>(null);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState('');

  const [now, setNow] = useState<KarachiNow>(() => getKarachiNow());
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [goalsSubTab, setGoalsSubTab] = useState<'goals' | 'projects'>('goals');
  const [coachInitialPrompt, setCoachInitialPrompt] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => getKarachiNow().dateStr);

  // Modals & notifications
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalBreakDefault, setTaskModalBreakDefault] = useState(false);
  const [editingTask, setEditingTask] = useState<RoutineTask | null>(null);
  const [taskTargetDate, setTaskTargetDate] = useState<string>(selectedDate);

  const [habitAddModalOpen, setHabitAddModalOpen] = useState(false);
  const [dailyReviewOpen, setDailyReviewOpen] = useState(false);
  const [newPlanConfirmOpen, setNewPlanConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [timetableBuilderOpen, setTimetableBuilderOpen] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<'onboarding' | 'builder'>('builder');

  // Notifications & Web Push state
  const [notificationPermission, setNotificationPermission] = useState<BrowserPermissionState>(
    () => getBrowserNotificationPermission()
  );
  const [vapidStatus, setVapidStatus] = useState<{
    configured: boolean;
    publicKey: string | null;
    cronConfigured: boolean;
    loading: boolean;
  }>({ configured: false, publicKey: null, cronConfigured: false, loading: true });
  const [activeNotifToast, setActiveNotifToast] = useState<SmartNotification | null>(null);
  const firedBrowserNotifIdsRef = useRef<Set<string>>(new Set());

  // Smart Plan Modal state
  const [smartPlanOpen, setSmartPlanOpen] = useState(false);
  const [smartPlanTargetDate, setSmartPlanTargetDate] = useState<string>(() =>
    addDaysToDateStr(getKarachiNow().dateStr, 1)
  );
  const [smartPlanSummary, setSmartPlanSummary] = useState('');
  const [smartPlanProposals, setSmartPlanProposals] = useState<ProposedScheduleChange[]>([]);
  const [smartPlanDiagnostics, setSmartPlanDiagnostics] = useState<RoutineDiagnostic[]>([]);
  const [smartPlanEnriching, setSmartPlanEnriching] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3200);
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setNotificationsOpen(false);
      }
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // 1. Auth session listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setCloudReady(false);
        setSyncStatus('idle');
      }
    });
    return () => unsub();
  }, []);

  // 2. Online / Offline listener
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus((prev) => (prev === 'offline' ? 'synced' : prev));
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3. Firestore Initialization + Real-time Subscription per Authenticated UID
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    let unsubscribeSnapshot: (() => void) | null = null;

    const bootCloud = async () => {
      try {
        setSyncStatus(navigator.onLine ? 'syncing' : 'offline');
        setSyncErrorMsg('');

        // Detect existing localStorage data before touching cloud
        if (storageRepo.hasLocalData()) {
          const local = storageRepo.peekLocalData();
          if (local && active) {
            setLocalCandidate(local);
          }
        }

        const { hadExistingCloudData } = await initializeUserFirestoreIfEmpty(authUser);

        if (active && storageRepo.hasLocalData()) {
          if (!hadExistingCloudData) {
            // Even when fresh, ask or migrate cleanly via dialog so nothing is silent
            setMigrationOpen(true);
          } else {
            setMigrationOpen(true);
          }
        }

        if (!active) return;

        unsubscribeSnapshot = subscribeUserAppState(
          authUser,
          (cloudState, fromCache) => {
            if (!active) return;
            setState(cloudState);
            stateRef.current = cloudState;
            setCloudReady(true);
            setSyncStatus(
              !navigator.onLine ? 'offline' : fromCache ? 'syncing' : 'synced'
            );
            setLastSyncedAt(new Date().toISOString());

            // Ensure selectedDate stays within valid challenge range on first load
            const kNow = getKarachiNow();
            const currentDay = getCurrentChallengeDay(cloudState, kNow.dateStr);
            if (currentDay && !cloudState.days[selectedDate]) {
              setSelectedDate(currentDay.date);
            }
          },
          (err) => {
            if (!active) return;
            setSyncStatus('error');
            setSyncErrorMsg(err.message);
          }
        );
      } catch (err) {
        if (!active) return;
        setSyncStatus('error');
        setSyncErrorMsg(err instanceof Error ? err.message : 'Cloud sync initialization failed.');
        setCloudReady(true);
      }
    };

    bootCloud();

    return () => {
      active = false;
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [authUser]);

  // 4. Refresh Asia/Karachi clock every 20s
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(getKarachiNow());
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  // 5. Register Service Worker & load server VAPID config
  useEffect(() => {
    registerAppServiceWorker();
    fetchServerVapidConfig().then((cfg) => {
      setVapidStatus({
        configured: cfg.configured,
        publicKey: cfg.publicKey,
        cronConfigured: cfg.cronConfigured,
        loading: false,
      });
    });
  }, []);

  /**
   * Central state mutator: updates UI immediately and syncs changed slices to Cloud Firestore.
   */
  const commitStateUpdate = useCallback(
    (updater: (prev: AppState) => AppState) => {
      const prev = stateRef.current;
      const next = updater(prev);
      setState(next);
      stateRef.current = next;

      if (!authUser) return;
      setSyncStatus(navigator.onLine ? 'syncing' : 'offline');
      setSyncErrorMsg('');

      syncAppStateDiffToFirestore(authUser.uid, prev, next)
        .then(() => {
          setSyncStatus(navigator.onLine ? 'synced' : 'offline');
          setLastSyncedAt(new Date().toISOString());
        })
        .catch((err) => {
          setSyncStatus('error');
          setSyncErrorMsg(err instanceof Error ? err.message : 'Sync failed.');
        });
    },
    [authUser]
  );

  // 6. Handle Service Worker Notification Click Actions & URL deep links
  const applyNotificationAction = useCallback(
    (payload: {
      action?: string;
      taskId?: string;
      dateStr?: string;
      notificationId?: string;
    }) => {
      const { action, taskId, dateStr, notificationId } = payload;
      if (action === 'complete' && taskId) {
        const targetDate = dateStr || getKarachiNow().dateStr;
        commitStateUpdate((prev) => {
          const day = prev.days[targetDate];
          const nextDays = day
            ? {
                ...prev.days,
                [targetDate]: {
                  ...day,
                  tasks: day.tasks.map((t) =>
                    t.id === taskId ? { ...t, status: 'completed' as const } : t
                  ),
                },
              }
            : prev.days;
          return {
            ...prev,
            days: nextDays,
            notifications: (prev.notifications || []).map((n) =>
              n.id === notificationId || n.taskId === taskId
                ? { ...n, read: true, dismissed: true }
                : n
            ),
          };
        });
        showToast('Activity marked completed.');
        return;
      }

      if (action === 'start') {
        if (dateStr) setSelectedDate(dateStr);
        setActiveSection('dashboard');
        if (notificationId) {
          commitStateUpdate((prev) => ({
            ...prev,
            notifications: (prev.notifications || []).map((n) =>
              n.id === notificationId ? { ...n, read: true } : n
            ),
          }));
        }
        return;
      }

      if (dateStr) setSelectedDate(dateStr);
      setActiveSection('routine');
    },
    [commitStateUpdate, showToast]
  );

  useEffect(() => {
    if (!cloudReady || !authUser) return;

    const params = new URLSearchParams(window.location.search);
    const notifAction = params.get('notifAction');
    if (notifAction) {
      applyNotificationAction({
        action: notifAction,
        taskId: params.get('taskId') || undefined,
        dateStr: params.get('date') || undefined,
        notificationId: params.get('notificationId') || undefined,
      });
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const onSwMessage = (event: MessageEvent) => {
        if (event.data?.type === 'NOTIFICATION_ACTION') {
          applyNotificationAction(event.data);
        }
      };
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }
  }, [cloudReady, authUser, applyNotificationAction]);

  // 7. Smart Timetable Notification Evaluator (Timezone-aware, deduped, quiet-hours safe)
  const runNotificationCheck = useCallback(() => {
    const current = stateRef.current;
    if (!authUser || !cloudReady || !current.profile.onboardingCompleted) return;
    const nPrefs = normalizeNotificationPreferences(
      current.profile.notificationPreferences,
      current.profile.wakeTime,
      current.profile.sleepTime
    );
    const clock = getZonedClock(nPrefs.timezone);
    const existing = current.notifications || [];
    const result = evaluateSmartNotifications({
      state: current,
      clock,
      existingNotifications: existing,
    });

    if (
      result.newNotifications.length > 0 ||
      result.supersededIds.length > 0 ||
      result.unsnoozedIds.length > 0
    ) {
      const supersededSet = new Set(result.supersededIds);
      const unsnoozedSet = new Set(result.unsnoozedIds);

      commitStateUpdate((prev) => {
        const updatedExisting = (prev.notifications || []).map((n) => {
          if (supersededSet.has(n.id)) {
            return { ...n, dismissed: true, read: true };
          }
          if (unsnoozedSet.has(n.id)) {
            return { ...n, snoozedUntil: undefined, read: false };
          }
          return n;
        });

        const merged = [...result.newNotifications, ...updatedExisting].slice(0, 60);
        return {
          ...prev,
          notifications: merged,
        };
      });

      if (result.newNotifications.length > 0 && !result.quietHoursActive) {
        const latest = result.newNotifications[0];
        setActiveNotifToast(latest);
        window.setTimeout(() => {
          setActiveNotifToast((curr) => (curr?.id === latest.id ? null : curr));
        }, 7500);

        if (nPrefs.browserNotificationsEnabled) {
          for (const n of result.newNotifications) {
            if (firedBrowserNotifIdsRef.current.has(n.id)) continue;
            firedBrowserNotifIdsRef.current.add(n.id);
            showBrowserNotification({
              title: n.title,
              body: n.body,
              tag: n.dedupeKey,
              taskId: n.taskId,
              notificationId: n.id,
              dateStr: n.dateStr,
            });
          }
        }
      }
    }
  }, [authUser, cloudReady, commitStateUpdate]);

  useEffect(() => {
    runNotificationCheck();
    const id = window.setInterval(runNotificationCheck, 20000);
    return () => window.clearInterval(id);
  }, [
    runNotificationCheck,
    now.minutesSinceMidnight,
    state.days,
    state.goals,
    state.projects,
    state.profile.notificationPreferences,
  ]);

  // Migration Handler (Avoids duplicates & verifies write before clearing local data)
  const handleMigrateLocalToCloud = async () => {
    if (!authUser || !localCandidate) return;
    setMigrating(true);
    setMigrationError('');
    try {
      const cloud = stateRef.current;
      const mergedDays = { ...cloud.days };
      for (const [dateStr, localDay] of Object.entries(localCandidate.days)) {
        const existingCloudDay = mergedDays[dateStr];
        if (!existingCloudDay) {
          mergedDays[dateStr] = localDay;
        } else {
          // Preserve completed tasks from both without duplicating by title+startTime
          const existingKeys = new Set(
            existingCloudDay.tasks.map((t) => `${t.title}::${t.startTime}`)
          );
          const mergedTasks = [...existingCloudDay.tasks];
          for (const lt of localDay.tasks) {
            const k = `${lt.title}::${lt.startTime}`;
            if (!existingKeys.has(k)) {
              mergedTasks.push(lt);
            } else if (lt.status === 'completed') {
              const idx = mergedTasks.findIndex((t) => `${t.title}::${t.startTime}` === k);
              if (idx >= 0) mergedTasks[idx] = { ...mergedTasks[idx], status: 'completed' };
            }
          }
          mergedDays[dateStr] = {
            ...existingCloudDay,
            tasks: sortTasksChronologically(mergedTasks),
          };
        }
      }

      const existingHabitTitles = new Set(cloud.habits.map((h) => h.title.toLowerCase()));
      const mergedHabits = [
        ...cloud.habits,
        ...localCandidate.habits.filter((h) => !existingHabitTitles.has(h.title.toLowerCase())),
      ];

      const existingGoalTitles = new Set(cloud.goals.map((g) => g.title.toLowerCase()));
      const mergedGoals = [
        ...cloud.goals,
        ...localCandidate.goals.filter((g) => !existingGoalTitles.has(g.title.toLowerCase())),
      ];

      const existingProjectTitles = new Set(cloud.projects.map((p) => p.title.toLowerCase()));
      const mergedProjects = [
        ...cloud.projects,
        ...localCandidate.projects.filter(
          (p) => !existingProjectTitles.has(p.title.toLowerCase())
        ),
      ];

      const mergedState: AppState = {
        ...localCandidate,
        profile: {
          ...localCandidate.profile,
          email: authUser.email || localCandidate.profile.email || '',
          photoUrl: authUser.photoURL || localCandidate.profile.photoUrl || '',
          prayerTimes: localCandidate.profile.prayerTimes || { ...DEFAULT_PRAYER_TIMES },
          schedulingPreferences:
            localCandidate.profile.schedulingPreferences || {
              ...DEFAULT_SCHEDULING_PREFERENCES,
            },
          onboardingCompleted: true,
        },
        days: mergedDays,
        habits: mergedHabits,
        goals: mergedGoals,
        projects: mergedProjects,
      };

      await writeFullAppStateToFirestore(authUser.uid, mergedState);
      // Verified write succeeded -> safe to clear local browser copy
      storageRepo.clearLocalData();
      setState(mergedState);
      stateRef.current = mergedState;
      setMigrationOpen(false);
      setLocalCandidate(null);
      showToast('Local data safely migrated and verified in Cloud Firestore.');
    } catch (err) {
      setMigrationError(
        err instanceof Error ? err.message : 'Migration failed. Local data was preserved.'
      );
    } finally {
      setMigrating(false);
    }
  };

  const handleSkipMigration = () => {
    setMigrationOpen(false);
    // Clear candidate prompt for this session while leaving localStorage untouched
    setLocalCandidate(null);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // Auth Gate
  if (!authReady) {
    return (
      <div className="min-h-screen bg-app text-muted flex items-center justify-center">
        <div className="inline-flex items-center gap-2.5 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-gold" />
          Checking authentication session...
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <AuthGate />;
  }

  if (!cloudReady) {
    return (
      <div className="min-h-screen bg-app text-muted flex items-center justify-center">
        <div className="inline-flex items-center gap-2.5 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-gold" />
          Loading your private Cloud Firestore workspace...
        </div>
      </div>
    );
  }

  // Onboarding gate (5-step personalized setup or Timetable Builder)
  const handleCompleteOnboarding = (result: { state: AppState }) => {
    const fresh: AppState = {
      ...result.state,
      profile: {
        ...result.state.profile,
        email: authUser.email || result.state.profile.email || '',
        photoUrl: authUser.photoURL || result.state.profile.photoUrl || '',
        onboardingCompleted: true,
      },
    };

    setState(fresh);
    stateRef.current = fresh;
    setTimetableBuilderOpen(false);
    writeFullAppStateToFirestore(authUser.uid, fresh)
      .then(() => {
        setSyncStatus('synced');
        setLastSyncedAt(new Date().toISOString());
      })
      .catch((err) => {
        setSyncStatus('error');
        setSyncErrorMsg(err instanceof Error ? err.message : 'Sync failed.');
      });

    const firstOrToday = getCurrentChallengeDay(fresh, now.dateStr);
    if (firstOrToday) setSelectedDate(firstOrToday.date);
    showToast('Personalized timetable saved to Cloud Firestore.');
  };

  const handleSaveOnboardingDraft = (draft: OnboardingDraft) => {
    commitStateUpdate((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        onboardingDraft: draft,
        onboardingCompleted: true,
        onboardingSkipped: true,
      },
    }));
    showToast('Setup progress saved. Resume anytime from the dashboard.');
  };

  const handleSkipOnboarding = () => {
    const cleanBlank = createInitialAppState({
      name: authUser.displayName || state.profile.name || 'Builder',
      startDate: now.dateStr,
      onboardingCompleted: true,
      onboardingSkipped: true,
      blankSetup: true,
    });
    cleanBlank.profile.email = authUser.email || '';
    cleanBlank.profile.photoUrl = authUser.photoURL || '';
    setState(cleanBlank);
    stateRef.current = cleanBlank;
    writeFullAppStateToFirestore(authUser.uid, cleanBlank);
    showToast('Flexible blank workspace ready. Customize anytime in Settings.');
  };

  if (!state.profile.onboardingCompleted) {
    return (
      <>
        <OnboardingWizard
          initialState={state}
          mode="onboarding"
          onSaveDraft={handleSaveOnboardingDraft}
          onComplete={handleCompleteOnboarding}
          onSkip={handleSkipOnboarding}
        />
        <MigrationModal
          open={migrationOpen}
          localData={localCandidate}
          migrating={migrating}
          error={migrationError}
          onMigrate={handleMigrateLocalToCloud}
          onSkipKeepCloud={handleSkipMigration}
        />
      </>
    );
  }

  if (timetableBuilderOpen) {
    return (
      <OnboardingWizard
        initialState={state}
        mode={onboardingMode}
        onSaveDraft={handleSaveOnboardingDraft}
        onComplete={handleCompleteOnboarding}
        onSkip={() => setTimetableBuilderOpen(false)}
        onClose={() => setTimetableBuilderOpen(false)}
      />
    );
  }

  const todayDay = getCurrentChallengeDay(state, now.dateStr);
  const effectiveTodayDate = todayDay?.date ?? now.dateStr;

  // Task operations
  const handleToggleTaskStatus = (dateStr: string, taskId: string) => {
    commitStateUpdate((prev) => {
      const day = prev.days[dateStr];
      if (!day) return prev;
      return {
        ...prev,
        days: {
          ...prev.days,
          [dateStr]: {
            ...day,
            tasks: day.tasks.map((t) =>
              t.id === taskId
                ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' }
                : t
            ),
          },
        },
      };
    });
  };

  const handleSetTaskStatus = (
    dateStr: string,
    taskId: string,
    status: RoutineTask['status']
  ) => {
    commitStateUpdate((prev) => {
      const day = prev.days[dateStr];
      if (!day) return prev;
      return {
        ...prev,
        days: {
          ...prev.days,
          [dateStr]: {
            ...day,
            tasks: day.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
          },
        },
      };
    });
  };

  const handleDeduplicateDayTasks = (dateStr: string) => {
    const targetDay = stateRef.current.days[dateStr];
    if (!targetDay) return;
    const { duplicateCount } = deduplicateDayTasks(targetDay.tasks);
    if (duplicateCount === 0) return;
    commitStateUpdate((prev) => {
      const day = prev.days[dateStr];
      if (!day) return prev;
      const res = deduplicateDayTasks(day.tasks);
      return {
        ...prev,
        days: {
          ...prev.days,
          [dateStr]: {
            ...day,
            tasks: res.tasks,
          },
        },
      };
    });
    showToast(
      `Removed ${duplicateCount} duplicate task ${duplicateCount === 1 ? 'record' : 'records'} from Firestore.`
    );
  };

  const openAddTaskForDate = (dateStr: string, isBreak = false) => {
    setTaskTargetDate(dateStr);
    setEditingTask(null);
    setTaskModalBreakDefault(isBreak);
    setTaskModalOpen(true);
  };

  const openEditTaskForDate = (dateStr: string, task: RoutineTask) => {
    setTaskTargetDate(dateStr);
    setEditingTask(task);
    setTaskModalBreakDefault(false);
    setTaskModalOpen(true);
  };

  const handleSaveTask = (
    taskData: Omit<RoutineTask, 'id'>,
    scope: RoutineUpdateScope,
    existingTaskId?: string
  ) => {
    commitStateUpdate((prev) => {
      if (existingTaskId && editingTask) {
        return applyTaskUpdateWithScope(
          prev,
          taskTargetDate,
          { type: 'edit', originalTask: editingTask, updated: taskData },
          scope,
          now.dateStr
        );
      }
      return applyTaskUpdateWithScope(
        prev,
        taskTargetDate,
        { type: 'add', task: taskData },
        scope,
        now.dateStr
      );
    });
    showToast(
      scope === 'this_day'
        ? 'Routine updated for selected day.'
        : scope === 'this_and_future'
        ? 'Updated this day and future routines.'
        : 'Updated across all 30 days (completed history preserved).'
    );
  };

  const handleDeleteTask = (dateStr: string, task: RoutineTask) => {
    commitStateUpdate((prev) =>
      applyTaskUpdateWithScope(
        prev,
        dateStr,
        { type: 'delete', originalTask: task },
        'this_day',
        now.dateStr
      )
    );
    showToast(`Removed "${task.title}".`);
  };

  const handleDuplicateDayInto = (sourceDateStr: string, targetDateStr: string) => {
    commitStateUpdate((prev) => {
      const source = prev.days[sourceDateStr];
      const target = prev.days[targetDateStr];
      if (!source || !target) return prev;

      const clonedTasks: RoutineTask[] = source.tasks.map((t) => ({
        ...t,
        id: createId('task'),
        status: 'pending',
      }));

      return {
        ...prev,
        days: {
          ...prev.days,
          [targetDateStr]: {
            ...target,
            scheduleType: source.scheduleType,
            tasks: clonedTasks,
          },
        },
      };
    });
    showToast(`Copied Day ${state.days[sourceDateStr]?.dayNumber ?? ''} routine.`);
  };

  const handleDuplicateYesterday = () => {
    const yesterdayStr = addDaysToDateStr(effectiveTodayDate, -1);
    if (!state.days[yesterdayStr]) {
      showToast('No previous day available in this 30-day cycle yet.');
      return;
    }
    handleDuplicateDayInto(yesterdayStr, effectiveTodayDate);
  };

  const handleStartNew30DayPlan = () => {
    commitStateUpdate((prev) => {
      const newStart = now.dateStr;
      const freshDays = build30DaysSchedule(
        newStart,
        prev.templates,
        prev.profile.fixedCommitments
      );
      return {
        ...prev,
        profile: {
          ...prev.profile,
          startDate: newStart,
        },
        days: freshDays,
        weeklyReviews: createStarterWeeklyReviews(newStart),
      };
    });
    setSelectedDate(now.dateStr);
    showToast('Started a fresh 30-day plan beginning today.');
  };

  const handleSaveDailyReview = (dateStr: string, review: DailyReviewEntry) => {
    commitStateUpdate((prev) => {
      const day = prev.days[dateStr];
      if (!day) return prev;
      return {
        ...prev,
        days: {
          ...prev.days,
          [dateStr]: {
            ...day,
            dailyReview: review,
          },
        },
      };
    });
    showToast('Daily review saved.');
  };

  // Smart Scheduling Launcher ("Generate Tomorrow's Smart Plan")
  const handleOpenSmartPlan = async (explicitTargetDate?: string) => {
    const tomorrow = explicitTargetDate || addDaysToDateStr(now.dateStr, 1);
    const result = buildDeterministicSmartPlan(stateRef.current, now, tomorrow);
    setSmartPlanTargetDate(result.targetDate);
    setSmartPlanProposals(result.proposals);
    setSmartPlanDiagnostics(result.diagnostics);
    setSmartPlanSummary(result.contextSummary);
    setSmartPlanOpen(true);

    if (result.proposals.length > 0) {
      setSmartPlanEnriching(true);
      try {
        const resp = await fetch('/api/scheduler/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            proposals: result.proposals.map((p) => ({
              id: p.id,
              title: p.title,
              category: p.category,
              priority: p.priority,
              reason: p.reason,
            })),
            diagnostics: result.diagnostics.map((d) => ({
              issue: d.issue,
              evidence: d.evidence,
            })),
            contextSummary: result.contextSummary,
          }),
        });
        const contentType = (resp.headers.get('content-type') || '').toLowerCase();
        if (resp.ok && contentType.includes('application/json')) {
          const data = await resp.json();
          if (data.summaryNote) setSmartPlanSummary(data.summaryNote);
          if (data.reasonsById) {
            setSmartPlanProposals((prev) =>
              prev.map((p) =>
                data.reasonsById[p.id] ? { ...p, reason: data.reasonsById[p.id] } : p
              )
            );
          }
        }
      } catch {
        // Rule-based summary remains intact
      } finally {
        setSmartPlanEnriching(false);
      }
    }
  };

  const handleApplyProposedChanges = (accepted: ProposedScheduleChange[]) => {
    if (accepted.length === 0) return;
    commitStateUpdate((prev) => {
      const nextDays = { ...prev.days };
      for (const prop of accepted) {
        const day = nextDays[prop.targetDate];
        if (!day) continue;
        const newTask: RoutineTask = {
          id: createId('smart'),
          templateKey: createId('smart_tpl'),
          title: prop.title,
          startTime: prop.suggestedStartTime,
          endTime: prop.suggestedEndTime,
          category: prop.category,
          priority: prop.priority,
          description: prop.description || prop.reason,
          status: 'pending',
          isBreak: prop.isBreak,
        };
        nextDays[prop.targetDate] = {
          ...day,
          tasks: sortTasksChronologically([...day.tasks, newTask]),
        };
      }
      return { ...prev, days: nextDays };
    });
    showToast(`Applied ${accepted.length} approved schedule change(s).`);
  };

  // Habit handlers
  const handleToggleHabitDay = (habitId: string, dateStr: string) => {
    commitStateUpdate((prev) => ({
      ...prev,
      habits: prev.habits.map((h) =>
        h.id === habitId
          ? {
              ...h,
              logs: {
                ...h.logs,
                [dateStr]: !h.logs[dateStr],
              },
            }
          : h
      ),
    }));
  };

  // Weekly review next-week schedule injection
  const handleSchedulePriorityInNextWeek = (
    nextWeekStartDate: string,
    title: string,
    startTime: string,
    endTime: string
  ) => {
    commitStateUpdate((prev) => {
      const nextDays = { ...prev.days };
      for (let i = 0; i < 7; i++) {
        const dStr = addDaysToDateStr(nextWeekStartDate, i);
        const day = nextDays[dStr];
        if (!day) continue;
        const newTask: RoutineTask = {
          id: createId('task'),
          templateKey: createId('rev_prio'),
          title,
          startTime,
          endTime,
          category: 'Entrepreneurship',
          priority: 'Critical',
          description: 'Added from Weekly Review top priorities.',
          status: 'pending',
        };
        nextDays[dStr] = {
          ...day,
          tasks: sortTasksChronologically([...day.tasks, newTask]),
        };
      }
      return { ...prev, days: nextDays };
    });
  };

  const viewedDashboardDay = state.days[selectedDate] || todayDay;
  const effectiveDashboardDate = viewedDashboardDay?.date ?? effectiveTodayDate;

  const handleAddFocusSession = (dateStr: string, session: FocusSession) => {
    commitStateUpdate((prev) => {
      const day = prev.days[dateStr];
      if (!day) return prev;
      const existing = day.focusSessions || [];
      return {
        ...prev,
        days: {
          ...prev.days,
          [dateStr]: {
            ...day,
            focusSessions: [...existing, session],
          },
        },
      };
    });
    showToast(`Logged ${Math.max(1, Math.round(session.durationSeconds / 60))}m Deep Work session.`);
  };

  const handleUpdateDashboardPreferences = (prefs: DashboardPreferences) => {
    commitStateUpdate((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        dashboardPreferences: prefs,
      },
    }));
  };

  const handleApplyGoalAction = (action: ProposedGoalAction) => {
    const newGoal: Goal = {
      id: createId('goal'),
      area: action.area,
      title: action.goalTitle,
      description: action.reason,
      deadline: action.deadline,
      status: 'in_progress',
      milestones: action.milestones.map((m) => ({
        id: createId('ms'),
        title: m,
        completed: false,
      })),
      notes: 'Added from AI Life Coach suggestion.',
      linkedTaskTitles: [],
    };
    commitStateUpdate((prev) => ({
      ...prev,
      goals: [...prev.goals, newGoal],
    }));
    showToast(`Saved goal "${action.goalTitle}".`);
  };

  // Smart Notifications Inbox + Interactive Actions
  const nowMs = Date.now();
  const visibleNotifications = (state.notifications || []).filter(
    (n) => !n.dismissed && (!n.snoozedUntil || Date.parse(n.snoozedUntil) <= nowMs)
  );
  const unreadNotificationCount = visibleNotifications.filter((n) => !n.read).length;

  const handleDismissNotification = (notifId: string) => {
    commitStateUpdate((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) =>
        n.id === notifId ? { ...n, read: true, dismissed: true } : n
      ),
    }));
  };

  const handleSnoozeNotification = (n: SmartNotification, minutes = 10) => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    commitStateUpdate((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((item) =>
        item.id === n.id ? { ...item, snoozedUntil: until, read: true } : item
      ),
    }));
    if (activeNotifToast?.id === n.id) setActiveNotifToast(null);
    showToast(`Snoozed for ${minutes} minutes.`);
  };

  const handleNotificationCompleteTask = (n: SmartNotification) => {
    if (n.taskId && n.dateStr) {
      handleSetTaskStatus(n.dateStr, n.taskId, 'completed');
    }
    handleDismissNotification(n.id);
    if (activeNotifToast?.id === n.id) setActiveNotifToast(null);
  };

  const handleNotificationReschedule = (n: SmartNotification) => {
    const targetDate = n.dateStr || effectiveTodayDate;
    const task = state.days[targetDate]?.tasks.find((t) => t.id === n.taskId);
    setSelectedDate(targetDate);
    setNotificationsOpen(false);
    if (activeNotifToast?.id === n.id) setActiveNotifToast(null);
    if (task) {
      openEditTaskForDate(targetDate, task);
    } else {
      navigateTo(n.targetSection || 'routine');
    }
  };

  const handleMarkAllNotificationsRead = () => {
    commitStateUpdate((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
    }));
  };

  const handleRequestNotificationPermission = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotificationPermission(perm);
    const currentPrefs = normalizeNotificationPreferences(
      stateRef.current.profile.notificationPreferences,
      stateRef.current.profile.wakeTime,
      stateRef.current.profile.sleepTime
    );
    commitStateUpdate((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        notificationPreferences: {
          ...currentPrefs,
          browserNotificationsEnabled: perm === 'granted',
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    showToast(
      perm === 'granted'
        ? 'Browser notifications enabled.'
        : 'Browser notification permission was not granted.'
    );
  };

  const handleEnableWebPush = async () => {
    if (!vapidStatus.configured || !vapidStatus.publicKey) {
      showToast('Server VAPID keys are required for background Web Push.');
      return;
    }
    try {
      const currentPrefs = normalizeNotificationPreferences(
        stateRef.current.profile.notificationPreferences,
        stateRef.current.profile.wakeTime,
        stateRef.current.profile.sleepTime
      );
      const subRecord = await subscribeDeviceWebPush(
        vapidStatus.publicKey,
        currentPrefs.timezone
      );
      setNotificationPermission(getBrowserNotificationPermission());
      commitStateUpdate((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          notificationPreferences: {
            ...currentPrefs,
            browserNotificationsEnabled: true,
            webPushEnabled: true,
            updatedAt: new Date().toISOString(),
          },
        },
        pushSubscriptions: [
          ...(prev.pushSubscriptions || []).filter((s) => s.id !== subRecord.id),
          subRecord,
        ],
      }));
      showToast('Web Push enabled for this device.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to enable Web Push.');
    }
  };

  const handleDisableWebPush = async () => {
    await unsubscribeDeviceWebPush();
    const currentPrefs = normalizeNotificationPreferences(
      stateRef.current.profile.notificationPreferences,
      stateRef.current.profile.wakeTime,
      stateRef.current.profile.sleepTime
    );
    commitStateUpdate((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        notificationPreferences: {
          ...currentPrefs,
          webPushEnabled: false,
          updatedAt: new Date().toISOString(),
        },
      },
      pushSubscriptions: [],
    }));
    showToast('Web Push disabled.');
  };

  const handleSendTestNotification = async () => {
    const nowIso = new Date().toISOString();
    const testNotif: SmartNotification = {
      id: createId('test_notif'),
      dedupeKey: `test_${Date.now()}`,
      type: 'upcoming_activity',
      title: 'Test Smart Timetable Alert',
      body: 'In-app, snooze, and completion controls are working properly.',
      createdAt: nowIso,
      dateStr: now.dateStr,
      read: false,
      deliveredChannels: ['in_app'],
      targetSection: 'dashboard',
    };
    commitStateUpdate((prev) => ({
      ...prev,
      notifications: [testNotif, ...(prev.notifications || [])].slice(0, 60),
    }));
    setActiveNotifToast(testNotif);

    if (getBrowserNotificationPermission() === 'granted') {
      await showBrowserNotification({
        title: testNotif.title,
        body: testNotif.body,
        tag: testNotif.dedupeKey,
      });
    }
    const firstSub = stateRef.current.pushSubscriptions?.[0];
    if (vapidStatus.configured && firstSub) {
      await triggerServerTestPush(firstSub, {
        title: testNotif.title,
        body: testNotif.body,
      });
    }
  };

  const navigateTo = (section: NavSection, subTab?: 'goals' | 'projects') => {
    setActiveSection(section);
    if (section === 'goals' && subTab) {
      setGoalsSubTab(subTab);
    }
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
  };

  const renderSyncBadge = () => {
    if (syncStatus === 'syncing') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-accent whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="hidden xl:inline">Saving...</span>
        </span>
      );
    }
    if (syncStatus === 'offline') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-gold whitespace-nowrap">
          <CloudOff className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Offline</span>
        </span>
      );
    }
    if (syncStatus === 'error') {
      return (
        <button
          type="button"
          onClick={() => {
            setSyncStatus('syncing');
            writeFullAppStateToFirestore(authUser.uid, stateRef.current)
              .then(() => {
                setSyncStatus('synced');
                setSyncErrorMsg('');
              })
              .catch((err) => {
                setSyncStatus('error');
                setSyncErrorMsg(err instanceof Error ? err.message : 'Sync failed.');
              });
          }}
          title={syncErrorMsg || 'Retry sync'}
          className="inline-flex items-center gap-1.5 text-xs text-rose-muted hover:opacity-80 whitespace-nowrap"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Retry</span>
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-accent whitespace-nowrap">
        <Cloud className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Saved</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-app text-main flex overflow-x-clip">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--overlay-backdrop)] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Collapsible Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-card border-r border-subtle flex flex-col transition-all duration-200 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${sidebarCollapsed ? 'lg:w-[74px]' : 'w-[250px]'}`}
      >
        {/* Brand Block */}
        <div className="h-16 px-4 border-b border-subtle flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gold-soft border border-gold-border flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-gold"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <polygon points="12 3 20 8.5 20 15.5 12 21 4 15.5 4 8.5 12 3" />
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-main truncate">
                  PROJECT REBUILD ME
                </p>
                <p className="text-[11px] text-muted truncate font-mono tabular-nums">
                  Day {todayDay?.dayNumber ?? 1} of 30
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="hidden lg:inline-flex p-2 text-muted hover:text-main hover:bg-surface rounded-lg transition-colors shrink-0"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-2 text-muted hover:text-main"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-gold-soft text-gold border border-gold-border'
                    : 'text-muted hover:text-main hover:bg-surface border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-gold' : ''
                  }`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Authenticated User Footer */}
        <div className="p-3 border-t border-subtle">
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2.5 min-w-0">
                {authUser.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt={state.profile.name}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover border border-subtle shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gold-soft border border-gold-border flex items-center justify-center text-xs font-semibold text-gold shrink-0">
                    {(state.profile.name || 'S').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-main truncate">
                    {state.profile.name}
                  </p>
                  <p className="text-[11px] text-muted truncate">
                    {authUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                aria-label="Sign Out"
                className="p-1.5 text-muted hover:text-main hover:bg-surface rounded-lg shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className="w-full flex justify-center p-2 text-muted hover:text-main rounded-lg hover:bg-surface"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar: Logo Left · Primary Nav Center · Actions + Theme + Profile Right */}
        <header className="h-16 sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-subtle px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Mobile Drawer Button + Logo */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-2 text-muted hover:text-main bg-surface rounded-xl"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateTo('dashboard')}
              className="flex items-center gap-2.5 min-w-0 text-left"
            >
              <span className="lg:hidden w-7 h-7 rounded-lg bg-gold-soft border border-gold-border flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-gold"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <polygon points="12 3 20 8.5 20 15.5 12 21 4 15.5 4 8.5 12 3" />
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-main truncate hidden sm:inline">
                Project Rebuild Me
              </span>
            </button>
          </div>

          {/* Center: Top Navigation Links */}
          <nav
            aria-label="Top Navigation"
            className="hidden md:flex items-center gap-1 p-1 bg-surface border border-subtle rounded-xl"
          >
            {[
              {
                label: 'Overview',
                active: activeSection === 'dashboard',
                onClick: () => navigateTo('dashboard'),
              },
              {
                label: 'Planner',
                active: activeSection === 'planner',
                onClick: () => navigateTo('planner'),
              },
              {
                label: 'Projects',
                active: activeSection === 'goals' && goalsSubTab === 'projects',
                onClick: () => navigateTo('goals', 'projects'),
              },
              {
                label: 'Goals',
                active: activeSection === 'goals' && goalsSubTab === 'goals',
                onClick: () => navigateTo('goals', 'goals'),
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  item.active
                    ? 'bg-card text-gold border border-gold-border shadow-xs dark:shadow-none'
                    : 'text-muted hover:text-main border border-transparent'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right: Sync + Add Task + Notifications + Settings + Theme Toggle + User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {toastMessage && (
              <span className="hidden xl:inline-flex items-center gap-1.5 text-xs text-slate-accent">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {toastMessage}
              </span>
            )}
            <span className="hidden sm:inline-flex">{renderSyncBadge()}</span>

            <button
              type="button"
              onClick={() => openAddTaskForDate(effectiveDashboardDate, false)}
              aria-label="Add Task"
              className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Add Task</span>
            </button>

            {/* Notifications Dropdown */}
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((o) => !o);
                  setProfileMenuOpen(false);
                }}
                aria-label="Notifications"
                className="relative min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-[36px] inline-flex items-center justify-center p-2 text-muted hover:text-main bg-surface border border-subtle rounded-xl transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gold text-on-gold text-[10px] font-bold flex items-center justify-center font-mono tabular-nums">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-1.5rem)] bg-card border border-subtle rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-subtle flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-main block">
                        Smart Notifications
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-muted">
                        {unreadNotificationCount} unread · {visibleNotifications.length} active
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadNotificationCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllNotificationsRead}
                          className="text-[11px] font-medium text-gold hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigateTo('settings')}
                        className="text-[11px] text-muted hover:text-main"
                      >
                        Settings
                      </button>
                    </div>
                  </div>

                  {visibleNotifications.length === 0 ? (
                    <p className="p-4 text-xs text-muted">
                      All caught up. Upcoming reminders and deadline alerts will appear here according to your timing settings.
                    </p>
                  ) : (
                    <div className="divide-y divide-subtle max-h-96 overflow-y-auto">
                      {visibleNotifications.map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 space-y-2 ${
                            !n.read ? 'bg-gold-soft/30' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                commitStateUpdate((prev) => ({
                                  ...prev,
                                  notifications: (prev.notifications || []).map((x) =>
                                    x.id === n.id ? { ...x, read: true } : x
                                  ),
                                }));
                                if (n.dateStr && state.days[n.dateStr]) setSelectedDate(n.dateStr);
                                navigateTo(n.targetSection || 'dashboard');
                              }}
                              className="text-left min-w-0 flex-1"
                            >
                              <p className="text-xs font-semibold text-main">{n.title}</p>
                              <p className="text-[11px] text-muted mt-0.5">{n.body}</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissNotification(n.id)}
                              className="p-1 text-muted hover:text-main shrink-0"
                              aria-label="Dismiss notification"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {n.taskId && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    applyNotificationAction({
                                      action: 'start',
                                      taskId: n.taskId,
                                      dateStr: n.dateStr,
                                      notificationId: n.id,
                                    });
                                    setNotificationsOpen(false);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gold text-on-gold text-[10px] font-semibold"
                                >
                                  <Play className="w-2.5 h-2.5 fill-current" />
                                  Start
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNotificationCompleteTask(n)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-soft border border-slate-border text-slate-accent text-[10px] font-semibold"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                  Mark Done
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSnoozeNotification(n, 10)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface border border-subtle text-muted hover:text-main text-[10px]"
                                >
                                  <AlarmClock className="w-2.5 h-2.5" />
                                  Snooze 10m
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNotificationReschedule(n)}
                                  className="px-2 py-1 rounded-md bg-surface border border-subtle text-muted hover:text-main text-[10px]"
                                >
                                  Reschedule
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Settings Icon Button */}
            <button
              type="button"
              onClick={() => navigateTo('settings')}
              aria-label="Settings"
              title="Settings"
              className={`min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-[36px] inline-flex items-center justify-center p-2 rounded-xl border transition-colors ${
                activeSection === 'settings'
                  ? 'bg-gold-soft border-gold-border text-gold'
                  : 'bg-surface border-subtle text-muted hover:text-main'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Theme Selector immediately beside User Profile */}
            <ThemeToggle variant="dropdown" />

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((o) => !o);
                  setNotificationsOpen(false);
                }}
                aria-label="User profile menu"
                className="min-h-[40px] sm:min-h-[36px] flex items-center gap-2 px-1.5 sm:pr-2 py-1 bg-surface border border-subtle hover:border-gold-border rounded-xl transition-colors"
              >
                {authUser.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt={state.profile.name}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gold-soft text-gold flex items-center justify-center text-[11px] font-semibold">
                    {(state.profile.name || 'S').charAt(0).toUpperCase()}
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-muted hidden sm:block" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-card border border-subtle rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-subtle">
                    <p className="text-xs font-semibold text-main truncate">
                      {state.profile.name}
                    </p>
                    <p className="text-[11px] text-muted truncate mt-0.5">
                      {authUser.email}
                    </p>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => navigateTo('coach')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-main hover:bg-surface rounded-lg text-left"
                    >
                      <Bot className="w-3.5 h-3.5 text-gold" />
                      AI Life Coach
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTo('settings')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-main hover:bg-surface rounded-lg text-left"
                    >
                      <Settings className="w-3.5 h-3.5 text-muted" />
                      Profile &amp; Settings
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-muted hover:bg-rose-soft rounded-lg text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto min-w-0">
          {state.profile.onboardingDraft && (
            <div className="mb-5 p-3.5 rounded-xl bg-gold-soft border border-gold-border flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-main">
                You have an unfinished personalized timetable setup draft.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOnboardingMode('onboarding');
                  setTimetableBuilderOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg"
              >
                Finish Setup
              </button>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <DashboardView
              state={state}
              viewedDay={viewedDashboardDay}
              viewedDate={effectiveDashboardDate}
              todayDateStr={effectiveTodayDate}
              now={now}
              onSelectDate={setSelectedDate}
              onToggleTaskStatus={handleToggleTaskStatus}
              onQuickAddTask={() => openAddTaskForDate(effectiveDashboardDate, false)}
              onQuickAddHabit={() => {
                setActiveSection('habits');
                setHabitAddModalOpen(true);
              }}
              onNavigate={navigateTo}
              onOpenCoachWithPrompt={(prompt) => {
                setCoachInitialPrompt(prompt);
                navigateTo('coach');
              }}
              onDuplicateYesterday={handleDuplicateYesterday}
              onStartNewPlan={() => setNewPlanConfirmOpen(true)}
              onOpenDailyReview={() => setDailyReviewOpen(true)}
              onOpenSmartPlan={() => handleOpenSmartPlan()}
              onEditTask={(task) => openEditTaskForDate(effectiveDashboardDate, task)}
              onDeduplicateDayTasks={handleDeduplicateDayTasks}
              onAddFocusSession={handleAddFocusSession}
              onUpdateDashboardPreferences={handleUpdateDashboardPreferences}
            />
          )}

          {activeSection === 'routine' && (
            <DailyRoutineView
              state={state}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              now={now}
              onToggleTaskStatus={handleToggleTaskStatus}
              onSetTaskStatus={handleSetTaskStatus}
              onOpenAddTask={(isBreak) => openAddTaskForDate(selectedDate, Boolean(isBreak))}
              onOpenEditTask={(task) => openEditTaskForDate(selectedDate, task)}
              onDeleteTask={(task) => handleDeleteTask(selectedDate, task)}
              onOpenSmartPlan={() => handleOpenSmartPlan()}
              onOpenTimetableBuilder={() => {
                setOnboardingMode('builder');
                setTimetableBuilderOpen(true);
              }}
            />
          )}

          {activeSection === 'planner' && (
            <Planner30DayView
              state={state}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              now={now}
              onToggleTaskStatus={handleToggleTaskStatus}
              onSetTaskStatus={handleSetTaskStatus}
              onOpenAddTask={() => openAddTaskForDate(selectedDate, false)}
              onOpenEditTask={(task) => openEditTaskForDate(selectedDate, task)}
              onDeleteTask={(task) => handleDeleteTask(selectedDate, task)}
              onApplyScheduleType={(dateStr, type) => {
                commitStateUpdate((prev) => applyScheduleTypeToDay(prev, dateStr, type, true));
                showToast(`Applied ${type} template to Day ${state.days[dateStr]?.dayNumber}.`);
              }}
              onDuplicateDayIntoSelected={(sourceDate) =>
                handleDuplicateDayInto(sourceDate, selectedDate)
              }
              onReset30DayPlan={handleStartNew30DayPlan}
              onOpenSmartPlan={() => handleOpenSmartPlan()}
            />
          )}

          {activeSection === 'habits' && (
            <HabitTrackerView
              state={state}
              now={now}
              onToggleHabitDay={handleToggleHabitDay}
              onAddHabit={(habit: Habit) => {
                commitStateUpdate((prev) => ({ ...prev, habits: [...prev.habits, habit] }));
                showToast(`Habit "${habit.title}" added.`);
              }}
              onUpdateHabit={(habit: Habit) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  habits: prev.habits.map((h) => (h.id === habit.id ? habit : h)),
                }));
                showToast(`Habit "${habit.title}" updated.`);
              }}
              onDeleteHabit={(habitId: string) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  habits: prev.habits.filter((h) => h.id !== habitId),
                }));
                showToast('Habit deleted.');
              }}
              addModalOpen={habitAddModalOpen}
              onSetAddModalOpen={setHabitAddModalOpen}
            />
          )}

          {activeSection === 'goals' && (
            <GoalsProjectsView
              state={state}
              now={now}
              initialTab={goalsSubTab}
              onTabChange={setGoalsSubTab}
              onAddGoal={(goal: Goal) => {
                commitStateUpdate((prev) => ({ ...prev, goals: [...prev.goals, goal] }));
                showToast('Goal created.');
              }}
              onUpdateGoal={(goal: Goal) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  goals: prev.goals.map((g) => (g.id === goal.id ? goal : g)),
                }));
              }}
              onDeleteGoal={(goalId: string) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  goals: prev.goals.filter((g) => g.id !== goalId),
                }));
                showToast('Goal deleted.');
              }}
              onAddProject={(project: Project) => {
                commitStateUpdate((prev) => ({ ...prev, projects: [...prev.projects, project] }));
                showToast('Project created.');
              }}
              onUpdateProject={(project: Project) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  projects: prev.projects.map((p) => (p.id === project.id ? project : p)),
                }));
              }}
              onDeleteProject={(projectId: string) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  projects: prev.projects.filter((p) => p.id !== projectId),
                }));
                showToast('Project deleted.');
              }}
            />
          )}

          {activeSection === 'analytics' && <AnalyticsView state={state} now={now} />}

          {activeSection === 'review' && (
            <WeeklyReviewView
              state={state}
              now={now}
              onSaveWeeklyReview={(review: WeeklyReview) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  weeklyReviews: prev.weeklyReviews.map((r) =>
                    r.weekNumber === review.weekNumber ? review : r
                  ),
                }));
              }}
              onSchedulePriorityInNextWeek={handleSchedulePriorityInNextWeek}
              onNavigate={navigateTo}
            />
          )}

          {activeSection === 'coach' && (
            <AICoachView
              state={state}
              now={now}
              onSaveConversations={(convs: CoachConversation[]) => {
                commitStateUpdate((prev) => ({
                  ...prev,
                  coachConversations: convs,
                }));
              }}
              onApplyProposedChanges={handleApplyProposedChanges}
              onApplyGoalAction={handleApplyGoalAction}
              onOpenSmartPlan={() => handleOpenSmartPlan()}
              initialPrompt={coachInitialPrompt}
              onConsumeInitialPrompt={() => setCoachInitialPrompt(null)}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              state={state}
              userEmail={authUser.email || ''}
              userPhotoUrl={authUser.photoURL || undefined}
              syncStatus={syncStatus}
              lastSyncedAt={lastSyncedAt}
              onLogout={handleLogout}
              onUpdateProfile={(patch) =>
                commitStateUpdate((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, ...patch },
                }))
              }
              onUpdateTemplate={(type: ScheduleType, tasks: TemplateTask[]) =>
                commitStateUpdate((prev) => ({
                  ...prev,
                  templates: {
                    ...prev.templates,
                    [type]: tasks,
                  },
                }))
              }
              onReapplyTemplatesToFuture={() => {
                commitStateUpdate((prev) => {
                  const updatedDays = { ...prev.days };
                  for (const [dStr, day] of Object.entries(updatedDays)) {
                    if (dStr >= now.dateStr) {
                      const tpl = prev.templates[day.scheduleType] || prev.templates.normal;
                      const fresh = instantiateTasksFromTemplate(
                        tpl,
                        dStr,
                        prev.profile.fixedCommitments
                      );
                      const completedTitles = new Set(
                        day.tasks
                          .filter((t) => t.status === 'completed')
                          .map((t) => t.title)
                      );
                      updatedDays[dStr] = {
                        ...day,
                        tasks: fresh.map((t) =>
                          completedTitles.has(t.title)
                            ? { ...t, status: 'completed' }
                            : t
                        ),
                      };
                    }
                  }
                  return { ...prev, days: updatedDays };
                });
              }}
              onOpenTimetableBuilder={() => {
                setOnboardingMode('builder');
                setTimetableBuilderOpen(true);
              }}
              onRerunOnboarding={() =>
                commitStateUpdate((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, onboardingCompleted: false },
                }))
              }
              notificationPermission={notificationPermission}
              vapidStatus={vapidStatus}
              onRequestNotificationPermission={handleRequestNotificationPermission}
              onEnableWebPush={handleEnableWebPush}
              onDisableWebPush={handleDisableWebPush}
              onSendTestNotification={handleSendTestNotification}
              onExportJson={() => {
                const json = storageRepo.exportBackupJson(state, authUser.uid);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `project-rebuild-me-backup-${now.dateStr}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Timestamped JSON backup downloaded.');
              }}
              onImportValidatedState={(restored: AppState) => {
                const merged: AppState = {
                  ...restored,
                  profile: {
                    ...restored.profile,
                    email: authUser.email || restored.profile.email || '',
                    photoUrl: authUser.photoURL || restored.profile.photoUrl || '',
                    onboardingCompleted: true,
                  },
                };
                setState(merged);
                stateRef.current = merged;
                setSyncStatus('syncing');
                writeFullAppStateToFirestore(authUser.uid, merged)
                  .then(() => {
                    setSyncStatus('synced');
                    setLastSyncedAt(new Date().toISOString());
                    showToast('Backup restored to Cloud Firestore.');
                  })
                  .catch((err) => {
                    setSyncStatus('error');
                    setSyncErrorMsg(err instanceof Error ? err.message : 'Restore failed.');
                  });
                const firstOrToday = getCurrentChallengeDay(merged, now.dateStr);
                if (firstOrToday) setSelectedDate(firstOrToday.date);
              }}
              onResetAllData={() => {
                const fresh = createInitialAppState({
                  startDate: now.dateStr,
                  name: authUser.displayName || state.profile.name,
                  onboardingCompleted: false,
                });
                const resetState: AppState = {
                  ...fresh,
                  profile: {
                    ...fresh.profile,
                    email: authUser.email || '',
                    photoUrl: authUser.photoURL || '',
                  },
                  habits: createStarterHabits(now.dateStr),
                  goals: createStarterGoals(now.dateStr),
                  projects: createStarterProjects(now.dateStr),
                };
                setState(resetState);
                stateRef.current = resetState;
                writeFullAppStateToFirestore(authUser.uid, resetState);
              }}
            />
          )}
        </main>
      </div>

      {/* Shared Task Modal */}
      <TaskModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        existingTasksOnDay={state.days[taskTargetDate]?.tasks ?? []}
        goals={state.goals}
        initialTask={editingTask}
        defaultIsBreak={taskModalBreakDefault}
        showScopeSelector={true}
        onSave={handleSaveTask}
      />

      {/* Daily Review Modal */}
      <DailyReviewModal
        open={dailyReviewOpen}
        onClose={() => setDailyReviewOpen(false)}
        day={todayDay}
        onSave={handleSaveDailyReview}
      />

      {/* Interactive Smart Plan Modal */}
      <SmartPlanModal
        open={smartPlanOpen}
        onClose={() => setSmartPlanOpen(false)}
        targetDate={smartPlanTargetDate}
        summaryNote={smartPlanSummary}
        proposals={smartPlanProposals}
        diagnostics={smartPlanDiagnostics}
        existingTasksOnTargetDay={state.days[smartPlanTargetDate]?.tasks ?? []}
        loadingAiEnrichment={smartPlanEnriching}
        onApplyAccepted={handleApplyProposedChanges}
      />

      {/* localStorage Migration Modal */}
      <MigrationModal
        open={migrationOpen}
        localData={localCandidate}
        migrating={migrating}
        error={migrationError}
        onMigrate={handleMigrateLocalToCloud}
        onSkipKeepCloud={handleSkipMigration}
      />

      {/* Interactive Floating Notification Toast */}
      {activeNotifToast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 w-88 max-w-[calc(100vw-2rem)] bg-card border border-gold-border rounded-2xl shadow-2xl p-4 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-gold-soft border border-gold-border text-gold shrink-0">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-main truncate">
                  {activeNotifToast.title}
                </p>
                <p className="text-[11px] text-muted mt-0.5">
                  {activeNotifToast.body}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveNotifToast(null)}
              className="p-1 text-muted hover:text-main shrink-0"
              aria-label="Close notification popup"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {activeNotifToast.taskId ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    applyNotificationAction({
                      action: 'start',
                      taskId: activeNotifToast.taskId,
                      dateStr: activeNotifToast.dateStr,
                      notificationId: activeNotifToast.id,
                    });
                    setActiveNotifToast(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold text-on-gold text-[11px] font-semibold"
                >
                  <Play className="w-3 h-3 fill-current" />
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => handleNotificationCompleteTask(activeNotifToast)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-soft border border-slate-border text-slate-accent text-[11px] font-semibold"
                >
                  <Check className="w-3 h-3" />
                  Mark Done
                </button>
                <button
                  type="button"
                  onClick={() => handleSnoozeNotification(activeNotifToast, 10)}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-subtle text-[11px] text-muted hover:text-main"
                >
                  Snooze 10m
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  navigateTo(activeNotifToast.targetSection || 'dashboard');
                  setActiveNotifToast(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-gold text-on-gold text-[11px] font-semibold"
              >
                View
              </button>
            )}
          </div>
        </div>
      )}

      {/* Start New 30-Day Plan Confirm Dialog */}
      <ConfirmDialog
        open={newPlanConfirmOpen}
        onClose={() => setNewPlanConfirmOpen(false)}
        onConfirm={handleStartNew30DayPlan}
        title="Start a New 30-Day Plan?"
        message="This resets Day 1 to today's date (Asia/Karachi) and rebuilds the 30-day schedule from your configured templates while keeping your habits, goals, and projects intact."
        confirmLabel="Start Fresh 30 Days"
        danger={false}
      />
    </div>
  );
}
