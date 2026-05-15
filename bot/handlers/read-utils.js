import { listPlayers } from './github.js';

const DISCORD_LIMIT = 1900;

export function resolveCharacterFromList(arg, discordUsername, players) {
  if (arg) {
    return players.find(p =>
      p.id === arg ||
      p.name.toLowerCase() === arg.toLowerCase()
    ) || null;
  }
  return players.find(p =>
    p.name.toLowerCase() === discordUsername.toLowerCase()
  ) || null;
}

export async function resolveCharacter(arg, discordUsername) {
  const players = await listPlayers();
  return resolveCharacterFromList(arg, discordUsername, players);
}

export function parseRecentEvents(markdown, n) {
  if (!markdown) return [];
  const matches = [...markdown.matchAll(/^## .+$/gm)];
  if (matches.length === 0) return [];

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    sections.push(markdown.slice(start, end).trimEnd());
  }
  return sections.slice(0, n);
}

export function formatNpc(npc) {
  const lines = [
    `**${npc.name}**`,
    `Faction: ${npc.faction || '—'}  ·  Location: ${npc.hub || '—'}`,
  ];
  if (npc.role) lines.push(npc.role);
  return lines.join('\n');
}

export function formatArc(arc, hubsIndex, npcsById, playersIndex) {
  const hubsByIdMap = Object.fromEntries((hubsIndex || []).map(h => [h.id, h.name]));
  const playersByIdMap = Object.fromEntries((playersIndex || []).map(p => [p.id, p.name]));
  const npcsByIdNameMap = Object.fromEntries(
    Object.entries(npcsById || {}).map(([id, n]) => [id, n.name])
  );

  const resolveList = (ids, lookup) => {
    if (!Array.isArray(ids) || ids.length === 0) return '—';
    const names = ids.map(id => lookup[id]).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  };

  const lines = [
    `**${arc.title}**`,
    `Hubs: ${resolveList(arc.hub_ids, hubsByIdMap)}`,
    `NPCs: ${resolveList(arc.npc_ids, npcsByIdNameMap)}`,
    `PCs: ${resolveList(arc.player_ids, playersByIdMap)}`,
  ];
  if (arc.summary) lines.push(arc.summary);
  return lines.join('\n');
}

export function chunk(text, limit = DISCORD_LIMIT) {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) parts.push(rest);
  return parts;
}

export async function sendChunked(interaction, content) {
  const parts = chunk(content);
  if (!parts.length) {
    await interaction.editReply({ content: '(empty)' });
    return;
  }
  await interaction.editReply({ content: parts[0] });
  for (const part of parts.slice(1)) {
    await interaction.followUp({ content: part });
  }
}
