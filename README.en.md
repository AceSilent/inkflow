# InkFlow

[![中文](https://img.shields.io/badge/中文-README-6b6257)](README.md)
[![English](https://img.shields.io/badge/English-current-8b3f2f)](README.en.md)

InkFlow is a local-first AI game script authoring studio for long-running game narrative projects. It brings the Scriptwriter Agent, lore, plot graphs, line-based scripts, branch self-checks, and editorial review into one web UI so creators can iterate around a game's narrative instead of generating isolated text snippets.

## Features

- Create and manage game script projects from the web UI.
- Chat with the Scriptwriter Agent to build lore, plot graphs, outlines, and line-based scripts.
- Four line types — dialogue, narration, action, thought — with direction tags (bgm, sfx, bg, shake, flash, wait) for scene staging.
- 2–4 branch choices per stage, with self-checks for branch closure, endpoint reachability, and orphan detection.
- Run script self-checks before saving to catch broken links, empty stages, narration overload, and other structural issues.
- Review with configurable lore compliance and causal logic reviewers.
- Store project data, scripts, reviews, and settings locally on disk so state survives app restarts.
- Export scripts to YAML, JSON, CSV, or HTML.

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

Edit `.env` with your OpenAI-compatible provider settings.

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

By default, runtime data is stored in a data directory at the repository root (default `books/`, configurable via `AUTONOVEL_DATA_DIR`).

Stop the app:

```text
stop.cmd
```

Closing the browser tab does not stop the backend or frontend processes.

## Configuration

InkFlow supports OpenAI-compatible providers through `.env` and the Settings UI.

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
