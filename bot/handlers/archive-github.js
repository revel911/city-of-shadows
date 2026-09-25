// Dedicated private storage. Never fall back to the public world repository.
export class ArchiveGitHub {
  constructor({ owner, repo, token, branch = 'main', fetchImpl = fetch }) {
    if (!owner || !repo || !token || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
      throw new Error('Archive owner, repository, and token are required');
    }
    this.base = `https://api.github.com/repos/${owner}/${repo}`;
    this.token = token;
    this.branch = branch;
    this.fetch = fetchImpl;
  }
  async request(url, options = {}) {
    const response = await this.fetch(url, {
      ...options, signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'city-of-shadows-archive',
        'Content-Type': 'application/json' },
    });
    if (!response.ok && response.status !== 404) {
      const error = new Error(`Archive GitHub request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response;
  }
  async verifyPrivate() {
    const response = await this.request(this.base);
    if (!response.ok || (await response.json()).private !== true) {
      throw new Error('Archive storage must be an accessible PRIVATE GitHub repository');
    }
  }
  async read(path) {
    const response = await this.request(`${this.base}/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    if (response.status === 404) return null;
    const file = await response.json();
    const blob = file.encoding === 'base64' ? file : await (await this.request(`${this.base}/git/blobs/${file.sha}`)).json();
    return { sha: file.sha, value: JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')) };
  }
  async merge(path, merge) {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Check visibility before every write, including conflict retries.
      await this.verifyPrivate();
      const old = await this.read(path);
      const value = merge(old?.value);
      if (old && JSON.stringify(old.value) === JSON.stringify(value)) return;
      try {
        await this.request(`${this.base}/contents/${path}`, { method: 'PUT', body: JSON.stringify({
          message: 'Archive session transcript', branch: this.branch, sha: old?.sha,
          content: Buffer.from(JSON.stringify(value) + '\n').toString('base64'),
        }) }).then(response => { if (!response.ok) throw new Error('Archive write not found'); });
        return;
      } catch (error) {
        if (![409, 422, 429, 500, 502, 503, 504].includes(error.status) || attempt === 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
  async list() {
    await this.verifyPrivate();
    const response = await this.request(`${this.base}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`);
    if (response.status === 404) return [];
    const data = await response.json();
    if (data.truncated) throw new Error('Archive tree is truncated; export must not silently omit sessions');
    return data.tree.filter(item => item.type === 'blob' && /^threads\/\d+\/(?:session|\d{4}-\d{2}-\d{2})\.json$/.test(item.path)).map(item => item.path);
  }
}
