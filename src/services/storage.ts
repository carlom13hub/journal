import { openDB, type IDBPDatabase } from 'idb';

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

const DB_NAME = 'gratitude-journal';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile');
        }
      },
    });
  }
  return dbPromise;
}

// Entries
export async function saveEntry(entry: JournalEntry) {
  const db = await getDB();
  await db.put('entries', entry);
}

export async function getEntryById(id: string): Promise<JournalEntry | undefined> {
  const db = await getDB();
  return await db.get('entries', id);
}

export async function getAllEntries(): Promise<JournalEntry[]> {
  const db = await getDB();
  const entries = await db.getAll('entries');
  // Sort by timestamp descending (newest first)
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteEntry(id: string) {
  const db = await getDB();
  await db.delete('entries', id);
}

// Streak — counts unique dates that have at least one entry
export async function getStreak(): Promise<number> {
  const entries = await getAllEntries();
  if (entries.length === 0) return 0;

  // Get unique dates sorted descending
  const dates = [...new Set(entries.map((e) => e.date))].sort().reverse();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  const yesterdayStr = toDateStr(new Date(today.getTime() - 86400000));

  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curr = new Date(dates[i] + 'T00:00:00');
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// Profile
export async function getProfile(): Promise<UserProfile> {
  const db = await getDB();
  const p = await db.get('profile', 'main');
  return p || { aboutMe: '', currentSeason: '', preferences: '', avoidances: '' };
}

export async function saveProfile(profile: UserProfile) {
  const db = await getDB();
  await db.put('profile', profile, 'main');
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const s = await db.get('settings', 'app');
  return s || { apiKey: '' };
}

export async function saveSettings(settings: Partial<AppSettings>) {
  const db = await getDB();
  const current = await getSettings();
  await db.put('settings', { ...current, ...settings }, 'app');
}

// Export / Import
export async function exportData(): Promise<string> {
  const db = await getDB();
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    entries: await db.getAll('entries'),
    profile: await db.get('profile', 'main'),
    settings: await db.get('settings', 'app'),
  }, null, 2);
}

export async function importData(json: string) {
  const data = JSON.parse(json);
  if (!data.version) throw new Error('Invalid format');
  const db = await getDB();
  if (data.entries) {
    const tx = db.transaction('entries', 'readwrite');
    for (const e of data.entries) await tx.store.put(e);
    await tx.done;
  }
  if (data.profile) {
    await db.put('profile', data.profile, 'main');
  }
  if (data.settings) {
    await db.put('settings', data.settings, 'app');
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}
