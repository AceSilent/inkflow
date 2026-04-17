# 剧情图谱（Plot Graph）

**Spec Date**: 2026-04-18
**Scope**: 重新定义剧情树为"因果 + 伏笔"DAG，替换现有按章节规划的树结构
**Depends on**: `2026-04-18-design-system.md`
**Status**: Design locked, pending implementation plan

## 目的

当前"剧情树"（`plot_tree.json`）退化成章节规划表，与大纲重复，无法承担"让 AI 写出前后呼应、因果扎实、伏笔必回收"这一核心任务。

本 spec 把剧情树重新定义为**以"事件 - 因果"为节点与边的有向图（DAG）**，显式管理：
1. 剧情推进的因果关系（把"and then" 升级为 "therefore / but"）
2. 伏笔铺设与回收（解决 AI 长篇"设置了但再没提"顽症）
3. 备选分支（保留 confirm_path / prune_branch 原意）

**核心约束：节点不再绑定章节**。一个节点是一个剧情事件，可被多个章节 references，一个章节也可包含多个节点。章节与节点多对多。

## 核心决策一览

| # | 决策 | 选择 |
|---|---|---|
| 1 | 图类型 | 有向图（DAG），不再是单亲树 |
| 2 | 节点类型 | 6 种：`event / setup / payoff / decision / turning_point / convergence`；**禁用** `chapter / arc` |
| 3 | 边类型 | 6 种：`causes / triggers / enables / blocks / pays-off / parallel` |
| 4 | 章节绑定 | `references: string[]`（多对多弱引用） |
| 5 | 可视化布局 | 分层时间线（列=章节，节点从左到右；伏笔长弧跨列） |
| 6 | 旧数据迁移 | **不做**。开发阶段直接 break 老 `plot_tree.json` |
| 7 | 编辑部集成 | `editorial_causality` 审稿人拉取当章 subgraph 做对照检查 |
| 8 | 记忆层集成 | prompt-builder 注入"未回收伏笔"summary |

## 数据模型

### 新 schema

```typescript
// books/{bookId}/plot_graph.json   (文件名从 plot_tree.json 变更)

interface PlotGraph {
  book_id: string
  nodes: Record<string, PlotNode>  // id → node
  edges: PlotEdge[]                 // flat list, not tied to nodes
  version: 2                        // schema version, for future migration
}

type NodeType =
  | 'event'          // 剧情事件（默认）
  | 'setup'          // 伏笔铺设
  | 'payoff'         // 伏笔回收（需要通过 pays-off 边指向某个 setup）
  | 'decision'       // 角色抉择（分支起点）
  | 'turning_point'  // 关键转折
  | 'convergence'    // 多线汇合

interface PlotNode {
  id: string                       // e.g. "evt_1712345678"
  type: NodeType
  title: string                    // 15 字内最好
  description: string              // 一两句话
  references: string[]             // 章节 id 列表，如 ["ch01", "ch02"]
  characters: string[]             // 涉及角色
  status: 'draft' | 'confirmed' | 'pruned' | 'alternative'
  pruned_reason?: string
  created_at: string               // ISO
}

type EdgeType =
  | 'causes'         // A 导致 B（最强因果）
  | 'triggers'       // A 直接触发 B（时序 + 因果，比 causes 更贴近时间）
  | 'enables'        // A 使 B 成为可能（弱因果）
  | 'blocks'         // A 阻止 B 发生（用于 alternative 分支）
  | 'pays-off'       // 从 payoff 节点指向 setup 节点（伏笔专用）
  | 'parallel'       // 无因果，仅时序并列

interface PlotEdge {
  id: string                       // e.g. "edg_xxx"
  from: string                     // node id
  to: string                       // node id
  type: EdgeType
  note?: string
}
```

### 删除的字段

- `parent: string`（单亲指针）—— 不再适用 DAG，改用 edges
- 节点的 `chapter` / `arc` 类型 —— schema 层 enum 不再接受

### 未回收伏笔的判定

```typescript
function unresolvedSetups(graph: PlotGraph): PlotNode[] {
  const setups = Object.values(graph.nodes).filter(n => n.type === 'setup' && n.status !== 'pruned')
  const paidOffSetupIds = new Set(
    graph.edges.filter(e => e.type === 'pays-off').map(e => e.to)
  )
  return setups.filter(s => !paidOffSetupIds.has(s.id))
}
```

