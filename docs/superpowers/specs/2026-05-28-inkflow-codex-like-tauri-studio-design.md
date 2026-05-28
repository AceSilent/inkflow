# InkFlow Codex-like Tauri Studio Design

Date: 2026-05-28
Status: approved for implementation planning

## Summary

InkFlow will evolve from a browser-first local web app into a Mac-first novel authoring studio inspired by Codex. The product should feel like a dedicated writing environment, not a generic admin dashboard wrapped around an Agent chat.

The first implementation phase is a vertical slice:

- A Codex-like split workspace with Agent Chat as the main interaction surface.
- A collapsible, resizable right Workspace Pane for novel artifacts.
- Workspace tabs limited to `章节`, `大纲`, and `剧情图`.
- A clearer Agent lifecycle model without adding a heavy Agent management panel.
- Message-level checkpoint recovery: edit or continue from a prior user message.
- Tauri macOS packaging with the existing Node/Fastify backend as a sidecar.
- A new Editorial Glass visual direction using Tailwind v4 and OKLCH design tokens.

Windows packaging and a full rewrite of every existing panel are out of scope for the first phase.

## Goals

1. Make InkFlow feel like a specialized "Codex for novel writers".
2. Give the novel itself a stable workspace while keeping chat as the primary entry point.
3. Clarify Agent/session/run/checkpoint concepts so user-facing management feels natural.
4. Hide raw snapshot management behind conversation interactions.
5. Ship a Mac-first desktop app through Tauri without rewriting backend business logic.
6. Keep existing web development mode available for fast iteration and fallback.

## Non-goals

- Do not introduce a large standalone Agent lifecycle management panel.
- Do not rebuild the full editorial/review UI in the first phase.
- Do not move Fastify business logic into Rust.
- Do not ship Windows `.exe` in the first phase.
- Do not make snapshots a primary toolbar button or user-facing file-management concept.
- Do not make the UI visually noisy with decorative animation.

## Product Structure

The main interface has three layers.

### Left Navigation

The left side contains a narrow rail and a library pane.

The rail holds top-level entry points such as books, search or command, memory, settings, and other advanced surfaces. The rail should use familiar icons and tooltips rather than large text buttons.

The library pane shows the current book tree and supports selecting books, chapters, volumes, or orphan drafts. It can remain visible by default and may become collapsible later. It should be visually lighter than the current IDE-like sidebar.

### Central Agent Chat

Agent Chat is the primary working surface. Users describe what they want, ask for changes, use slash commands, and inspect the current run from the conversation.

Chat owns:

- User and assistant messages.
- Current run timeline.
- Streaming thinking/content/tool states.
- `/compact`, `/clear`, and `/remember`.
- Stop/interruption controls.
- Message actions such as copy, edit and resend, and continue from here.

The run timeline remains inside the chat context as a collapsible status card. It is not promoted to a separate primary page.

### Right Workspace Pane

The right pane is a collapsible and resizable Workspace Pane, similar in spirit to Codex side panes.

It has three first-phase tabs:

- `章节`: current chapter preview/edit surface.
- `大纲`: outline structure surface.
- `剧情图`: plot graph overview surface.

The pane can be collapsed to give chat the full width. When expanded, users can drag the divider to adjust the chat/workspace ratio. The preferred pane state and width should be stored locally, scoped at least by app install and ideally by book.

Other features such as snapshots, memory library, settings, export, and editorial review are opened from buttons, menus, commands, or secondary routes instead of becoming permanent workspace tabs.

## Chapter Workspace

The `章节` tab uses a dual-mode design.

Preview mode is the default. It shows the current chapter title, draft content, word count, save state, and recent Agent edit state. This mode is optimized for reading while chatting.

Edit mode is entered explicitly. It supports light editing and saving without leaving the main split workspace. It should include save/cancel affordances and communicate whether the current content differs from disk.

Full review workflows, dense annotations, and complex diff review can remain in dedicated modals or secondary pages. The first phase should not force the entire current workbench into the right pane.

## Agent And Session Model

The existing backend already has much of the required behavior. The redesign gives it clearer conceptual boundaries.

### Session

A Session is the current working conversation for a book. It contains chat history, context budget state, recent token usage, compaction state, temporary session state, current book/chapter context, and local UI preferences.

`/clear` clears the runnable session context, chat history, and run timeline. It does not delete book assets such as chapters, outlines, plot graph nodes, lore, or saved memories.

### Message Checkpoint

Each user message creates a checkpoint before the Agent run mutates any book state. This is already close to the current snapshot behavior, but the user-facing model changes.

