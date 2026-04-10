# Ralph-Loop 迭代目标 — 项目质量提升

> **Created**: 2026-04-10
> **Updated**: 2026-04-10 (after Loop 8)
> **Purpose**: Ralph-loop 循环的迭代输入文档，定义当前项目状态和每轮迭代的改进目标

---

## 项目现状总结

### 已完成的核心功能

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent Loop | ✅ 增强 | `streamText({ maxSteps: 20 })` + AbortSignal + mode context + tool summary injection |
| Tool System | ✅ 增强 | 17 tools via `ToolDefinition<T>` + `ToolRegistry` + categorized summary |
| Safety Layer | ✅ 可用 | `.bak` backup + `audit_log.jsonl` + path sanitizer + Zod validation |
| Editorial Pipeline | ✅ 增强 | 3-reviewer parallel + auto-persist to `04_Drafts/review_*.json` |
| Memory System | ✅ 可用 | 两层记忆：core-memory + project-memory + context-builder |
| SSE Streaming | ✅ 增强 | author-chat SSE with abort + brainstorm mode + Zod validation |
| Books CRUD | ✅ 增强 | 5 endpoints + Zod POST validation + path sanitization |
| Settings CRUD | ✅ 增强 | 2 endpoints + Zod PUT validation + key masking |
| Data Read | ✅ 增强 | 6 endpoints + outline PUT + review read + path sanitization |
| Frontend 6 面板 | ✅ 可用 | Sidebar/BrainstormPanel/AuthorChatPanel/OutlineTreeEditor/ChapterEditor/SettingsPanel |
| Frontend-Backend 联通 | ✅ 可用 | Vite proxy → :3001，全部面板使用真实端点 |
| Error Hierarchy | ✅ 新增 | AgentError → AbortError/ToolExecutionError/LLMError/ValidationError |

### 测试覆盖

- **18 test files**, **207 tests passing**
- 新增覆盖：author-chat history, editorial pipeline parsing, review persistence, Zod schemas, error types, tool summary
- 测试文件覆盖率 >80%

### 代码规模

- 后端：26 个 TS 源文件（+4 新文件：schemas, errors, path-sanitizer, editorial auto-save）
- 后端测试：18 个测试文件
- 前端：15 个 JSX/JS 文件

---

## 质量审计结果

### P0 — 安全漏洞

| # | 问题 | 状态 |
|---|------|------|
| S1 | **Path Traversal** | ✅ 已修复 (Loop 1) |

### P1 — 功能缺陷

| # | 问题 | 状态 |
|---|------|------|
| F1 | **BrainstormPanel 缺少 onDataChanged** | ✅ 已修复 (Loop 2) |
| F2 | **Editorial pipeline 静默失败** | ✅ 已修复 (Loop 2) |
| F3 | **Unused import: Box** | ✅ 已修复 (Loop 2) |

### P2 — 代码质量

| # | 问题 | 状态 |
|---|------|------|
| Q1 | **无 Zod 输入校验** | ✅ 已修复 (Loop 3) |
| Q2 | **author-chat 无测试** | ✅ 已修复 (Loop 4) |
| Q3 | **agent-loop 无测试** | ✅ 已修复 (Loop 4) |
| Q4 | **i18n 缺失 key** | 🔲 待处理 |
| Q5 | **data.ts 过大** | 🔲 待处理 |

### P3 — 架构改进

| # | 问题 | 状态 |
|---|------|------|
| A1 | **Editorial pipeline 错误处理** | 🔲 待处理 |
| A2 | **Review 结果不持久化** | ✅ 已修复 (Loop 5) |
| A3 | **Agent 无 save_review tool** | ✅ 已修复 (Loop 5，内嵌自动保存) |
| A4 | **前端 CSS 过大** | 🔲 待处理 |
| A5 | **Agent-loop 无 AbortSignal** | ✅ 已修复 (Loop 6) |
| A6 | **无工具分类摘要** | ✅ 已修复 (Loop 6) |
| A7 | **无自定义错误类型** | ✅ 已修复 (Loop 7) |

