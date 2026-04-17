# 章节工作台 (Chapter Workbench)

**Spec Date**: 2026-04-18
**Scope**: 替代 `ChapterEditor.jsx`，构建集写作/批注/审稿反馈/审批于一体的章节主工作台
**Depends on**: `2026-04-18-design-system.md`
**Status**: Design locked, pending implementation plan

## 目的

现在的 `ChapterEditor.jsx` 是一个简单的文本编辑器，用户在这里只能读/编辑正文。AI Agent 写作、编辑部审稿、用户批注这些事发生在不同界面/不可见，用户无法在一个地方完成"读 + 改 + 看审稿意见 + 给 Agent 反馈 + 放行"的完整闭环。

工作台把这个闭环集中到单个 Tab，Agent 对该章的任何动作也在同一个 Tab 里可视化。

## 核心决策一览

| # | 决策 | 选择 |
|---|---|---|
| 1 | 定位 | 替代 `ChapterEditor.jsx`，Tab 形态（不是 Modal） |
| 2 | 审批模型 | 编辑部 + 用户双保险，**用户决定最高优先级** |
| 3 | 布局 | 统一时间线（左正文 + 右评论 feed）|
| 4 | 批注→Author 流 | 手动批量发送（按"📤 发送 N 条"触发 Agent 新一轮） |
| 5 | 通过时有未处理批注 | 询问式弹窗确认 |
| 6 | Agent 正在写该章 | 工作台只读 + 中央 spin 遮罩，正文灰化 |
| 7 | Agent 写其他章 | 右下 toast"Author 正在写 ch05 → [跳过去]" |
| 8 | 用户编辑中 + Agent save_draft | 拦截 Agent 的 save_draft，返回错误 |
| 9 | 编辑器 | Milkdown（ProseMirror WYSIWYG markdown） |
| 10 | Agent 重写后的 diff | 被动横幅"Agent 刚改了此章（第 N 版）→ 查看修改" |

## 布局

```
┌──────────────────────────────────────────────────────────────────────┐
│ TITLE  Ch. I · 雨夜     [Agent 写作中 ⟳]  [审核 3/5]     [📤 4 条] [再送审] [用户通过]│
├─────┬────────────────────────────────────────┬────────────────────────┤
│     │                                        │  ─── Marginalia ───    │
│ Ch. │   Milkdown WYSIWYG 编辑区              │                        │
│ I   │   （Fraunces 标题 + Noto Serif SC      │  设定审稿 · 4          │
│  /  │    正文 + drop cap + epigraph）        │  "铜制的怀表..."       │
│ XVI │                                        │  怀表装饰风格与时空冲突│
│     │   雨水砸在铁皮棚顶上...                │  [跳原文] [采纳→发 Author] [忽略]│
│     │                                        │                        │
│     │                                        │  节奏审稿 · 3          │
│     │                                        │  ...                   │
│     │                                        │                        │
│     │                                        │  — 笔者                │
│     │                                        │  此处转场太硬          │
├─────┴────────────────────────────────────────┴────────────────────────┤
│ Rev. III  ·  3,142 Words  ·  Edited 2 Min  ·  [查看历史版本] [导出 .md] │
└──────────────────────────────────────────────────────────────────────┘
```

### 分区

- **左竖条（`rail-label`）**: 罗马数字章节定位，永远可见（设计系统签名组件）
- **主编辑区**：Milkdown 实例
  - 标题区域：Fraunces 22px，可选 epigraph
  - 正文区：Noto Serif SC 13px，行高 1.85，首段 `.drop-cap`
  - 编辑器 UI chrome（toolbar）隐藏 / 只留悬浮式行内格式化（Typora-like 体验）
- **右评论 feed**：固定宽度 230px
  - 顶部过滤：全部 / 未处理 / ≥severity 4 / 我的
  - 每条评论卡片：作者（5 审稿人之一 + 用户）、严重度徽章、原文 quote、意见正文、操作按钮
  - 按"状态（未处理优先）+ 严重度降序"排序
- **底部状态栏**：hairline 上边界，Fraunces small caps，显示版本 / 字数 / 编辑时间 / 操作

### 顶栏详解

从左到右：
1. `Ch. I · 雨夜` — 章节定位 + 标题（Fraunces）
2. `[Agent 写作中 ⟳]` — 仅在 Agent 正在 save_draft 本章时显示
3. `[审核 3/5 ✅]` — 编辑部当前通过数徽章，点击展开详情 popover
4. `[📤 发送 4 条批注]` — 有未发送批注时出现，数字随状态更新
5. `[再次送审]` — 触发 `submit_to_editorial` 重跑
6. `[用户通过]` — 终审按钮；有未处理批注时弹确认

