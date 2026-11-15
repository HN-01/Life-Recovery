import { Database, UploadCloud } from 'lucide-react';
import { AppState } from '../types';
import { Modal } from './ui/Modal';

interface MigrationModalProps {
  open: boolean;
  localData: AppState | null;
  migrating: boolean;
  error: string;
  onMigrate: () => void;
  onSkipKeepCloud: () => void;
}

export function MigrationModal({
  open,
  localData,
  migrating,
  error,
  onMigrate,
  onSkipKeepCloud,
}: MigrationModalProps) {
  if (!localData) return null;

  const dayCount = Object.keys(localData.days).length;
  const totalTasks = Object.values(localData.days).reduce(
    (acc, d) => acc + d.tasks.length,
    0
  );
  const completedTasks = Object.values(localData.days).reduce(
    (acc, d) => acc + d.tasks.filter((t) => t.status === 'completed').length,
    0
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!migrating) onSkipKeepCloud();
      }}
      title="Existing Local Data Detected"
      subtitle="Safely migrate your browser data into your private Cloud Firestore account."
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-[#0B101B] border border-white/10 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
            <Database className="w-4 h-4" />
            <span>Local Snapshot Summary ({localData.profile.name})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 font-mono tabular-nums text-xs">
            <div>
              <p className="text-slate-500">Days</p>
              <p className="text-white font-semibold">{dayCount}</p>
            </div>
            <div>
              <p className="text-slate-500">Completed</p>
              <p className="text-emerald-400 font-semibold">
                {completedTasks}/{totalTasks}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Habits</p>
              <p className="text-white font-semibold">{localData.habits.length}</p>
            </div>
            <div>
              <p className="text-slate-500">Goals</p>
              <p className="text-white font-semibold">{localData.goals.length}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          We will verify that every record is safely written to Cloud Firestore before clearing the local browser copy, avoiding duplicate entries. Nothing will be discarded without your choice.
        </p>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-white/8">
          <button
            type="button"
            disabled={migrating}
            onClick={onSkipKeepCloud}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            Keep Cloud Data (Skip)
          </button>
          <button
            type="button"
            disabled={migrating}
            onClick={onMigrate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            {migrating ? 'Migrating & Verifying...' : 'Migrate Local Data to Cloud'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