---

## Ralph-Loop 迭代计划

每轮迭代聚焦一个优先级层次，完成后进入下一轮。

### Loop 1: 安全修复 (P0) ✅ DONE

**验收标准**:
- [x] 所有路由的 `bookId` / `chapterId` 参数经过路径清洗
- [x] 拒绝含 `..`、绝对路径、空值的请求
- [x] 添加 `sanitizePath()` 工具函数 + 对应测试
- [x] 77+ tests passing

### Loop 2: 功能修复 (P1) ✅ DONE

**验收标准**:
- [x] App.jsx 传递 `onDataChanged={refreshData}` 和 `dataVersion` 给 BrainstormPanel
- [x] Editorial pipeline 模板缺失时返回 `pass_status: false`
- [x] Editorial pipeline LLM 错误时返回 `pass_status: false`
- [x] 清理 SettingsPanel unused import
- [x] 前端 build 通过

### Loop 3: 输入校验 (P2-Q1) ✅ DONE

**验收标准**:
- [x] books/settings/author-chat/data 路由全部 Zod 验证
- [x] 无效请求返回 400 + 清晰错误信息
- [x] 135 tests passing

### Loop 4: 测试补全 (P2-Q2/Q3) ✅ DONE

**验收标准**:
- [x] author-chat routes 历史读写测试
- [x] editorial pipeline 解析/合并测试
- [x] settings Zod 集成测试
- [x] 180 tests passing

### Loop 5: 审稿结果持久化 (P3-A2/A3) ✅ DONE

**验收标准**:
- [x] `submit_to_editorial` 自动写入 `04_Drafts/review_{chapterId}.json`
- [x] ChapterEditor 能读到持久化的 review 数据
- [x] 内嵌自动保存（editorial.ts persistReview 函数）

### Loop 6: Agent 架构现代化 ✅ DONE

**验收标准**:
- [x] Agent-loop 支持 AbortSignal（客户端断开取消流）
- [x] ToolContext 增加 mode 字段
- [x] ToolRegistry 新增 getReadTools() + getToolSummary()
- [x] Prompt-builder 新增工具箱 section
- [x] Author-chat SSE 支持 AbortController + proper cleanup
- [x] 194 tests passing

### Loop 7: 错误类型系统 ✅ DONE

**验收标准**:
- [x] AgentError 基类 + 4 个子类
- [x] isAbortError() + isAgentError() 类型守卫
- [x] 13 个错误类型测试
- [x] 207 tests passing

### Loop 8: 前端 i18n 完善 (P2-Q4) 🔄 IN PROGRESS

**目标**: 补全 i18n 缺失的 key

**验收标准**:
- [x] 检查所有面板中硬编码的中文文案
- [x] 添加缺失的 i18n key 到 zh.json 和 en.json
- [x] ChapterEditor 替换硬编码文案为 `t('key')` 调用
- [x] OutlineTreeEditor 替换硬编码文案为 `t('key')` 调用
- [ ] Sidebar 替换硬编码文案
- [ ] AuthorChatPanel 替换硬编码文案
- [ ] BrainstormPanel 替换硬编码文案

### Loop 9: 前端 CSS 模块化 (P3-A4) 🔲 PLANNED

**目标**: 拆分 index.css 为组件级 CSS modules

**验收标准**:
- [ ] 创建 CSS module 文件：sidebar.module.css, chapter-editor.module.css 等
- [ ] index.css 仅保留全局变量和通用样式
- [ ] 所有组件样式迁移完成

---

## 迭代规则

1. 每轮 Loop 开始前，从本文档读取当前目标
2. 完成一个 Loop 后，在对应验收标准上打勾
3. 运行完整测试套件，确保所有测试 passing
4. 提交时使用 `fix: ...` / `feat: ...` 前缀
5. 进入下一个 Loop
