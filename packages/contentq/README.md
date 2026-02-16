# contentq

Content queue manager for marketing. Manage, schedule, and publish posts to social platforms from your terminal.

## Install

```bash
cd tools/contentq
npm install && npm run build
npm link  # makes `contentq` available globally
```

## Quick Start

```bash
# Initialize in any project directory
contentq init

# Add your Late API key to .contentq/config.yaml
# Or set LATE_API_KEY environment variable

# Add posts
contentq add "Just shipped a new feature! 🚀"
contentq add --from draft.md
contentq add "Tagged post" -t "launch,product"

# View queue
contentq list
contentq list --status draft
contentq show <id>

# Edit posts
contentq edit <id> "Updated text"

# Schedule & publish
contentq schedule <id> "2026-02-16 09:00"
contentq publish <id>          # publish now
contentq publish --pending     # publish all due scheduled posts

# Stats & history
contentq stats
contentq history
contentq platforms
```

## Inbox

Capture ideas, screenshots, and inspiration before they become posts:

```bash
# Add items
contentq inbox add "idea for a thread about AI tools" --type idea
contentq inbox add screenshot.png --type social --note "cool design"
contentq inbox add --url "https://example.com/article" --type inspo --tags "competitor,design"

# Browse inbox
contentq inbox                   # list all
contentq inbox --social          # filter by type
contentq inbox --recent          # last 5 items
contentq inbox show <id>         # full details
contentq inbox stats             # count by type

# Promote to content queue
contentq inbox promote <id>      # creates a draft post

# Clean up
contentq inbox delete <id>
```

Inbox items are stored in `.contentq/inbox.json` with media files in `.contentq/inbox/{social,inspo,ideas,general}/`.

## JSON Mode

All commands support `--json` for machine-readable output:

```bash
contentq list --json
contentq add "post" --json
```

## Configuration

`.contentq/config.yaml`:

```yaml
platforms:
  linkedin:
    adapter: linkedin
    apiKey: sk_your_late_api_key
    accountId: "698f07784525118cee8daad0"
    profileId: "698e1a7211ffd99f0d2eebd9"
defaults:
  platform: linkedin
```

## Platform Adapters

Currently supported:
- **LinkedIn** via [Late API](https://getlate.dev)

## License

MIT
