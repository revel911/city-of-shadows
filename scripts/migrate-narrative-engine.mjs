import { readJSON, writeJSON } from './world-utils.mjs';
import { withDerivedMysteryState, withStructuredArcPressure } from '../bot/handlers/narrative-state.js';

const stamp = new Date().toISOString().slice(0, 10);
const [arcDoc, mysteryDoc] = await Promise.all([
  readJSON('game/arcs.json'),
  readJSON('game/mysteries.json'),
]);
const arcs = withStructuredArcPressure(arcDoc, { stamp, bumpRevision: true });
const mysteries = withDerivedMysteryState(mysteryDoc);
await Promise.all([
  writeJSON('game/arcs.json', arcs.doc),
  writeJSON('game/mysteries.json', mysteries),
]);
console.log(JSON.stringify({ arcs_changed: arcs.changed, arc_count: arcs.doc.arcs.length, mystery_count: mysteries.mysteries.length }, null, 2));
