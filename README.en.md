# InkFlow

[![中文](https://img.shields.io/badge/中文-README-6b6257)](README.md)
[![English](https://img.shields.io/badge/English-current-8b3f2f)](README.en.md)

InkFlow is a local-first AI novel authoring studio for long-running personal writing projects. It brings the Author Agent, lore, outlines, plot graphs, chapter drafts, draft self-checks, and editorial review into one web UI so writers can iterate around a book instead of generating isolated text snippets.

## Features

- Create and manage novel projects from the desktop app or web UI.
- Chat with the Author Agent to build lore, outlines, plot graphs, and chapter drafts.
- Start with an unbound conversation, discuss an idea, then let the user or Agent bind that conversation into a new book.
- Run draft self-checks before saving to catch common AI-tone, length, and formatting issues early.
- Review chapters with configurable lore and logic reviewers.
- Use Gemini, DeepSeek, OpenAI-compatible services, or the ChatGPT Codex OAuth provider.
- Store book data, drafts, reviews, and settings locally on disk so state survives app restarts.

## Requirements

- Node.js 22 or newer
- npm
- macOS 12 or newer for the desktop app
- Rust and the Tauri CLI when building the desktop app locally
- Windows PowerShell only for the bundled `start.cmd` / `npm start` launcher

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

By default, runtime data is stored in the repository root `books/` directory.

## macOS Desktop App

Build the macOS app:

```bash
npm run desktop:build:mac
```

Build outputs:

- `.app`: `src-tauri/target/release/bundle/macos/InkFlow.app`
- `.dmg`: `src-tauri/target/release/bundle/dmg/InkFlow_1.0.1_aarch64.dmg`

After installing the app, runtime data is stored by default in:

```text
~/Library/Application Support/com.inkflow.studio/books
```

Each book is isolated in its own directory. Chapters, lore, outlines, plot graphs, run logs, and chat history stay under that book directory.

Stop the app:

```text
stop.cmd
```

Closing the browser tab does not stop the backend or frontend processes.

## Configuration

InkFlow supports Gemini, DeepSeek, OpenAI-compatible services, and the ChatGPT Codex OAuth provider through `.env` and the Settings UI.

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

### Codex OAuth

The ChatGPT Codex OAuth provider uses local OAuth credentials and does not require an API key inside InkFlow. It targets the ChatGPT Codex Responses API and explicitly uses `store:false` for multi-step tool calls so the continuation request does not reference non-persisted backend `item_reference` records.

This keeps Author Agent turns stable across flows like:

```text
user message -> model calls read_file/search/save_draft -> tool returns -> model continues with the final reply
```

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
