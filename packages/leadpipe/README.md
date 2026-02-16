# leadpipe 🔧

CLI-first CRM pipeline. The Unix of Marketing.

Local-first. No database. No cloud. Just JSON files and your terminal.

## Install

```bash
npm install -g leadpipe
```

## Quick Start

```bash
leadpipe init
leadpipe add "John Smith" --email john@acme.com --company "Acme Corp" --source linkedin --tags "founder,saas" --value 5000
leadpipe list
leadpipe move <id> --stage warm
leadpipe touch <id> "Had intro call" --type call
leadpipe stats
```

## Commands

### CRUD
| Command | Description |
|---------|-------------|
| `leadpipe init` | Initialize `.leadpipe/` directory |
| `leadpipe add "Name" [options]` | Add a lead |
| `leadpipe list [--stage --tag --source]` | List & filter leads |
| `leadpipe show <id>` | Full lead details |
| `leadpipe edit <id> [options]` | Update lead fields |
| `leadpipe delete <id>` | Remove a lead |
| `leadpipe search "query"` | Search across all fields |

### Pipeline
| Command | Description |
|---------|-------------|
| `leadpipe move <id> --stage hot` | Change stage |
| `leadpipe touch <id> "note" --type call` | Log interaction |
| `leadpipe follow-up <id> "2026-02-20"` | Set follow-up |
| `leadpipe due` | Show overdue follow-ups |
| `leadpipe stale [--days 14]` | Find neglected leads |

### Scoring
| Command | Description |
|---------|-------------|
| `leadpipe score <id>` | Show score |
| `leadpipe score <id> --add 20 --reason "replied"` | Adjust score |
| `leadpipe score --recalc` | Recalculate all scores |

### Import/Export
| Command | Description |
|---------|-------------|
| `leadpipe import --csv file.csv` | Bulk import |
| `leadpipe export --csv [--stage hot]` | CSV export |
| `leadpipe export --json` | JSON dump |

### Templates
| Command | Description |
|---------|-------------|
| `leadpipe template list` | Available templates |
| `leadpipe template show cold-dm` | Preview |
| `leadpipe template use cold-dm <id>` | Render with lead data |

### Reporting
| Command | Description |
|---------|-------------|
| `leadpipe stats` | Pipeline overview |
| `leadpipe funnel` | Conversion rates |
| `leadpipe velocity` | Days per stage |
| `leadpipe revenue` | Value breakdown |
| `leadpipe context <id>` | Rich lead context |

### Multi-Pipeline
```bash
leadpipe --pipe agentsmith list
leadpipe --pipe agentsmith add "Lead" --stage lead
```

### Agent-Friendly
Every command supports `--json` for structured output:
```bash
leadpipe list --json | jq '.[] | select(.stage == "hot")'
```

## Pipeline Stages

**Default:** cold → warm → hot → proposal → won → lost

Custom pipelines in `.leadpipe/config.yaml`.

## Data

Everything lives in `.leadpipe/`:
- `config.yaml` — pipelines, scoring rules, settings
- `leads.json` — all your leads
- `templates/` — message templates with `{{variables}}`

## License

MIT
