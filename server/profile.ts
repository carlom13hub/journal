import type { Request, Response } from 'express';
import { query } from './db.js';

// GET /api/profile
export async function getProfile(_req: Request, res: Response) {
  try {
    const result = await query(
      'SELECT about_me, current_season, preferences, avoidances FROM user_profile WHERE id = $1',
      ['main']
    );
    const row = result.rows[0];
    res.json({
      aboutMe: row?.about_me || '',
      currentSeason: row?.current_season || '',
      preferences: row?.preferences || '',
      avoidances: row?.avoidances || '',
    });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

// PUT /api/profile
export async function saveProfile(req: Request, res: Response) {
  try {
    const { aboutMe, currentSeason, preferences, avoidances } = req.body;
    await query(
      `UPDATE user_profile
       SET about_me = $1, current_season = $2, preferences = $3, avoidances = $4
       WHERE id = 'main'`,
      [aboutMe || '', currentSeason || '', preferences || '', avoidances || '']
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('saveProfile error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
}
