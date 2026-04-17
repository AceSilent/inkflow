# 大纲 / 卷纲 视图（Outline View）

**Spec Date**: 2026-04-18
**Scope**: 替换 `OutlineTreeEditor.jsx` 的"JSON 树"展示为"文学方案书"长文档流
**Depends on**: `2026-04-18-design-system.md`
**Status**: Design locked, pending implementation plan

## 目的

现在的 `OutlineTreeEditor.jsx` 把 `outline.json` 按树结构渲染，每个节点一行 + 缩进 + 展开箭头——这是开发者视角的数据结构展示，不是作家视角的"方案书"。用户反馈"太 AI 太 JSON"。

本 spec **只改展示层**：数据层的 `outline.json`（`{id, type, children, label, summary}` 树）结构**保持不变**，`ch{N}` 硬约束不动（hook + `save_draft` 依赖它），只在节点上**向后兼容地**加几个可选字段承载长文档需要的信息。

## 核心决策一览

| # | 决策 | 选择 |
|---|---|---|
| 1 | 展示范式 | 长文档流（Scrivenings + 刊物目录页风） |
| 2 | 编辑模式 | Inline（点任意段落进入编辑态，blur 保存） |
| 3 | 章节重排 | 拖拽 + 键盘 `Alt+↑/↓` + `Alt+Shift+←/→`（改卷） |
| 4 | `scene` 子层 | 保留数据兼容，UI 默认收起，不主推 |
| 5 | 章节 `beats[]` | 跳过。保留 `summary` 字符串即可 |
| 6 | Corkboard 备用视图 | 跳过。未来可加 |
| 7 | Agent 写 outline 时 | 整页 read-only + 中央 spin（与 Chapter Workbench 一致） |
| 8 | Schema 扩展 | 仅加可选字段：`book.epigraph`、`book.synopsis`、`volume.synopsis` |

## 布局

```
┌──────────────────────────────────────────────────────────────────────┐
│ TITLE  Outline · 雨夜来信                    [重排模式] [导出 .md]     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  雨夜来信                                          ← book.label       │
│  │ 所有关于记忆的书，其实都是关于遗忘的。        ← book.epigraph     │
│                                                                      │
│  [首字母下沉]林舟在雨夜收到一封三年前寄出的信...   ← book.synopsis    │
│                                                                      │
│  ─────  Vol. I · 雨夜 · 怀表与旧人  ─────       ← volume.label       │
│   林舟收到来信，从都市回到小镇...                 ← volume.synopsis   │
│                                                                      │
│   I.   雨夜                                       ✓ Done              │
│        林舟摸出怀表，巷口撞见以为已经死去的她。                        │
│   ─────────────────────────────────────────────────────              │
│   II.  旧信                                         Draft             │
│        拆开信封，字迹与自己的笔迹一模一样。                            │
│   ─────────────────────────────────────────────────────              │
│   III. 回乡                                           —              │
│        踏上归途，车窗外的风景与记忆不符。                              │
│                                                                      │
│  ─────  Vol. II · 裂缝 · 三个不同的她  ─────                          │
│   ...                                                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 分区

- **顶栏**：页面标题（`Outline · {book.label}`），右侧两个功能按钮
  - `[重排模式]` 切换到"拖拽重排"态（显示 grip 手柄、拖放提示线）
  - `[导出 .md]` 把整份 outline 导出为 markdown 文件（头 = book，## = volume，### = chapter）
- **书标题区**：
  - `h1` 书名（Fraunces 28px `opsz:144`）
  - `epigraph`（可空）斜体题词
  - `synopsis`（可空）首字母下沉段，长文本
- **卷区**：每卷一块
  - 卷头：居中细线 + `Vol. N · 卷名` （Fraunces 斜体 17px）
  - 卷梗概：缩进 2em 的小段（可空）
  - 章节行列表
- **章节行**（三列）：
  - 列 1（50px）：罗马数字 `I.` / `II.` / `III.` （Fraunces 赤色）
  - 列 2：章节标题（Fraunces 13px）+ 摘要（Noto Serif SC 10px 灰）
  - 列 3：状态标签（Draft / Done / —）
  - 行间 hairline 分隔；整行可点 → 打开 Chapter Workbench Tab

## 数据模型

### 当前 schema（保持不变）

```typescript
interface OutlineNode {
  id: string
  type: 'book' | 'volume' | 'chapter' | 'scene'
  label: string
  summary?: string       // chapter/scene 常用
  children?: OutlineNode[]
}
```

### 本 spec 新增字段（向后兼容）

```typescript
interface OutlineNode {
  // ...existing fields...

