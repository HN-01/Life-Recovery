import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <div className="flex items-start gap-3">
        <div
          className={`p-2.5 rounded-lg border shrink-0 ${
            danger
              ? 'bg-rose-soft border-rose-border text-rose-muted'
              : 'bg-gold-soft border-gold-border text-gold'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-muted leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-subtle">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            danger
              ? 'bg-rose-muted hover:bg-rose-muted-hover text-on-rose'
              : 'bg-gold hover:bg-gold-hover text-on-gold'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
