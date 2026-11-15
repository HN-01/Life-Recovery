import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  ClipboardCheck,
  Copy,
  Edit2,
  FileBarChart2,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import {
  AIDailyReviewReport,
  AIWeeklyPerformanceReport,
  AppState,
  CoachConversation,
  CoachMessage,
  LifeArea,
  ProposedGoalAction,
  ProposedScheduleChange,
  TaskCategory,
  TaskPriority,
} from '../../types';
import { createId, LIFE_AREAS } from '../../data/starterData';
import {
  addDaysToDateStr,
  formatDisplayDate,
  formatTime12h,
  getDurationMinutes,
  getEffectiveTaskState,
  KarachiNow,
} from '../../utils/dateUtils';
import {
  computeAnalytics,
  computeDayStats,
  computeHabitStreak,
  getSortedDays,
} from '../../utils/metrics';
import { computeAttentionQuality, computeDeepWorkMetrics } from '../../utils/focusMetrics';
import {
  fetchCoachWithRetry,
  RetryStatusUpdate,
  UNAVAILABLE_FINAL_MESSAGE,
} from '../../utils/aiRetry';
import { CoachMessageContent } from '../ui/CoachMessageContent';

interface AICoachViewProps {
  state: AppState;
  now: KarachiNow;
  onSaveConversations: (conversations: CoachConversation[]) => void;
  onApplyProposedChanges: (changes: ProposedScheduleChange[]) => void;
  onApplyGoalAction?: (action: ProposedGoalAction) => void;
  onOpenSmartPlan: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

interface FailedChatAttempt {
  convId: string;
  userMsgId: string;
  promptText: string;
  historyBeforeUserMsg: Array<{ role: 'user' | 'assistant'; content: string }>;
  replaceAssistantMsgId?: string;
}

const SUGGESTED_QUESTIONS = [
  'How productive was I this week?',
  'Which habits am I consistently missing?',
  'Why am I falling behind my routine?',
  'Which tasks should I prioritize tomorrow?',
  'Am I spending enough time on programming?',
  'Break down my top goal into weekly milestones.',
  'How has my focus quality & deep work trended this month?',
  'Explain active recall + spaced repetition for my university exams.',
];

function buildContextSnapshot(state: AppState, now: KarachiNow) {
  const sortedDays = getSortedDays(state);
  const todayDay = state.days[now.dateStr];
  const tomorrowStr = addDaysToDateStr(now.dateStr, 1);
  const tomorrowDay = state.days[tomorrowStr];
  const last7Start = addDaysToDateStr(now.dateStr, -6);
  const last30Start = addDaysToDateStr(now.dateStr, -29);
  const weekAnalytics = computeAnalytics(state, now, last7Start, now.dateStr);
  const monthAnalytics = computeAnalytics(state, now, last30Start, now.dateStr);
  const todayStats = computeDayStats(todayDay, now);
  const todayFocus = computeDeepWorkMetrics(todayDay?.focusSessions || []);
  const todayAttention = computeAttentionQuality(todayDay?.focusSessions || []);

  const recentDaysSummary = sortedDays
    .filter((d) => d.date >= last7Start && d.date <= now.dateStr)
    .map((d) => {
      const s = computeDayStats(d, now);
      const dw = computeDeepWorkMetrics(d.focusSessions || []);
      return {
        date: d.date,
        dayNumber: d.dayNumber,
        scheduleType: d.scheduleType,
        completionRate: s.completionRate,
        completed: s.completed,
        missed: s.missed,
        pending: s.pending,
        deepWorkMinutes: Math.round(dw.totalSeconds / 60),
        missedTitles: d.tasks
          .filter((t) => getEffectiveTaskState(t, d.date, now) === 'missed')
          .map((t) => `${t.title} (${t.startTime}-${t.endTime})`),
      };
    });

  return {
    currentKarachiDate: now.dateStr,
    currentKarachiTime: now.timeStr,
    profile: {
      name: state.profile.name,
      wakeTime: state.profile.wakeTime,
      sleepTime: state.profile.sleepTime,
      primaryGoalAreas: state.profile.primaryGoalAreas,
      fixedCommitments: state.profile.fixedCommitments,
      schedulingPreferences: state.profile.schedulingPreferences,
    },
    today: {
      date: todayDay?.date ?? now.dateStr,
      dayNumber: todayDay?.dayNumber ?? 1,
      stats: todayStats,
      focusMetrics: {
        deepWorkFormatted: todayFocus.formattedDuration,
        sessionsCount: todayFocus.totalSessions,
        attentionQualityAvailable: todayAttention.available,
        attentionQualityScore: todayAttention.score,
      },
      tasks: (todayDay?.tasks || []).map((t) => ({
        title: t.title,
        startTime: t.startTime,
        endTime: t.endTime,
        category: t.category,
        priority: t.priority,
        effectiveState: todayDay ? getEffectiveTaskState(t, todayDay.date, now) : 'pending',
      })),
    },
    tomorrow: {
      date: tomorrowStr,
      tasks: (tomorrowDay?.tasks || []).map((t) => ({
        title: t.title,
        startTime: t.startTime,
        endTime: t.endTime,
        category: t.category,
        priority: t.priority,
      })),
    },
    last7DaysAnalytics: {
      weeklyCompletionPct: weekAnalytics.weeklyCompletion,
      habitConsistencyPct: weekAnalytics.habitConsistency,
      plannedHours: weekAnalytics.plannedHours,
      completedHours: weekAnalytics.completedHours,
      categoryDistribution: weekAnalytics.categoryDistribution,
      frequentlyMissedTasks: weekAnalytics.frequentlyMissedTasks,
    },
    last30DaysAnalytics: {
      monthlyCompletionPct: monthAnalytics.monthlyCompletion,
      dailyAvgCompletionPct: monthAnalytics.dailyAvgCompletion,
      habitConsistencyPct: monthAnalytics.habitConsistency,
      plannedHours: monthAnalytics.plannedHours,
      completedHours: monthAnalytics.completedHours,
      topCategories: monthAnalytics.categoryDistribution.slice(0, 5),
      frequentlyMissedTasks: monthAnalytics.frequentlyMissedTasks,
    },
    recentDaysSummary,
    habits: state.habits.map((h) => ({
      title: h.title,
      category: h.category,
      targetPerWeek: h.targetPerWeek,
      streakDays: computeHabitStreak(h, now.dateStr),
      doneToday: Boolean(h.logs[now.dateStr]),
      recent7DayHits: Array.from({ length: 7 }, (_, i) =>
        h.logs[addDaysToDateStr(now.dateStr, -i)] ? 1 : 0
      ).reduce((a: number, b: number) => a + b, 0),
    })),
    goals: state.goals.map((g) => ({
      area: g.area,
      title: g.title,
      deadline: g.deadline,
      status: g.status,
      milestonesDone: g.milestones.filter((m) => m.completed).length,
      milestonesTotal: g.milestones.length,
    })),
    projects: state.projects.map((p) => ({
      title: p.title,
      type: p.type,
      status: p.status,
      deadline: p.deadline,
      tasksDone: p.tasks.filter((t) => t.completed).length,
      tasksTotal: p.tasks.length,
    })),
    weeklyReviews: state.weeklyReviews
      .filter((w) => w.accomplished || w.distractions || w.needsImprovement)
      .map((w) => ({
        weekNumber: w.weekNumber,
        accomplished: w.accomplished,
        distractions: w.distractions,
        needsImprovement: w.needsImprovement,
      })),
    recentConversationTopics: (state.coachConversations || [])
      .slice(0, 5)
      .map((c) => ({ title: c.title, updatedAt: c.updatedAt })),
  };
}

export function AICoachView({
  state,
  now,
  onSaveConversations,
  onApplyProposedChanges,
  onApplyGoalAction,
  onOpenSmartPlan,
  initialPrompt,
  onConsumeInitialPrompt,
}: AICoachViewProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'daily' | 'weekly'>('chat');
  const conversations = state.coachConversations || [];
  const conversationsRef = useRef<CoachConversation[]>(conversations);
  conversationsRef.current = conversations;

  const [selectedConvId, setSelectedConvId] = useState<string>(
    () => conversations[0]?.id || ''
  );

  const activeConv =
    conversations.find((c) => c.id === selectedConvId) || conversations[0] || null;

  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatRetryStatus, setChatRetryStatus] = useState<RetryStatusUpdate | null>(null);
  const [chatError, setChatError] = useState('');
  const [failedChatAttempt, setFailedChatAttempt] = useState<FailedChatAttempt | null>(null);