## 布局（视觉）

### 顶栏

```
TITLE · 剧情图谱    [已埋 N · 未回收 M · 最老 ch{X}]    [+节点] [+边] [视图: 时间线 ▾]
```

- 未回收伏笔提示：红/金配色（`--accent`），点击弹出未回收列表
- 视图切换：Phase 1 只实现"时间线"，Phase 2 可加"泳道"

### 主视图 · 分层时间线

- **列**：每章一列，按章序号从左到右；列头 `Ch. I` / `Ch. II`（Fraunces small caps 罗马数字）
  - 用户可手动合并相邻列：右键列头 → "合并到下一列" → 形成 `Ch. IV–V`
  - 合并仅视觉压缩，不改数据（数据里节点的 references 不动）
- **节点卡**：落在它最早被 reference 的章节列里
  - 多章节点 → 落在最早的章节，视觉上通过卡片宽度延伸到最晚的章节
  - 节点类型用左边框颜色区分：
    - `event`：默认（深墨）
    - `setup`：`#a06820` 橙棕 + 浅黄底
    - `payoff`：`#2d5a3d` 墨绿 + 浅绿底
    - `decision`：赤氧红边
    - `turning_point`：**反色**深墨底 + 金色标签
    - `convergence`：菱形边角
  - `status === 'pruned'` 或 `'alternative'` → 虚线边 + 50% 透明
- **边**：SVG 绘制，穿梭于节点卡之间
  - `causes / triggers / enables`：深墨实线 + 箭头
  - `blocks`：赤红虚短线
  - `pays-off`：**墨绿长虚线，从 payoff 节点跨越到 setup 节点，通常走卡片顶部上方的空间（长弧）**，自带 "pays off" 标签
  - `parallel`：细灰点线
- **minimap**：右下角小型鸟瞰，100+ 章时滚动定位

## 交互流

### 场景 1 · 添加节点

1. 用户点顶栏 `[+节点]` → 弹 Modal
2. 填字段：type (dropdown) / title / description / references (多选章节) / characters / status 默认 draft
3. 提交 → `POST /api/v1/books/:bookId/plot-graph/nodes`
4. 节点渲染到对应章节列
5. 快捷入口：右键任意章节列头 → "在此章添加节点"

### 场景 2 · 添加边

1. 用户点顶栏 `[+边]` 进入"连线模式"，光标变十字
2. 单击源节点 → 单击目标节点 → 弹小 popup 选边类型 + 可选 note
3. 提交 → `POST /api/v1/books/:bookId/plot-graph/edges`
4. 边立即绘制，SVG 自动计算路径（避开其他节点）
5. **专门的 pays-off 快捷**：payoff 类型节点创建时，弹出 "指向哪个 setup" 列表让用户选，自动建 pays-off 边

### 场景 3 · 查看未回收伏笔

1. 顶栏 "未回收 M" 点击 → 浮层列出所有未回收 setup
2. 每条显示：标题 / 埋设章节 / 距今跨度（"13 章前")
3. 单条点击 → 滚动定位到该 setup 节点 + flash 高亮
4. 右键单条 → "标记已放弃"（`status: pruned`，带原因）

### 场景 4 · 确认 / 剪枝 / 汇合（保留原意）

1. 右键节点 → 操作菜单：`confirm / prune / make alternative`
2. `prune` 弹简短原因输入框，保存到 `pruned_reason`
3. `merge` 手动连线工具：多选节点后 `Ctrl+M` 创建 convergence 节点自动连边

### 场景 5 · 点击节点详情

1. 单击节点 → 右侧抽屉弹出详情面板
2. 面板显示：全部字段 + 入边 + 出边列表 + 相关章节链接
3. 可 inline 编辑所有字段
4. 面板内右键边可删除

### 场景 6 · 列头合并 / 拆分

1. 右键章节列头 → "合并到下一列"
2. 相邻两章视觉合并为单列，标签 `Ch. IV–V`
3. 再右键合并列头 → "拆分"恢复

