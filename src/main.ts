import {
  saveEntry, getAllEntries, getStreak,
  getSettings, saveSettings, getProfile, saveProfile,
  exportData, importData,
  type JournalEntry, type UserProfile,
} from './services/storage';
import { sendMessage } from './services/api';

// ── Emotion levels (slider: 0=Very Unpleasant → 6=Very Pleasant) ──
const EMOTION_LEVELS = [
  { label: 'Very Unpleasant',    points: 8, amp: 28, color: '#7C3AED', bgStart: '#D8C8F0', bgEnd: '#C4B0E0' },
  { label: 'Unpleasant',         points: 8, amp: 22, color: '#4F46E5', bgStart: '#CCD4F0', bgEnd: '#B4BEE0' },
  { label: 'Slightly Unpleasant', points: 7, amp: 16, color: '#3B82F6', bgStart: '#D4DFF4', bgEnd: '#BCC8E0' },
  { label: 'Neutral',            points: 0, amp: 0,  color: '#5BC0CE', bgStart: '#E4F0F4', bgEnd: '#D4E4EC' },
  { label: 'Slightly Pleasant',  points: 5, amp: 16, color: '#22C55E', bgStart: '#D4F0D8', bgEnd: '#B8E0C0' },
  { label: 'Pleasant',           points: 5, amp: 24, color: '#B8960C', bgStart: '#F0EAC8', bgEnd: '#E4DCA8' },
  { label: 'Very Pleasant',      points: 5, amp: 30, color: '#EA580C', bgStart: '#F0DCC8', bgEnd: '#E4C8A8' },
];

// ── Moods with labels ──
const MOODS: Array<{ emoji: string; label: string }> = [
  { emoji: '😊', label: 'Happy' },
  { emoji: '😌', label: 'Calm' },
  { emoji: '🙏', label: 'Grateful' },
  { emoji: '💪', label: 'Strong' },
  { emoji: '🤩', label: 'Excited' },
  { emoji: '🥰', label: 'Loved' },
  { emoji: '😔', label: 'Down' },
  { emoji: '😤', label: 'Frustrated' },
  { emoji: '😰', label: 'Anxious' },
  { emoji: '😴', label: 'Tired' },
  { emoji: '😶', label: 'Numb' },
  { emoji: '🤔', label: 'Reflective' },
];

const app = document.getElementById('app')!;
let currentTab: 'journal' | 'entries' | 'profile' = 'journal';
let selectedMoods: Set<string> = new Set();
let aiPrompt = '';
let currentEmotion = 3; // default to Neutral

async function init() {
  await renderApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Shell: header + tabs + page content ──
async function renderApp() {
  const streak = await getStreak();

  app.innerHTML = `
    <div class="header">
      <h1>Carlo's Journal</h1>
      <div class="header-right">
        <div class="streak-badge">
          <span class="flame">${streak > 0 ? '🔥' : '✨'}</span>
          <span>${streak} day${streak !== 1 ? 's' : ''}</span>
        </div>
        <button class="gear-btn" id="settings-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>

    <div class="tab-bar">
      <button class="tab${currentTab === 'journal' ? ' active' : ''}" data-tab="journal">Journal</button>
      <button class="tab${currentTab === 'entries' ? ' active' : ''}" data-tab="entries">Entries</button>
      <button class="tab${currentTab === 'profile' ? ' active' : ''}" data-tab="profile">My Profile</button>
    </div>

    <div id="page"></div>
  `;

  // Tab switching
  app.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = (btn as HTMLElement).dataset.tab as typeof currentTab;
      renderApp();
    });
  });

  // Settings gear
  app.querySelector('#settings-btn')?.addEventListener('click', openSettings);

  // Render current page
  const page = app.querySelector('#page') as HTMLElement;
  if (currentTab === 'journal') await renderJournal(page);
  else if (currentTab === 'entries') await renderEntries(page);
  else if (currentTab === 'profile') await renderProfile(page);
}

// ── Emotion shape SVG generation ──
function polarPath(cx: number, cy: number, r: number, points: number, amp: number, phase: number): string {
  if (points === 0 || amp === 0) {
    return `M${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy}`;
  }
  const steps = 200;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const radius = r + amp * Math.cos(points * theta + phase);
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    d += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + 'Z';
}

