const API = 'https://api.github.com';

const MAX_WRITE_ATTEMPTS = 5;

function env(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
}

function headers() {
  return {
    Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'city-of-shadows-bot',
  };
}

function contentsUrl(path) {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  const branch = process.env.GITHUB_BRANCH || 'main';
  return `${API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
}

function putUrl(path) {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  return `${API}/repos/${owner}/${repo}/contents/${path}`;
}

export async function getFile(path) {
  const res = await fetch(contentsUrl(path), { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

export async function readFile(path) {
  const f = await getFile(path);
  return f ? f.content : null;
}

export async function readJSON(path) {
  const text = await readFile(path);
  return text ? JSON.parse(text) : null;
}

function isConflict(status) {
  return status === 409 || status === 422;
}

async function backoff(attempt) {
  const ms = 100 * attempt + Math.floor(Math.random() * 100);
  await new Promise(r => setTimeout(r, ms));
}

export async function writeFile(path, content, message) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const existing = await getFile(path);
    const body = {
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: process.env.GITHUB_BRANCH || 'main',
    };
    if (existing) body.sha = existing.sha;
    const res = await fetch(putUrl(path), {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const errText = await res.text();
    lastErr = new Error(`GitHub PUT ${path}: ${res.status} ${errText}`);
    if (isConflict(res.status) && attempt < MAX_WRITE_ATTEMPTS) {
      await backoff(attempt);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

// Read-modify-write helper for shared files where the new content depends on
// the current file state. The transform runs against the freshly-fetched text
// on every attempt, so concurrent writers each merge into the latest state
// instead of silently overwriting one another. Returns the GitHub PUT response.
export async function updateFile(path, transform, message) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const existing = await getFile(path);
    const currentText = existing ? existing.content : null;
    const next = await transform(currentText);
    const body = {
      message,
      content: Buffer.from(next, 'utf8').toString('base64'),
      branch: process.env.GITHUB_BRANCH || 'main',
    };
    if (existing) body.sha = existing.sha;
    const res = await fetch(putUrl(path), {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const errText = await res.text();
    lastErr = new Error(`GitHub PUT ${path}: ${res.status} ${errText}`);
    if (isConflict(res.status) && attempt < MAX_WRITE_ATTEMPTS) {
      await backoff(attempt);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

export async function updateJSON(path, transform, message) {
  return updateFile(path, async (text) => {
    const current = text ? JSON.parse(text) : null;
    const next = await transform(current);
    return JSON.stringify(next, null, 2) + '\n';
  }, message);
}

export async function listPlayers() {
  const data = await readJSON('players/index.json');
  return Array.isArray(data) ? data : [];
}