Users should not need to open a snapshot list for ordinary recovery. Instead, each user message supports:

- `编辑并重发`: restore the checkpoint before that message, replace the message text, truncate later conversation/runs, and run again.
- `从这里继续`: restore the checkpoint before that message, keep or reuse the message, truncate later conversation/runs, and continue from that point.

The current snapshot file mechanism can remain as the persistence layer. The UI and API should expose it as message checkpoint recovery.

### Run

A Run is one Agent execution triggered by a user message. It starts when a message is sent and ends when the model/tool loop completes, errors, is interrupted, or is aborted.

Run timeline labels should be written in product language:

- Received user request.
- Created checkpoint.
- Loaded conversation.
- Prepared context.
- Thinking.
- Calling tool.
- Writing artifact.
- Reviewing.
- Completed.
- Interrupted.

The exact event model can continue using the existing run timeline infrastructure, but labels and grouping should better match this lifecycle.

### Artifact

Artifacts are durable book assets produced or changed by the Agent:

- Chapter drafts.
- Outline JSON.
- Plot graph nodes and edges.
- Lore and character data.
- Editorial review output.
- Session summaries and memories.

The Workspace Pane displays artifact state. It does not expose tool-call internals unless useful for explanation or debugging.

## Commands

### `/compact`

Manually compresses older context into a session summary. It should reuse the existing cold compaction and Memory v2 session summary path where practical.

Expected behavior:

- Runs without deleting book assets.
- Emits a visible chat notice with what was compacted.
- Updates context state and usage indicators.
- Handles compaction failure with a clear error message and no history loss.

### `/clear`

Clears the current book session. It removes chat history, run timeline, recent usage, and context logs, matching the current backend direction.

Expected behavior:

- Requires confirmation if invoked from a destructive UI button.
- Slash command can ask for confirmation in-chat before execution.
- Does not delete chapters, outline, plot graph, lore, reviews, or memories.

### `/remember`

Keeps the existing memory write behavior. It remains a chat command and may also be available from a memory menu.

### Stop Current Run

The stop button interrupts the active run. Partial assistant output may remain visible, but the run is marked interrupted and animations stop immediately.

## Visual Direction

The selected direction is Editorial Glass.

The app should feel bright, quiet, and Mac-native, with enough warmth for fiction writing. It should avoid a heavy IDE look and avoid a generic SaaS dashboard feel.

### Design Tokens

Use Tailwind v4 with OKLCH tokens. Tokens should include:

- App background.
- Raised panel background.
- Glass/translucent panel surface.
- Paper/workspace surface.
- Border subtle and border strong.
- Text primary, secondary, muted.
- Accent/focus.
- Success, warning, danger, info.
- Thinking/running highlight.

Large areas should not be dominated by purple, dark blue, beige, or a one-note palette. The selected direction can use a mostly light neutral base with a warm paper workspace and restrained blue/violet accents.

### Motion

Motion should be purposeful and quiet:

- Pane expand/collapse: 160-220ms ease-out.
- Split pane width changes should feel smooth but remain direct.
- New messages and tab changes can use slight opacity/translate transitions.
- Active Agent state can use a Codex-like shimmer sweep on short labels such as `thinking`, `running tool`, and `reviewing`.
- Thinking cards may use a subtle breathing border or background opacity.
- Active timeline steps may use a small moving highlight or light point.
- Completed or interrupted states become static.
- Respect `prefers-reduced-motion` by disabling shimmer and decorative motion.

## Tauri Desktop Architecture

The first desktop target is macOS.

Add a `src-tauri/` app shell. Tauri owns the native window, app lifecycle, and sidecar process management. It does not own novel-writing business logic.

### Runtime

- The React/Vite frontend is bundled into the Tauri app.
- The existing TypeScript server is built with `tsc`.
- The server runs as a Node sidecar managed by Tauri.
- The frontend receives the API base URL from Tauri or boot-time configuration.
- The server should bind to localhost, preferably on a dynamic available port for packaged app mode.
- Tauri terminates the sidecar on app quit.

### Data Directory

Packaged macOS builds should use an application support data directory, for example:

`~/Library/Application Support/InkFlow/books`

Development mode may keep using the repository-local `books/` directory. The data directory decision must be explicit so users do not lose track of their writing.

### Window

Use a Mac-first window:

- Native macOS traffic lights.
- Hidden or transparent titlebar.
- Custom draggable region.
- Light Editorial Glass styling.
- Minimum useful window size for split workspace.

The implementation should avoid private macOS APIs unless required and explicitly justified.

