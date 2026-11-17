import React, { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { DailyReviewEntry, DayPlan } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';

interface DailyReviewModalProps {
  open: boolean;
  onClose: () => void;
  day: DayPlan | undefined;
  onSave: (dateStr: string, review: DailyReviewEntry) => void;
}

const MOODS: DailyReviewEntry['mood'][] = ['Focused', 'Steady', 'Energized', 'Struggling'];

export function DailyReviewModal({ open, onClose, day, onSave }: DailyReviewModalProps) {
  const [mood, setMood] = useState<DailyReviewEntry['mood']>('Focused');
  const [wins, setWins] = useState('');
  const [reflection, setReflection] = useState('');

  useEffect(() => {
    if (!open || !day) return;
    setMood(day.dailyReview?.mood || 'Focused');
    setWins(day.dailyReview?.wins || '');
    setReflection(day.dailyReview?.reflection || '');
  }, [open, day]);

  if (!day) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(day.date, {
      mood,
      wins: wins.trim(),
      reflection: reflection.trim(),
      completedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Daily Execution Review — Day ${day.dayNumber}`}
      subtitle={formatDisplayDate(day.date)}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-2">
            Execution State Today
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(m)}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  mood === m
                    ? 'bg-gold-soft border-gold-border text-gold'
                    : 'bg-surface border-subtle text-muted hover:text-main'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">
            Key Wins &amp; Completed Focus
          </label>
          <textarea
            rows={2}
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            placeholder="What did you execute cleanly today?"
            className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main placeholder:text-muted/70 focus:outline-none focus:border-gold resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">
            Lessons &amp; Tomorrow&apos;s Adjustment
          </label>
          <textarea
            rows={3}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What caused friction, and how will tomorrow run smoother?"
            className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main placeholder:text-muted/70 focus:outline-none focus:border-gold resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
          >
            Save Daily Review
          </button>
        </div>
      </form>
    </Modal>
  );
}
