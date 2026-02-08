# Pomodoro Focus Timer

## Development

- **Railway CLI** is available for deployment (`railway up`, `railway add`, etc.)
- **GitHub CLI** (`gh`) is available for PRs and issues

## Architecture

- Static frontend served by Express (`server.js`)
- PostgreSQL on Railway for persistent state (`db.js`)
- `GET /api/state` and `PUT /api/state` for server sync
- localStorage remains the fast read/write layer; server syncs in background

## Deploy

```bash
railway up
```
