export interface JournalEntry {
  id: string;        // unique: "2026-02-25-1740500000000"
  date: string;      // "2026-02-25"
  text: string;
  mood: string;      // space-separated emojis for multi-select
  prompt?: string;
  timestamp: number;
  edited?: boolean;
}

export interface UserProfile {
  aboutMe: string;
  currentSeason: string;
  preferences: string;
  avoidances: string;
}

export interface AppSettings {
  apiKey: string;
}

// ── Helper: typed fetch with error handling ──
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Entries ──
export async function saveEntry(entry: JournalEntry): Promise<void> {
  await apiFetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
}

export async function getEntryById(id: string): Promise<JournalEntry | undefined> {
  try {
    return await apiFetch<JournalEntry>(`/api/entries/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}

export async function getAllEntries(): Promise<JournalEntry[]> {
  return apiFetch<JournalEntry[]>('/api/entries');
}

export async function deleteEntry(id: string): Promise<void> {
  await apiFetch(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Streak ──
export async function getStreak(): Promise<number> {
  const data = await apiFetch<{ streak: number }>('/api/streak');
  return data.streak;
}

// ── Profile ──
export async function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/profile');
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await apiFetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

// ── Settings (stays client-side in localStorage — API key never touches the DB) ──
const SETTINGS_KEY = 'gratitude-app-settings';

export async function getSettings(): Promise<AppSettings> {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? JSON.parse(stored) : { apiKey: '' };
  } catch {
    return { apiKey: '' };
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

// ── Export / Import ──
export async function exportData(): Promise<string> {
  const data = await apiFetch<object>('/api/export');
  return JSON.stringify(data, null, 2);
}

export async function importData(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (!data.version) throw new Error('Invalid format');

  await apiFetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entries: data.entries,
      profile: data.profile,
    }),
  });

  if (data.settings?.apiKey) {
    await saveSettings({ apiKey: data.settings.apiKey });
  }
}