### 场景 7 · Agent 写 plot_graph 时的锁定态

1. SSE 事件 `tool_start { name: 'add_plot_node' | 'add_edge' | 'remove_edge' | 'confirm_path' | 'prune_branch' | 'merge_branches' }`
2. 页面 read-only + 中央 spin（与 Chapter Workbench / Outline 一致）
3. `tool_done` 后刷新图谱

## Tools 改造（`server/src/tools/plot-tree.ts` → `plot-graph.ts`）

### `add_plot_node` 修改

- 参数 `node_type` 的 enum 去除 `chapter` 和 `arc`，只保留 6 类
- 新增可选参数 `references: string` (逗号分隔章节 id) 替代原来的 parent
- 去除原 `parent` 参数
- description 强化："parent is no longer accepted. Use add_edge to establish causal relationships."

### 新增 `add_edge` tool

```typescript
{
  name: 'add_edge',
  description: '在剧情图谱中添加因果边',
  parameters: {
    from: string    // source node id
    to: string      // target node id
    type: 'causes'|'triggers'|'enables'|'blocks'|'pays-off'|'parallel'
    note?: string
  }
}
```

- `pays-off` 要求 `to` 节点 type === 'setup'，否则拒绝
- 拒绝自环（`from === to`）
- 拒绝重复边（`from/to/type` 三元组已存在）
- 拒绝引入环（DAG 约束，实现时用 DFS 检测）

### 新增 `remove_edge` tool

```typescript
{
  name: 'remove_edge',
  parameters: { edge_id: string }
}
```

### 新增 `query_unresolved_setups` tool

```typescript
{
  name: 'query_unresolved_setups',
  description: '查询所有未回收的伏笔。返回列表，包含 id / title / 埋设章节 / 距今跨度（按当前写作章号计算）',
  parameters: {
    current_chapter?: string  // 如 "ch07"，用于计算"距今跨度"
  }
}
```

- 返回 JSON 数组：`[{id, title, setup_chapter, span, description}]`
- Agent 写新章前主动调用；或 prompt-builder 自动调用并注入 prompt

### 保留的 tools

- `read_tree`（重命名为 `read_graph` 更贴切）
- `confirm_path`
- `prune_branch`
- `merge_branches`

### 删除的 tools

- 无（只是 add_plot_node 行为变了）

### 数据文件变更

- `plot_tree.json` → **`plot_graph.json`**（重命名）
- 旧文件不迁移，schema 不兼容，开发阶段直接 break

## 编辑部集成（`editorial_causality` 审稿人增强）

### 审稿人 context 注入

`server/src/editorial/pipeline.ts` 在调 `editorial_causality` 审稿人时，新增一个 context 字段：

```typescript
interface CausalityContext {
  chapter_subgraph: {
    nodes: PlotNode[]         // 当前章节 references 里包含的所有节点
    incoming_edges: PlotEdge[]  // 这些节点的入边
    outgoing_edges: PlotEdge[]  // 这些节点的出边
  }
  unresolved_setups: PlotNode[]  // 全书还没回收的伏笔
}
```

把 `JSON.stringify(causalityContext, null, 2)` 塞进模板可见的变量 `{{plot_graph_context}}`。

### 模板 `reader_scene_causality.j2` 扩展

在现有因果审查逻辑之上加一段：

```jinja
{% if plot_graph_context %}

【剧情图谱对照参考】
本章在剧情图谱上对应以下节点：
{{ plot_graph_context.chapter_subgraph.nodes | tojson }}

这些节点的入边（应当已经发生过的因果铺垫）：
{{ plot_graph_context.chapter_subgraph.incoming_edges | tojson }}

全书目前仍未回收的伏笔：
{{ plot_graph_context.unresolved_setups | tojson }}

审稿检查点：
1. 本章写出的事件链，是否严格遵循了图谱上的因果边？有跳步骤或凭空结果吗？
2. 图谱上的 setup 节点如果 references 包含本章，本章文本里有实际铺设吗？还是徒有设计、文本里没落实？
3. 图谱上的 payoff 节点如果 references 包含本章，本章文本里有实际回收吗？
4. 如果本章没有图谱参考，严重度记为 1-2（信息不足，不作为硬扣分）

在 issues[] 里为每个违例单独一条，severity ≥ 3 的要给 fix_instruction。
{% endif %}
```

