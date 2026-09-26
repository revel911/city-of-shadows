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

function branchName() {
  return process.env.GITHUB_BRANCH || 'main';
}

function contentsUrl(path, ref = branchName()) {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  return `${API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
}

function gitUrl(path) {
  return `${API}/repos/${env('GITHUB_OWNER')}/${env('GITHUB_REPO')}/git/${path}`;
}

function putUrl(path) {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  return `${API}/repos/${owner}/${repo}/contents/${path}`;
}

export async function getFile(path, ref) {
  const res = await fetch(contentsUrl(path, ref), { headers: headers() });
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

async function gitRequest(method, path, body) {
  const res = await fetch(gitUrl(path), {
    method,
    headers: { ...headers(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) return res.json();
  const error = new Error(`GitHub ${method} git/${path}: ${res.status} ${await res.text()}`);
  error.status = res.status;
  throw error;
}

// Stages every file a save touches and lands them as ONE commit, so a save is
// all-or-nothing and triggers one Pages build. `build(tx)` runs against a
// consistent snapshot of the branch head and is re-run from scratch if another
// writer moves the branch first, so it must derive everything from tx reads.
// Transforms returning null/undefined skip that file.
export async function commitBatch(message, build) {
  const branch = branchName();
  let lastErr;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const head = (await gitRequest('GET', `ref/heads/${branch}`)).object.sha;
    const staged = new Map();
    const snapshot = new Map();
    const read = async path => {
      if (staged.has(path)) return staged.get(path);
      if (!snapshot.has(path)) snapshot.set(path, getFile(path, head).then(file => file ? file.content : null));
      return snapshot.get(path);
    };
    const tx = {
      read,
      readJSON: async path => { const text = await read(path); return text ? JSON.parse(text) : null; },
      prefetch: paths => Promise.all(paths.map(read)),
      write: (path, content) => { staged.set(path, content); },
      update: async (path, transform) => {
        const next = await transform(await read(path));
        if (next !== null && next !== undefined) staged.set(path, next);
        return next;
      },
      updateJSON: async (path, transform) => {
        const text = await read(path);
        const next = await transform(text ? JSON.parse(text) : null);
        if (next !== null && next !== undefined) staged.set(path, JSON.stringify(next, null, 2) + '\n');
        return next;
      },
      staged: () => [...staged.keys()],
    };
    const result = await build(tx);
    if (!staged.size) return { result, commit: null, paths: [] };
    try {
      const baseTree = (await gitRequest('GET', `commits/${head}`)).tree.sha;
      const tree = await gitRequest('POST', 'trees', {
        base_tree: baseTree,
        tree: [...staged].map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
      });
      const commit = await gitRequest('POST', 'commits', { message, tree: tree.sha, parents: [head] });
      try {
        await gitRequest('PATCH', `refs/heads/${branch}`, { sha: commit.sha, force: false });
      } catch (err) {
        // A lost response can hide a successful ref move; never apply a batch twice.
        const now = await gitRequest('GET', `ref/heads/${branch}`).catch(() => null);
        if (now?.object?.sha !== commit.sha) throw err;
      }
      return { result, commit: commit.sha, paths: [...staged.keys()] };
    } catch (err) {
      lastErr = err;
      if (isConflict(err.status) && attempt < MAX_WRITE_ATTEMPTS) {
        await backoff(attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function listPlayers() {
  const data = await readJSON('players/index.json');
  return Array.isArray(data) ? data : [];
}
