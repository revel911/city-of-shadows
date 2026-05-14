const API = 'https://api.github.com';

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

export async function writeFile(path, content, message) {
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
  if (!res.ok) throw new Error(`GitHub PUT ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listPlayers() {
  const data = await readJSON('players/index.json');
  return Array.isArray(data) ? data : [];
}
