// ── Config — set your GitHub username and repo ───────────────────────
const CONFIG = {
  GITHUB_RAW: 'https://raw.githubusercontent.com/revel911/city-of-shadows/main',
};

// ── Simple in-session cache (clears on page reload) ──────────────────
const _cache = new Map();

async function cached(key, fn) {
  if (_cache.has(key)) return _cache.get(key);
  const result = await fn();
  _cache.set(key, result);
  return result;
}

function clearCache() { _cache.clear(); _fetchToken = Date.now(); }

// ── GitHub raw file fetchers ──────────────────────────────────────────

// raw.githubusercontent.com is served through Fastly with ~5-minute edge
// caching. _fetchToken changes whenever the user clicks Refresh so a fresh
// page session and an explicit Refresh both pull the latest content; within
// a single session the same token is reused so the browser caches normally.
let _fetchToken = Date.now();

async function ghText(path) {
  const res = await fetch(`${CONFIG.GITHUB_RAW}/${path}?v=${_fetchToken}`, { cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.text();
}

async function ghJSON(path) {
  const text = await ghText(path);
  if (!text) return null;
  return JSON.parse(text);
}

// ── Data fetchers ─────────────────────────────────────────────────────

async function getPlayers() {
  return cached('players', () => ghJSON('players/index.json').then(d => d || []));
}

async function getPlayerData(playerId) {
  return cached(`player-${playerId}`, async () => {
    const [stateRaw, handoff, sheet] = await Promise.allSettled([
      ghJSON(`players/${playerId}/state.json`),
      ghText(`players/${playerId}/handoff.md`),
      ghText(`players/${playerId}/sheet.md`),
    ]);
    return {
      state:            stateRaw.status === 'fulfilled' ? stateRaw.value : null,
      handoff:          handoff.status  === 'fulfilled' ? (handoff.value  || '') : '',
      sheet:            sheet.status    === 'fulfilled' ? (sheet.value    || '') : '',
      sheetArchive:     [],
      history:          '',
      interactionQueue: '',
    };
  });
}

async function getWorldBible() {
  return cached('world-bible', () => ghText('game/world-bible.md').then(t => t || ''));
}

async function getEventsLog() {
  return cached('events', () => ghText('game/events-log.md').then(t => t || ''));
}

async function getHubDocs() {
  return cached('hubs', async () => {
    const index = await ghJSON('hubs/index.json');
    if (!index) return [];
    return Promise.all(index.map(async hub => ({
      name:    hub.name,
      rawName: hub.name,
      id:      hub.id,
      content: await ghText(`hubs/${hub.file}`).then(t => t || '').catch(() => ''),
    })));
  });
}

async function getAllNPCRoster() {
  return cached('npc-roster', async () => {
    const data = await ghJSON('game/npcs.json');
    const raw  = data ? (data.npcs || []) : [];
    const npcs = raw.map(n => ({
      name:              n.name  || '',
      status:            n.status || 'active',
      faction:           n.faction || '',
      role:              n.role || '',
      playerInteraction: n.player_interaction || '',
      hub:               n.hub  || '',
    }));
    const STATUS_RANK = { deceased: 3, gone: 2, active: 1 };
    return npcs.sort((a, b) => {
      const ra = STATUS_RANK[a.status] || 0, rb = STATUS_RANK[b.status] || 0;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
  });
}

async function getThreatsDoc() {
  // Returns the raw JSON text so parseThreats() can JSON.parse it (same API as before)
  return cached('threats', () => ghText('game/arcs.json').then(t => t || ''));
}

// ── Parse helpers ─────────────────────────────────────────────────────

function parseStats(text) {
  const statNames = ['Blood','Heart','Mind','Spirit'];
  const found = new Map();

  for (const name of statNames) {
    const m = text.match(new RegExp(`${name}[^\\n\\d+-]*([+-]?\\d+)`, 'i'));
    if (m) found.set(name, parseInt(m[1], 10));
  }

  if (found.size < 3) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const presentStats = statNames.filter(n => new RegExp(`\\b${n}\\b`, 'i').test(lines[i]));
      if (presentStats.length < 2) continue;
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const nums = (lines[j].match(/[+-]?\d+/g) || []).map(Number);
        if (nums.length >= presentStats.length) {
          presentStats.forEach((name, idx) => { if (!found.has(name)) found.set(name, nums[idx]); });
          break;
        }
      }
      if (found.size >= 3) break;
    }
  }
  return statNames.flatMap(n => found.has(n) ? [{ name: n, value: found.get(n) }] : []);
}

function parsePlaybook(text) {
  const m = text.match(/playbook[:\s]+([^\n]+)/i) || text.match(/\btype[:\s]+([^\n]+)/i);
  return m ? m[1].trim() : '';
}

function recentLines(text, n = 8) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 20 && !l.startsWith('#') && !l.startsWith('---'))
    .slice(-n)
    .reverse();
}

// ── Stats from state.json (preferred over text parsing) ──────────────

function statsFromState(state) {
  if (!state || !state.stats) return null;
  const ORDER = ['Blood','Heart','Mind','Spirit'];
  return ORDER
    .filter(n => state.stats[n] !== undefined)
    .map(n => ({ name: n, value: state.stats[n] }));
}

// ── NPC helpers ───────────────────────────────────────────────────────

function normalizeNPCStatus(text) {
  const t = (text || '').toLowerCase();
  if (/\b(deceased|dead|killed|terminated|died|murdered|no longer)\b/.test(t)) return 'deceased';
  if (/\b(gone|missing|fled|removed|departed|vanished|exiled)\b/.test(t)) return 'gone';
  return 'active';
}

