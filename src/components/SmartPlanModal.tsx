import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Edit2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ProposedScheduleChange,
  RoutineDiagnostic,
  RoutineTask,
} from '../types';
import {
  findConflictingTasks,
  formatDisplayDate,
  formatDuration,
  formatTime12h,
  getDurationMinutes,
} from '../utils/dateUtils';
import { Modal } from './ui/Modal';

interface SmartPlanModalProps {
  open: boolean;
  onClose: () => void;
  targetDate: string;
  summaryNote: string;
  proposals: ProposedScheduleChange[];
  diagnostics: RoutineDiagnostic[];
  existingTasksOnTargetDay: RoutineTask[];
  loadingAiEnrichment: boolean;
  onApplyAccepted: (acceptedProposals: ProposedScheduleChange[]) => void;
}

export function SmartPlanModal({
  open,
  onClose,
  targetDate,
  summaryNote,
  proposals: initialProposals,
  diagnostics,
  existingTasksOnTargetDay,
  loadingAiEnrichment,
  onApplyAccepted,
}: SmartPlanModalProps) {
  const [items, setItems] = useState<ProposedScheduleChange[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setItems(initialProposals);
      setEditingId(null);
    }
  }, [open, initialProposals]);

  const setApproval = (id: string, state: ProposedScheduleChange['approvalState']) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, approvalState: state } : item))
    );
  };

  const updateItem = (id: string, patch: Partial<ProposedScheduleChange>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        next.durationMinutes = getDurationMinutes(
          next.suggestedStartTime,
          next.suggestedEndTime
        );
        return next;
      })
    );
  };

  const acceptedCount = items.filter((i) => i.approvalState === 'accepted').length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Smart Plan Preview — ${formatDisplayDate(targetDate)}`}
      subtitle="Review rule-validated proposals and AI recommendations before applying."
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Strategic Summary */}
        <div className="p-4 rounded-lg bg-[#0B101B] border border-white/10 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {loadingAiEnrichment
                ? 'Analyzing schedule & refining recommendations...'
                : 'Schedule Intelligence Summary'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{summaryNote}</p>
        </div>

        {/* Diagnostics */}
        {diagnostics.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">
              Routine Health Diagnostics ({diagnostics.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {diagnostics.map((d) => (
                <div
                  key={d.id}
                  className="p-3 rounded-lg bg-[#0B101B] border border-white/8 space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{d.issue}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{d.evidence}</p>
                  <p className="text-[11px] text-slate-300">{d.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proposed Changes */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300">
              Proposed Schedule Adjustments ({items.length})
            </h3>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setItems((prev) =>
                    prev.map((i) => ({ ...i, approvalState: 'accepted' }))
                  )
                }
                className="text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Accept All
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-6 rounded-lg bg-[#0B101B] border border-white/8 text-center text-xs text-slate-400">
              Tomorrow&apos;s routine already covers your core pillars within capacity and has no urgent missed carry-overs.
            </div>
          ) : (
            <div className="divide-y divide-white/8 border border-white/8 rounded-lg overflow-hidden bg-[#0B101B]">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                const conflicts = findConflictingTasks(
                  existingTasksOnTargetDay,
                  item.suggestedStartTime,
                  item.suggestedEndTime
                );

                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono tabular-nums text-blue-400 font-medium">
                            {formatTime12h(item.suggestedStartTime)} –{' '}
                            {formatTime12h(item.suggestedEndTime)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDuration(item.durationMinutes)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.priority} priority</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                        </div>

                        <p className="text-sm font-semibold text-white">{item.title}</p>

                        {item.originalTime && (
                          <p className="text-xs text-slate-400 font-mono tabular-nums">
                            Original time: {item.originalTime}
                          </p>
                        )}
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Reason: {item.reason}
                        </p>

                        {conflicts.length > 0 && (
                          <p className="text-xs text-amber-400">
                            Overlaps with: {conflicts.map((c) => c.title).join(', ')}
                          </p>
                        )}
                      </div>

                      {/* Accept / Edit / Reject Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setApproval(item.id, 'accepted')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            item.approvalState === 'accepted'
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-[#111827] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border bg-[#111827] border-white/10 text-slate-300 hover:text-white transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setApproval(item.id, 'rejected')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            item.approvalState === 'rejected'
                              ? 'bg-rose-600/30 border-rose-500/50 text-rose-200'
                              : 'bg-[#111827] border-white/10 text-slate-400 hover:text-rose-300'
                          }`}
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="p-3 bg-[#111827] border border-white/10 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => updateItem(item.id, { title: e.target.value })}
                          className="sm:col-span-2 px-2.5 py-1.5 bg-[#0B101B] border border-white/10 rounded text-xs text-white"
                        />
                        <input
                          type="time"
                          value={item.suggestedStartTime}
                          onChange={(e) =>
                            updateItem(item.id, { suggestedStartTime: e.target.value })
                          }
                          className="px-2.5 py-1.5 bg-[#0B101B] border border-white/10 rounded text-xs font-mono tabular-nums text-white"
                        />
                        <input
                          type="time"
                          value={item.suggestedEndTime}
                          onChange={(e) =>
                            updateItem(item.id, { suggestedEndTime: e.target.value })
                          }
                          className="px-2.5 py-1.5 bg-[#0B101B] border border-white/10 rounded text-xs font-mono tabular-nums text-white"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/8">
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {acceptedCount} change(s) ready to apply
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 rounded-lg"
            >
              Close Without Applying
            </button>
            <button
              type="button"
              disabled={acceptedCount === 0}
              onClick={() => {
                onApplyAccepted(items.filter((i) => i.approvalState === 'accepted'));
                onClose();
              }}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors"
            >
              Apply Accepted Changes ({acceptedCount})
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
