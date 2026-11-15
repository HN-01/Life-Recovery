import { AppState, BackupEnvelope } from '../types';
import { createInitialAppState } from '../data/starterData';

const STORAGE_KEY = 'project_rebuild_me_state_v1';

export interface ExecutionRepository {
  load(): AppState;
  save(state: AppState): void;
  reset(): AppState;
  hasLocalData(): boolean;
  peekLocalData(): AppState | null;
  clearLocalData(): void;
  exportBackupJson(state: AppState, uid?: string): string;
  validateAndParseBackup(jsonText: string): { state: AppState; exportedAt?: string };
}

class LocalStorageRepository implements ExecutionRepository {
  hasLocalData(): boolean {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as AppState;
      return Boolean(parsed && parsed.profile && parsed.days && Object.keys(parsed.days).length > 0);
    } catch {
      return false;
    }
  }

  peekLocalData(): AppState | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed || typeof parsed !== 'object' || !parsed.days || !parsed.profile) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  clearLocalData(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  load(): AppState {
    const local = this.peekLocalData();
    if (local) return local;
    const initial = createInitialAppState({ onboardingCompleted: false });
    this.save(initial);
    return initial;
  }

  save(state: AppState): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors gracefully
    }
  }

  reset(): AppState {
    const fresh = createInitialAppState({ onboardingCompleted: false });
    this.save(fresh);
    return fresh;
  }

  exportBackupJson(state: AppState, uid?: string): string {
    const envelope: BackupEnvelope = {
      app: 'PROJECT_REBUILD_ME',
      version: 2,
      exportedAt: new Date().toISOString(),
      uid,
      data: state,
    };
    return JSON.stringify(envelope, null, 2);
  }

  validateAndParseBackup(jsonText: string): { state: AppState; exportedAt?: string } {
    const raw = JSON.parse(jsonText) as Partial<BackupEnvelope> & Partial<AppState>;
    if (!raw || typeof raw !== 'object') {
      throw new Error('Backup file is empty or invalid JSON.');
    }

    let candidate: Partial<AppState>;
    let exportedAt: string | undefined;

    if (raw.app === 'PROJECT_REBUILD_ME' && raw.data) {
      candidate = raw.data;
      exportedAt = raw.exportedAt;
    } else {
      candidate = raw as Partial<AppState>;
    }

    if (
      !candidate.profile ||
      typeof candidate.profile.name !== 'string' ||
      !candidate.days ||
      typeof candidate.days !== 'object' ||
      !Array.isArray(candidate.habits) ||
      !Array.isArray(candidate.goals) ||
      !Array.isArray(candidate.projects)
    ) {
      throw new Error(
        'Backup validation failed: missing required profile, days, habits, goals, or projects fields.'
      );
    }

    return {
      state: {
        version: candidate.version ?? 1,
        profile: candidate.profile,
        days: candidate.days,
        templates: candidate.templates ?? createInitialAppState().templates,
        habits: candidate.habits,
        goals: candidate.goals,
        projects: candidate.projects,
        weeklyReviews: Array.isArray(candidate.weeklyReviews) ? candidate.weeklyReviews : [],
        coachConversations: Array.isArray(candidate.coachConversations)
          ? candidate.coachConversations
          : [],
      },
      exportedAt,
    };
  }
}

export const storageRepo: ExecutionRepository = new LocalStorageRepository();