  // ─ 新增（所有均可选，老数据不含也能渲染） ─
  epigraph?: string      // 仅 book 类型；斜体题词
  synopsis?: string      // book 或 volume 类型；长段梗概
                         // 'summary' 继续用于 chapter/scene 的短摘要
}
```

**字段归属约定**：
- `book.epigraph` — 题词（一句话）
- `book.synopsis` — 全书梗概（一段 200-800 字）
- `volume.synopsis` — 卷梗概（一段 100-400 字）
- `volume.label` — 卷名（保留现有）
- `chapter.summary` — 章摘要（保留现有）
- `chapter.label` — 章名（保留现有）

**不新增**：`beats[]`、`characters[]`、`tags[]`、章节级 `synopsis`。若未来需要，单独 spec 再加。

### 章节状态来源

章节行右侧状态标签的数据源（不在 outline.json 内）：
1. 检查 `books/{bookId}/04_Drafts/ch{N}.md` 是否存在 → 存在则至少 `Draft`
2. 检查 `books/{bookId}/04_Drafts/chapter_status_ch{N}.json` 的 `user_decision` → `approved` 则显示 `Done`
3. 都没有 → `—`

### 章节重排时的 ID 重算

拖拽/键盘移动改动章节顺序时：

- 默认**不改** `ch{N}` 编号（保持与 `ch{N}.md` 的文件对应）
- 仅 `children[]` 数组顺序变化 → outline.json 更新
- **除非用户点"整理编号"按钮**：此时扫描所有章节按 outline 顺序重排 `ch01 / ch02 / ...`，并同步重命名 `04_Drafts/ch{N}.md` + `review_ch{N}.json` + `chapter_status_ch{N}.json` + `annotations_ch{N}.json` + `.draft_history/ch{N}/`（整套批处理，用 `createBackup` 保安全）

## 交互流

### 场景 1 · Inline 编辑

1. 用户单击任意可编辑区域（书名 / 题词 / 书梗概 / 卷名 / 卷梗概 / 章名 / 章摘要）
2. 该段转为 `<textarea>` 或 `<input>`（根据字段），获得焦点 + 全选
3. 用户编辑
4. 两种结束方式：
   - `blur` / `Enter`（单行字段）/ `Ctrl+Enter`（多行字段）→ 保存并退出编辑态
   - `Esc` → 放弃改动退出编辑态
5. 保存后立即 `PUT /api/v1/books/:bookId/outline`（全量覆盖 outline.json）
6. 可编辑区域 hover 时显示 `Edit3` 图标微弱提示

**字段类型**：
- 单行 `<input>`：book.label / volume.label / chapter.label / book.epigraph
- 多行 `<textarea>`：book.synopsis / volume.synopsis / chapter.summary

**空字段处理**：空的 `epigraph` / `synopsis` / `summary` 显示为 `"— 点此添加 {字段名} —"` 占位文本（灰色 italic，点击即进入编辑态）。

### 场景 2 · 重排模式（拖拽）

1. 用户点顶栏 `[重排模式]` 按钮
2. 页面进入 reorder-mode：
   - 每个章节行左侧出现 `GripVertical` 手柄
   - 每个卷头左侧出现手柄
   - 所有 inline 编辑禁用（避免误触）
3. 用户拖拽章节行 → 拖放提示线显示可放置位置
4. 释放后 outline.json 的 `children[]` 数组重排，立即保存
5. 再次点 `[重排模式]` 退出
6. 同一时刻允许跨卷拖拽（从 Vol.I 拖到 Vol.II 之后，章节归属改变）

### 场景 3 · 键盘重排

1. Tab 焦点到任意章节行
2. `Alt+↑` / `Alt+↓`：同卷内上下移
3. `Alt+Shift+→`：下移到下一卷（若存在）
4. `Alt+Shift+←`：上移到上一卷（若存在）
5. 每次移动立即保存

### 场景 4 · 整理编号

1. 用户点顶栏二级菜单中的 `整理章节编号`
2. 弹确认："此操作会重命名 ch01.md 等文件，不可撤销（但会备份）。确认继续？"
3. 后端执行：
   - 遍历 outline 按顺序给每章分配新 `ch{N}` id
   - 逐个 rename 相关文件（`.md` / `review_*.json` / `chapter_status_*.json` / `annotations_*.json` / `.draft_history/*/`）
   - 每个改动都走 `createBackup` + `appendAuditLog`
4. 成功后刷新工作台

### 场景 5 · 点击章节行跳进工作台

1. 用户单击章节行（非编辑态）
2. `openTab('chapter-ch{N}', label)` → 切到 Chapter Workbench

### 场景 6 · Agent 写 outline 时的锁定

1. SSE 事件 `tool_start { name: 'save_outline' }`
2. 整页进入 read-only 态：
   - 所有段落不可点进入编辑
   - 拖拽禁用
   - 中央叠 spin 遮罩 + "Author 正在修改大纲..."
3. `tool_done` 后：
   - 重新 `GET /api/v1/books/:bookId/outline`
   - 解锁，平滑淡入
   - 若整本书结构有变（新卷、新章），顶部 toast："大纲已更新"

## Backend 改动

### 路由（复用现有 `routes/data.ts` 或新建 `routes/outline.ts`）

当前已有：
- `GET /api/v1/books/:bookId/outline` — 读
- `PUT /api/v1/books/:bookId/outline` — 全量写（若已有）/ 否则新加

新增：
- `POST /api/v1/books/:bookId/outline/renumber` — 整理编号操作（重命名相关文件）

### `save_outline` tool 扩展

`server/src/tools/write-tools.ts` 的 `saveOutlineTool` 需要在 schema validation 中接受新字段：

- `validateOutlineNode` 增加：book 节点允许 `epigraph: string`、`synopsis: string`；volume 节点允许 `synopsis: string`
- 不新增必填字段，老数据通过验证不受影响
- 在 tool `description` 里加说明："书节点可选 epigraph/synopsis 字段；卷节点可选 synopsis 字段"

### Renumber 逻辑（`routes/outline.ts` 或独立 service）

```typescript
async function renumberChapters(bookId: string): Promise<RenumberResult> {
  // 1. 读 outline.json，按 children[] 顺序列出所有 chapter 节点
  // 2. 给它们分配新 id: ch01, ch02, ...（保持和原 id 的 oldId -> newId 映射）
  // 3. 对每个变化（oldId !== newId）：
  //    - createBackup 所有相关文件
  //    - rename: 04_Drafts/{oldId}.md → 04_Drafts/{newId}.md
  //    - rename: 04_Drafts/review_{oldId}.json → review_{newId}.json
  //    - rename: 04_Drafts/chapter_status_{oldId}.json → chapter_status_{newId}.json
  //    - rename: 04_Drafts/annotations_{oldId}.json → annotations_{newId}.json
  //    - rename: .draft_history/{oldId}/ → .draft_history/{newId}/
  //    - 更新 outline.json 对应节点的 id
  //    - 更新 plot_graph.json 所有 nodes[*].references 数组中的 oldId → newId
  // 4. appendAuditLog 记录整个 renumber 操作 + 映射表
  // 5. 返回 { renamed: Array<{from, to}>, skipped: Array<string> }
}
```

**安全**：整个操作用两阶段：先 dry-run 检查所有目标文件名无冲突，再实际执行。任何一步失败 → 回滚已完成的改动。

## Frontend 改动

### 新组件

- `frontend/src/components/OutlineView.jsx` — 替换 `OutlineTreeEditor.jsx`
  - 订阅 SSE `tool_start/tool_done` 用于锁定态
  - 管理 reorder-mode / edit-state
- `frontend/src/components/outline/EditableField.jsx` — 通用 inline 编辑组件（单行/多行两种）
- `frontend/src/components/outline/DraggableChapterRow.jsx` — 拖拽包装
- `frontend/src/components/outline/RenumberConfirmModal.jsx`

### App.jsx 改动

- `renderEditor()` 的 `'outline'` 分支改用 `OutlineView`

### 依赖新增

```json
{
  "@dnd-kit/core": "^6",
  "@dnd-kit/sortable": "^8"
}
```

（`react-dnd` 和 HTML5 拖拽选型备选，倾向 `@dnd-kit` 因其 API 轻、和 React 18+ 兼容更好。）

### 样式

全部引用 `2026-04-18-design-system.md` 的 tokens + 签名组件。特别是：
- 书标题：`.drop-cap` 用在 `book.synopsis` 首段
- 卷头：居中 + `hairline` 分隔 + Fraunces italic
- 罗马数字：章节列 1 用 `toRoman()` 转换
- 状态标签：Fraunces small-caps，`.done` 用 `--success`，`.draft` 用 `--warning`

## 验收标准

1. 打开 Outline Tab，整页以"方案书"形态展示，完全替代原 JSON 树
2. 所有可编辑字段 inline 点击即编辑，blur/Ctrl+Enter 保存
3. epigraph / book.synopsis / volume.synopsis 为空时显示"点此添加"占位
4. 拖拽重排章节立即生效；跨卷拖拽改变章归属
5. `Alt+↑/↓` + `Alt+Shift+←/→` 键盘重排工作
6. 点章节行打开 Chapter Workbench Tab
7. 整理编号操作成功重命名所有相关文件，带 backup
8. Agent 调 `save_outline` 时整页锁定 + spin，完成后自动刷新
9. 老数据（没有 epigraph/synopsis）正常渲染，不报错
10. 美学层完全符合 design-system（drop cap / 罗马数字 / epigraph / 居中卷头）
11. 测试覆盖：inline 编辑、reorder、renumber、锁定态、schema 验证老数据，≥ 8 个新测试

## 不在本 spec 范围

- Corkboard 视图
- 章节级 beats / characters 结构化字段
- 大纲 AI 辅助（"帮我补全卷梗概"等按钮）—— 通过 AuthorChat 实现即可
- 大纲版本历史 UI（数据层的 `.bak` 已足够）
- 导出为 Word / PDF（只支持 markdown）
- Outline 可视化（卡片瀑布、思维导图等）

## 风险 & 备注

1. **跨卷拖拽的视觉反馈**：需要清晰的 drop-indicator（细线 + 赤色），避免放置位置歧义
2. **Renumber 的原子性**：半失败会导致文件名错乱；实现必须用 dry-run 两阶段 + 回滚 + audit log
3. **Inline 编辑 textarea 的自动增高**：行数变化时布局跳动。用 `auto-size-textarea` 模式避免
4. **大纲很长时的性能**：单页面 100+ 章节行会有滚动卡顿；用 `content-visibility: auto` 处理，不加虚拟列表（保持文档连续感）
5. **Free-form JSON 老数据**：当前 OutlineTreeEditor 有 `FreeformOutlineFallback` 处理 `{title, intro, genre, ...}` 这种非树形数据。新视图遇到这种数据时，先 toast 警告 + 保留只读显示 + 引导用户"重新规范化"（通过 AuthorChat 请 Agent 走一次 save_outline）
6. **与 outline 绑定的 Sidebar 小树**：现有 `Sidebar.jsx` 还会渲染一个 outline 小树，本 spec 不改动；未来可考虑按新视图重写

