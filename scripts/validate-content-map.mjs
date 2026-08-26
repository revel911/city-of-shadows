import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGS = [
  { tree: 'docs', index: 'docs/README.md' },
  { tree: 'mc-reference', index: 'mc-reference/README.md' },
];
const SECONDARY_INDEXES = [
  'bot/README.md',
  'dashboard/README.md',
  'game/README.md',
  'hubs/README.md',
  'players/README.md',
  'scripts/README.md',
];

function repoPath(path) {
  return relative(ROOT, path).split(sep).join('/');
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [full] : [];
  }));
  return nested.flat();
}

function localHref(raw) {
  const href = String(raw || '').trim().replace(/^<|>$/g, '').split('#')[0].split('?')[0];
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return decodeURIComponent(href);
}

function catalogLinks(markdown, indexPath) {
  const targets = new Set();
  const tableTargets = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    const table = /^\s*\|/.test(line);
    const cells = table ? line.split('|').slice(1, -1).map(value => value.trim()) : [];
    for (const match of line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = localHref(match[1]);
      if (!href) continue;
      const target = resolve(dirname(indexPath), href);
      targets.add(target);
      if (table && cells.length >= 3 && cells[0].includes(match[0])
        && cells[1] && cells[2] && !/^[-:]+$/.test(cells[1])) {
        tableTargets.add(target);
      }
    }
  }
  return { targets, tableTargets };
}

const failures = [];
let indexedCount = 0;

for (const catalog of CATALOGS) {
  const treePath = resolve(ROOT, catalog.tree);
  const indexPath = resolve(ROOT, catalog.index);
  const [files, markdown] = await Promise.all([
    markdownFiles(treePath),
    readFile(indexPath, 'utf8'),
  ]);
  const { targets, tableTargets } = catalogLinks(markdown, indexPath);

  for (const file of files) {
    const body = await readFile(file, 'utf8');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body)) {
      failures.push(repoPath(file) + ' contains disallowed control characters');
    }
    if (!/^#\s+\S/m.test(body)) {
      failures.push(repoPath(file) + ' needs an H1 title');
    }
    if (!targets.has(file)) {
      failures.push(`${repoPath(file)} is missing from ${catalog.index}`);
      continue;
    }
    if (!tableTargets.has(file)) {
      failures.push(`${repoPath(file)} needs a table row with link, title, and description in ${catalog.index}`);
      continue;
    }
    indexedCount += 1;
  }

  for (const target of targets) {
    try {
      await access(target);
    } catch {
      failures.push(`${catalog.index} has a broken local link to ${repoPath(target)}`);
    }
  }
}

for (const relativeIndex of SECONDARY_INDEXES) {
  const indexPath = resolve(ROOT, relativeIndex);
  const markdown = await readFile(indexPath, 'utf8');
  const { targets } = catalogLinks(markdown, indexPath);
  for (const target of targets) {
    try {
      await access(target);
    } catch {
      failures.push(`${relativeIndex} has a broken local link to ${repoPath(target)}`);
    }
  }
}

if (failures.length) {
  console.error('Content map invalid:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Content maps valid: ${indexedCount} Markdown files indexed with link, title, and description; ${SECONDARY_INDEXES.length} folder maps have valid local links.`);
}
