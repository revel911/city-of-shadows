# Dashboard map

The dashboard is a public, read-only view of canonical repository state. It must
never contain player safety data, private relationships, undiscovered secrets,
or private character knowledge.

| Link | Title | Information within |
|---|---|---|
| [index.html](index.html) | Dashboard shell | Page structure, navigation, content regions, scripts, and stylesheet order |
| [app.js](app.js) | Dashboard application | Repository data loading, views, entity rendering, filters, graph interaction, and public mystery presentation |
| [style.css](style.css) | Base styles | Layout tokens, cards, tables, lists, badges, responsive behavior, and shared visual rules |
| [graph-controls.css](graph-controls.css) | Graph controls | Network filter and control presentation |
| [layout-fixes.css](layout-fixes.css) | Layout fixes | Narrow corrective overrides for dashboard geometry |
| [polish.css](polish.css) | Visual polish | Finishing treatments layered over the base design |
| [textures.css](textures.css) | Textures | Atmospheric backgrounds and decorative texture rules |
| [data/world-graph.json](data/world-graph.json) | Generated world graph | Public nodes, edges, and metadata produced by scripts/build-graph.mjs |

Source data remains under [game/](../game/); do not hand-edit generated graph
data. Run npm run build:graph after world changes and
npm test before publishing.
