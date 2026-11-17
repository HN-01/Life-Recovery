import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference, useTheme } from '../../utils/theme';

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    id: 'light',
    label: 'Light Mode',
    shortLabel: 'Light',
    description: 'Clean off-white canvas with crisp white cards',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark Mode',
    shortLabel: 'Dark',
    description: 'Deep #0A0A0C surface with dark charcoal cards',
    icon: Moon,
  },
  {
    id: 'system',
    label: 'System Default',
    shortLabel: 'System',
    description: 'Automatically matches your device setting',
    icon: Monitor,
  },
];

interface ThemeToggleProps {
  variant?: 'dropdown' | 'segmented' | 'quick';
}

export function ThemeToggle({ variant = 'dropdown' }: ThemeToggleProps) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant === 'segmented' || !open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [variant, open]);

  if (variant === 'quick') {
    const isDark = resolvedTheme === 'dark';
    const nextTheme: ThemePreference = isDark ? 'light' : 'dark';
    const ActiveIcon = isDark ? Moon : Sun;
    return (
      <div className="relative shrink-0" ref={containerRef}>
        <div className="inline-flex items-center bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/12 hover:border-amber-500/45 dark:hover:border-amber-400/45 rounded-xl shadow-xs dark:shadow-none transition-colors">
          <button
            type="button"
            onClick={() => {
              setPreference(nextTheme);
              setOpen(false);
            }}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-pressed={isDark}
            title={
              isDark
                ? 'Dark Mode active — click to switch to Light Mode'
                : 'Light Mode active — click to switch to Dark Mode'
            }
            className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-l-xl hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-colors"
          >
            <ActiveIcon
              className={`w-4 h-4 shrink-0 ${
                isDark ? 'text-amber-400' : 'text-amber-600'
              }`}
            />
            <span className="hidden md:inline">{isDark ? 'Dark' : 'Light'}</span>
          </button>
          <span
            className="w-px h-4 bg-slate-200 dark:bg-white/10"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Theme options (Light Mode, Dark Mode, System Default)"
            aria-expanded={open}
            aria-haspopup="menu"
            title="Theme options"
            className="px-1.5 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-r-xl hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {open && (
          <div
            role="menu"
            aria-label="Theme options"
            className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/12 rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden z-50 p-1.5"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Appearance
            </div>
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = preference === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setPreference(opt.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors text-left ${
                    active
                      ? 'bg-amber-500/12 text-amber-800 dark:text-amber-300 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    />
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {active && (
                    <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'segmented') {
    return (
      <div className="space-y-3">
        <div
          role="radiogroup"
          aria-label="Theme preference"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = preference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(opt.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-amber-500/12 border-amber-500/45 text-slate-900 dark:text-white'
                    : 'bg-slate-50 dark:bg-[#0B101B] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    active
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : 'bg-white dark:bg-[#111827] text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-white/8'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{opt.label}</span>
                    {active && (
                      <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Active appearance:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">
            {resolvedTheme} mode
          </span>
          {preference === 'system' ? ' (synced with your device)' : ''}
        </p>
      </div>
    );
  }

  const ActiveIcon =
    preference === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  const activeOption = THEME_OPTIONS.find((o) => o.id === preference) || THEME_OPTIONS[1];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Theme: ${activeOption.label}. Change theme`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Theme: ${activeOption.label}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 rounded-xl transition-colors"
      >
        <ActiveIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="hidden md:inline">{activeOption.shortLabel}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/12 rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden z-50 p-1.5"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Appearance
          </div>
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = preference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setPreference(opt.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors text-left ${
                  active
                    ? 'bg-amber-500/12 text-amber-800 dark:text-amber-300 font-medium'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span className="truncate">{opt.label}</span>
                </span>
                {active && (
                  <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
