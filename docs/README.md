# City of Shadows documentation

This is the documentation index for operators, contributors, and AI-assisted
review. Start here instead of scanning the repository alphabetically.

## Read by goal

| Goal | Start here | Then read |
|---|---|---|
| Understand the product | [VISION.md](VISION.md) | [../README.md](../README.md) |
| Understand the runtime | [ARCHITECTURE.md](ARCHITECTURE.md) | [AI-CONTEXT.md](AI-CONTEXT.md) |
| Understand world files | [DATA-MODEL.md](DATA-MODEL.md) | [../game/README.md](../game/README.md) |
| Understand mechanics execution | [../mc-reference/MECHANICS-CONTRACT.md](../mc-reference/MECHANICS-CONTRACT.md) | [../mc-reference/reference/basic-moves.md](../mc-reference/reference/basic-moves.md) |
| Operate or deploy it | [OPERATOR.md](OPERATOR.md) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Review with an AI agent | [AI-CONTEXT.md](AI-CONTEXT.md) | [DATA-MODEL.md](DATA-MODEL.md) |
| See current work | [../CHANGELOG.md](../CHANGELOG.md) | [../ROADMAP.md](../ROADMAP.md) |

## Canonical documents

- [VISION.md](VISION.md) — product intent and non-goals.
- [ARCHITECTURE.md](ARCHITECTURE.md) — runtime boundaries and session lifecycle.
- [DATA-MODEL.md](DATA-MODEL.md) — IDs, ownership, references, and public-data rules.
- [AI-CONTEXT.md](AI-CONTEXT.md) — how repository data reaches the model and how
  an AI reviewer should navigate the files.
- [OPERATOR.md](OPERATOR.md) — setup, deployment, environment, and troubleshooting.

## Historical design records

`superpowers/specs/` and `superpowers/plans/` are dated implementation records.
They explain why older features were built, but they are not current contracts.
When a historical record conflicts with one of the canonical documents above,
the canonical document and running code win.
