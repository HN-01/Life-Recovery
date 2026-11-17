import React, { useState } from 'react';
import { ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import {
  ALL_CATEGORIES,
  createId,
  DEFAULT_TEMPLATES,
  LIFE_AREAS,
} from '../data/starterData';
import { FixedCommitment, LifeArea, TaskCategory, TemplateTask } from '../types';
import { getKarachiNow } from '../utils/dateUtils';

interface OnboardingWizardProps {
  onComplete: (config: {
    name: string;
    startDate: string;
    wakeTime: string;
    sleepTime: string;
    fixedCommitments: FixedCommitment[];
    primaryGoalAreas: LifeArea[];
    customNormalTemplate: TemplateTask[];
  }) => void;
  onSkip: () => void;
}

const WEEKDAYS = [
  { idx: 1, label: 'Mon' },
  { idx: 2, label: 'Tue' },
  { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' },
  { idx: 5, label: 'Fri' },
  { idx: 6, label: 'Sat' },
  { idx: 0, label: 'Sun' },
];

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const now = getKarachiNow();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [name, setName] = useState('Student Builder');
  const [startDate, setStartDate] = useState(now.dateStr);
  const [wakeTime, setWakeTime] = useState('05:30');
  const [sleepTime, setSleepTime] = useState('22:30');

  const [fixedCommitments, setFixedCommitments] = useState<FixedCommitment[]>([
    {
      id: createId('fc'),
      title: 'University Morning Block',
      startTime: '08:30',
      endTime: '13:00',
      daysOfWeek: [1, 2, 3, 4],
      category: 'University',
    },
  ]);

  const [newCommitTitle, setNewCommitTitle] = useState('');
  const [newCommitStart, setNewCommitStart] = useState('14:00');
  const [newCommitEnd, setNewCommitEnd] = useState('15:30');
  const [newCommitCat, setNewCommitCat] = useState<TaskCategory>('University');
  const [newCommitDays, setNewCommitDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [primaryGoalAreas, setPrimaryGoalAreas] = useState<LifeArea[]>([...LIFE_AREAS]);
  const [routineBlocks, setRoutineBlocks] = useState<TemplateTask[]>(() =>
    JSON.parse(JSON.stringify(DEFAULT_TEMPLATES.normal))
  );

  const toggleGoalArea = (area: LifeArea) => {
    setPrimaryGoalAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const addCommitment = () => {
    if (!newCommitTitle.trim()) return;
    setFixedCommitments((prev) => [
      ...prev,
      {
        id: createId('fc'),
        title: newCommitTitle.trim(),
        startTime: newCommitStart,
        endTime: newCommitEnd,
        daysOfWeek: newCommitDays.length > 0 ? newCommitDays : [1, 2, 3, 4, 5],
        category: newCommitCat,
      },
    ]);
    setNewCommitTitle('');
  };

  const updateRoutineBlock = (idx: number, patch: Partial<TemplateTask>) => {
    setRoutineBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const removeRoutineBlock = (idx: number) => {
    setRoutineBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFinish = () => {
    onComplete({
      name,
      startDate,
      wakeTime,
      sleepTime,
      fixedCommitments,
      primaryGoalAreas: primaryGoalAreas.length > 0 ? primaryGoalAreas : [...LIFE_AREAS],
      customNormalTemplate: routineBlocks,
    });
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#0A0A0C] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 sm:px-8 py-6 border-b border-slate-200 dark:border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 tracking-wide">
              PROJECT REBUILD ME · 30-DAY SETUP
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mt-1">
              Configure Your 30-Day Execution System
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Plan your days. Build your discipline. Rebuild your life.
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 hover:bg-slate-200/70 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            Skip Setup &amp; Use Sample Data
          </button>
        </div>

        {/* Stepper Indicator */}
        <div className="px-6 sm:px-8 py-3.5 bg-slate-50 dark:bg-[#0D0E12] border-b border-slate-200 dark:border-white/8 flex items-center gap-6 text-xs overflow-x-auto">
          {[
            { num: 1, label: '01. Schedule Anchors' },
            { num: 2, label: '02. Commitments & Goals' },
            { num: 3, label: '03. Baseline Routine' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              onClick={() => setStep(item.num as 1 | 2 | 3)}
              className={`font-medium transition-colors whitespace-nowrap ${
                step === item.num
                  ? 'text-amber-700 dark:text-amber-400'
                  : step > item.num
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-6 sm:p-8 max-h-[65vh] overflow-y-auto space-y-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Your Name or Handle
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Challenge Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Target Wake-Up Time
                  </label>
                  <input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Target Sleep Time
                  </label>
                  <input
                    type="time"
                    value={sleepTime}
                    onChange={(e) => setSleepTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                All timestamps, daily transitions, and active-block indicators run strictly on{' '}
                <span className="text-slate-900 dark:text-slate-200 font-medium">
                  Asia/Karachi (PKT, UTC+05:00)
                </span>
                .
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                  Primary Focus Areas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Select the life pillars you want to prioritize over the next 30 days.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {LIFE_AREAS.map((area) => {
                    const selected = primaryGoalAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleGoalArea(area)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-amber-500/12 border-amber-500/50 text-amber-800 dark:text-amber-200'
                            : 'bg-slate-50 dark:bg-[#0A0A0C] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <span>{area}</span>
                        {selected && (
                          <Check className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/8">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                  Fixed Weekly Commitments (University Classes, Labs, Tuition)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  These blocks will be automatically anchored on the selected weekdays.
                </p>

                <div className="space-y-2 mb-4">
                  {fixedCommitments.map((fc) => (
                    <div
                      key={fc.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-200 truncate">
                          {fc.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {fc.startTime} – {fc.endTime} · {fc.category}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFixedCommitments((prev) => prev.filter((item) => item.id !== fc.id))
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                        aria-label="Remove commitment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8 rounded-lg space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={newCommitTitle}
                      onChange={(e) => setNewCommitTitle(e.target.value)}
                      placeholder="Commitment title (e.g., CS Lab)"
                      className="px-3 py-2 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <select
                      value={newCommitCat}
                      onChange={(e) => setNewCommitCat(e.target.value as TaskCategory)}
                      className="px-3 py-2 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="time"
                      value={newCommitStart}
                      onChange={(e) => setNewCommitStart(e.target.value)}
                      className="px-3 py-2 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                    <span className="text-xs text-slate-500">to</span>
                    <input
                      type="time"
                      value={newCommitEnd}
                      onChange={(e) => setNewCommitEnd(e.target.value)}
                      className="px-3 py-2 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                    <div className="flex items-center gap-1 flex-wrap">
                      {WEEKDAYS.map((wd) => {
                        const active = newCommitDays.includes(wd.idx);
                        return (
                          <button
                            key={wd.idx}
                            type="button"
                            onClick={() =>
                              setNewCommitDays((prev) =>
                                prev.includes(wd.idx)
                                  ? prev.filter((d) => d !== wd.idx)
                                  : [...prev, wd.idx]
                              )
                            }
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                              active
                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-800 dark:text-amber-300'
                                : 'bg-white dark:bg-[#111216] border-slate-200 dark:border-white/10 text-slate-500'
                            }`}
                          >
                            {wd.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={addCommitment}
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Commitment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Review &amp; Fine-Tune Your Daily Routine Blocks
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Adjust timings or remove blocks you do not want in your default schedule. You can customize University, Weekend, Holiday, and Exam schedules anytime.
                </p>
              </div>
              <div className="space-y-2">
                {routineBlocks.map((block, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center p-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/8 rounded-lg"
                  >
                    <input
                      type="time"
                      value={block.startTime}
                      onChange={(e) => updateRoutineBlock(idx, { startTime: e.target.value })}
                      className="col-span-3 sm:col-span-2 px-2 py-1.5 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded text-xs font-mono tabular-nums text-slate-900 dark:text-slate-200"
                    />
                    <input
                      type="time"
                      value={block.endTime}
                      onChange={(e) => updateRoutineBlock(idx, { endTime: e.target.value })}
                      className="col-span-3 sm:col-span-2 px-2 py-1.5 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded text-xs font-mono tabular-nums text-slate-900 dark:text-slate-200"
                    />
                    <input
                      type="text"
                      value={block.title}
                      onChange={(e) => updateRoutineBlock(idx, { title: e.target.value })}
                      className="col-span-5 sm:col-span-5 px-2.5 py-1.5 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded text-xs text-slate-900 dark:text-slate-100"
                    />
                    <select
                      value={block.category}
                      onChange={(e) =>
                        updateRoutineBlock(idx, { category: e.target.value as TaskCategory })
                      }
                      className="hidden sm:block sm:col-span-2 px-2 py-1.5 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded text-xs text-slate-700 dark:text-slate-300"
                    >
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeRoutineBlock(idx)}
                      className="col-span-1 flex justify-center p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      aria-label="Delete block"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 sm:px-8 py-4 bg-slate-50 dark:bg-[#0D0E12] border-t border-slate-200 dark:border-white/8 flex items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-transparent rounded-lg transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
              >
                Launch 30-Day Plan
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
