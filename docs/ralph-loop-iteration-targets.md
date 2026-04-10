# Ralph-Loop 迭代目标 — 项目质量提升

> **Created**: 2026-04-10
> **Purpose**: Ralph-loop 循环的迭代输入文档，定义当前项目状态和每轮迭代的改进目标

---

## 项目现状总结

### 已完成的核心功能

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent Loop | ✅ 可用 | `streamText({ maxSteps: 20 })` + 17 tools，Vercel AI SDK 驱动 |
| Tool System | ✅ 可用 | 17 tools via `ToolDefinition<T>` interface + `ToolRegistry` |
| Safety Layer | ✅ 可用 | `.bak` backup + `audit_log.jsonl` + input validation |
| Editorial Pipeline | ✅ 可用 | 3-reviewer parallel (lore/pacing/AI-tone)，模板驱动 |
| Memory System | ✅ 可用 | 两层记忆：core-memory + project-memory + context-builder |
| SSE Streaming | ✅ 可用 | author-chat SSE with brainstorm mode |
| Books CRUD | ✅ 可用 | 5 endpoints：list/get/create/delete/explorer |
| Settings CRUD | ✅ 可用 | 2 endpoints：get(脱敏)/put |
| Data Read | ✅ 可用 | 5 endpoints：outline/lore/plot-tree/chapters/chapter-detail/reviews |
| Frontend 6 面板 | ✅ 可用 | Sidebar/BrainstormPanel/AuthorChatPanel/OutlineTreeEditor/ChapterEditor/SettingsPanel |
| Frontend-Backend 联通 | ✅ 可用 | Vite proxy → :3001，全部面板使用真实端点 |

### 测试覆盖

- **11 test files**, **77 tests passing**
- 源文件 22 个，测试文件 11 个（覆盖率约 50%）
- **未测试的模块**：agent-loop.ts, llm/provider.ts, editorial/editorial.ts, routes/author-chat.ts

### 代码规模

- 后端：22 个 TS 源文件，2137 行
- 后端测试：11 个测试文件，1086 行
- 前端：15 个 JSX/JS 文件，3237 行
- Prompt 模板：11 个文件（9 skill .md + 3 reviewer .j2 + 4 summary .j2）

---

## 质量审计结果

### P0 — 安全漏洞

