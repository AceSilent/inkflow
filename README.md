# InkFlow

InkFlow is a local-first AI novel authoring studio. It combines a TypeScript backend, a Vite frontend, an Author Agent tool loop, chapter drafting, project lore, outline management, plot graph tracking, self-checks, and editorial review.

The project is designed for personal writing workflows. Book data, memories, drafts, reviews, and settings are stored on disk instead of in a database, so closing and reopening the app preserves state.

## Features

- Create and manage novel projects from the web UI.
- Chat with the Author Agent to build lore, outlines, plot graphs, and chapter drafts.
- Save drafts through controlled tools with backups and audit logs.
- Run draft self-checks before slow editorial review.
- Review chapters with configurable lore and logic reviewers.
- Keep provider settings local in `.env` or runtime `settings.json`.

## Requirements

- Node.js 22 or newer
- npm
- Windows PowerShell for the bundled `start.cmd` / `npm start` launcher

## Quick Start

Install dependencies:

```powershell
npm run install:all
```

Create local configuration:

```powershell
copy .env.example .env
```

Edit `.env` with your OpenAI-compatible provider settings. Do not commit real API keys.

Start the app:

```powershell
npm start
```

On Windows, you can also double-click:

```text
start.cmd
```

The launcher starts:

- Backend: `http://127.0.0.1:3001`
- Frontend: `http://127.0.0.1:5173`

By default, runtime data is stored in the repository root `books/` directory.

## Configuration

InkFlow supports OpenAI-compatible providers through environment variables and the Settings UI.

Common `.env` variables:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.example.com/v1
AUTHOR_MODEL=provider/model-name
EDITOR_MODEL=provider/editor-model-name
AUTONOVEL_DATA_DIR=books
```

The startup script maps these compatibility variables for the TypeScript backend:

- `OPENAI_API_KEY` -> `LLM_API_KEY`
- `OPENAI_BASE_URL` -> `LLM_BASE_URL`
- `AUTHOR_MODEL` -> `LLM_MODEL`
- `EDITOR_MODEL` -> `EDITORIAL_MODEL`

## Development

Backend:

```powershell
cd server
npm run dev
npm test
npm run build
```

Frontend:

```powershell
cd frontend
npm run dev
npm run build
```

Repo-level shortcuts:

```powershell
npm test
npm run build
```

## Packaging

GitHub Actions builds an installer-free zip artifact on pushes to `master` and on manual workflow dispatch.

The package workflow:

1. Installs backend and frontend dependencies.
2. Runs backend tests.
3. Builds backend and frontend.
4. Assembles `release/inkflow`.
5. Uploads `inkflow-<commit>.zip` as an Actions artifact.

This is not an installer. Users unzip it, install dependencies, configure `.env`, and run `npm start`.

## Data And Secrets

These paths are intentionally local and ignored by Git:

- `.env`
- `books/`
- `server/books/`
- `server/global/`
- `.agents/`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/`

Before publishing, scan staged changes and history for real API keys.
