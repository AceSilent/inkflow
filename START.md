# InkFlow Quick Start

## First Run

```powershell
copy .env.example .env
```

Edit `.env` with your OpenAI-compatible provider settings. Dependencies are installed automatically on first launch if they are missing.

## Start

```powershell
npm start
```

or double-click `start.cmd` on Windows.

The launcher starts:

- Backend: `http://127.0.0.1:3001`
- UI: `http://127.0.0.1:5173`

Logs are written to `server-dev.log` and `frontend-dev.log`.

## Stop

```powershell
.\stop.cmd
```

Closing the browser tab does not stop the backend or frontend processes. Use `stop.cmd` to shut them down.

## Verify

```powershell
npm test
npm run build
```