function normalizeFaction(text) {
  const m = (text || '').match(/\b(Night|Power|Wild|Mortalis)\b/i);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : '';
}

function renderNPCRoster(npcs) {
  if (!npcs.length) return '<p class="empty-note">No NPCs found.</p>';

  const factionClass = f => f ? `npc-faction npc-faction-${f.toLowerCase()}` : 'npc-faction npc-faction-none';
  const statusLabel  = { active: 'Active', deceased: 'Deceased', gone: 'Gone' };

  const card = npc => {
    const isGone = npc.status === 'deceased' || npc.status === 'gone';
    return `
    <div class="npc-card${isGone ? ' npc-card-gone' : ''}">
      <div class="npc-name">${esc(npc.name)}</div>
      ${npc.hub ? `<div class="npc-hub">${esc(npc.hub)}</div>` : ''}
      ${npc.role ? `<div class="npc-role">${esc(npc.role)}</div>` : ''}
      <div class="npc-badges">
        ${npc.faction ? `<span class="${factionClass(npc.faction)}">${esc(npc.faction)}</span>` : ''}
        <span class="npc-status npc-status-${npc.status}">${statusLabel[npc.status] || 'Active'}</span>
      </div>
      ${npc.playerInteraction ? `<div class="npc-interaction">${esc(npc.playerInteraction)}</div>` : ''}
    </div>`;
  };

  const living = npcs.filter(n => n.status !== 'deceased');
  const dead   = npcs.filter(n => n.status === 'deceased');

  const deadSection = dead.length ? `
    <details class="history-toggle npc-dead-toggle" style="margin-top:1rem">
      <summary>Deceased (${dead.length})</summary>
      <div class="npc-grid history-body" style="margin-top:0.75rem">${dead.map(card).join('')}</div>
    </details>` : '';

  return `
    <div class="npc-grid">${living.map(card).join('')}</div>
    ${deadSection}`;
}

// ── Markdown section helpers ──────────────────────────────────────────

function extractMarkdownSections(text, ...patterns) {
  const lines = text.split('\n');
  const out = [];
  let capturing = false, captureDepth = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      const depth = m[1].length, title = m[2];
      if (capturing && depth <= captureDepth) capturing = false;
      if (!capturing && patterns.some(p => p.test(title))) { capturing = true; captureDepth = depth; }
    }
    if (capturing) out.push(line);
  }
  return out.join('\n').trim();
}

function excludeMarkdownSections(text, ...patterns) {
  const lines = text.split('\n');
  const out = [];
  let skipping = false, skipDepth = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      const depth = m[1].length, title = m[2];
      if (skipping && depth <= skipDepth) skipping = false;
      if (!skipping && patterns.some(p => p.test(title))) { skipping = true; skipDepth = depth; }
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n').trim();
}

// ── HTML helpers ──────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function md(text) {
  if (!text || !text.trim()) return '<p class="empty-note">No content available.</p>';
  if (typeof marked === 'undefined') return `<pre>${esc(text)}</pre>`;
  const html = marked.parse(text);
  // Files are written by the MC but embed player-supplied text (handoff intent,
  // NPC player_interaction, sheet bio). Sanitize before injecting via innerHTML.
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
}

function statPills(stats) {
  if (!stats || !stats.length) return '';
  return `<div class="stat-block">${stats.map(({name, value}) =>
    `<div class="stat-pill">
      <span class="stat-name">${name.slice(0,3)}</span>
      <span class="stat-value ${value>0?'pos':value<0?'neg':'zero'}">${value>0?'+':''}${value}</span>
    </div>`).join('')}</div>`;
}

function circleBlock(label, obj) {
  if (!obj || !Object.keys(obj).length) return '';
  const allZero = Object.values(obj).every(v => v === 0);
  if (allZero) return '';
  const rows = Object.entries(obj)
    .map(([f, v]) => `<div class="debt-row"><span class="debt-faction">${esc(f)}</span><span class="debt-value ${v>0?'pos':v<0?'neg':'zero'}">${v>0?'+':''}${v}</span></div>`)
    .join('');
  return `<div class="debt-block" style="margin-top:1rem"><p class="side-section-title">${esc(label)}</p>${rows}</div>`;
}

// ── DOM refs ──────────────────────────────────────────────────────────
const $content = document.getElementById('content');
const $sideNav = document.getElementById('side-nav');