## 记忆层集成（`prompt-builder.ts`）

### 新增 section `plotGraphStatus`

```typescript
function buildPlotGraphStatus(bookDir: string, currentChapter?: string): string {
  const graph = loadPlotGraph(bookDir)
  if (!graph) return ''

  const unresolved = unresolvedSetups(graph)
  if (unresolved.length === 0) return ''

  const lines = [
    '【剧情账本·未回收伏笔】',
    `你已在之前章节埋下 ${unresolved.length} 个伏笔尚未回收。写新章时请考虑是否该收账：`,
  ]
  for (const s of unresolved) {
    const earliestChRef = s.references.sort()[0] ?? '?'
    const span = currentChapter ? spanBetween(earliestChRef, currentChapter) : '?'
    lines.push(`- [${s.id}] "${s.title}" （埋于 ${earliestChRef}，距今 ${span} 章）`)
    if (s.description) lines.push(`  描述：${s.description}`)
  }
  return lines.join('\n')
}
```

### 注入点

在 `promptBuilder` 的系统 prompt 组装链里，plotGraphStatus 位于 `coreMemory` 和 `projectMemory` 之间，确保每次 Agent 发起 save_draft 前都能看到账本。

### 工具层自觉调用

同时在系统 prompt 里加一行硬指引：
> 在写新章前，如果你对要回收哪些伏笔不确定，调用 `query_unresolved_setups` 先查询。

## Backend 路由（`server/src/routes/plot-graph.ts`）

新建 Fastify plugin，提供以下 endpoints：

```
GET    /api/v1/books/:bookId/plot-graph                             → 读全图
POST   /api/v1/books/:bookId/plot-graph/nodes                       → 新增节点
PATCH  /api/v1/books/:bookId/plot-graph/nodes/:nodeId               → 更新节点
DELETE /api/v1/books/:bookId/plot-graph/nodes/:nodeId               → 删除节点（同时级联删相关边）
POST   /api/v1/books/:bookId/plot-graph/edges                       → 新增边（含 DAG 环检测）
DELETE /api/v1/books/:bookId/plot-graph/edges/:edgeId               → 删除边
GET    /api/v1/books/:bookId/plot-graph/unresolved-setups           → 未回收伏笔列表
POST   /api/v1/books/:bookId/plot-graph/merge-columns               → 合并列视觉状态
```

列合并状态属于**UI state**，不改图数据；存到 `books/{bookId}/plot_graph_ui.json` 或用 localStorage（推荐 localStorage 避免同步复杂度）。

### Zod schema 新增

`server/src/routes/schemas.ts` 加：
- `plotNodeSchema`
- `plotEdgeSchema`
- `addNodeBodySchema`
- `addEdgeBodySchema`

所有输入经校验（DAG 环检测、pays-off 目标 type 校验、节点引用完整性）。

## Frontend 改动

### 新组件

- `frontend/src/components/PlotGraphView.jsx` — 替代 `OutlineTreeEditor.jsx` 里的 "plot-tree" 模式
- `frontend/src/components/plotgraph/TimelineCanvas.jsx` — 主视图（列 + 节点 + SVG 边）
- `frontend/src/components/plotgraph/NodeCard.jsx`
- `frontend/src/components/plotgraph/NodeDetailDrawer.jsx` — 右侧抽屉编辑
- `frontend/src/components/plotgraph/AddNodeModal.jsx`
- `frontend/src/components/plotgraph/AddEdgeMode.jsx` — 连线模式覆盖层
- `frontend/src/components/plotgraph/UnresolvedSetupsPopover.jsx`
- `frontend/src/components/plotgraph/Minimap.jsx`

### App.jsx 改动

- 新增 tab `plot-graph`（替代 `outline` 里的 plot-tree 切换）
- 新增 ActivityBar 入口（可选：图标用 `Network` 或 `GitBranch`）

### 依赖新增

无需引入完整图可视化库（Cytoscape/vis.js 太重）。手工用 SVG + React 实现：

