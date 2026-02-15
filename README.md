# ⚡ Marketing HQ

Unified marketing dashboard for the **Unix of Marketing** CLI tools.

A single dark-mode web dashboard that reads data from [taskpipe](https://github.com/bennosan/taskpipe), [leadpipe](https://github.com/bennosan/leadpipe), and [contentq](https://github.com/bennosan/contentq).

![Dashboard](https://img.shields.io/badge/port-4000-00FF00?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

## Features

- 📋 **Dashboard** — Stats, today's tasks, pipeline overview, content queue
- 🎯 **Pipeline** — Full kanban board for leads (cold → won)
- 📝 **Content** — Content queue with status tracking
- 📊 **Activity** — Daily activity charts, completion patterns
- 🌙 Dark mode, responsive, auto-refreshes every 30s
- Zero dependencies on frontend frameworks — pure HTML/CSS/JS

## Install

```bash
npm install -g marketing-hq
# or
git clone https://github.com/bennosan/marketing-hq
cd marketing-hq && npm install && npm run build && npm link
```

## Usage

```bash
marketing-hq                          # reads from ~/marketing-test/
marketing-hq --dir /path/to/data      # custom data directory
MARKETING_HQ_DIR=/data marketing-hq   # via env var
```

The data directory should contain `.taskpipe/`, `.leadpipe/`, and `.contentq/` subdirectories (created by the respective CLI tools).

## Architecture

- Express server reading JSON/YAML files directly
- No database, no build step for frontend
- Static HTML + CSS + vanilla JS
- API endpoints: `/api/tasks`, `/api/leads`, `/api/content`, `/api/activity`, `/api/stats`, `/api/config`

## Part of the Unix of Marketing

Small, composable CLI tools for marketing:
- **taskpipe** — Task management with energy levels and stakes
- **leadpipe** — CRM pipeline in your terminal
- **contentq** — Content queue and publishing

## License

MIT
