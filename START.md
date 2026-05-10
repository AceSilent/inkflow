# InkFlow Quick Start

## First Run

```powershell
npm run install:all
copy .env.example .env
```

Edit `.env` with your OpenAI-compatible provider settings. Keep real API keys local; `.env` is ignored by Git.

## Start

```powershell
npm start
```

or double-click `start.cmd` on Windows.

The launcher starts:

- Backend: `http://127.0.0.1:3001`
- UI: `http://127.0.0.1:5173`

Logs are written to `server-dev.log` and `frontend-dev.log`.

## Verify

```powershell
npm test
npm run build
```
