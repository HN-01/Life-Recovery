import React, { useRef, useState } from 'react';
import {
  Cloud,
  Download,
  LogOut,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppState,
  EnergyPreference,
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
import { storageRepo } from '../../services/storage';
import { ConfirmDialog } from '../ui/ConfirmDialog';

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
  onRerunOnboarding: () => void;
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
  onRerunOnboarding,
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
      <div className="bg-[#111827] border border-white/8 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Settings, Account &amp; Routine Templates
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your Firebase account, prayer &amp; smart scheduling preferences, routine templates, and manual JSON backups.
          </p>
        </div>
        <button
          type="button"
          onClick={onRerunOnboarding}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Launch Setup Wizard
        </button>
      </div>

      {/* Authenticated Account Card */}
      <section className="bg-[#111827] border border-white/8 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {userPhotoUrl ? (
            <img
              src={userPhotoUrl}
              alt={state.profile.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-base font-semibold text-blue-300 shrink-0">
              {(state.profile.name || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              {state.profile.name}
            </h2>
            <p className="text-xs text-slate-400 truncate">{userEmail || 'Authenticated user'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
              Private Firestore sync scoped strictly to your account
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </section>

      {/* Profile, Prayer Times & Smart Scheduling Preferences */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-[#111827] border border-white/8 rounded-xl p-6 space-y-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Core Profile, Prayer Windows &amp; Smart Scheduling
          </h2>
          <span className="text-xs text-slate-400 font-mono">Asia/Karachi (PKT)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Wake-Up Time</label>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-sm font-mono tabular-nums text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Sleep Time</label>
            <input
              type="time"
              value={sleepTime}
              onChange={(e) => setSleepTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-sm font-mono tabular-nums text-slate-100"
            />
          </div>
        </div>

        {/* Prayer Times */}
        <div className="pt-4 border-t border-white/8 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300">
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
                <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
                <input
                  type="time"
                  value={prayerTimes[key]}
                  onChange={(e) =>
                    setPrayerTimes((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full px-2.5 py-2 bg-[#0B101B] border border-white/10 rounded-lg text-xs font-mono tabular-nums text-slate-100"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Smart Scheduling Preferences */}
        <div className="pt-4 border-t border-white/8 space-y-3">
          <h3 className="text-xs font-semibold text-slate-300">
            Intelligent Scheduling Preferences
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Peak Energy Window</label>
              <select
                value={schedPrefs.energyPreference}
                onChange={(e) =>
                  setSchedPrefs((prev) => ({
                    ...prev,
                    energyPreference: e.target.value as EnergyPreference,
                  }))
                }
                className="w-full px-3 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs text-slate-100"
              >
                <option value="morning_peak">Morning Peak (Before 12 PM)</option>
                <option value="afternoon_peak">Afternoon Peak (12 PM – 5 PM)</option>
                <option value="evening_peak">Evening Peak (After 5 PM)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
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
                className="w-full px-3 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs font-mono tabular-nums text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
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
                className="w-full px-3 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-xs font-mono tabular-nums text-slate-100"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={schedPrefs.protectPrayerWindows}
              onChange={(e) =>
                setSchedPrefs((prev) => ({
                  ...prev,
                  protectPrayerWindows: e.target.checked,
                }))
              }
              className="rounded border-slate-600 bg-slate-800 text-blue-500"
            />
            <span>Prevent smart scheduler from placing tasks over configured prayer times</span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-emerald-400">{savedBanner}</span>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Save Profile &amp; Preferences
          </button>
        </div>
      </form>

      {/* Schedule Templates Editor */}
      <section className="bg-[#111827] border border-white/8 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Schedule Mode Templates</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize reusable routines for University, Normal, Weekend, Holiday, and Exam days.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B101B] border border-white/10 rounded-lg">
            {SCHEDULE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveTplType(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTplType === type
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
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
              className="grid grid-cols-12 gap-2 items-center p-2.5 bg-[#0B101B] border border-white/8 rounded-lg"
            >
              <input
                type="time"
                value={row.startTime}
                onChange={(e) => updateTemplateRow(idx, { startTime: e.target.value })}
                className="col-span-6 sm:col-span-2 px-2 py-1.5 bg-[#111827] border border-white/10 rounded text-xs font-mono tabular-nums text-slate-200"
              />
              <input
                type="time"
                value={row.endTime}
                onChange={(e) => updateTemplateRow(idx, { endTime: e.target.value })}
                className="col-span-6 sm:col-span-2 px-2 py-1.5 bg-[#111827] border border-white/10 rounded text-xs font-mono tabular-nums text-slate-200"
              />
              <input
                type="text"
                value={row.title}
                onChange={(e) => updateTemplateRow(idx, { title: e.target.value })}
                className="col-span-12 sm:col-span-4 px-2.5 py-1.5 bg-[#111827] border border-white/10 rounded text-xs text-slate-100"
              />
              <select
                value={row.category}
                onChange={(e) =>
                  updateTemplateRow(idx, { category: e.target.value as TaskCategory })
                }
                className="col-span-10 sm:col-span-3 px-2 py-1.5 bg-[#111827] border border-white/10 rounded text-xs text-slate-300"
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
                className="col-span-2 sm:col-span-1 flex justify-center p-1.5 text-slate-500 hover:text-rose-400"
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
            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg"
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
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
          >
            Apply Templates to Future Pending Days
          </button>
        </div>
      </section>

      {/* Cloud Sync Status & Manual Backup Recovery (Explicitly Separated) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#111827] border border-white/8 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-400" />
            <h2 className="text-base font-semibold text-white">
              Automatic Cloud Synchronization
            </h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your routines, completions, habits, goals, projects, weekly reviews, and coach threads automatically sync in real time with Cloud Firestore across devices and queue offline edits until reconnected.
          </p>
          <div className="p-3.5 rounded-lg bg-[#0B101B] border border-white/8 text-xs font-mono tabular-nums flex items-center justify-between">
            <span className="text-slate-400">Status: <strong className="text-slate-100 uppercase">{syncStatus}</strong></span>
            {lastSyncedAt && (
              <span className="text-slate-500">
                Last sync: {new Date(lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </section>

        <section className="bg-[#111827] border border-white/8 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Manual JSON Backup &amp; Recovery
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Download timestamped offline snapshots or validate and restore a previous JSON backup into your cloud account.
            </p>
          </div>

          {importError && <p className="text-xs text-rose-400">{importError}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg"
            >
              <Upload className="w-3.5 h-3.5" />
              Import &amp; Validate Backup
            </button>

            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg ml-auto"
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
        message="This resets your Cloud Firestore 30-day planner, habits, goals, projects, and weekly reviews back to the initial starter setup."
        confirmLabel="Erase & Reset Everything"
      />
    </div>
  );
}
