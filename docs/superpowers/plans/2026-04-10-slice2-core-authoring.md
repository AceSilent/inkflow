# Slice 2: Core Authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable brainstorm mode in author-chat SSE, add data read endpoints, clean BrainstormPanel dead code, wire panel linkage.

**Architecture:** Add `mode` field to author-chat POST body. When `mode: 'brainstorm'`, inject brainstorm-specific prompt instructions. Data endpoints are thin file readers over the book directory structure.

**Tech Stack:** Fastify 5, Vitest 4, React 19, Zod 4

**Spec:** `docs/superpowers/specs/2026-04-10-frontend-backend-unification-design.md` (Slice 2)

---

## Task 1: Add Brainstorm Mode to Backend

**Files:**
- Modify: `server/src/agent/prompt-builder.ts` — add BRAINSTORM section
- Modify: `server/src/agent/agent-loop.ts` — accept `mode` param, pass to prompt builder
- Modify: `server/src/routes/author-chat.ts` — read `mode` from body, pass to agent loop
- Test: `server/tests/prompt-builder.test.ts` — add brainstorm mode test

### prompt-builder.ts changes

Add a new BRAINSTORM_SECTIONS constant:

```typescript
export const BRAINSTORM_SECTIONS: PromptSection[] = [
  {
    title: '身份',
    content: '你是[头脑风暴伙伴]，AutoNovel-Studio 的创作顾问。你正在与人类用户讨论他们的小说创意。',
  },
  {
    title: '工作模式',
    content: [
      '- 你的核心任务是帮用户理清创意、扩展世界观、深化角色设定',
      '- 主动提问来引导思考，而不是被动等待',
      '- 讨论过程中，主动使用 save_lore 工具将确认的设定保存到设定库',
      '- 不要生成完整的正文段落，你是在构思阶段，不是写作阶段',
      '- 可以生成大纲结构，但不要写具体场景描写',
      '- 用 list_skills() 查看可用的写作方法技能',
      '- 回复使用中文',
    ].join('\n'),
  },
  {
    title: '记忆',
    contentFn: (ctx) => ctx.memory ?? '',
    condition: (ctx) => !!ctx.memory,
  },
]
```

Add a new export function:

```typescript
export function buildBrainstormPrompt(ctx: PromptContext): string {
  return buildSystemPrompt(BRAINSTORM_SECTIONS, ctx)
}
```

### agent-loop.ts changes

Add `mode?: string` to `AgentRunOptions`. In `runAgentStream`, use it to select prompt:

```typescript
const systemPrompt = options.mode === 'brainstorm'
  ? buildBrainstormPrompt({ memory: memoryContext })
  : buildAuthorPrompt({ memory: memoryContext })
```

### author-chat.ts changes

In the POST handler, extract `mode` from body:

```typescript
app.post<{ Params: { bookId: string }; Body: { message: string; mode?: string } }>(
```

Pass mode to runAgentStream:

```typescript
const result = runAgentStream({
  ...existingOptions,
  mode,
})
```

Import `buildBrainstormPrompt` (indirectly via agent-loop is fine — just pass mode).

### Test

Add to `server/tests/prompt-builder.test.ts`:

```typescript
it('should build brainstorm prompt with correct sections', () => {
  const prompt = buildBrainstormPrompt({})
  expect(prompt).toContain('头脑风暴伙伴')
  expect(prompt).toContain('save_lore')
  expect(prompt).not.toContain('铁律')
})
```

---

## Task 2: Data Read Endpoints

**Files:**
- Create: `server/src/routes/data.ts`
- Test: `server/tests/data-routes.test.ts`
- Modify: `server/src/index.ts` — register data routes

### data.ts

5 endpoints under `/api/v1/books/:bookId/...`:

```
GET /api/v1/books/:bookId/outline       → outline.json (or { children: [] })
GET /api/v1/books/:bookId/lore           → { meta, world_setting, characters, outline }
GET /api/v1/books/:bookId/plot-tree      → plot_tree.json (or { nodes: [] })
GET /api/v1/books/:bookId/chapters       → chapter list from outline
GET /api/v1/books/:bookId/chapters/:id   → chapter detail
```

All are thin file readers. Pattern:

```typescript
export function readOutline(dataDir: string, bookId: string): any {
  const p = path.join(dataDir, bookId, '02_Outlines', 'outline.json')
  if (!fs.existsSync(p)) return { id: bookId, label: '', type: 'book', children: [] }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
```

Similar for readLore (reads meta + world_setting + characters + outline), readPlotTree.

### Test

4 tests in `server/tests/data-routes.test.ts`:
1. readOutline returns default when no file
2. readOutline returns parsed JSON when file exists
3. readLore returns structured data
4. readPlotTree returns default when no file

---

## Task 3: Clean BrainstormPanel + Wire Linkage

**Files:**
- Modify: `frontend/src/components/BrainstormPanel.jsx`

### Changes

Remove dead code from BrainstormPanel:
- Remove: `messages`, `input`, `loading`, `historyLoaded`, `chatEndRef`, `fileInputRef`, `hoveredMsg` states
- Remove: `handleSend`, `handleFileUpload`, `handleDeleteMessage`, `handleRollback` functions
- Remove: `setLoreField` function
- Remove: chat history loading logic from `useEffect` (the brainstorm chat endpoints no longer exist)
- Remove: `Send`, `Upload`, `Sparkles`, `MessageSquare`, `Trash2`, `RotateCcw`, `Wrench` from imports

Keep:
- `lore`, `loreFiles`, `loreSection` states
- `fetchLore` function (updated to use new data endpoint)
- LoreJsonViewer and LoreEntry components
- Right pane (Lore Book) UI
- Left pane (AuthorChatPanel) — already working

Update `fetchLore` to use the new TS data endpoint:
```javascript
fetch(`/api/v1/books/${currentBook.book_id}/lore`)
```
This already matches what the code calls — just needs the backend endpoint.

Add `onDataChanged` prop usage:
```jsx
<AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={() => { fetchLore(); onDataChanged?.() }} />
```
Accept new prop: `onDataChanged`.
