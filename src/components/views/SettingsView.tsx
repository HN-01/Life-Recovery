import React, { useRef, useState } from 'react';
import {
  Bell,
  Cloud,
  Download,
  LogOut,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppState,
  EnergyPreference,
  NotificationPreferences,
  NotificationTimingOption,
  NotificationType,
  PrayerTimes,
  ScheduleType,
  SchedulingPreferences,
  SyncStatus,
  TaskCategory,
  TemplateTask,
} from '../../types';
import {
  ALL_CATEGORIES,
  DEFAULT_PRAYER_TIMES,
  DEFAULT_SCHEDULING_PREFERENCES,
  SCHEDULE_TYPE_LABELS,
} from '../../data/starterData';
import {
  ALL_TIMING_OPTIONS,
  NOTIFICATION_TIMING_LABELS,
  NOTIFICATION_TYPE_LABELS,
  normalizeNotificationPreferences,
} from '../../utils/notificationEngine';
import { BrowserPermissionState } from '../../utils/pushNotifications';
import { storageRepo } from '../../services/storage';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ThemeToggle } from '../ui/ThemeToggle';

interface SettingsViewProps {
  state: AppState;
  userEmail: string;
  userPhotoUrl?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  onLogout: () => void;
  onUpdateProfile: (patch: Partial<AppState['profile']>) => void;
  onUpdateTemplate: (type: ScheduleType, tasks: TemplateTask[]) => void;
  onReapplyTemplatesToFuture: () => void;
  onOpenTimetableBuilder: () => void;
  onRerunOnboarding: () => void;
  notificationPermission?: BrowserPermissionState;
  vapidStatus?: { configured: boolean; cronConfigured: boolean; loading: boolean };
  onRequestNotificationPermission?: () => Promise<void>;
  onEnableWebPush?: () => Promise<void>;
  onDisableWebPush?: () => Promise<void>;
  onSendTestNotification?: () => Promise<void>;
  onExportJson: () => void;
  onImportValidatedState: (restored: AppState) => void;
  onResetAllData: () => void;
}

const SCHEDULE_TYPES: ScheduleType[] = [
  'university',
  'normal',
  'weekend',
  'holiday',
  'exam',
];