function showLoading(msg = 'The shadows stir…') {
  $content.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>${msg}</p>
    </div>`;
}

function showError(title, msg, hint = '') {
  $content.innerHTML = `
    <div class="error-card">
      <h3>${esc(title)}</h3>
      <p>${esc(msg)}</p>
      ${hint ? `<p class="error-setup">${hint}</p>` : ''}
    </div>`;
}

function setSideNav(sections) {
  if (!sections.length) { $sideNav.innerHTML = ''; return; }
  const route = getRoute();
  $sideNav.innerHTML = sections.map(({ title, items }) => `
    <div class="side-section">
      <p class="side-section-title">${title}</p>
      <ul class="side-links">
        ${items.map(({ href, label, scrollTo }) => scrollTo
          ? `<li><a href="#" data-scroll-to="${scrollTo}">${esc(label)}</a></li>`
          : `<li><a href="${href}" class="${route === href.replace('#','') ? 'active' : ''}">${esc(label)}</a></li>`
        ).join('')}
      </ul>
    </div>`).join('');
}

function updateTopNav() {
  const route = getRoute();
  document.querySelectorAll('.nav-links a').forEach(a => {
    const r = a.dataset.route;
    const isActive = r === '/' ? (route === '/' || route === '') : route.startsWith(r);
    a.classList.toggle('active', isActive);
  });
}

// ── Page: Summary ─────────────────────────────────────────────────────
async function renderSummary() {
  setSideNav([]);
  showLoading('Reading the city…');

  let players = [], events = '', err = '';
  try {
    [players, events] = await Promise.all([getPlayers(), getEventsLog()]);
  } catch (e) { err = e.message; }

  const chars = await Promise.all(
    players.map(async p => {
      try { const d = await getPlayerData(p.id); return { ...p, ...d }; }
      catch { return { ...p, state: null, handoff: '', sheet: '' }; }
    })
  );

  const errorHtml = err ? `
    <div class="error-card" style="margin-bottom:1.5rem">
      <h3>Could not load game data</h3>
      <p>${esc(err)}</p>
      <p class="error-setup">Open <code>app.js</code> and set <code>YOUR_GITHUB_USERNAME</code> in CONFIG.</p>
    </div>` : '';

  const charCards = chars.map(c => {
    const stats    = statsFromState(c.state) || parseStats(c.sheet || '');
    const playbook = c.state?.playbook || parsePlaybook(c.sheet || '');
    return `
      <div class="char-card" data-nav="/characters/${encodeURIComponent(c.name)}">
        <div class="char-card-inner">
          <div>
            <div class="char-name">${esc(c.name)}</div>
            ${playbook ? `<div class="char-playbook">${esc(playbook)}</div>` : ''}
          </div>
          ${statPills(stats)}
          <div class="char-link">View Sheet &rarr;</div>
        </div>
      </div>`;
  }).join('');

  const recentCharSection = chars.length ? `
    <div style="margin-bottom:1.75rem">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:.75rem">
        <h2 style="font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:400;color:var(--gold-light);letter-spacing:.16em;text-transform:uppercase">Characters</h2>
        <span class="card-footer-link" data-nav="/characters">All Characters (${chars.length}) &rarr;</span>
      </div>
      <div class="char-grid">${charCards}</div>
    </div>` : '';

  const eventItems = recentLines(events);
  const eventHtml = eventItems.length
    ? `<div class="timeline">${eventItems.map((e, i) => `
        <div class="timeline-item">
          <div class="timeline-num">${String(eventItems.length - i).padStart(3, '0')}</div>
          <div class="timeline-text">${esc(e)}</div>
        </div>`).join('')}</div>`
    : '<p class="empty-note">Events log not loaded.</p>';

  $content.innerHTML = `
    ${errorHtml}
    <div class="page-header">
      <h1>Richmond, Virginia</h1>
      <p>The city breathes. The city bleeds. The city remembers.</p>
      <div class="ornament"><span style="font-size:.7rem">✦</span></div>
    </div>
    ${recentCharSection}
    <div class="dashboard-grid">
      <div class="sidebar-cards">
        <div class="card">
          <h2>Navigate</h2>
          <div class="quick-link purple" data-nav="/characters">Characters</div>
          <div class="quick-link purple" data-nav="/city">City</div>
          <div class="quick-link purple" data-nav="/events">Public Events Log</div>
        </div>
      </div>
      <div class="card">
        <h2>Recent Events</h2>
        ${eventHtml}
        <div class="card-footer">
          <span class="card-footer-link" data-nav="/events">Full Events Log &rarr;</span>
        </div>
      </div>
    </div>`;
}

// ── Page: Characters list ─────────────────────────────────────────────
async function renderCharacters() {
  showLoading('Gathering the shadows…');

  let players = [];
  try { players = await getPlayers(); }
  catch (e) {
    showError('Could not load characters', e.message,
      'Open app.js and set YOUR_GITHUB_USERNAME in CONFIG.');
    setSideNav([{ title: 'Characters', items: [{ href: '#/characters', label: 'All Characters' }] }]);
    return;
  }

  setSideNav([{ title: 'Characters', items: [
    { href: '#/characters', label: 'All Characters' },
    ...players.map(p => ({ href: `#/characters/${encodeURIComponent(p.name)}`, label: p.name })),
  ]}]);

  const chars = await Promise.all(players.map(async p => {
    try { const d = await getPlayerData(p.id); return { ...p, ...d }; }
    catch { return { ...p, state: null, handoff: '', sheet: '' }; }
  }));

  const cards = chars.map(c => {
    const stats    = statsFromState(c.state) || parseStats(c.sheet || '');
    const playbook = c.state?.playbook || parsePlaybook(c.sheet || '');
    const handoffPreview = (c.handoff || '')
      .replace(/```[\s\S]*?```/g, '').replace(/^#+\s.*/gm, '').replace(/^[a-z_]+:/gm, '')
      .split('\n').map(l => l.trim()).filter(l => l.length > 5 && !l.startsWith('-'))
      .join(' ').slice(0, 200);
    return `
      <div class="char-card" data-nav="/characters/${encodeURIComponent(c.name)}">
        <div class="char-card-inner">
          <div>
            <div class="char-name">${esc(c.name)}</div>
            ${playbook ? `<div class="char-playbook">${esc(playbook)}</div>` : ''}
          </div>
          ${statPills(stats)}
          ${handoffPreview ? `<div class="char-handoff">&ldquo;${esc(handoffPreview)}&rdquo;</div>` : ''}
          <div class="char-link">View Full Sheet &rarr;</div>
        </div>
      </div>`;
  }).join('');

  $content.innerHTML = `
    <div class="page-header">
      <h1>The Shadows</h1>
      <p>Those who walk between the world that is and the world that hungers.</p>
    </div>
    ${chars.length ? `<div class="char-grid">${cards}</div>` : '<p class="empty-note">No characters found.</p>'}`;
}