  // Conversation rename state
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Copy feedback state
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Daily Review Report State
  const [dailyReport, setDailyReport] = useState<AIDailyReviewReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyRetryStatus, setDailyRetryStatus] = useState<RetryStatusUpdate | null>(null);
  const [dailyError, setDailyError] = useState('');

  // Weekly Performance Report State
  const [weeklyReport, setWeeklyReport] = useState<AIWeeklyPerformanceReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyRetryStatus, setWeeklyRetryStatus] = useState<RetryStatusUpdate | null>(null);
  const [weeklyError, setWeeklyError] = useState('');

  const [appliedBanner, setAppliedBanner] = useState('');

  const chatInFlightRef = useRef(false);
  const dailyInFlightRef = useRef(false);
  const weeklyInFlightRef = useRef(false);

  const abortControllersRef = useRef<{
    chat?: AbortController;
    daily?: AbortController;
    weekly?: AbortController;
  }>({});

  useEffect(() => {
    return () => {
      abortControllersRef.current.chat?.abort();
      abortControllersRef.current.daily?.abort();
      abortControllersRef.current.weekly?.abort();
    };
  }, []);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setActiveTab('chat');
      setInput(initialPrompt);
      onConsumeInitialPrompt?.();
    }
  }, [initialPrompt, onConsumeInitialPrompt]);

  const contextSnapshot = useMemo(() => buildContextSnapshot(state, now), [state, now]);

  const startNewConversation = () => {
    if (chatInFlightRef.current) return;
    const newConv: CoachConversation = {
      id: createId('conv'),
      title: `Session · ${formatDisplayDate(now.dateStr)}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSaveConversations([newConv, ...conversationsRef.current]);
    setSelectedConvId(newConv.id);
    setChatError('');
    setChatRetryStatus(null);
    setFailedChatAttempt(null);
  };

  const deleteConversation = (convId: string) => {
    if (chatInFlightRef.current) return;
    const remaining = conversationsRef.current.filter((c) => c.id !== convId);
    onSaveConversations(remaining);
    if (selectedConvId === convId) {
      setSelectedConvId(remaining[0]?.id || '');
    }
    if (failedChatAttempt?.convId === convId) {
      setFailedChatAttempt(null);
    }
    if (renamingConvId === convId) {
      setRenamingConvId(null);
    }
  };

  const commitRenameConversation = (convId: string) => {
    const clean = renameDraft.trim();
    setRenamingConvId(null);
    if (!clean) return;
    onSaveConversations(
      conversationsRef.current.map((c) =>
        c.id === convId
          ? { ...c, title: clean.slice(0, 120), updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const clearCurrentConversation = () => {
    if (!activeConv || chatInFlightRef.current) return;
    deleteConversation(activeConv.id);
    setChatError('');
    setChatRetryStatus(null);
  };

  const copyAssistantResponse = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      window.setTimeout(() => {
        setCopiedMsgId((prev) => (prev === msgId ? null : prev));
      }, 2000);
    } catch {
      // Clipboard blocked in restricted browser contexts
    }
  };

  const executeChatRequest = async (params: {
    convId: string;
    userMsgId: string;
    promptText: string;
    historyBeforeUserMsg: Array<{ role: 'user' | 'assistant'; content: string }>;
    withUserConversations: CoachConversation[];
    replaceAssistantMsgId?: string;
  }) => {
    if (chatInFlightRef.current) return;
    chatInFlightRef.current = true;

    const controller = new AbortController();
    abortControllersRef.current.chat = controller;

    setChatError('');
    setChatRetryStatus(null);
    setChatLoading(true);

    try {
      const data = await fetchCoachWithRetry<{
        reply?: string;
        suggestedChanges?: Array<{
          targetDate?: string;
          action?: string;
          title?: string;
          category?: string;
          priority?: string;
          suggestedStartTime?: string;
          suggestedEndTime?: string;
          reason?: string;
        }>;
        suggestedGoalActions?: Array<{
          goalTitle?: string;
          area?: string;
          deadline?: string;
          milestones?: string[];
          reason?: string;
        }>;
        modelUsed?: string;
        usedFallback?: boolean;
        fallbackNotice?: string;
      }>({
        url: '/api/coach/chat',
        signal: controller.signal,
        body: {
          userMessage: params.promptText,
          conversationHistory: [
            ...params.historyBeforeUserMsg,
            { role: 'user', content: params.promptText },
          ],
          contextSnapshot,
        },
        onRetryStatus: (status) => setChatRetryStatus(status),
      });

      const rawSuggestions = Array.isArray(data.suggestedChanges)
        ? data.suggestedChanges
        : [];

      const mappedChanges: ProposedScheduleChange[] = rawSuggestions.map((s) => {
        const st = s.suggestedStartTime || '17:00';
        const et = s.suggestedEndTime || '18:00';
        return {
          id: createId('prop'),
          targetDate: s.targetDate || addDaysToDateStr(now.dateStr, 1),
          action: s.action === 'reschedule' ? 'reschedule' : 'add',
          title: s.title || 'Recommended Focus Block',
          category: (s.category as TaskCategory) || 'Programming',
          priority: (s.priority as TaskPriority) || 'High',
          suggestedStartTime: st,
          suggestedEndTime: et,
          durationMinutes: getDurationMinutes(st, et),
          reason: s.reason || 'Recommended by AI Life Coach.',
          approvalState: 'pending',
        };
      });

      const rawGoalActions = Array.isArray(data.suggestedGoalActions)
        ? data.suggestedGoalActions
        : [];

      const mappedGoalActions: ProposedGoalAction[] = rawGoalActions
        .filter((g) => g.goalTitle && Array.isArray(g.milestones) && g.milestones.length > 0)
        .map((g) => ({
          id: createId('gprop'),
          goalTitle: String(g.goalTitle),
          area: LIFE_AREAS.includes(g.area as LifeArea)
            ? (g.area as LifeArea)
            : 'Academic and technical development',
          deadline: g.deadline || addDaysToDateStr(now.dateStr, 21),
          milestones: (g.milestones || []).map(String),
          reason: g.reason || 'Suggested goal breakdown from AI Life Coach.',
          approvalState: 'pending',
        }));

      const assistantMsg: CoachMessage = {
        id: params.replaceAssistantMsgId || createId('msg'),
        role: 'assistant',
        content: data.reply || 'No response generated.',
        createdAt: new Date().toISOString(),
        suggestedChanges: mappedChanges.length > 0 ? mappedChanges : undefined,
        suggestedGoalActions: mappedGoalActions.length > 0 ? mappedGoalActions : undefined,
        modelUsed: data.modelUsed,
        usedFallback: Boolean(data.usedFallback),
        fallbackNotice: data.fallbackNotice,
      };

      const latestConversations =
        conversationsRef.current.length > 0
          ? conversationsRef.current
          : params.withUserConversations;
      const target =
        latestConversations.find((c) => c.id === params.convId) ||
        params.withUserConversations.find((c) => c.id === params.convId);

      if (target) {
        const nextMessages = params.replaceAssistantMsgId
          ? target.messages.map((m) =>
              m.id === params.replaceAssistantMsgId ? assistantMsg : m
            )
          : [...target.messages, assistantMsg];

        const finalConv: CoachConversation = {
          ...target,
          messages: nextMessages,
          updatedAt: new Date().toISOString(),
        };
        onSaveConversations(
          latestConversations.map((c) => (c.id === finalConv.id ? finalConv : c))
        );
      }

      setFailedChatAttempt(null);
      setInput((prev) => (prev.trim() === params.promptText ? '' : prev));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : UNAVAILABLE_FINAL_MESSAGE;
      setChatError(message);
      setFailedChatAttempt({
        convId: params.convId,
        userMsgId: params.userMsgId,
        promptText: params.promptText,
        historyBeforeUserMsg: params.historyBeforeUserMsg,
        replaceAssistantMsgId: params.replaceAssistantMsgId,
      });
      if (!params.replaceAssistantMsgId) {
        setInput((prev) => (prev.trim() ? prev : params.promptText));
      }
    } finally {
      chatInFlightRef.current = false;
      setChatRetryStatus(null);
      setChatLoading(false);
    }
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || chatInFlightRef.current) return;

    if (
      failedChatAttempt &&
      activeConv &&
      failedChatAttempt.convId === activeConv.id &&
      failedChatAttempt.promptText === trimmed
    ) {
      await executeChatRequest({
        ...failedChatAttempt,
        withUserConversations: conversationsRef.current,
      });
      return;
    }

    setInput('');
    setFailedChatAttempt(null);

    let targetConv = activeConv;
    let nextConversations = [...conversationsRef.current];

    if (!targetConv) {
      targetConv = {
        id: createId('conv'),
        title: trimmed.slice(0, 48),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      nextConversations = [targetConv, ...nextConversations];
      setSelectedConvId(targetConv.id);
    }

    const historyBeforeUserMsg = targetConv.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const userMsg: CoachMessage = {
      id: createId('msg'),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const withUserConv: CoachConversation = {
      ...targetConv,
      title: targetConv.messages.length === 0 ? trimmed.slice(0, 48) : targetConv.title,
      messages: [...targetConv.messages, userMsg],
      updatedAt: new Date().toISOString(),
    };

    nextConversations = nextConversations.map((c) =>
      c.id === withUserConv.id ? withUserConv : c
    );
    onSaveConversations(nextConversations);

    await executeChatRequest({
      convId: withUserConv.id,
      userMsgId: userMsg.id,
      promptText: trimmed,
      historyBeforeUserMsg,
      withUserConversations: nextConversations,
    });
  };

  const regenerateAssistantMessage = async (assistantMsgId: string) => {
    if (!activeConv || chatInFlightRef.current) return;
    const idx = activeConv.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0) return;

    // Find preceding user message
    let userMsgIndex = idx - 1;
    while (userMsgIndex >= 0 && activeConv.messages[userMsgIndex].role !== 'user') {
      userMsgIndex--;
    }
    if (userMsgIndex < 0) return;

    const userMsg = activeConv.messages[userMsgIndex];
    const historyBeforeUserMsg = activeConv.messages.slice(0, userMsgIndex).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await executeChatRequest({
      convId: activeConv.id,
      userMsgId: userMsg.id,
      promptText: userMsg.content,
      historyBeforeUserMsg,
      withUserConversations: conversationsRef.current,
      replaceAssistantMsgId: assistantMsgId,
    });
  };

  const retryLastChat = async () => {
    if (!failedChatAttempt || chatInFlightRef.current) return;
    await executeChatRequest({
      ...failedChatAttempt,
      withUserConversations: conversationsRef.current,
    });
  };

  const approveSingleProposal = (
    convId: string,
    msgId: string,
    proposal: ProposedScheduleChange
  ) => {
    onApplyProposedChanges([{ ...proposal, approvalState: 'accepted' }]);
    const updated = conversationsRef.current.map((c) => {
      if (c.id !== convId) return c;
      return {
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== msgId || !m.suggestedChanges) return m;
          return {
            ...m,
            suggestedChanges: m.suggestedChanges.map((sc) =>
              sc.id === proposal.id ? { ...sc, approvalState: 'accepted' as const } : sc
            ),
          };
        }),
      };
    });
    onSaveConversations(updated);
    setAppliedBanner(
      `Applied "${proposal.title}" to ${formatDisplayDate(proposal.targetDate)}.`
    );
    window.setTimeout(() => setAppliedBanner(''), 3500);
  };

  const approveGoalAction = (
    convId: string,
    msgId: string,
    goalAction: ProposedGoalAction
  ) => {
    if (!onApplyGoalAction) return;
    onApplyGoalAction({ ...goalAction, approvalState: 'accepted' });
    const updated = conversationsRef.current.map((c) => {
      if (c.id !== convId) return c;
      return {
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== msgId || !m.suggestedGoalActions) return m;
          return {
            ...m,
            suggestedGoalActions: m.suggestedGoalActions.map((ga) =>
              ga.id === goalAction.id ? { ...ga, approvalState: 'accepted' as const } : ga
            ),
          };
        }),
      };
    });
    onSaveConversations(updated);
    setAppliedBanner(`Added goal "${goalAction.goalTitle}" with ${goalAction.milestones.length} milestones.`);
    window.setTimeout(() => setAppliedBanner(''), 3500);
  };

  const generateAIDailyReview = async () => {
    if (dailyInFlightRef.current) return;
    dailyInFlightRef.current = true;

    const controller = new AbortController();
    abortControllersRef.current.daily = controller;

    setDailyError('');
    setDailyRetryStatus(null);
    setDailyLoading(true);

    try {
      const data = await fetchCoachWithRetry<{
        completedSummary?: string;
        missedTasks?: string[];
        plannedVsActual?: string;
        patterns?: string[];
        recommendations?: string[];
        tomorrowPriorities?: string[];
        modelUsed?: string;
        usedFallback?: boolean;
        fallbackNotice?: string;
      }>({
        url: '/api/coach/daily-review',
        signal: controller.signal,
        body: {
          todaySnapshot: contextSnapshot.today,
          recentTrends: contextSnapshot.recentDaysSummary,
        },
        onRetryStatus: (status) => setDailyRetryStatus(status),
      });

      setDailyReport({
        date: now.dateStr,
        completedSummary: data.completedSummary || '',
        missedTasks: Array.isArray(data.missedTasks) ? data.missedTasks : [],
        plannedVsActual: data.plannedVsActual || '',
        patterns: Array.isArray(data.patterns) ? data.patterns : [],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
        tomorrowPriorities: Array.isArray(data.tomorrowPriorities)
          ? data.tomorrowPriorities
          : [],
        generatedAt: new Date().toISOString(),
        modelUsed: data.modelUsed,
        usedFallback: Boolean(data.usedFallback),
        fallbackNotice: data.fallbackNotice,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setDailyError(
        err instanceof Error && err.message.trim()
          ? err.message
          : UNAVAILABLE_FINAL_MESSAGE
      );
    } finally {
      dailyInFlightRef.current = false;
      setDailyRetryStatus(null);
      setDailyLoading(false);
    }
  };

  const generateWeeklyReport = async () => {
    if (weeklyInFlightRef.current) return;
    weeklyInFlightRef.current = true;

    const controller = new AbortController();
    abortControllersRef.current.weekly = controller;

    setWeeklyError('');
    setWeeklyRetryStatus(null);
    setWeeklyLoading(true);

    try {
      const last7Start = addDaysToDateStr(now.dateStr, -6);
      const weekAnalytics = computeAnalytics(state, now, last7Start, now.dateStr);
      const data = await fetchCoachWithRetry<{
        studyProgress?: string;
        exerciseConsistency?: string;
        timeAllocation?: string;
        biggestAchievement?: string;
        biggestWeakness?: string;
        recommendedImprovements?: string[];
        modelUsed?: string;
        usedFallback?: boolean;
        fallbackNotice?: string;
      }>({
        url: '/api/coach/weekly-report',
        signal: controller.signal,
        body: {
          weekMetrics: {
            dateRange: `${last7Start} to ${now.dateStr}`,
            overallCompletionPct: weekAnalytics.weeklyCompletion,
            habitConsistencyPct: weekAnalytics.habitConsistency,
            plannedHours: weekAnalytics.plannedHours,
            completedHours: weekAnalytics.completedHours,
            categoryDistribution: weekAnalytics.categoryDistribution,
            mostConsistentHabits: weekAnalytics.mostConsistentHabits,
            frequentlyMissedTasks: weekAnalytics.frequentlyMissedTasks,
            goals: contextSnapshot.goals,
          },
        },
        onRetryStatus: (status) => setWeeklyRetryStatus(status),
      });

      setWeeklyReport({
        weekLabel: `${formatDisplayDate(last7Start)} – ${formatDisplayDate(now.dateStr)}`,
        overallCompletionPct: weekAnalytics.weeklyCompletion,
        habitConsistencyPct: weekAnalytics.habitConsistency,
        studyProgress: data.studyProgress || '',
        exerciseConsistency: data.exerciseConsistency || '',
        timeAllocation: data.timeAllocation || '',
        biggestAchievement: data.biggestAchievement || '',
        biggestWeakness: data.biggestWeakness || '',
        recommendedImprovements: Array.isArray(data.recommendedImprovements)
          ? data.recommendedImprovements
          : [],
        generatedAt: new Date().toISOString(),
        modelUsed: data.modelUsed,
        usedFallback: Boolean(data.usedFallback),
        fallbackNotice: data.fallbackNotice,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setWeeklyError(
        err instanceof Error && err.message.trim()
          ? err.message
          : UNAVAILABLE_FINAL_MESSAGE
      );
    } finally {
      weeklyInFlightRef.current = false;
      setWeeklyRetryStatus(null);
      setWeeklyLoading(false);
    }
  };

  const activeConvHasFailedAttempt =
    Boolean(failedChatAttempt) && failedChatAttempt?.convId === activeConv?.id;

  const latestAssistantMsgId = useMemo(() => {
    if (!activeConv) return null;
    for (let i = activeConv.messages.length - 1; i >= 0; i--) {
      if (activeConv.messages[i].role === 'assistant') {
        return activeConv.messages[i].id;
      }
    }
    return null;
  }, [activeConv]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#111216] border border-white/8 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Your AI Life Coach</h1>
            <p className="text-xs text-slate-400 mt-1">
              Grounded in your real Firestore tasks, focus sessions, habits, goals, and projects. No changes happen without your explicit approval.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-[#0A0A0C] border border-white/10 rounded-xl">
            {[
              { id: 'chat', label: 'Coach Chat', icon: Bot },
              { id: 'daily', label: 'AI Daily Review', icon: ClipboardCheck },
              { id: 'weekly', label: 'Weekly Report', icon: FileBarChart2 },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as 'chat' | 'daily' | 'weekly')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenSmartPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarClock className="w-3.5 h-3.5 text-sky-400" />
            Generate Tomorrow&apos;s Smart Plan
          </button>
        </div>
      </div>

      {appliedBanner && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          {appliedBanner}
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Conversation History Sidebar */}
          <aside className="bg-[#111216] border border-white/8 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Conversations
              </h2>
              <button
                type="button"
                disabled={chatLoading}
                onClick={startNewConversation}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 disabled:opacity-40 whitespace-nowrap"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                New
              </button>
            </div>

            {conversations.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                Ask a question below to start your first coaching thread.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                {conversations.map((conv) => {
                  const isActive = activeConv?.id === conv.id;
                  const isRenaming = renamingConvId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      className={`group rounded-xl border transition-colors ${
                        isActive
                          ? 'bg-amber-500/10 border-amber-500/30 text-white'
                          : 'bg-[#0A0A0C] border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                      }`}
                    >
                      {isRenaming ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitRenameConversation(conv.id);
                          }}
                          className="p-2 flex items-center gap-1"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setRenamingConvId(null);
                            }}
                            className="flex-1 min-w-0 px-2 py-1 text-xs bg-[#111216] border border-amber-500/40 rounded text-white focus:outline-none"
                            aria-label="Rename conversation"
                          />
                          <button
                            type="submit"
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                            aria-label="Save conversation name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingConvId(null)}
                            className="p-1 text-slate-400 hover:text-white"
                            aria-label="Cancel rename"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-1 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setSelectedConvId(conv.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-xs font-medium truncate">{conv.title}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                              {conv.messages.length} msg{conv.messages.length === 1 ? '' : 's'}
                            </p>
                          </button>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100">
                            <button
                              type="button"
                              disabled={chatLoading}
                              onClick={() => {
                                setRenamingConvId(conv.id);
                                setRenameDraft(conv.title);
                              }}
                              title="Rename conversation"
                              aria-label={`Rename ${conv.title}`}
                              className="p-1 text-slate-400 hover:text-amber-300 rounded disabled:opacity-40"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={chatLoading}
                              onClick={() => deleteConversation(conv.id)}
                              title="Delete conversation"
                              aria-label={`Delete ${conv.title}`}
                              className="p-1 text-slate-400 hover:text-rose-400 rounded disabled:opacity-40"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeConv && (
              <button
                type="button"
                disabled={chatLoading}
                onClick={clearCurrentConversation}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-rose-400 disabled:opacity-40 bg-[#0A0A0C] border border-white/8 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Active Chat
              </button>
            )}
          </aside>

          {/* Chat Thread */}
          <section className="lg:col-span-3 bg-[#111216] border border-white/8 rounded-2xl flex flex-col min-h-[580px]">
            <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[560px]">
              {!activeConv || activeConv.messages.length === 0 ? (
                <div className="py-6 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Ready for your check-in or strategy session
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-2xl">
                        Ask about your routine execution, focus quality, habits, goal milestones, university study strategies, programming concepts, or anything else you want to think through.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={chatLoading}
                        onClick={() => sendMessage(q)}
                        className="text-left px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/[0.04] disabled:opacity-50 text-xs text-slate-200 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                activeConv.messages.map((msg) => {
                  const isAssistant = msg.role === 'assistant';
                  const isLatestAssistant = msg.id === latestAssistantMsgId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-2xl rounded-2xl px-4 py-3.5 ${
                          isAssistant
                            ? 'bg-[#0A0A0C] border border-white/10 text-slate-200'
                            : 'bg-amber-500 text-slate-950 font-medium text-sm leading-relaxed whitespace-pre-wrap'
                        }`}
                      >
                        {isAssistant ? (
                          <CoachMessageContent content={msg.content} />
                        ) : (
                          msg.content
                        )}
                      </div>

                      {isAssistant && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1">
                          <button
                            type="button"
                            onClick={() => copyAssistantResponse(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-200 transition-colors"
                          >
                            {copiedMsgId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          {isLatestAssistant && (
                            <button
                              type="button"
                              disabled={chatLoading}
                              onClick={() => regenerateAssistantMessage(msg.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-amber-300 disabled:opacity-40 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Regenerate</span>
                            </button>
                          )}
                        </div>
                      )}

                      {isAssistant && msg.usedFallback && msg.fallbackNotice && (
                        <p className="mt-1.5 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 max-w-2xl">
                          {msg.fallbackNotice}
                        </p>
                      )}

                      {/* Optional Proposed Schedule Changes with Explicit Approval */}
                      {msg.suggestedChanges && msg.suggestedChanges.length > 0 && (
                        <div className="mt-2.5 max-w-2xl w-full space-y-2">
                          {msg.suggestedChanges.map((sc) => (
                            <div
                              key={sc.id}
                              className="p-3.5 rounded-xl bg-[#15171E] border border-sky-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white">
                                  Suggested Block: {sc.title}
                                </p>
                                <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                                  {formatDisplayDate(sc.targetDate)} ·{' '}
                                  {formatTime12h(sc.suggestedStartTime)} –{' '}
                                  {formatTime12h(sc.suggestedEndTime)} · {sc.priority}
                                </p>
                                <p className="text-xs text-slate-300 mt-1">{sc.reason}</p>
                              </div>

                              {sc.approvalState === 'accepted' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 shrink-0">
                                  <Check className="w-3.5 h-3.5" />
                                  Applied
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    approveSingleProposal(activeConv.id, msg.id, sc)
                                  }
                                  className="px-3 py-1.5 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shrink-0 whitespace-nowrap"
                                >
                                  Apply Changes
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Optional Goal & Milestone Breakdown Proposals */}
                      {msg.suggestedGoalActions && msg.suggestedGoalActions.length > 0 && (
                        <div className="mt-2.5 max-w-2xl w-full space-y-2">
                          {msg.suggestedGoalActions.map((ga) => (
                            <div
                              key={ga.id}
                              className="p-3.5 rounded-xl bg-[#15171E] border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                                  <Target className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Suggested Goal: {ga.goalTitle}</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {ga.area} · Due {formatDisplayDate(ga.deadline)} · {ga.milestones.length} milestones
                                </p>
                                <p className="text-xs text-slate-300 mt-1">{ga.reason}</p>
                              </div>

                              {ga.approvalState === 'accepted' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 shrink-0">
                                  <Check className="w-3.5 h-3.5" />
                                  Saved
                                </span>
                              ) : (
                                onApplyGoalAction && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      approveGoalAction(activeConv.id, msg.id, ga)
                                    }
                                    className="px-3 py-1.5 text-xs font-medium text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shrink-0 whitespace-nowrap"
                                  >
                                    Save Goal
                                  </button>
                                )
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {chatLoading && (
                <div
                  role="status"
                  className={`inline-flex items-center gap-2 text-xs px-3.5 py-2.5 rounded-xl border ${
                    chatRetryStatus
                      ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                      : 'text-slate-300 bg-[#0A0A0C] border-white/10'
                  }`}
                >
                  <Loader2
                    className={`w-3.5 h-3.5 animate-spin ${
                      chatRetryStatus ? 'text-amber-400' : 'text-sky-400'
                    }`}
                  />
                  <span>
                    {chatRetryStatus
                      ? `${chatRetryStatus.message} (Attempt ${chatRetryStatus.attempt} of ${chatRetryStatus.maxRetries})`
                      : 'Analyzing your context and preparing a thoughtful response...'}
                  </span>
                </div>
              )}

              {chatError && !chatLoading && (
                <div
                  role="alert"
                  className="text-xs bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2 text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-rose-200">{chatError}</p>
                      {activeConvHasFailedAttempt && failedChatAttempt && (
                        <p className="text-[11px] text-slate-300">
                          Your message is preserved: &ldquo;{failedChatAttempt.promptText}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                  {activeConvHasFailedAttempt && (
                    <button
                      type="button"
                      disabled={chatLoading}
                      onClick={retryLastChat}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="p-4 border-t border-white/8 flex items-center gap-3"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your AI Life Coach about productivity, habits, study strategy, coding, or planning..."
                className="flex-1 px-4 py-2.5 bg-[#0A0A0C] border border-white/10 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
              <button
                type="submit"
                disabled={chatLoading || !input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </section>
        </div>
      )}

      {activeTab === 'daily' && (
        <section className="bg-[#111216] border border-white/8 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                AI End-of-Day Accountability Review
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Summarizes completed work, diagnoses missed blocks, compares planned vs actual execution, and proposes 3 practical actions for tomorrow.
              </p>
            </div>
            <button
              type="button"
              disabled={dailyLoading}
              onClick={generateAIDailyReview}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl whitespace-nowrap shrink-0"
            >
              {dailyLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {dailyLoading ? 'Generating Review...' : 'Run AI Daily Review'}
            </button>
          </div>

          {dailyLoading && dailyRetryStatus && (
            <div
              role="status"
              className="inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2.5"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>
                {dailyRetryStatus.message} (Attempt {dailyRetryStatus.attempt} of{' '}
                {dailyRetryStatus.maxRetries})
              </span>
            </div>
          )}

          {dailyError && !dailyLoading && (
            <div
              role="alert"
              className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{dailyError}</span>
              </div>
              <button
                type="button"
                disabled={dailyLoading}
                onClick={generateAIDailyReview}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {dailyReport?.usedFallback && dailyReport.fallbackNotice && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2">
              {dailyReport.fallbackNotice}
            </p>
          )}

          {!dailyReport && !dailyLoading && (
            <div className="p-8 rounded-xl bg-[#0A0A0C] border border-white/8 text-center text-xs text-slate-400">
              Click &ldquo;Run AI Daily Review&rdquo; to analyze today&apos;s recorded execution ({formatDisplayDate(now.dateStr)}).
            </div>
          )}

          {dailyReport && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                <h3 className="text-xs font-semibold text-emerald-400">Completed Summary</h3>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {dailyReport.completedSummary}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                <h3 className="text-xs font-semibold text-sky-400">Planned vs. Actual</h3>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {dailyReport.plannedVsActual}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-2">
                <h3 className="text-xs font-semibold text-rose-400">Missed Tasks</h3>
                {dailyReport.missedTasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No missed tasks recorded today.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                    {dailyReport.missedTasks.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-2">
                <h3 className="text-xs font-semibold text-amber-400">Observed Patterns</h3>
                <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                  {dailyReport.patterns.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-2">
                <h3 className="text-xs font-semibold text-white">
                  Three Practical Recommendations
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside">
                  {dailyReport.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-2">
                <h3 className="text-xs font-semibold text-sky-300">
                  Realistic Priorities for Tomorrow
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside">
                  {dailyReport.tomorrowPriorities.map((tp, i) => (
                    <li key={i}>{tp}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'weekly' && (
        <section className="bg-[#111216] border border-white/8 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                AI Weekly Performance Report
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Structured weekly diagnostic grounded strictly in the last 7 days of logged execution.
              </p>
            </div>
            <button
              type="button"
              disabled={weeklyLoading}
              onClick={generateWeeklyReport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl whitespace-nowrap shrink-0"
            >
              {weeklyLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileBarChart2 className="w-3.5 h-3.5" />
              )}
              {weeklyLoading ? 'Generating Report...' : 'Generate Weekly Report'}
            </button>
          </div>

          {weeklyLoading && weeklyRetryStatus && (
            <div
              role="status"
              className="inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2.5"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>
                {weeklyRetryStatus.message} (Attempt {weeklyRetryStatus.attempt} of{' '}
                {weeklyRetryStatus.maxRetries})
              </span>
            </div>
          )}

          {weeklyError && !weeklyLoading && (
            <div
              role="alert"
              className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{weeklyError}</span>
              </div>
              <button
                type="button"
                disabled={weeklyLoading}
                onClick={generateWeeklyReport}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {weeklyReport?.usedFallback && weeklyReport.fallbackNotice && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2">
              {weeklyReport.fallbackNotice}
            </p>
          )}

          {!weeklyReport && !weeklyLoading && (
            <div className="p-8 rounded-xl bg-[#0A0A0C] border border-white/8 text-center text-xs text-slate-400">
              Click &ldquo;Generate Weekly Report&rdquo; to compile your 7-day execution metrics and strategic adjustments.
            </div>
          )}

          {weeklyReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8">
                  <p className="text-xs text-slate-400">Overall Completion</p>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-white mt-1">
                    {weeklyReport.overallCompletionPct}%
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8">
                  <p className="text-xs text-slate-400">Habit Consistency</p>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-emerald-400 mt-1">
                    {weeklyReport.habitConsistencyPct}%
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 col-span-2 sm:col-span-1">
                  <p className="text-xs text-slate-400">Window</p>
                  <p className="text-xs font-mono tabular-nums text-slate-200 mt-2">
                    {weeklyReport.weekLabel}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                  <h3 className="text-xs font-semibold text-sky-400">Study Progress</h3>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {weeklyReport.studyProgress}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                  <h3 className="text-xs font-semibold text-amber-400">
                    Exercise Consistency
                  </h3>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {weeklyReport.exerciseConsistency}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                  <h3 className="text-xs font-semibold text-slate-300">Time Allocation</h3>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {weeklyReport.timeAllocation}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                  <h3 className="text-xs font-semibold text-emerald-400">
                    Biggest Achievement
                  </h3>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {weeklyReport.biggestAchievement}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-1.5">
                  <h3 className="text-xs font-semibold text-rose-400">Biggest Weakness</h3>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {weeklyReport.biggestWeakness}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/8 space-y-2">
                  <h3 className="text-xs font-semibold text-white">
                    Recommended Improvements
                  </h3>
                  <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                    {weeklyReport.recommendedImprovements.map((imp, idx) => (
                      <li key={idx}>{imp}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