## 交互流

### 场景 1 · 用户阅读 + 轻度改动

1. 用户打开 Tab → 读现有 `04_Drafts/ch{N}.md` → Milkdown 渲染为 WYSIWYG
2. 用户改几个字 → Tab 标题旁出现 `●` 脏标记
3. Ctrl+S 或 blur 自动保存 → 写回 `04_Drafts/ch{N}.md`（经 `archivePriorDraft` 存档上一版）
4. 底栏字数/版本号更新

### 场景 2 · 批注

1. 用户选中正文某段 → 浮动按钮 `+ 批注`
2. 点击 → 弹输入框（原文摘录 + 评论） → 提交
3. 正文该段加 `.hl-user` 绿色下划线；右栏 feed 顶部插入新卡片；写入 `annotations_{chId}.json`
4. 顶栏按钮数字 +1："📤 发送 N 条批注"
5. 用户可继续批注 / 删除 / 编辑评论内容

### 场景 3 · 审稿意见（已存在的 `review_{chId}.json`）

1. 页面加载时读 `04_Drafts/review_{chId}.json`
2. 遍历 `feedbacks[*].issues[*]`：
   - 有 `quote` → 在正文中查找该子串，命中第一处打相应颜色下划线 + 锚定到右栏卡片
   - 无 `quote` → 仅进右栏 feed，不在正文锚定
3. 卡片上的操作：
   - `[跳原文]` — 滚动到对应锚点并 flash 高亮 800ms
   - `[采纳→发 Author]` — 把此 issue 转成一条批注（继承 quote + fix_instruction 作为用户观点），立即可随下次"📤 发送"发出
   - `[忽略]` — 卡片置灰，不再进未处理队列

### 场景 4 · 📤 发送批注给 Author（核心回路）

1. 用户点"📤 发送 4 条批注"按钮
2. 前端组装 payload：
   ```
   用户消息：
   请根据以下批注修改第 N 章（原文在 04_Drafts/ch{N}.md）：

   【批注 1】引用："林舟摸出那枚铜制的怀表..."
   评论：转场太硬，建议加路灯或脚步声的细节

   【批注 2】（来自采纳的设定审稿）引用："..."
   评论：...

   请修改后用 save_draft 保存新版本，然后告知哪些批注已处理。
   ```
3. 通过 `POST /api/v1/books/:bookId/chapters/:chId/send-annotations` 发给后端
4. 后端把 payload 作为 user message 注入 author-chat 历史，然后启动 agent-loop（和点"发送"相同路径）
5. 前端切回 AuthorChat Tab（或不切，按用户当前焦点），工作台顶栏显示"Agent 正在修改..."
6. Agent 走完后 → `save_draft` 新版本覆盖 → 工作台自动热更新
7. 批注状态改为 `status: 'sent'`，UI 显示"已发送 · 待 Agent 处理"
8. Agent 回复里如标记"批注 1 已处理"等，对应批注状态变 `resolved`（Phase 2 优化，Phase 1 只改 `sent`，用户手动 `resolve`）

### 场景 5 · 再次送审

1. 用户点"再次送审"按钮
2. 前端 `POST /api/v1/books/:bookId/chapters/:chId/resubmit-review`
3. 后端调用 `submit_to_editorial` tool 逻辑（不走 agent-loop，直接执行 editorial pipeline）
4. 返回新的 `review_{chId}.json`，工作台 feed 刷新
5. Agent chat 不受干扰

### 场景 6 · 用户通过

1. 用户点"用户通过"
2. 前端判断：有 `status === 'open'` 或 `status === 'sent'` 的批注？
   - 有 → 弹确认："还有 N 条未处理批注，确定直接通过？"
   - 无 → 直接执行
3. `PUT /api/v1/books/:bookId/chapters/:chId/status` body `{ user_decision: 'approved' }`
4. 后端写 `chapter_status_{chId}.json`
5. UI 顶栏徽章变绿："✅ 已通过"
6. **hook 层生效**：Agent 尝试 `save_draft` 下一章时，`review-prev-chapter.ts` 读到 `chapter_status_{chId}.json` 的 `user_decision: 'approved'`，直接放行

### 场景 7 · Agent 正在写本章