function generateEmotionSVG(level: number): string {
  const e = EMOTION_LEVELS[level];
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const layers = [
    { r: 95, opacity: 0.10, phase: 0 },
    { r: 80, opacity: 0.18, phase: 0.35 },
    { r: 65, opacity: 0.30, phase: 0.7 },
    { r: 48, opacity: 0.50, phase: 1.05 },
  ];
  let svg = `<svg class="emotion-svg" viewBox="0 0 ${size} ${size}">`;
  for (const l of layers) {
    const ampScale = l.r / 95;
    const path = polarPath(cx, cy, l.r, e.points, e.amp * ampScale, l.phase);
    svg += `<path d="${path}" fill="${e.color}" fill-opacity="${l.opacity}" />`;
  }
  svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="${e.color}" fill-opacity="0.85" />`;
  svg += '</svg>';
  return svg;
}

function emotionCardHTML(level: number): string {
  const e = EMOTION_LEVELS[level];
  return `
    <div class="emotion-card" id="emotion-card" style="background: linear-gradient(180deg, ${e.bgStart} 0%, ${e.bgEnd} 100%)">
      <div class="emotion-shape-bg">
        ${generateEmotionSVG(level)}
      </div>
      <div class="emotion-content">
        <div class="emotion-label-text">${e.label}</div>
        <div class="emotion-slider-wrap">
          <input type="range" id="emotion-slider" class="emotion-slider" min="0" max="6" step="1" value="${level}" />
          <div class="emotion-slider-labels">
            <span>VERY UNPLEASANT</span>
            <span>VERY PLEASANT</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════
// ── JOURNAL TAB ──
// ════════════════════════════════════════════
async function renderJournal(page: HTMLElement) {
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  page.innerHTML = `
    <div class="date-label">${dateStr}</div>

    <div class="mood-section">
      <div class="mood-label">How are you feeling? <span class="mood-hint">(pick as many as you like)</span></div>
      <div class="mood-grid">
        ${MOODS.map((m) => `
          <button class="mood-btn${selectedMoods.has(m.emoji) ? ' selected' : ''}" data-mood="${m.emoji}">
            <span class="mood-emoji">${m.emoji}</span>
            <span class="mood-name">${m.label}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <div id="emotion-area">
      ${emotionCardHTML(currentEmotion)}
    </div>

    <div id="ai-prompt-area">
      ${aiPrompt ? `<div class="ai-prompt">${esc(aiPrompt)}</div>` : ''}
    </div>

    <div class="entry-section">
      <textarea class="entry-textarea" id="entry-text"
        placeholder="What are you grateful for or what do you want to dump..."></textarea>
    </div>

    <div class="actions">
      <button class="btn-prompt" id="prompt-btn">✨ Give me a prompt</button>
      <button class="btn-save" id="save-btn">Save Entry</button>
    </div>
  `;

  // Mood buttons — toggle multi-select
  page.querySelectorAll('.mood-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mood = (btn as HTMLElement).dataset.mood || '';
      if (selectedMoods.has(mood)) {
        selectedMoods.delete(mood);
        btn.classList.remove('selected');
      } else {
        selectedMoods.add(mood);
        btn.classList.add('selected');
      }
    });
  });

  // Emotion slider — update card visuals without replacing the slider element
  const emotionSlider = page.querySelector('#emotion-slider') as HTMLInputElement;
  emotionSlider?.addEventListener('input', () => {
    currentEmotion = parseInt(emotionSlider.value, 10);
    const card = page.querySelector('#emotion-card') as HTMLElement;
    if (!card) return;
    const e = EMOTION_LEVELS[currentEmotion];
    card.style.background = `linear-gradient(180deg, ${e.bgStart} 0%, ${e.bgEnd} 100%)`;
    const shapeBg = card.querySelector('.emotion-shape-bg') as HTMLElement;
    if (shapeBg) shapeBg.innerHTML = generateEmotionSVG(currentEmotion);
    const label = card.querySelector('.emotion-label-text') as HTMLElement;
    if (label) label.textContent = e.label;
  });

  // Save
  page.querySelector('#save-btn')?.addEventListener('click', async () => {
    const text = (page.querySelector('#entry-text') as HTMLTextAreaElement).value.trim();
    if (!text) { toast('Write something first'); return; }
    const today = toDateStr(new Date());
    const now = Date.now();
    await saveEntry({
      id: `${today}-${now}`,
      date: today,
      text,
      mood: [...selectedMoods].join(' '),
      prompt: aiPrompt || undefined,
      timestamp: now,
      emotion: currentEmotion,
    });
    aiPrompt = '';
    selectedMoods.clear();
    currentEmotion = 3;
    toast('Saved');
    await renderApp();
  });

  // AI Prompt
  page.querySelector('#prompt-btn')?.addEventListener('click', async () => {
    const settings = await getSettings();
    if (!settings.apiKey) { toast('Add your API key in settings first'); return; }

    const btn = page.querySelector('#prompt-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '✨ Thinking<span class="loading-dots"></span>';

    try {
      const profile = await getProfile();
      const response = await sendMessage(
        [{ role: 'user', content: 'Give me one short, thoughtful prompt for today. Just the prompt, nothing else. One or two sentences.' }],
        settings.apiKey,
        undefined,
        profile,
      );
      aiPrompt = response.trim().replace(/^["']|["']$/g, '');
      const area = page.querySelector('#ai-prompt-area') as HTMLElement;
      area.innerHTML = `<div class="ai-prompt">${esc(aiPrompt)}</div>`;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to get prompt');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Give me a prompt';
    }
  });
}

// ════════════════════════════════════════════
// ── ENTRIES TAB ──
// ════════════════════════════════════════════
async function renderEntries(page: HTMLElement) {
  let allEntries = await getAllEntries();

  page.innerHTML = `
    <div class="entries-controls">
      <input type="text" id="search-input" placeholder="Search entries..." class="search-input" />
      <div class="filter-row" id="filter-row">
        <button class="filter-chip active" data-filter="all">All</button>
        ${uniqueMoods(allEntries).map((m) => `
          <button class="filter-chip" data-filter="${m}">${m}</button>
        `).join('')}
      </div>
    </div>
    <div id="entries-list"></div>
  `;

  let searchTerm = '';
  let moodFilter = 'all';

  function renderList() {
    let filtered = allEntries;

    if (moodFilter !== 'all') {
      filtered = filtered.filter((e) => e.mood && e.mood.includes(moodFilter));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((e) =>
        e.text.toLowerCase().includes(q) ||
        (e.prompt && e.prompt.toLowerCase().includes(q)) ||
        e.date.includes(q)
      );
    }

    const list = page.querySelector('#entries-list') as HTMLElement;

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-past">${allEntries.length === 0 ? 'No entries yet — go write one!' : 'No entries match your search'}</div>`;
      return;
    }

    list.innerHTML = filtered.map((e) => `
      <div class="entry-card fade-in" data-entry-id="${e.id}">
        <div class="entry-card-header">
          <div class="entry-card-left">
            <span class="entry-card-date">${formatDate(e.date)}${e.timestamp ? ' · ' + formatTime(e.timestamp) : ''}</span>
            ${e.edited ? '<span class="edited-badge" title="This entry was updated">edited</span>' : ''}
            ${e.emotion != null ? `<span class="emotion-badge" style="background: ${EMOTION_LEVELS[e.emotion].color}20; color: ${EMOTION_LEVELS[e.emotion].color};">${EMOTION_LEVELS[e.emotion].label}</span>` : ''}
          </div>
          <div class="entry-card-right">
            <span class="entry-card-mood">${e.mood || ''}</span>
            <button class="edit-entry-btn" data-id="${e.id}" title="Edit entry">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </div>
        ${e.prompt ? `<div class="entry-card-prompt">"${esc(e.prompt)}"</div>` : ''}
        <div class="entry-card-text">${esc(e.text)}</div>
      </div>
    `).join('');

    // Bind edit buttons
    list.querySelectorAll('.edit-entry-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = (btn as HTMLElement).dataset.id!;
        const entry = allEntries.find((e) => e.id === id);
        if (entry) openEditModal(entry);
      });
    });
  }

  function openEditModal(entry: JournalEntry) {
    const entryMoods = new Set(entry.mood ? entry.mood.split(' ').filter(Boolean) : []);
    let editEmotion = entry.emotion ?? 3;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal edit-modal">
        <h2>Edit Entry — ${formatDate(entry.date)}${entry.timestamp ? ' · ' + formatTime(entry.timestamp) : ''}</h2>
        <div class="mood-section" style="margin-bottom:16px;">
          <div class="mood-label">Feelings</div>
          <div class="mood-grid">
            ${MOODS.map((m) => `
              <button class="mood-btn${entryMoods.has(m.emoji) ? ' selected' : ''}" data-mood="${m.emoji}">
                <span class="mood-emoji">${m.emoji}</span>
                <span class="mood-name">${m.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="modal-field">
          <label>Emotion</label>
          <div class="edit-emotion-row">
            <span class="edit-emotion-label" id="edit-emotion-label" style="color: ${EMOTION_LEVELS[editEmotion].color}">${EMOTION_LEVELS[editEmotion].label}</span>
            <input type="range" id="edit-emotion-slider" class="emotion-slider emotion-slider-modal" min="0" max="6" step="1" value="${editEmotion}" />
          </div>
        </div>
        <div class="modal-field">
          <label>Entry</label>
          <textarea id="edit-text" style="min-height:140px;">${esc(entry.text)}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-modal-secondary" id="edit-cancel">Cancel</button>
          <button class="btn-modal-primary" id="edit-save">Save Changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#edit-cancel')?.addEventListener('click', () => overlay.remove());

    // Emotion slider in modal
    const editSlider = overlay.querySelector('#edit-emotion-slider') as HTMLInputElement;
    editSlider?.addEventListener('input', () => {
      editEmotion = parseInt(editSlider.value, 10);
      const lbl = overlay.querySelector('#edit-emotion-label') as HTMLElement;
      if (lbl) {
        lbl.textContent = EMOTION_LEVELS[editEmotion].label;
        lbl.style.color = EMOTION_LEVELS[editEmotion].color;
      }
    });

    // Multi-mood toggle in modal
    overlay.querySelectorAll('.mood-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mood = (btn as HTMLElement).dataset.mood || '';
        if (entryMoods.has(mood)) {
          entryMoods.delete(mood);
          btn.classList.remove('selected');
        } else {
          entryMoods.add(mood);
          btn.classList.add('selected');
        }
      });
    });

    overlay.querySelector('#edit-save')?.addEventListener('click', async () => {
      const newText = (overlay.querySelector('#edit-text') as HTMLTextAreaElement).value.trim();
      if (!newText) { toast('Entry cannot be empty'); return; }
      await saveEntry({
        ...entry,
        text: newText,
        mood: [...entryMoods].join(' '),
        edited: true,
        emotion: editEmotion,
      });
      overlay.remove();
      toast('Entry updated');
      allEntries = await getAllEntries();
      renderList();
    });
  }

  // Search
  page.querySelector('#search-input')?.addEventListener('input', (e) => {
    searchTerm = (e.target as HTMLInputElement).value;
    renderList();
  });

  // Mood filter chips
  page.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      moodFilter = (chip as HTMLElement).dataset.filter || 'all';
      page.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderList();
    });
  });

  renderList();
}

function uniqueMoods(entries: JournalEntry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.mood) {
      for (const m of e.mood.split(' ')) {
        if (m) seen.add(m);
      }
    }
  }
  return [...seen];
}

// ════════════════════════════════════════════
// ── PROFILE TAB ──
// ════════════════════════════════════════════
async function renderProfile(page: HTMLElement) {
  const profile = await getProfile();

  page.innerHTML = `
    <div class="profile-page">
      <p class="profile-intro">This shapes how the app talks to you. The AI uses this context to give you prompts that actually fit your life. Update it anytime.</p>

      <div class="profile-field">
        <label for="p-about">About me</label>
        <textarea id="p-about" placeholder="A bit about who you are — personality, how you think, what matters to you...">${esc(profile.aboutMe)}</textarea>
      </div>

      <div class="profile-field">
        <label for="p-season">What's happening right now</label>
        <textarea id="p-season" placeholder="Current life season — stress level, what's heavy, what's good, big changes...">${esc(profile.currentSeason)}</textarea>
      </div>

      <div class="profile-field">
        <label for="p-prefs">What resonates with me</label>
        <textarea id="p-prefs" placeholder="What kinds of prompts, language, or approaches work for you — direct, gentle, analytical, creative...">${esc(profile.preferences)}</textarea>
      </div>

      <div class="profile-field">
        <label for="p-avoid">What to avoid</label>
        <textarea id="p-avoid" placeholder="What feels fake, cheesy, or irritating — language or framing that makes you roll your eyes...">${esc(profile.avoidances)}</textarea>
      </div>

      <button class="btn-save" id="save-profile-btn" style="width:100%;">Save Profile</button>
    </div>
  `;

  page.querySelector('#save-profile-btn')?.addEventListener('click', async () => {
    await saveProfile({
      aboutMe: (page.querySelector('#p-about') as HTMLTextAreaElement).value.trim(),
      currentSeason: (page.querySelector('#p-season') as HTMLTextAreaElement).value.trim(),
      preferences: (page.querySelector('#p-prefs') as HTMLTextAreaElement).value.trim(),
      avoidances: (page.querySelector('#p-avoid') as HTMLTextAreaElement).value.trim(),
    });
    toast('Profile saved');
  });
}

// ════════════════════════════════════════════
// ── SETTINGS MODAL ──
// ════════════════════════════════════════════
async function openSettings() {
  const settings = await getSettings();
  const masked = settings.apiKey
    ? settings.apiKey.slice(0, 10) + '...' + settings.apiKey.slice(-4)
    : 'Not set';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Settings</h2>
      <div class="modal-field">
        <label>Anthropic API Key</label>
        <input type="password" id="modal-api-key" value="${escAttr(settings.apiKey)}" placeholder="sk-ant-..." />
        <p>For the "Give me a prompt" feature. Stored only on this device.<br>Current: ${esc(masked)}</p>
      </div>
      <div class="modal-actions">
        <button class="btn-modal-secondary" id="modal-export">Export</button>
        <button class="btn-modal-secondary" id="modal-import">Import</button>
        <button class="btn-modal-primary" id="modal-save">Save</button>
      </div>
      <div class="modal-actions" style="margin-top: 8px;">
        <button class="btn-modal-danger" id="modal-clear">Clear All Data</button>
        <button class="btn-modal-secondary" id="modal-close">Close</button>
      </div>
      <input type="file" id="modal-file" accept=".json" style="display:none;" />
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-close')?.addEventListener('click', () => overlay.remove());

  overlay.querySelector('#modal-save')?.addEventListener('click', async () => {
    const key = (overlay.querySelector('#modal-api-key') as HTMLInputElement).value.trim();
    await saveSettings({ apiKey: key });
    toast('Settings saved');
    overlay.remove();
  });

  overlay.querySelector('#modal-export')?.addEventListener('click', async () => {
    const data = await exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gratitude-${toDateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported');
  });

  const fileInput = overlay.querySelector('#modal-file') as HTMLInputElement;
  overlay.querySelector('#modal-import')?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await importData(await file.text());
      toast('Imported');
      overlay.remove();
      await renderApp();
    } catch {
      toast('Invalid file');
    }
  });

  overlay.querySelector('#modal-clear')?.addEventListener('click', async () => {
    if (confirm('Delete all entries, profile, and settings? This cannot be undone.')) {
      try {
        await fetch('/api/entries', { method: 'DELETE' });
      } catch {}
      localStorage.removeItem('gratitude-app-settings');
      toast('Data cleared');
      overlay.remove();
      selectedMoods.clear();
      aiPrompt = '';
      setTimeout(() => location.reload(), 500);
    }
  });
}

// ── Utilities ──
function toast(message: string) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function toDateStr(d: Date): string { return d.toISOString().split('T')[0]; }

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const weekday = d.toLocaleDateString('en-AU', { weekday: 'short' });
  return `${weekday} ${day}/${month}/${year}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit',
    hour12: true,
  });
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function escAttr(text: string): string {
  return text.replace(/"/g, '&quot;');
}

init();