| # | 问题 | 文件 | 影响 |
|---|------|------|------|
| S1 | **Path Traversal** | 所有 routes/*.ts | `bookId` 未过滤，`../` 可越权读文件 |

所有路由使用 `path.join(dataDir, bookId)` 但未校验 bookId 不含 `..` 或绝对路径前缀。攻击者可读取/写入 dataDir 外的任意文件。

### P1 — 功能缺陷

| # | 问题 | 文件 | 影响 |
|---|------|------|------|
| F1 | **BrainstormPanel 缺少 onDataChanged** | App.jsx:71 | BrainstormPanel 内 Agent 保存数据后，其他面板不会刷新 |
| F2 | **Editorial pipeline 静默失败** | pipeline.ts:57,98 | 模板缺失或 LLM 错误时返回 `pass_status: true`，审核形同虚设 |
| F3 | **Unused import: Box** | SettingsPanel.jsx | 未使用的 lucide-react 导入 |

### P2 — 代码质量

| # | 问题 | 文件 | 影响 |
|---|------|------|------|
| Q1 | **无 Zod 输入校验** | 所有 routes/*.ts | POST body 未验证，恶意/畸形数据可导致崩溃 |
| Q2 | **author-chat 无测试** | routes/author-chat.ts | 核心路由零测试覆盖 |
| Q3 | **agent-loop 无测试** | agent/agent-loop.ts | 核心运行时零测试覆盖 |
| Q4 | **i18n 缺失 key** | locales.js | 部分 UI 文案硬编码中文，未走 i18n |
| Q5 | **data.ts 过大** | routes/data.ts (281行) | 读写函数混合，可拆分为 reader + writer |

### P3 — 架构改进

| # | 问题 | 说明 |
|---|------|------|
| A1 | **Editorial pipeline 错误处理** | JSON parse fallback 有 4 条路径，逻辑混乱 |
| A2 | **Review 结果不持久化** | submit_to_editorial 返回结果但不自动保存到 04_Drafts/review_*.json |
| A3 | **Agent 无 save_review tool** | Agent 无法主动保存审核结果，需手动调用 |
| A4 | **前端 CSS 过大** | index.css 643 行，无模块化 |

---

## Ralph-Loop 迭代计划

每轮迭代聚焦一个优先级层次，完成后进入下一轮。

### Loop 1: 安全修复 (P0)

**目标**: 消除 path traversal 漏洞

**验收标准**:
- [ ] 所有路由的 `bookId` / `chapterId` 参数经过路径清洗
- [ ] 拒绝含 `..`、绝对路径、空值的请求
- [ ] 添加 `sanitizePath()` 工具函数 + 对应测试
- [ ] 77+ tests passing

**预计改动**:
- 新增 `server/src/utils/path-sanitizer.ts`
- 修改 `server/src/routes/books.ts`、`data.ts`、`settings.ts`、`author-chat.ts`
- 新增 `server/tests/path-sanitizer.test.ts`

### Loop 2: 功能修复 (P1)

**目标**: 修复已知功能缺陷

**验收标准**:
- [ ] App.jsx 传递 `onDataChanged={refreshData}` 和 `dataVersion` 给 BrainstormPanel
- [ ] Editorial pipeline 模板缺失时返回 `pass_status: false`（而不是 true）
- [ ] Editorial pipeline LLM 错误时返回 `pass_status: false`
- [ ] 清理 SettingsPanel unused import
- [ ] 前端 build 通过

**预计改动**:
- 修改 `frontend/src/App.jsx`（2 处）
- 修改 `server/src/editorial/pipeline.ts`（2 处）
- 修改 `frontend/src/components/SettingsPanel.jsx`（1 处）

### Loop 3: 输入校验 (P2-Q1)

**目标**: 给所有路由添加 Zod schema 验证

**验收标准**:
- [ ] books 路由 POST body 有 Zod schema（book_id 非空、target_words 正整数）
- [ ] settings 路由 PUT body 有 Zod schema（providers 数组）
- [ ] author-chat 路由 POST body 有 Zod schema（message 非空）
- [ ] outline PUT body 基本校验（type='book', children 数组）
- [ ] 无效请求返回 400 + 清晰错误信息
- [ ] 80+ tests passing

**预计改动**:
- 新增 `server/src/routes/schemas.ts`（集中存放 Zod schema）
- 修改所有 4 个路由文件
- 新增 `server/tests/schemas.test.ts`

### Loop 4: 测试补全 (P2-Q2/Q3)

**目标**: 关键模块测试覆盖

**验收标准**:
- [ ] author-chat routes: 历史读写、SSE 流 mock 测试
- [ ] editorial pipeline: mock LLM 测试成功/失败/模板缺失
- [ ] agent-loop: mode 切换、prompt 选择测试
- [ ] 100+ tests passing

**预计改动**:
- 新增 `server/tests/author-chat-routes.test.ts`
- 新增 `server/tests/editorial-pipeline.test.ts`
- 修改 `server/tests/prompt-builder.test.ts`

### Loop 5: 审稿结果持久化 (P3-A2/A3)

**目标**: submit_to_editorial 自动保存结果

**验收标准**:
- [ ] `submit_to_editorial` tool 执行后自动写入 `04_Drafts/review_{chapterId}.json`
- [ ] ChapterEditor 能读到持久化的 review 数据
- [ ] 新增 `save_review` tool 或 editorial 自动保存

---

## 迭代规则

1. 每轮 Loop 开始前，从本文档读取当前目标
2. 完成一个 Loop 后，在对应验收标准上打勾
3. 运行完整测试套件，确保 77+ tests passing
4. 提交时使用 `fix: ...` / `feat: ...` 前缀
5. 进入下一个 Loop