1. SSE 事件 `tool_start { name: 'save_draft', args: { file_path: 'ch{N}.md' } }` 到达前端
2. 前端判断当前工作台章节 === 被写的章节
3. 工作台进入 **locked-writing** 状态：
   - 正文 opacity 0.35
   - 中央叠加 spin 动画（Fraunces "✱" 12 瓣旋转）+ "Author 正在写作..."
   - 所有按钮 disabled
   - Milkdown 变 read-only
4. 收到 `tool_done` 后：
   - 页面重载 `04_Drafts/ch{N}.md`
   - locked 状态解除
   - 顶部插入横幅："Agent 刚改了此章（第 N 版）→ [查看修改]"
   - 点"查看修改" → 弹 Modal side-by-side diff（使用 `.draft_history/ch{N}/` 里的上一版）

### 场景 8 · Agent 写其他章

1. SSE 事件 `tool_start { name: 'save_draft', args: { file_path: 'ch05.md' } }`
2. 当前工作台章节 !== ch05
3. 不改工作台，右下角 `useToast` 弹："Author 正在写 ch05 → [跳过去]"
4. 点"跳过去" → `openTab('chapter-ch05', ...)` + 切换 activeTab

### 场景 9 · 用户编辑中 + Agent 写本章冲突

1. 工作台有 `●` 脏标记
2. Agent 调 `save_draft` 本章 → **hook 拦截**
3. 新 hook `block-while-user-editing.ts` 检查：book 目录下是否有 `workbench_lock_{chId}` 临时文件（前端在进入脏状态时写，保存或退出时删）
4. 有锁 → 返回错误给 Agent："`Error: User is currently editing ch{N}. Retry later or ask user to save.`"
5. Agent 会自己处理（重试、问用户等）

## 数据模型新增

### `books/{bookId}/04_Drafts/annotations_{chId}.json`

```typescript
interface Annotation {
  id: string                          // nanoid
  quote: string                       // 原文摘录
  anchor_start: number                // 字符偏移（对 markdown 源码，不是渲染后 DOM）
  anchor_end: number
  comment: string                     // 用户评论正文
  source: 'user' | 'adopted_review'   // 来源：用户原创 / 从审稿采纳
  source_reviewer?: string            // 若 source=adopted_review，记录哪个审稿人
  status: 'open' | 'sent' | 'resolved' | 'ignored'
  sent_batch_id?: string              // 哪一次发送批次（见"风险"第 5 条）
  created_at: string                  // ISO 时间
  sent_at?: string
  resolved_at?: string
}

type AnnotationsFile = Annotation[]
```

### `books/{bookId}/04_Drafts/chapter_status_{chId}.json`

```typescript
interface ChapterStatus {
  chapter_id: string
  user_decision: 'approved' | 'rejected' | null
  decided_at?: string                 // ISO
  note?: string                       // 可选：用户说明
}
```

### `books/{bookId}/04_Drafts/workbench_lock_{chId}` （临时文件）

空文件或单行时间戳。存在 = 用户正在编辑；前端维护生命周期。

### 现有文件保持不变

- `review_{chId}.json` — 结构不变
- `ch{N}.md` — 结构不变
- `.draft_history/ch{N}/` — 结构不变

## 后端改动

### 新增路由（`server/src/routes/`）

新建 `server/src/routes/workbench.ts`（Fastify plugin，集中所有工作台相关 endpoint：批注 + 审批 + 锁 + 再送审）：

```
GET    /api/v1/books/:bookId/chapters/:chId/annotations
POST   /api/v1/books/:bookId/chapters/:chId/annotations              body: Omit<Annotation, 'id'|'created_at'|'status'>
PATCH  /api/v1/books/:bookId/chapters/:chId/annotations/:annId       body: Partial<Annotation>
DELETE /api/v1/books/:bookId/chapters/:chId/annotations/:annId
POST   /api/v1/books/:bookId/chapters/:chId/send-annotations         → 触发 Agent run
PUT    /api/v1/books/:bookId/chapters/:chId/status                   body: { user_decision }
GET    /api/v1/books/:bookId/chapters/:chId/status
POST   /api/v1/books/:bookId/chapters/:chId/resubmit-review          → 直接跑 editorial pipeline
POST   /api/v1/books/:bookId/chapters/:chId/workbench-lock
DELETE /api/v1/books/:bookId/chapters/:chId/workbench-lock
```

所有 POST/PUT/PATCH body 通过 Zod schema 验证（`schemas.ts` 新增定义）。

### Hook 改造（`server/src/stats/tips/review-prev-chapter.ts`）

