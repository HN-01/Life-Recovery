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
          className={`p-2.5 rounded-lg shrink-0 ${
            danger ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/8">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