- 节点：React 组件，绝对定位到 `.tc-col` 列网格
- 边：顶层 `<svg>` 覆盖整个 canvas，计算路径用简单的贝塞尔曲线
- 布局计算：每列从上到下堆放节点，避开重叠；跨章节点用 CSS `grid-column: span N`

但列合并、minimap 可能需要少量辅助逻辑，引入 `@dnd-kit/core`（Outline spec 里已引入）即可。

### 样式

引用 `2026-04-18-design-system.md` tokens + 签名组件。特别：
- 列头 Fraunces small caps + 罗马数字 + 赤红
- 节点边框色区分类型（6 套色），引用现有变量
- pays-off 长弧用 `stroke: var(--success)` + 虚线 + "pays off" 小标签
- 禁用态（pruned/alternative）用 50% opacity + 虚线

## 验收标准

1. 打开 Plot Graph Tab，时间线展示所有节点按章节列布局，边正确绘制
2. 添加节点 Modal 里 type dropdown 不包含 `chapter` / `arc`
3. 添加 pays-off 边时，如目标不是 setup 类型，返回错误
4. 添加边时 DAG 环检测生效，拒绝成环操作
5. "未回收伏笔" 弹窗正确列出所有 setup 且没有指向它们的 pays-off 边
6. 节点详情抽屉 inline 编辑所有字段工作
7. 列合并/拆分视觉切换正确，不破坏数据
8. Agent 调 `add_plot_node` / `add_edge` 等 tool 时整页锁定 + spin
9. `query_unresolved_setups` tool 返回格式正确
10. `editorial_causality` 审稿人收到 plot_graph_context，可在输出里引用（测试用具有 setup/payoff 的图验证）
11. `prompt-builder` 在有未回收伏笔时注入"剧情账本"section，Agent 能看到
12. 美学符合 design-system（Fraunces + 签名组件 + 文学刊物配色）
13. 测试覆盖：DAG 环检测 / pays-off 目标校验 / unresolved_setups 查询 / 图 CRUD / 编辑部 context 注入，≥ 12 个新测试

## 不在本 spec 范围

- 泳道视图（Phase 2）
- 力导图视图
- 全图缩放（只提供水平滚动 + minimap）
- 多书的图谱对比
- 图谱自动生成（让 Agent 根据已写章节反向生成图）—— 可通过 AuthorChat 手工让 Agent 生成
- 图谱导出 PNG / SVG
- 多人协作编辑
- 节点版本历史

## 风险 & 备注

1. **DAG 环检测性能**：每次 add_edge 跑 DFS；图规模 <500 节点时无压力，更大需要改增量维护拓扑序
2. **SVG 边的路径计算**：节点布局变动时边需要重算，实时拖拽节点位置会有性能压力；Phase 1 固定布局（按章节列 + 列内从上往下），不做交互式拖拽重排
3. **列对齐 + 跨章节点**：同时 reference 多个非连续章节的节点（如 Ch.I 和 Ch.V），视觉怎么展示？Phase 1 方案：落在最早章节列，第二个 reference 用虚线 marker 指到对应列头。复杂情况后续优化
4. **破坏性变更**：`plot_tree.json` 文件名改为 `plot_graph.json`，schema 不兼容。所有已有书的旧文件作废（开发阶段无正式数据，可接受）。`tools/plot-tree.ts` 要重命名为 `plot-graph.ts`，tools/index.ts 注册更新
5. **ID 命名**：边的 id 用 `edg_{ts}_{rand}`；节点继续用 `{type}_{ts}`；避免碰撞
6. **Agent 编辑与用户编辑冲突**：和 Chapter Workbench 同模式，有 `workbench_lock_plotgraph` 文件；不过节点改动粒度小，锁粒度也到文件级别即可
7. **伏笔 setup 节点被 prune**：pays-off 边自动同步标记为 pruned / 或直接删除（需要决策）。**推荐**：pruned setup 的 pays-off 边保留，`unresolvedSetups()` 过滤 `status !== 'pruned'` 时自然跳过
8. **references 和章节 id 的一致性**：如果章节整理编号（见 outline spec 的 renumber 场景），plot_graph 的 references 要跟着批量 rename；renumber 逻辑需要同时更新 plot_graph.json