新增逻辑：在 `interceptToolCall` 中，先读 `chapter_status_{prevCh}.json`：
- 若 `user_decision === 'approved'` → 直接放行
- 若 `user_decision === 'rejected'` → 直接 block，返回"Chapter rejected by user; revise before writing next."
- 否则 → 走原有 `review_{prevCh}.json.overall_pass` 判断

### 新 Hook（`server/src/stats/tips/block-while-user-editing.ts`）

`interceptToolCall` 在 `save_draft` 时检查 `workbench_lock_{chId}` 是否存在。存在 → block。

### 复用现有

- `submit_to_editorial` tool：`resubmit-review` 路由直接调用其内部实现（提取成一个 internal function）
- `createBackup` + `appendAuditLog`：所有写批注 / 写 status 操作走安全层

## 前端改动

### 新组件

- `frontend/src/components/ChapterWorkbench.jsx` — 替代 `ChapterEditor.jsx`
- `frontend/src/components/workbench/CommentFeed.jsx` — 右栏评论列表 + 过滤
- `frontend/src/components/workbench/AnnotationPopover.jsx` — 选中文字后浮动"+ 批注"
- `frontend/src/components/workbench/DiffModal.jsx` — "查看修改"弹窗
- `frontend/src/components/workbench/ApprovalConfirmModal.jsx` — 询问式通过确认
- `frontend/src/hooks/useWorkbenchSSE.js` — 订阅 author-chat SSE，筛当前章的 save_draft 事件

### App.jsx 改动

- `renderEditor()` 的 chapter-xxx 分支改用 `ChapterWorkbench`
- 新增全局 SSE 监听（Agent 写其他章 → 全局 toast）

### 依赖新增

```json
{
  "@milkdown/core": "^7",
  "@milkdown/react": "^7",
  "@milkdown/preset-commonmark": "^7",
  "@milkdown/plugin-history": "^7",
  "@milkdown/plugin-listener": "^7",
  "nanoid": "^5"
}
```

### 自定义 Milkdown 插件

需要一个自定义批注插件：
- 扩展 ProseMirror `decoration` 画 `.hl-*` 下划线
- 监听选区 → 发出事件给 AnnotationPopover
- 字符偏移映射回 `anchor_start/anchor_end`（用 markdown 源码的 char 偏移，不用 node-offset，保证跨编辑器可移植）

### 样式

使用设计系统 `2026-04-18-design-system.md` 的所有 tokens + 签名组件。工作台**不定义新的颜色或字体**，全部引用 CSS 变量。

## 验收标准

1. 打开任意章节 Tab，整页用 Milkdown 显示现有 `ch{N}.md`
2. 批注 / 采纳 / 忽略 / 发送全流程跑通，Agent 收到批注后 save_draft 新版本
3. 再次送审触发 editorial pipeline，feed 刷新
4. 用户通过写入 `chapter_status.json`；hook 层读取后放行下一章
5. 未处理批注弹确认才能通过
6. Agent 写本章时工作台锁定显示 spin；写其他章出 toast
7. 用户编辑中 Agent 的 save_draft 被 hook 拦截
8. Agent 重写后顶部出横幅，点击可 side-by-side 对比历史版本
9. 视觉层完全符合 design-system spec（drop cap、罗马数字、竖排标签、配色、字体）
10. Light / Dark 主题切换正常
11. 测试覆盖：批注 CRUD、发送、审批、hook 联动，≥ 10 个新测试

## 不在本 spec 范围

- 大纲/卷纲 spec（独立，待办）
- 剧情树 spec（独立，待办）
- 批注的回复/讨论线程（只支持一级批注）
- 实时多人协作
- 手动版本回滚 UI（`.draft_history/` 仅做 diff 对比）
- Phase 2 自动识别"批注是否已 resolved"（靠 Agent 回复自然语言）

## 风险 & 备注

1. **Milkdown 字符偏移与 markdown 源码偏移的映射**可能在列表、表格等复杂结构下不精确；第一版仅保证段落级准确，复杂结构退化到 block-level 锚定（锚定整段而非字符范围）
2. **批注发送会触发完整 Agent run**，消耗较大。前端必须有明确发送确认 + 中途可 abort
3. **`workbench_lock` 文件可能成为僵尸**（前端崩溃未清理）；hook 需要 timeout 判定（>10min 未更新视为过期）
4. **并发**：用户在多个浏览器同时开同一章不在考虑范围
5. **Agent 处理批注中用户继续加新批注**：允许；"📤 发送" 按钮在 Agent run 进行中 disabled；Agent 完成后只把这次发送的批注标为 `sent`，新加的保持 `open` 等下一批次。前端用 `sent_batch_id` 区分
