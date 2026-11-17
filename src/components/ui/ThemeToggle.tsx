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
    description: 'Clean #F5F5F7 canvas with crisp white cards',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark Mode',
    shortLabel: 'Dark',
    description: 'Deep #0A0A0C surface with #141419 charcoal cards',
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
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [variant, open]);

  if (variant === 'quick') {
    const isDark = resolvedTheme === 'dark';
    const nextTheme: ThemePreference = isDark ? 'light' : 'dark';
    const ActiveIcon = isDark ? Moon : Sun;
    return (
      <div className="relative shrink-0" ref={containerRef}>
        <div className="inline-flex items-center bg-card border border-subtle hover:border-gold-border rounded-xl shadow-xs dark:shadow-none transition-colors">
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
            className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-2 text-xs font-medium text-main hover:bg-surface rounded-l-xl transition-colors"
          >
            <ActiveIcon className="w-4 h-4 shrink-0 text-gold" />
            <span className="hidden md:inline">{isDark ? 'Dark' : 'Light'}</span>
          </button>
          <span className="w-px h-4 bg-subtle" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Theme options (Light Mode, Dark Mode, System Default)"
            aria-expanded={open}
            aria-haspopup="menu"
            title="Theme options"
            className="px-1.5 py-2 text-muted hover:text-main hover:bg-surface rounded-r-xl transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {open && (
          <div
            role="menu"
            aria-label="Theme options"
            className="absolute right-0 mt-2 w-56 bg-card border border-subtle rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden z-50 p-1.5"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted">
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
                      ? 'bg-gold-soft text-gold font-medium'
                      : 'text-main hover:bg-surface'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-gold' : 'text-muted'
                      }`}
                    />
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-gold shrink-0" />}
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
                    ? 'bg-gold-soft border-gold-border text-main'
                    : 'bg-surface border-subtle text-muted hover:text-main hover:border-gold-border/60'
                }`}
              >
                <div
                  className={`p-2 rounded-lg shrink-0 border ${
                    active
                      ? 'bg-gold-soft border-gold-border text-gold'
                      : 'bg-card border-subtle text-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-main">{opt.label}</span>
                    {active && <Check className="w-3.5 h-3.5 text-gold shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted mt-0.5 leading-snug">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted">
          Active appearance:{' '}
          <span className="font-medium text-main capitalize">
            {resolvedTheme} mode
          </span>
          {preference === 'system' ? ' (synced with your device)' : ''}
        </p>
      </div>
    );
  }

  const ActiveIcon = resolvedTheme === 'dark' ? Moon : Sun;
  const activeOption = THEME_OPTIONS.find((o) => o.id === preference) || THEME_OPTIONS[1];

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Theme: ${activeOption.label}. Open theme selector`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Theme: ${activeOption.label}`}
        className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium text-main bg-card border border-subtle hover:border-gold-border rounded-xl shadow-xs dark:shadow-none transition-colors"
      >
        <ActiveIcon className="w-4 h-4 shrink-0 text-gold" />
        <span className="hidden md:inline">{activeOption.shortLabel}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          className="absolute right-0 mt-2 w-56 bg-card border border-subtle rounded-2xl shadow-xl dark:shadow-2xl overflow-hidden z-50 p-1.5"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-medium text-muted">
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
                    ? 'bg-gold-soft text-gold font-medium'
                    : 'text-main hover:bg-surface'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? 'text-gold' : 'text-muted'
                    }`}
                  />
                  <span className="truncate">{opt.label}</span>
                </span>
                {active && <Check className="w-3.5 h-3.5 text-gold shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
