import type { Request, Response } from 'express';
import { query } from './db.js';

// GET /api/entries
export async function getAllEntries(_req: Request, res: Response) {
  try {
    const result = await query(
      'SELECT id, date, text, mood, prompt, timestamp, edited FROM journal_entries ORDER BY timestamp DESC'
    );
    res.json(result.rows.map(rowToEntry));
  } catch (err) {
    console.error('getAllEntries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
}

// GET /api/entries/:id
export async function getEntryById(req: Request, res: Response) {
  try {
    const result = await query(
      'SELECT id, date, text, mood, prompt, timestamp, edited FROM journal_entries WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    res.json(rowToEntry(result.rows[0]));
  } catch (err) {
    console.error('getEntryById error:', err);
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
}

// POST /api/entries
export async function saveEntry(req: Request, res: Response) {
  try {
    const { id, date, text, mood, prompt, timestamp, edited } = req.body;
    if (!id || !date || !text || timestamp == null) {
      res.status(400).json({ error: 'Missing required fields: id, date, text, timestamp' });
      return;
    }
    await query(
      `INSERT INTO journal_entries (id, date, text, mood, prompt, timestamp, edited)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         text = EXCLUDED.text,
         mood = EXCLUDED.mood,
         prompt = EXCLUDED.prompt,
         timestamp = EXCLUDED.timestamp,
         edited = EXCLUDED.edited`,
      [id, date, text, mood || '', prompt || null, timestamp, edited || false]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('saveEntry error:', err);
    res.status(500).json({ error: 'Failed to save entry' });
  }
}

// DELETE /api/entries/:id
export async function deleteEntry(req: Request, res: Response) {
  try {
    await query('DELETE FROM journal_entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteEntry error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
}

// DELETE /api/entries (all)
export async function deleteAllData(_req: Request, res: Response) {
  try {
    await query('DELETE FROM journal_entries');
    await query(`UPDATE user_profile SET about_me = '', current_season = '', preferences = '', avoidances = '' WHERE id = 'main'`);
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteAllData error:', err);
    res.status(500).json({ error: 'Failed to clear data' });
  }
}

// GET /api/streak
export async function getStreak(_req: Request, res: Response) {
  try {
    const result = await query(
      'SELECT DISTINCT date FROM journal_entries ORDER BY date DESC'
    );
    const dates = result.rows.map((r) => r.date as string);

    if (dates.length === 0) {
      res.json({ streak: 0 });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);
    const yesterdayStr = toDateStr(new Date(today.getTime() - 86400000));

    if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
      res.json({ streak: 0 });
      return;
    }

    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T00:00:00');
      const curr = new Date(dates[i] + 'T00:00:00');
      const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
      if (diff === 1) streak++;
      else break;
    }

    res.json({ streak });
  } catch (err) {
    console.error('getStreak error:', err);
    res.status(500).json({ error: 'Failed to calculate streak' });
  }
}

// GET /api/export
export async function exportData(_req: Request, res: Response) {
  try {
    const entriesResult = await query(
      'SELECT id, date, text, mood, prompt, timestamp, edited FROM journal_entries ORDER BY timestamp DESC'
    );
    const profileResult = await query(
      'SELECT about_me, current_season, preferences, avoidances FROM user_profile WHERE id = $1',
      ['main']
    );
    const row = profileResult.rows[0];

    res.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      entries: entriesResult.rows.map(rowToEntry),
      profile: row ? {
        aboutMe: row.about_me,
        currentSeason: row.current_season,
        preferences: row.preferences,
        avoidances: row.avoidances,
      } : null,
    });
  } catch (err) {
    console.error('exportData error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
}

// POST /api/import
export async function importData(req: Request, res: Response) {
  try {
    const { entries, profile } = req.body;
    if (entries && Array.isArray(entries)) {
      for (const e of entries) {
        await query(
          `INSERT INTO journal_entries (id, date, text, mood, prompt, timestamp, edited)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             text = EXCLUDED.text, mood = EXCLUDED.mood, prompt = EXCLUDED.prompt,
             timestamp = EXCLUDED.timestamp, edited = EXCLUDED.edited`,
          [e.id, e.date, e.text, e.mood || '', e.prompt || null, e.timestamp, e.edited || false]
        );
      }
    }
    if (profile) {
      await query(
        `UPDATE user_profile SET about_me = $1, current_season = $2, preferences = $3, avoidances = $4 WHERE id = 'main'`,
        [profile.aboutMe || '', profile.currentSeason || '', profile.preferences || '', profile.avoidances || '']
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('importData error:', err);
    res.status(500).json({ error: 'Failed to import data' });
  }
}

function rowToEntry(row: any) {
  return {
    id: row.id,
    date: row.date,
    text: row.text,
    mood: row.mood,
    prompt: row.prompt || undefined,
    timestamp: Number(row.timestamp),
    edited: row.edited || undefined,
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}
