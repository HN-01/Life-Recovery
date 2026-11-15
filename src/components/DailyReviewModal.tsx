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
          <label className="block text-xs font-medium text-slate-400 mb-2">
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
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                    : 'bg-[#0B101B] border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Key Wins & Completed Focus
          </label>
          <textarea
            rows={2}
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            placeholder="What did you execute cleanly today?"
            className="w-full px-3.5 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Lessons & Tomorrow&apos;s Adjustment
          </label>
          <textarea
            rows={3}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="What caused friction, and how will tomorrow run smoother?"
            className="w-full px-3.5 py-2.5 bg-[#0B101B] border border-white/10 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Save Daily Review
          </button>
        </div>
      </form>
    </Modal>
  );
}
