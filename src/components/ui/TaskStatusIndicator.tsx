import { CheckCircle2, Clock, PlayCircle, XCircle, MinusCircle } from 'lucide-react';
import { EffectiveTaskDisplayState } from '../../utils/dateUtils';

interface TaskStatusIndicatorProps {
  state: EffectiveTaskDisplayState;
}

export function TaskStatusIndicator({ state }: TaskStatusIndicatorProps) {
  switch (state) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-accent whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Completed
        </span>
      );
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gold whitespace-nowrap shrink-0">
          <PlayCircle className="w-3.5 h-3.5" />
          Pending · Active
        </span>
      );
    case 'missed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-muted whitespace-nowrap shrink-0">
          <XCircle className="w-3.5 h-3.5" />
          Missed
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-status whitespace-nowrap shrink-0">
          <MinusCircle className="w-3.5 h-3.5" />
          Skipped
        </span>
      );
    case 'upcoming':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gold/85 whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5" />
          Pending
        </span>
      );
  }
}