### Packaging

The first deliverable is a macOS `.dmg`. Code signing and notarization are a release hardening task. If public distribution is required immediately, signing/notarization becomes part of the implementation plan.

## Backend/API Changes

The current routes can remain mostly intact. First-phase additions should focus on session/checkpoint clarity.

Expected additions or changes:

- A manual compact endpoint or chat command path that invokes compaction directly.
- A message checkpoint restore/resend endpoint.
- Metadata linking user messages to checkpoint IDs.
- Chat history truncation after checkpoint restore.
- Run timeline truncation after checkpoint restore.
- Clear session behavior aligned with the new `/clear` semantics.

Existing snapshot files can remain the internal checkpoint storage. Public API names should prefer checkpoint/message language.

## Frontend Migration Plan

Implementation should avoid a full rewrite.

1. Introduce Tailwind v4 and OKLCH tokens.
2. Build the new App shell around existing data and panels.
3. Add resizable/collapsible Workspace Pane.
4. Move or wrap current chapter, outline, and plot graph surfaces into the workspace tabs.
5. Add message action UI for edit/resend and continue from here.
6. Add `/compact` and clarify `/clear`.
7. Add shimmer and active Agent state motion.
8. Add Tauri shell and sidecar wiring.

Where existing components are too large or tightly coupled, extract thin adapters rather than rewriting everything at once.

## Testing Strategy

### Backend

Add Vitest coverage for:

- Manual compact success/failure.
- `/clear` behavior and assets preserved.
- Checkpoint creation and restore.
- Chat history truncation after restore.
- Run timeline truncation after restore.
- Data directory resolution for packaged app mode where practical.

### Frontend

Add focused tests for:

- Slash command parsing.
- Workspace pane state transitions.
- Message edit/resend state.
- Checkpoint action payload construction.
- Chapter preview/edit mode state.

### Manual QA

Mac app smoke test:

1. Launch packaged app.
2. Confirm sidecar starts and shuts down with the app.
3. Create or open a book.
4. Send a chat message.
5. Stop an active run.
6. Use `/compact`.
7. Use `/clear` and confirm book assets remain.
8. Edit a prior user message and resend from its checkpoint.
9. Open chapter, outline, and plot graph tabs.
10. Collapse, expand, and resize the Workspace Pane.
11. Edit and save a chapter in the right pane.

## Risks And Mitigations

### Tauri Sidecar Complexity

Managing a Node sidecar is more complex than keeping a browser-only app. Mitigate by keeping the server unchanged at first and isolating Tauri work to process lifecycle and API base URL injection.

### Snapshot To Checkpoint Migration

The existing snapshot model is file-oriented. The new model is message-oriented. Mitigate by layering message checkpoint metadata on top of existing snapshot files before changing storage internals.

### Frontend Scope Creep

The current UI has many panels. Mitigate by limiting first-phase Workspace tabs to `章节`, `大纲`, and `剧情图`; other surfaces remain accessible through menus or existing secondary UI.

### Motion Overuse

Agent animations can become distracting in a writing tool. Mitigate with strict use: only active status labels shimmer, completed states are static, and reduced-motion preferences are respected.

### Data Directory Confusion

Moving packaged data outside the repo can confuse existing users. Mitigate with explicit Settings display and a migration/import path from repo-local `books/`.

## Open Decisions Resolved

- Desktop route: Tauri first, not Electron.
- Visual direction: Editorial Glass.
- Workspace default: right pane exists, can collapse, can resize.
- Workspace first-phase tabs: `章节`, `大纲`, `剧情图`.
- Chapter mode: preview by default, edit on demand.
- Snapshot UX: message checkpoint recovery, not a primary snapshot button.
- Run timeline: remains in Chat.
- Agent lifecycle: conceptual cleanup and light UI visibility, no large management panel.

## Acceptance Criteria

The first implementation phase is successful when:

- The app can run in web dev mode and Tauri macOS mode.
- The main UI uses the new split workspace layout.
- The right Workspace Pane can collapse, expand, resize, and switch between `章节`, `大纲`, and `剧情图`.
- Chapter preview/edit mode works for current drafts.
- Agent Chat supports visible `/compact`, `/clear`, and stop behavior.
- User messages support checkpoint-based edit/resend or continue-from-here.
- Run timeline remains available in Chat with clearer lifecycle labels.
- Editorial Glass tokens and Agent shimmer states are implemented with reduced-motion fallback.
- Existing backend tests pass, and new checkpoint/session tests cover the key lifecycle behavior.