export function SettingsView({
  state,
  userEmail,
  userPhotoUrl,
  syncStatus,
  lastSyncedAt,
  onLogout,
  onUpdateProfile,
  onUpdateTemplate,
  onReapplyTemplatesToFuture,
  onOpenTimetableBuilder,
  onRerunOnboarding,
  notificationPermission = 'default',
  vapidStatus,
  onRequestNotificationPermission,
  onEnableWebPush,
  onDisableWebPush,
  onSendTestNotification,
  onExportJson,
  onImportValidatedState,
  onResetAllData,
}: SettingsViewProps) {
  const [name, setName] = useState(state.profile.name);
  const [wakeTime, setWakeTime] = useState(state.profile.wakeTime);
  const [sleepTime, setSleepTime] = useState(state.profile.sleepTime);

  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes>(
    state.profile.prayerTimes || { ...DEFAULT_PRAYER_TIMES }
  );
  const [schedPrefs, setSchedPrefs] = useState<SchedulingPreferences>(
    state.profile.schedulingPreferences || { ...DEFAULT_SCHEDULING_PREFERENCES }
  );

  const [activeTplType, setActiveTplType] = useState<ScheduleType>('university');
  const [savedBanner, setSavedBanner] = useState('');
  const [importError, setImportError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{
    state: AppState;
    exportedAt?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTemplate = state.templates[activeTplType] || [];

  const notifPrefs = normalizeNotificationPreferences(
    state.profile.notificationPreferences,
    state.profile.wakeTime,
    state.profile.sleepTime
  );
  const [overrideTarget, setOverrideTarget] = useState<string>(ALL_CATEGORIES[0]);
  const [overrideTimings, setOverrideTimings] = useState<NotificationTimingOption[]>([15, 0]);
  const [notifFeedback, setNotifFeedback] = useState('');

  const updateNotifPrefs = (patch: Partial<NotificationPreferences>) => {
    const next: NotificationPreferences = {
      ...notifPrefs,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    onUpdateProfile({ notificationPreferences: next });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      name: name.trim() || 'Student Builder',
      wakeTime,
      sleepTime,
      prayerTimes,
      schedulingPreferences: schedPrefs,
    });
    setSavedBanner('Profile, prayer times, and scheduling preferences saved to Cloud.');
    setTimeout(() => setSavedBanner(''), 3200);
  };

  const updateTemplateRow = (idx: number, patch: Partial<TemplateTask>) => {
    const next = activeTemplate.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onUpdateTemplate(activeTplType, next);
  };

  const addTemplateRow = () => {
    onUpdateTemplate(activeTplType, [
      ...activeTemplate,
      {
        title: 'New Template Block',
        startTime: '16:00',
        endTime: '17:00',
        category: 'Programming',
        priority: 'High',
        description: '',
      },
    ]);
  };

  const removeTemplateRow = (idx: number) => {
    onUpdateTemplate(
      activeTplType,
      activeTemplate.filter((_, i) => i !== idx)
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setImportError('');
        const validated = storageRepo.validateAndParseBackup(String(reader.result || ''));
        setPendingRestore(validated);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to validate backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-subtle rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-main">
            Settings, Account &amp; Routine Templates
          </h1>
          <p className="text-xs text-muted mt-1">
            Manage your appearance theme, personalized weekly timetable builder, Firebase account, smart scheduling preferences, and manual JSON backups.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenTimetableBuilder}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Open Timetable Builder
          </button>
          <button
            type="button"
            onClick={onRerunOnboarding}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-run Full Setup Wizard
          </button>
        </div>
      </div>

      {/* Appearance & Theme Card */}
      <section className="bg-card border border-subtle rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-main">
            Appearance &amp; Theme
          </h2>
          <p className="text-xs text-muted mt-1">
            Choose Light Mode, Dark Mode, or follow your device&apos;s System Default automatically. Your preference is saved locally on this browser.
          </p>
        </div>
        <ThemeToggle variant="segmented" />
      </section>

      {/* Smart Timetable Notifications & Web Push */}
      <section className="bg-card border border-subtle rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-gold-soft border border-gold-border text-gold shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-main">
                Smart Timetable Notifications
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Configure pre-activity reminders, quiet hours, timezone accuracy, and browser/push notifications.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onSendTestNotification && (
              <button
                type="button"
                onClick={async () => {
                  await onSendTestNotification();
                  setNotifFeedback('Test notification sent.');
                  setTimeout(() => setNotifFeedback(''), 3000);
                }}
                className="px-3.5 py-2 text-xs font-medium text-gold bg-gold-soft border border-gold-border hover:opacity-90 rounded-lg transition-colors whitespace-nowrap"
              >
                Send Test Notification
              </button>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-subtle text-xs font-medium text-main cursor-pointer">
              <input
                type="checkbox"
                checked={notifPrefs.enabled}
                onChange={(e) => updateNotifPrefs({ enabled: e.target.checked })}
                className="rounded border-subtle accent-[var(--accent-gold)]"
              />
              <span>Notifications Enabled</span>
            </label>
          </div>
        </div>

        {notifFeedback && (
          <p className="text-xs text-slate-accent font-medium">{notifFeedback}</p>
        )}

        {/* Channels: Browser & Web Push */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-subtle space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-main">Browser Alerts</span>
              <span className="text-[11px] font-mono text-muted capitalize">
                Permission: {notificationPermission}
              </span>
            </div>
            <p className="text-xs text-muted">
              Shows native desktop/mobile alerts with quick Start &amp; Mark Done actions while app tabs are active.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {notificationPermission !== 'granted' && onRequestNotificationPermission && (
                <button
                  type="button"
                  onClick={onRequestNotificationPermission}
                  className="px-3 py-1.5 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg"
                >
                  Request Browser Permission
                </button>
              )}
              <label className="inline-flex items-center gap-2 text-xs text-main cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifPrefs.browserNotificationsEnabled}
                  onChange={(e) =>
                    updateNotifPrefs({ browserNotificationsEnabled: e.target.checked })
                  }
                  className="rounded border-subtle accent-[var(--accent-gold)]"
                />
                <span>Use browser notifications</span>
              </label>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-subtle space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-main">Background Web Push</span>
              <span className="text-[11px] font-mono text-muted">
                {notifPrefs.webPushEnabled
                  ? `Subscribed (${(state.pushSubscriptions || []).length})`
                  : vapidStatus?.configured
                  ? 'Ready'
                  : 'VAPID keys needed'}
              </span>
            </div>
            <p className="text-xs text-muted">
              {vapidStatus?.configured
                ? 'Server VAPID keys detected. Enable Web Push to receive alerts even when tabs are closed.'
                : 'In-app & open-tab browser notifications work immediately. To enable closed-tab Web Push on production, add VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY env vars.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              {notifPrefs.webPushEnabled && onDisableWebPush ? (
                <button
                  type="button"
                  onClick={onDisableWebPush}
                  className="px-3 py-1.5 text-xs font-medium text-rose-muted bg-rose-soft border border-rose-border rounded-lg"
                >
                  Disable Web Push
                </button>
              ) : (
                onEnableWebPush && (
                  <button
                    type="button"
                    disabled={!vapidStatus?.configured}
                    onClick={onEnableWebPush}
                    className="px-3 py-1.5 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover disabled:opacity-45 rounded-lg"
                  >
                    Enable Web Push
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Default Reminder Timings + Timezone */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-subtle">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-main">
              Default Reminder Timing Before Activities
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_TIMING_OPTIONS.map((opt) => {
                const active = notifPrefs.defaultTimings.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? notifPrefs.defaultTimings.filter((x) => x !== opt)
                        : [...notifPrefs.defaultTimings, opt];
                      updateNotifPrefs({ defaultTimings: next.length > 0 ? next : [0] });
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      active
                        ? 'bg-gold-soft border-gold-border text-gold'
                        : 'bg-surface border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {NOTIFICATION_TIMING_LABELS[opt]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Timezone
              </label>
              <select
                value={notifPrefs.timezone}
                onChange={(e) => updateNotifPrefs({ timezone: e.target.value })}
                className="w-full px-2.5 py-2 bg-surface border border-subtle rounded-lg text-xs text-main"
              >
                {[
                  'Asia/Karachi',
                  'UTC',
                  'Asia/Dubai',
                  'Europe/London',
                  'Europe/Berlin',
                  'America/New_York',
                  'America/Chicago',
                  'America/Los_Angeles',
                  'Asia/Singapore',
                  'Asia/Tokyo',
                  'Australia/Sydney',
                ].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Morning Routine Alert
              </label>
              <input
                type="time"
                value={notifPrefs.dailyRoutineReminderTime}
                onChange={(e) =>
                  updateNotifPrefs({ dailyRoutineReminderTime: e.target.value })
                }
                className="w-full px-2.5 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono text-main"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Daily Summary Time
              </label>
              <input
                type="time"
                value={notifPrefs.dailySummaryTime}
                onChange={(e) => updateNotifPrefs({ dailySummaryTime: e.target.value })}
                className="w-full px-2.5 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono text-main"
              />
            </div>
          </div>
        </div>

        {/* Quiet Hours & Sleep Protection */}
        <div className="pt-3 border-t border-subtle flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-xs text-main cursor-pointer">
            <input
              type="checkbox"
              checked={notifPrefs.quietHoursEnabled}
              onChange={(e) => updateNotifPrefs({ quietHoursEnabled: e.target.checked })}
              className="rounded border-subtle accent-[var(--accent-gold)]"
            />
            <span>Quiet Hours</span>
          </label>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="time"
              value={notifPrefs.quietHoursStart}
              onChange={(e) => updateNotifPrefs({ quietHoursStart: e.target.value })}
              className="px-2.5 py-1.5 bg-surface border border-subtle rounded-lg font-mono text-main"
            />
            <span className="text-muted">to</span>
            <input
              type="time"
              value={notifPrefs.quietHoursEnd}
              onChange={(e) => updateNotifPrefs({ quietHoursEnd: e.target.value })}
              className="px-2.5 py-1.5 bg-surface border border-subtle rounded-lg font-mono text-main"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-main cursor-pointer">
            <input
              type="checkbox"
              checked={notifPrefs.respectSleepSchedule}
              onChange={(e) => updateNotifPrefs({ respectSleepSchedule: e.target.checked })}
              className="rounded border-subtle accent-[var(--accent-gold)]"
            />
            <span>Suppress notifications during configured sleep window</span>
          </label>
        </div>

        {/* Per-Category / Activity Timing Overrides */}
        <div className="pt-3 border-t border-subtle space-y-2.5">
          <p className="text-xs font-semibold text-main">
            Per-Category or Activity Timing Overrides
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={overrideTarget}
              onChange={(e) => setOverrideTarget(e.target.value)}
              className="px-2.5 py-1.5 bg-surface border border-subtle rounded-lg text-xs text-main"
            >
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {ALL_TIMING_OPTIONS.map((opt) => {
              const active = overrideTimings.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    setOverrideTimings((prev) =>
                      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                    )
                  }
                  className={`px-2.5 py-1 text-[11px] rounded-lg border ${
                    active
                      ? 'bg-gold-soft border-gold-border text-gold'
                      : 'bg-surface border-subtle text-muted'
                  }`}
                >
                  {opt === 0 ? 'Start' : `${opt}m`}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                if (!overrideTarget || overrideTimings.length === 0) return;
                updateNotifPrefs({
                  activityTimingOverrides: {
                    ...notifPrefs.activityTimingOverrides,
                    [overrideTarget]: overrideTimings,
                  },
                });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg"
            >
              <Plus className="w-3 h-3" />
              Save Override
            </button>
          </div>
          {Object.keys(notifPrefs.activityTimingOverrides).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(notifPrefs.activityTimingOverrides).map(([k, vals]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface border border-subtle text-[11px] text-main"
                >
                  <span>
                    {k}: {vals.map((v) => (v === 0 ? 'Start' : `${v}m`)).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const copy = { ...notifPrefs.activityTimingOverrides };
                      delete copy[k];
                      updateNotifPrefs({ activityTimingOverrides: copy });
                    }}
                    className="text-muted hover:text-rose-muted"
                    aria-label={`Remove ${k} override`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* All 7 Notification Types */}
        <div className="pt-3 border-t border-subtle space-y-2">
          <p className="text-xs font-semibold text-main">Notification Categories</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((type) => {
              const info = NOTIFICATION_TYPE_LABELS[type];
              const checked = Boolean(notifPrefs.enabledTypes[type]);
              return (
                <label
                  key={type}
                  className="p-3 rounded-xl bg-surface border border-subtle flex items-start gap-2.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      updateNotifPrefs({
                        enabledTypes: {
                          ...notifPrefs.enabledTypes,
                          [type]: e.target.checked,
                        },
                      })
                    }
                    className="mt-0.5 rounded border-subtle accent-[var(--accent-gold)]"
                  />
                  <div>
                    <p className="text-xs font-medium text-main">{info.label}</p>
                    <p className="text-[11px] text-muted mt-0.5">{info.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {/* Authenticated Account Card */}
      <section className="bg-card border border-subtle rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {userPhotoUrl ? (
            <img
              src={userPhotoUrl}
              alt={state.profile.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-subtle shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gold-soft border border-gold-border flex items-center justify-center text-base font-semibold text-gold shrink-0">
              {(state.profile.name || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-main truncate">
              {state.profile.name}
            </h2>
            <p className="text-xs text-muted truncate">
              {userEmail || 'Authenticated user'}
            </p>
            <p className="text-[11px] text-muted mt-0.5 font-mono">
              Private Firestore sync scoped strictly to your account
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </section>

      {/* Profile, Prayer Times & Smart Scheduling Preferences */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-card border border-subtle rounded-xl p-6 space-y-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-main">
            Core Profile, Prayer Windows &amp; Smart Scheduling
          </h2>
          <span className="text-xs text-muted font-mono">
            Asia/Karachi (PKT)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Wake-Up Time
            </label>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Sleep Time
            </label>
            <input
              type="time"
              value={sleepTime}
              onChange={(e) => setSleepTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        {/* Prayer Times */}
        <div className="pt-4 border-t border-subtle space-y-3">
          <h3 className="text-xs font-semibold text-main">
            Prayer Times (Protected by Smart Scheduler)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(
              [
                ['fajr', 'Fajr'],
                ['zuhr', 'Zuhr'],
                ['asr', 'Asr'],
                ['maghrib', 'Maghrib'],
                ['isha', 'Isha'],
              ] as Array<[keyof PrayerTimes, string]>
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-[11px] text-muted mb-1">
                  {label}
                </label>
                <input
                  type="time"
                  value={prayerTimes[key]}
                  onChange={(e) =>
                    setPrayerTimes((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full px-2.5 py-2 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Smart Scheduling Preferences */}
        <div className="pt-4 border-t border-subtle space-y-3">
          <h3 className="text-xs font-semibold text-main">
            Intelligent Scheduling Preferences
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">
                Peak Energy Window
              </label>
              <select
                value={schedPrefs.energyPreference}
                onChange={(e) =>
                  setSchedPrefs((prev) => ({
                    ...prev,
                    energyPreference: e.target.value as EnergyPreference,
                  }))
                }
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-xs text-main focus:outline-none focus:border-gold"
              >
                <option value="morning_peak">Morning Peak (Before 12 PM)</option>
                <option value="afternoon_peak">Afternoon Peak (12 PM – 5 PM)</option>
                <option value="evening_peak">Evening Peak (After 5 PM)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">
                Max Productive Hours / Day
              </label>
              <input
                type="number"
                min={4}
                max={14}
                value={schedPrefs.maxProductiveHoursPerDay}
                onChange={(e) =>
                  setSchedPrefs((prev) => ({
                    ...prev,
                    maxProductiveHoursPerDay: Math.min(
                      14,
                      Math.max(4, Number(e.target.value) || 8)
                    ),
                  }))
                }
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">
                Buffer Between Blocks (min)
              </label>
              <input
                type="number"
                min={0}
                max={45}
                value={schedPrefs.includeBufferMinutes}
                onChange={(e) =>
                  setSchedPrefs((prev) => ({
                    ...prev,
                    includeBufferMinutes: Math.min(
                      45,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  }))
                }
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-main cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={schedPrefs.protectPrayerWindows}
              onChange={(e) =>
                setSchedPrefs((prev) => ({
                  ...prev,
                  protectPrayerWindows: e.target.checked,
                }))
              }
              className="rounded border-subtle bg-surface accent-[var(--accent-gold)]"
            />
            <span>Prevent smart scheduler from placing tasks over configured prayer times</span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-accent font-medium">{savedBanner}</span>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
          >
            Save Profile &amp; Preferences
          </button>
        </div>
      </form>

      {/* Schedule Templates Editor */}
      <section className="bg-card border border-subtle rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-main">
              Schedule Mode Templates
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Customize reusable routines for University, Normal, Weekend, Holiday, and Exam days.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-surface border border-subtle rounded-lg">
            {SCHEDULE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveTplType(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTplType === type
                    ? 'bg-gold text-on-gold font-semibold'
                    : 'text-muted hover:text-main'
                }`}
              >
                {SCHEDULE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {activeTemplate.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 items-center p-2.5 bg-surface border border-subtle rounded-lg"
            >
              <input
                type="time"
                value={row.startTime}
                onChange={(e) => updateTemplateRow(idx, { startTime: e.target.value })}
                className="col-span-6 sm:col-span-2 px-2 py-1.5 bg-card border border-subtle rounded text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
              <input
                type="time"
                value={row.endTime}
                onChange={(e) => updateTemplateRow(idx, { endTime: e.target.value })}
                className="col-span-6 sm:col-span-2 px-2 py-1.5 bg-card border border-subtle rounded text-xs font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
              <input
                type="text"
                value={row.title}
                onChange={(e) => updateTemplateRow(idx, { title: e.target.value })}
                className="col-span-12 sm:col-span-4 px-2.5 py-1.5 bg-card border border-subtle rounded text-xs text-main focus:outline-none focus:border-gold"
              />
              <select
                value={row.category}
                onChange={(e) =>
                  updateTemplateRow(idx, { category: e.target.value as TaskCategory })
                }
                className="col-span-10 sm:col-span-3 px-2 py-1.5 bg-card border border-subtle rounded text-xs text-main focus:outline-none focus:border-gold"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeTemplateRow(idx)}
                className="col-span-2 sm:col-span-1 flex justify-center p-1.5 text-muted hover:text-rose-muted transition-colors"
                aria-label="Remove template block"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={addTemplateRow}
            className="px-3.5 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
          >
            + Add Block to {SCHEDULE_TYPE_LABELS[activeTplType]}
          </button>

          <button
            type="button"
            onClick={() => {
              onReapplyTemplatesToFuture();
              setSavedBanner('Updated templates applied to today & future pending days.');
              setTimeout(() => setSavedBanner(''), 3000);
            }}
            className="px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
          >
            Apply Templates to Future Pending Days
          </button>
        </div>
      </section>

      {/* Cloud Sync Status & Manual Backup Recovery */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border border-subtle rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-gold" />
            <h2 className="text-base font-semibold text-main">
              Automatic Cloud Synchronization
            </h2>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Your routines, completions, habits, goals, projects, weekly reviews, and coach threads automatically sync in real time with Cloud Firestore across devices and queue offline edits until reconnected.
          </p>
          <div className="p-3.5 rounded-lg bg-surface border border-subtle text-xs font-mono tabular-nums flex items-center justify-between">
            <span className="text-muted">
              Status:{' '}
              <strong className="text-main uppercase">
                {syncStatus}
              </strong>
            </span>
            {lastSyncedAt && (
              <span className="text-muted">
                Last sync: {new Date(lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </section>

        <section className="bg-card border border-subtle rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-main">
              Manual JSON Backup &amp; Recovery
            </h2>
            <p className="text-xs text-muted mt-1">
              Download timestamped offline snapshots or validate and restore a previous JSON backup into your cloud account.
            </p>
          </div>

          {importError && (
            <p className="text-xs text-rose-muted">{importError}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Timestamped Backup
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import &amp; Validate Backup
            </button>

            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-rose-muted bg-rose-soft hover:border-rose-muted border border-rose-border rounded-lg ml-auto transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Account Data
            </button>
          </div>
        </section>
      </div>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingRestore)}
        onClose={() => setPendingRestore(null)}
        onConfirm={() => {
          if (pendingRestore) {
            onImportValidatedState(pendingRestore.state);
            setSavedBanner('Validated JSON backup restored to Cloud Firestore.');
            setPendingRestore(null);
          }
        }}
        title="Confirm Backup Restoration"
        message={`Backup passed schema validation (${
          pendingRestore?.exportedAt
            ? `exported ${new Date(pendingRestore.exportedAt).toLocaleString()}`
            : 'legacy format'
        }, ${Object.keys(pendingRestore?.state.days || {}).length} days, ${
          pendingRestore?.state.habits.length || 0
        } habits). Restoring will replace your current Cloud Firestore data with this snapshot.`}
        confirmLabel="Restore Backup to Cloud"
        danger={false}
      />

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={onResetAllData}
        title="Reset All Account Data?"
        message="This resets your Cloud Firestore 30-day planner, habits, goals, projects, and weekly reviews back to a clean setup."
        confirmLabel="Erase & Reset Everything"
      />
    </div>
  );
}