// ── Handoff helpers (unchanged from original) ─────────────────────────

function splitStoryThread(text) {
  if (!text.trim()) return { handoff: '', history: '' };
  const handoffSection = extractMarkdownSections(text, /current\s*handoff/i);
  if (handoffSection) {
    return { handoff: handoffSection, history: excludeMarkdownSections(text, /current\s*handoff/i).trim() };
  }
  const lines = text.split('\n');
  let splitIdx = lines.length;
  for (let i = 5; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^-{3,}$/.test(t) || t === '===' || /^#{1,3}\s+(session|entry|\d{4})/i.test(t)) { splitIdx = i; break; }
  }
  return { handoff: lines.slice(0, splitIdx).join('\n').trim(), history: lines.slice(splitIdx).join('\n').trim() };
}

function isYamlHandoff(text) {
  return /^handoff\s*:/m.test(text) || /\b(where_we_are|who_is_present|last_beat)\s*:/m.test(text);
}

function extractYamlBlock(text, topKey) {
  const re = new RegExp(`^${topKey}\\s*:\\s*\\n([\\s\\S]*?)(?=^\\S|\\Z)`, 'm');
  const m = text.match(re);
  return m ? m[1] : '';
}

function extractYamlField(blockText, field) {
  const blockScalarRe = new RegExp(`^[ \\t]*${field}:\\s*\\|[ \\t]*\\n((?:[ \\t]+[^\\n]*\\n?)*)`, 'm');
  const bsm = blockText.match(blockScalarRe);
  if (bsm) {
    const lines = bsm[1].split('\n');
    const indent = lines[0].match(/^([ \t]*)/)[1].length;
    return lines.map(l => l.slice(indent)).join('\n').trim();
  }
  const quotedRe = new RegExp(`^[ \\t]*${field}:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`, 'm');
  const qm = blockText.match(quotedRe);
  if (qm) return (qm[1] ?? qm[2] ?? '').trim();
  const unquotedRe = new RegExp(`^[ \\t]*${field}:\\s+([^\\n|>][^\\n]*)`, 'm');
  const um = blockText.match(unquotedRe);
  if (um) return um[1].trim();
  return '';
}

