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
        <div className="p-4 rounded-lg bg-surface border border-subtle space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-gold">
            <Database className="w-4 h-4" />
            <span>Local Snapshot Summary ({localData.profile.name})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 font-mono tabular-nums text-xs">
            <div>
              <p className="text-muted">Days</p>
              <p className="text-main font-semibold">{dayCount}</p>
            </div>
            <div>
              <p className="text-muted">Completed</p>
              <p className="text-slate-accent font-semibold">
                {completedTasks}/{totalTasks}
              </p>
            </div>
            <div>
              <p className="text-muted">Habits</p>
              <p className="text-main font-semibold">
                {localData.habits.length}
              </p>
            </div>
            <div>
              <p className="text-muted">Goals</p>
              <p className="text-main font-semibold">
                {localData.goals.length}
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          We will verify that every record is safely written to Cloud Firestore before clearing the local browser copy, avoiding duplicate entries. Nothing will be discarded without your choice.
        </p>

        {error && (
          <p className="text-xs text-rose-muted bg-rose-soft border border-rose-border rounded-lg p-3">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-subtle">
          <button
            type="button"
            disabled={migrating}
            onClick={onSkipKeepCloud}
            className="px-4 py-2 text-xs font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
          >
            Keep Cloud Data (Skip)
          </button>
          <button
            type="button"
            disabled={migrating}
            onClick={onMigrate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover disabled:opacity-50 rounded-lg transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            {migrating ? 'Migrating & Verifying...' : 'Migrate Local Data to Cloud'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