function extractYamlList(blockText, field) {
  const inlineRe = new RegExp(`^[ \\t]*${field}:\\s*\\[([^\\]]+)\\]`, 'm');
  const im = blockText.match(inlineRe);
  if (im) return im[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);
  const blockRe = new RegExp(`^[ \\t]*${field}:[^\\n]*\\n((?:[ \\t]+-[^\\n]+\\n?)*)`, 'm');
  const bm = blockText.match(blockRe);
  if (bm) return bm[1].split('\n').map(l => l.replace(/^[ \t]*-\s*["']?|["']?\s*$/, '').trim()).filter(Boolean);
  return [];
}

function parseYamlHandoff(text) {
  const block = extractYamlBlock(text, 'handoff') || text;
  const archiveBlock = extractYamlBlock(text, 'handoff_archive') || '';
  const archiveLabels = [...archiveBlock.matchAll(/[ \t]*label:\s*["']?([^"'\n]+)/g)]
    .map(m => m[1].trim()).filter(Boolean);
  return {
    label:             extractYamlField(block, 'label'),
    where_we_are:      extractYamlField(block, 'where_we_are'),
    who_is_present:    extractYamlField(block, 'who_is_present'),
    last_beat:         extractYamlField(block, 'last_beat'),
    player_intent:     extractYamlField(block, 'player_intent'),
    must_not_forget:   extractYamlList(block, 'must_not_forget'),
    mood:              extractYamlField(block, 'mood'),
    lore_flags:        extractYamlList(block, 'lore_flags'),
    harm:              extractYamlField(block, 'harm'),
    hold_remaining:    extractYamlField(block, 'hold_remaining'),
    tension_threads:   extractYamlList(block, 'tension_threads'),
    open_interactions: extractYamlList(block, 'open_interactions'),
    active_bonuses:    extractYamlList(block, 'active_bonuses'),
    hubs_touched:      extractYamlList(block, 'hubs_touched'),
    archive_labels:    archiveLabels,
  };
}

function yamlInline(str) {
  return esc(String(str || ''))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/(^|&lt;br&gt;)#+\s*/g, '$1');
}

function renderYamlHandoff(data) {
  const fieldRow = (label, value) => {
    if (!value || (Array.isArray(value) && !value.length)) return '';
    if (Array.isArray(value)) {
      return `<div class="handoff-row">
        <div class="handoff-row-label">${esc(label)}</div>
        <ul class="handoff-list">${value.map(v => `<li>${yamlInline(v)}</li>`).join('')}</ul>
      </div>`;
    }
    const hasNewlines = String(value).includes('\n');
    const bodyContent = hasNewlines
      ? `<div class="handoff-row-body handoff-prose">${yamlInline(String(value)).replace(/\n/g, '<br>')}</div>`
      : `<div class="handoff-row-body">${yamlInline(value)}</div>`;
    return `<div class="handoff-row"><div class="handoff-row-label">${esc(label)}</div>${bodyContent}</div>`;
  };

  const mechParts = [
    data.harm ? `Harm&nbsp;<strong>${esc(data.harm)}</strong>` : '',
    data.hold_remaining !== '' && data.hold_remaining !== '0' && data.hold_remaining
      ? `Hold&nbsp;<strong>${esc(data.hold_remaining)}</strong>` : '',
  ].filter(Boolean);
  const mechHtml = mechParts.length
    ? `<div class="handoff-row"><div class="handoff-row-label">State</div><div class="handoff-row-body">${mechParts.join(' &nbsp;·&nbsp; ')}</div></div>` : '';

  const archiveHtml = data.archive_labels.length
    ? `<details class="history-toggle" style="margin-top:1.25rem">
        <summary>Handoff Archive (${data.archive_labels.length} previous)</summary>
        <ul class="handoff-list history-body" style="margin-top:0.75rem">
          ${data.archive_labels.map(l => `<li>${esc(l)}</li>`).join('')}
        </ul>
      </details>` : '';

  return `<div class="structured-handoff">
    ${data.label ? `<div class="handoff-title">${yamlInline(data.label)}</div>` : ''}
    ${fieldRow('Where We Are', data.where_we_are)}
    ${fieldRow('Present', data.who_is_present)}
    ${fieldRow('Last Beat', data.last_beat)}
    ${fieldRow('Tension Threads', data.tension_threads)}
    ${fieldRow('Must Not Forget', data.must_not_forget)}
    ${mechHtml}
    ${fieldRow('Active Bonuses', data.active_bonuses)}
    ${fieldRow('Player Intent', data.player_intent)}
    ${fieldRow('Mood', data.mood)}
    ${fieldRow('Lore Flags', data.lore_flags)}
    ${fieldRow('Open Interactions', data.open_interactions)}
    ${archiveHtml}
  </div>`;
}

// ── Page: Single character ────────────────────────────────────────────
async function renderCharacter(name) {
  showLoading(`Finding ${esc(name)}…`);

  let players = [];
  try { players = await getPlayers(); }
  catch (e) { showError('Could not load character', e.message); return; }

  setSideNav([{ title: 'Characters', items: [
    { href: '#/characters', label: '← All Characters' },
    ...players.map(p => ({ href: `#/characters/${encodeURIComponent(p.name)}`, label: p.name })),
  ]}]);

  const player = players.find(p => p.name === name);
  if (!player) { showError('Character not found', `No character named "${name}".`); return; }

  let state = null, handoff = '', sheet = '';
  try { ({ state, handoff, sheet } = await getPlayerData(player.id)); }
  catch (e) { showError('Could not load character data', e.message); return; }

  // Mechanical state panel (from state.json)
  const stats    = statsFromState(state) || parseStats(sheet);
  const playbook = state?.playbook || parsePlaybook(sheet);

  const circlesHtml = state?.circle_ratings || state?.circle_status
    ? circleBlock('Circle Ratings', state.circle_ratings) + circleBlock('Circle Status', state.circle_status)
    : ''; // faction_debts (legacy) intentionally not shown — migrate to circle_ratings/circle_status

  const mechanicsHtml = (stats.length || circlesHtml || state) ? `
    <div class="card">
      <h2>Mechanics</h2>
      ${playbook ? `<div class="char-playbook" style="margin-bottom:.75rem">${esc(playbook)}</div>` : ''}
      ${statPills(stats)}
      ${circlesHtml}
      ${state?.harm ? `<p style="margin-top:.75rem;font-size:.85rem;color:var(--text-muted)">Harm: <strong>${esc(String(state.harm))}</strong>${state.corrupt ? ` &nbsp;·&nbsp; Corrupt: <strong>${esc(String(state.corrupt))}</strong>` : ''}</p>` : ''}
      ${state?.xp ? `<p style="font-size:.85rem;color:var(--text-muted)">XP: <strong>${esc(String(state.xp))}</strong></p>` : ''}
    </div>` : '';

  // Handoff panel
  let handoffHtml = '<p class="empty-note">No handoff note found.</p>';
  if (handoff && handoff.trim()) {
    if (isYamlHandoff(handoff)) {
      handoffHtml = renderYamlHandoff(parseYamlHandoff(handoff));
    } else {
      const grafs = handoff.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      const FOLD = 5;
      if (grafs.length <= FOLD) {
        handoffHtml = `<div class="prose">${md(handoff)}</div>`;
      } else {
        const above = grafs.slice(0, FOLD).join('\n\n');
        const below = grafs.slice(FOLD).join('\n\n');
        handoffHtml = `
          <div class="prose">${md(above)}</div>
          <details class="history-toggle" style="margin-top:1rem">
            <summary>Continue reading</summary>
            <div class="prose history-body">${md(below)}</div>
          </details>`;
      }
    }
  }

  $content.innerHTML = `
    <div class="page-header">
      <h1>${esc(name)}</h1>
      <div class="ornament"><span style="font-size:.7rem">✦</span></div>
    </div>
    <div class="two-col">
      <div>
        ${mechanicsHtml}
        ${sheet && sheet.trim() ? `<div class="card" style="margin-top:1rem"><h2>Character Sheet</h2><div class="prose">${md(sheet)}</div></div>` : ''}
      </div>
      <div class="card">
        <h2>Current Handoff</h2>
        ${handoffHtml}
      </div>
    </div>`;
}

// ── Page: City ────────────────────────────────────────────────────────
async function renderCity() {
  showLoading('Reading the world bible…');

  let worldBible = '', hubDocs = [], npcs = [];
  try {
    [worldBible, hubDocs, npcs] = await Promise.all([
      getWorldBible(), getHubDocs(), getAllNPCRoster(),
    ]);
  } catch (e) { showError('Could not load city data', e.message); return; }

  const activeHubs = hubDocs.filter(h => h.content.trim()).map(h => ({
    ...h,
    elemId: 'hub-' + h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  }));

  setSideNav([
    { title: 'City', items: [
      { href: '#', label: 'Overview', scrollTo: 'city-overview' },
      ...(npcs.length ? [{ href: '#', label: 'NPCs', scrollTo: 'city-npcs' }] : []),
    ]},
    ...(activeHubs.length ? [{ title: 'Hubs', items: activeHubs.map(h => ({ href: '#/city', label: h.name, scrollTo: h.elemId })) }] : []),
  ]);

  const NPC_HEADINGS = /\bnpcs?|cast|characters?|(?:key\s+)?figures?|notable|roster|personalities|residents?|people\b/i;

  const hubCards = activeHubs.map(h => {
    const display = excludeMarkdownSections(h.content, NPC_HEADINGS);
    return `<div class="card" id="${h.elemId}"><h2>${esc(h.name)}</h2><div class="prose">${md(display)}</div></div>`;
  }).join('');

  const worldBibleCollapsible = worldBible ? `
    <div class="card">
      <details class="history-toggle">
        <summary>World Bible</summary>
        <div class="prose history-body">${md(worldBible)}</div>
      </details>
    </div>` : '';

  $content.innerHTML = `
    <div id="city-overview" class="page-header">
      <h1>Richmond, Virginia</h1>
      <p>The shared world state. What is real, what is hidden, what is hunted.</p>
    </div>
    <div class="page-stack">
      <div class="card" id="city-npcs">
        <h2>NPC Roster</h2>
        ${npcs.length ? renderNPCRoster(npcs) : '<p class="empty-note">No NPC data found.</p>'}
      </div>
      ${hubCards}
      ${worldBibleCollapsible}
    </div>`;
}

// ── Active Threats ────────────────────────────────────────────────────

function splitMarkdownSections(text) {
  const bySep = text.split(/\n\s*-{3,}\s*\n/).map(s => s.trim()).filter(Boolean);
  if (bySep.length > 1) return { preamble: '', sections: bySep };
  const lines = text.split('\n');
  const preambleLines = [], sections = [];
  let cur = null;
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (cur !== null && cur.some(l => l.trim())) sections.push(cur.join('\n').trim());
      cur = [line];
    } else if (cur !== null) {
      cur.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (cur !== null && cur.some(l => l.trim())) sections.push(cur.join('\n').trim());
  if (sections.length >= 2) return { preamble: preambleLines.join('\n').trim(), sections };
  return { preamble: '', sections: [text] };
}

function parseThreats(text) {
  if (!text || !text.trim()) return [];
  try {
    const data = JSON.parse(text);
    const raw = Array.isArray(data) ? data : (data.arcs || []);
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    return raw.map(arc => ({
      id:          (arc.id || '').replace(/^arc[-_]0*/i, '').padStart(3, '0'),
      name:        arc.name || '',
      type:        cap(arc.type || ''),
      escalation:  arc.escalation ? String(arc.escalation) : '',
      status:      cap(arc.status || ''),
      description: arc.summary || arc.description || '',
      hubs:        Array.isArray(arc.hub_ids)  ? arc.hub_ids  : (Array.isArray(arc.hubs)    ? arc.hubs    : []),
      players:     Array.isArray(arc.player_ids) ? arc.player_ids : (Array.isArray(arc.players) ? arc.players : []),
      keyNpcs:     Array.isArray(arc.npc_ids)  ? arc.npc_ids  : (Array.isArray(arc.key_npcs) ? arc.key_npcs : []),
      mcNotes:     arc.mc_notes || '',
    }));
  } catch (e) {
    console.warn('parseThreats: JSON parse failed', e);
    return [];
  }
}

// Map numeric escalation (1-4) to a label
function escalationLabel(val) {
  const map = { '1': 'Simmering', '2': 'Elevated', '3': 'Critical', '4': 'Catastrophic' };
  return map[String(val)] || val || 'Unknown';
}

function renderThreats(arcs) {
  if (!arcs.length) return '<p class="empty-note">No active threats found.</p>';

  const TIER_ORDER = ['Catastrophic', 'Critical', 'Elevated', 'Simmering'];
  const groups = new Map();
  for (const arc of arcs) {
    const tier = escalationLabel(arc.escalation);
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier).push(arc);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const tag = (label, cls = '') =>
    `<span class="threat-tag${cls ? ' ' + cls : ''}">${esc(label)}</span>`;

  const arcCard = arc => {
    const tierLabel = escalationLabel(arc.escalation);
    const slug = tierLabel.toLowerCase();
    const meta = [arc.type, arc.status].filter(Boolean)
      .map(s => `<span class="threat-meta-item">${esc(s)}</span>`).join('<span class="threat-meta-sep">·</span>');
    const tags = [
      ...arc.hubs.map(h => tag(h)),
      ...arc.players.map(p => tag(p, 'threat-tag-player')),
      ...arc.keyNpcs.map(n => tag(n, 'threat-tag-npc')),
    ].join('');
    return `
    <div class="threat-card threat-escalation-${slug}">
      <div class="threat-header">
        <span class="threat-id">Arc-${arc.id}</span>
        <span class="threat-name">${esc(arc.name)}</span>
        <span class="threat-badge threat-badge-${slug}">${esc(tierLabel)}</span>
      </div>
      ${meta ? `<div class="threat-meta">${meta}</div>` : ''}
      ${arc.description ? `<div class="threat-desc">${esc(arc.description)}</div>` : ''}
      ${tags ? `<div class="threat-tags">${tags}</div>` : ''}
      ${arc.mcNotes ? `<details class="threat-mc-notes"><summary>MC Notes</summary><div class="threat-mc-body">${esc(arc.mcNotes)}</div></details>` : ''}
    </div>`;
  };

  return ordered.map(([tier, tierArcs]) => `
    <div class="threat-group">
      <div class="threat-group-label">${esc(tier)}</div>
      ${tierArcs.map(arcCard).join('')}
    </div>`).join('');
}

// ── Page: Events ──────────────────────────────────────────────────────
async function renderEvents() {
  setSideNav([{ title: 'Events', items: [
    { href: '#', label: 'Active Threats', scrollTo: 'events-threats' },
    { href: '#', label: 'Events Log',     scrollTo: 'events-log'     },
  ]}]);
  showLoading('Unrolling the chronicle…');

  let log = '', threatsDoc = '';
  try { [log, threatsDoc] = await Promise.all([getEventsLog(), getThreatsDoc()]); }
  catch (e) { showError('Could not load events', e.message); return; }

  let body = '';
  if (!log.trim()) {
    body = '<p class="empty-note">Events log is empty.</p>';
  } else {
    const { preamble, sections } = splitMarkdownSections(log);
    if (sections.length > 1) {
      const reversed = [...sections].reverse();
      const parts = preamble ? [preamble, ...reversed] : reversed;
      body = `<div class="prose events-prose">${md(parts.join('\n\n---\n\n'))}</div>`;
    } else {
      const normalized = log.replace(/\r\n/g, '\n').replace(/([^\n])\n(?!\n)/g, '$1\n\n').trim();
      const grafs = normalized.split(/\n{2,}/).map(g => g.trim()).filter(Boolean);
      if (grafs.length < 3) {
        body = `<div class="prose events-prose">${md(normalized)}</div>`;
      } else {
        const chunks = [];
        let chunk = [];
        grafs.forEach((g, i) => {
          const looksLikeTitle = i > 0 && g.length <= 80 && !g.endsWith('.');
          if (looksLikeTitle && chunk.length) { chunks.push(chunk); chunk = []; }
          chunk.push(g);
        });
        if (chunk.length) chunks.push(chunk);
        const rendered = (chunks.length > 1 ? chunks : [grafs])
          .map(c => `<div class="events-entry">${md(c.join('\n\n'))}</div>`).join('');
        body = `<div class="prose events-prose">${rendered}</div>`;
      }
    }
  }

  const arcs = parseThreats(threatsDoc);

  $content.innerHTML = `
    <div class="page-header">
      <h1>Events</h1>
      <p>The city&rsquo;s open wounds and its append-only memory.</p>
    </div>
    <div class="page-stack">
      <div class="card" id="events-threats">
        <h2>Active Threats &amp; Story Arcs</h2>
        ${renderThreats(arcs)}
      </div>
      <div class="card" id="events-log">
        <h2>Public Events Log</h2>
        ${body}
      </div>
    </div>`;
}

// ── Router ────────────────────────────────────────────────────────────
function getRoute() { return window.location.hash.replace(/^#/, '') || '/'; }
function navigate(path) { window.location.hash = path; }

async function render() {
  const route = getRoute();
  updateTopNav();
  if (route === '/' || route === '') { await renderSummary(); }
  else if (route === '/characters')        { await renderCharacters(); }
  else if (route.startsWith('/characters/')){ await renderCharacter(decodeURIComponent(route.replace('/characters/', ''))); }
  else if (route === '/city')              { await renderCity(); }
  else if (route === '/events')            { await renderEvents(); }
  else { $content.innerHTML = '<p class="empty-note">Page not found.</p>'; }
}

// ── Mobile nav ────────────────────────────────────────────────────────
function closeDrawer() { document.body.classList.remove('nav-open'); }
document.getElementById('nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.getElementById('nav-overlay').addEventListener('click', closeDrawer);
document.querySelectorAll('[data-drawer-link]').forEach(a => a.addEventListener('click', closeDrawer));

// ── Click delegation ──────────────────────────────────────────────────
document.addEventListener('click', e => {
  const scrollEl = e.target.closest('[data-scroll-to]');
  if (scrollEl) {
    e.preventDefault();
    const target = document.getElementById(scrollEl.dataset.scrollTo);
    if (target) {
      const navH = document.getElementById('top-nav').offsetHeight;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH - 12, behavior: 'smooth' });
    }
    return;
  }
  const el = e.target.closest('[data-nav]');
  if (el) { e.preventDefault(); navigate(el.dataset.nav); }
});

document.getElementById('refresh-btn').addEventListener('click', () => { clearCache(); render(); });

const _origUpdateTopNav = updateTopNav;
updateTopNav = function() {
  _origUpdateTopNav();
  const route = getRoute();
  document.querySelectorAll('#nav-drawer a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === '/' ? (route === '/' || route === '') : route.startsWith(r));
  });
};

// ── Boot ──────────────────────────────────────────────────────────────
window.addEventListener('hashchange', render);
render();

// ── Search ────────────────────────────────────────────────────────────
(function () {
  const $overlay = document.getElementById('search-overlay');
  const $input   = document.getElementById('search-input');
  const $results = document.getElementById('search-results');
  const $btn     = document.getElementById('search-btn');

  let _index = null, _building = false, _debounce = null;

  async function buildIndex() {
    if (_index) return _index;
    if (_building) return null;
    _building = true;
    try {
      const [npcs, threatsText, hubDocs, players] = await Promise.all([
        getAllNPCRoster(), getThreatsDoc(), getHubDocs(), getPlayers(),
      ]);
      _index = [];
      for (const npc of npcs) {
        _index.push({
          type: 'npc', title: npc.name,
          sub: [npc.hub, npc.faction, npc.status !== 'active' ? npc.status : ''].filter(Boolean).join(' · '),
          haystack: [npc.name, npc.hub, npc.faction, npc.role, npc.playerInteraction, npc.status].join(' ').toLowerCase(),
          nav: '/city', scrollTo: 'city-npcs',
        });
      }
      for (const arc of parseThreats(threatsText)) {
        _index.push({
          type: 'arc', title: arc.name,
          sub: [escalationLabel(arc.escalation), arc.type].filter(Boolean).join(' · '),
          haystack: [arc.name, arc.escalation, arc.type, arc.status, arc.description,
            ...arc.hubs, ...arc.players, ...arc.keyNpcs].join(' ').toLowerCase(),
          nav: '/events', scrollTo: 'events-threats',
        });
      }
      for (const hub of hubDocs) {
        _index.push({
          type: 'hub', title: hub.name, sub: 'Location',
          haystack: hub.name.toLowerCase(),
          nav: '/city',
          scrollTo: 'hub-' + hub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        });
      }
      for (const p of players) {
        _index.push({
          type: 'character', title: p.name, sub: 'Character',
          haystack: p.name.toLowerCase(),
          nav: `/characters/${encodeURIComponent(p.name)}`, scrollTo: null,
        });
      }
      return _index;
    } finally { _building = false; }
  }

  function search(query) {
    if (!_index) return null;
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return _index.map(item => {
      const tl = item.title.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (tl === t) score += 20;
        else if (tl.startsWith(t)) score += 12;
        else if (tl.includes(t)) score += 8;
        if ((item.sub || '').toLowerCase().includes(t)) score += 3;
        if (item.haystack.includes(t)) score += 1;
      }
      return { item, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 14).map(r => r.item);
  }

  const TYPE_LABELS = { npc: 'NPC', arc: 'Arc', hub: 'Hub', character: 'PC' };

  function renderResults(results, query) {
    if (results === null) { $results.innerHTML = `<div class="search-loading">Indexing…</div>`; return; }
    if (!query.trim()) { $results.innerHTML = ''; return; }
    if (!results.length) { $results.innerHTML = `<div class="search-empty">No results for &ldquo;${esc(query)}&rdquo;</div>`; return; }
    const ORDER = ['character', 'npc', 'arc', 'hub'];
    const groups = new Map();
    for (const item of results) { if (!groups.has(item.type)) groups.set(item.type, []); groups.get(item.type).push(item); }
    const sorted = [...groups.entries()].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b));
    $results.innerHTML = sorted.map(([type, items]) => `
      <div class="search-group-label">${TYPE_LABELS[type] || type}</div>
      ${items.map(item => `
        <button class="search-result" data-nav="${esc(item.nav)}" ${item.scrollTo ? `data-scroll-after="${esc(item.scrollTo)}"` : ''}>
          <span class="search-result-type search-result-type-${type}">${TYPE_LABELS[type] || type}</span>
          <span class="search-result-body">
            <span class="search-result-title">${esc(item.title)}</span>
            ${item.sub ? `<span class="search-result-sub">${esc(item.sub)}</span>` : ''}
          </span>
        </button>`).join('')}
    `).join('');
  }

  function openSearch() {
    $overlay.classList.add('open'); $input.value = ''; $results.innerHTML = ''; $input.focus();
    buildIndex().then(() => { if ($input.value.trim()) runSearch($input.value); });
  }
  function closeSearch() { $overlay.classList.remove('open'); $input.blur(); }
  function runSearch(query) { renderResults(search(query), query); }

  $btn.addEventListener('click', () => $overlay.classList.contains('open') ? closeSearch() : openSearch());
  $overlay.addEventListener('click', e => { if (e.target === $overlay) closeSearch(); });
  $input.addEventListener('input', () => { clearTimeout(_debounce); _debounce = setTimeout(() => runSearch($input.value), 120); });
  $input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeSearch(); } });

  $results.addEventListener('click', e => {
    const btn = e.target.closest('.search-result');
    if (!btn) return;
    closeSearch(); navigate(btn.dataset.nav);
    const scrollTarget = btn.dataset.scrollAfter;
    if (scrollTarget) {
      setTimeout(() => {
        const el = document.getElementById(scrollTarget);
        if (el) { const navH = document.getElementById('top-nav').offsetHeight; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navH - 12, behavior: 'smooth' }); }
      }, 600);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault(); openSearch();
    }
    if (e.key === 'Escape' && $overlay.classList.contains('open')) closeSearch();
  });
}());

// ── Dice Roller ───────────────────────────────────────────────────────
(function () {
  const fab    = document.getElementById('dice-fab');
  const panel  = document.getElementById('dice-panel');
  const close  = document.getElementById('dice-close');
  const rollBtn= document.getElementById('dice-roll-btn');
  const die1   = document.getElementById('die1');
  const die2   = document.getElementById('die2');
  const total  = document.getElementById('die-total');
  function d6() { return Math.floor(Math.random() * 6) + 1; }
  function roll() { const a = d6(), b = d6(); die1.textContent = a; die2.textContent = b; total.textContent = a + b; }
  fab.addEventListener('click', () => panel.classList.toggle('open'));
  close.addEventListener('click', () => panel.classList.remove('open'));
  rollBtn.addEventListener('click', roll);
}());
