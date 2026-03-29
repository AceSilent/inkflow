# 剧情树 + Skill 渐进式披露系统设计

> **日期**: 2026-03-29
> **范围**: 剧情树数据结构、Skill 系统三层架构、Agent Loop 重设计、前端 Tool Call 展示
> **前置**: AutoNovel-Studio v5.1（多 Agent 群聊 + 作者 1v1 + 流式 thinking）

---

## 一、设计目标

1. **引入剧情树（Plot Tree）**：用树形结构取代线性管道，支持"发散探索→收敛确认"的双阶段创作流程
2. **Skill 系统渐进式披露**：将扁平的 2-skill 菜单重构为三层架构（L0/L1/L2），Agent 自主发现和加载
3. **Agent Loop 自治化**：Agent 在阶段内自由链式 tool call，仅在 terminal tools 时暂停等待人类
4. **前端 Tool Call 可视化**：聊天面板清晰区分 content / tool_call / thinking，不丢失任何信息

---

## 二、剧情树（Plot Tree）

### 2.1 核心概念

剧情树 = **剧情发展树（Plot Development Tree）** + **可能性树（Possibility Tree）**

- **Author Agent 生成可能性树**：自治循环中创建多条分支路径
- **人类 + Agent 选择**：从可能性中修剪/确认，形成正式剧情发展树
- **树是大纲的上游**：树提供创意蓝图（事件序列、因果链、角色参与），大纲是从树导出的执行规格
- **树→大纲是 AI 辅助生成**：不是机械格式转换，Agent 基于树路径生成完整大纲（场景拆分、情绪弧线、逻辑链等）

### 2.2 存储结构

```
books/<book_id>/
  └── plot_tree/
        ├── tree.json          ← 核心数据（JSON，仅 tools 读写，不注入创作 prompt）
        └── snapshots/         ← 每次 confirm/prune 前自动备份
              └── <timestamp>.json
```

大纲保持现有位置，采用 Markdown 格式：
```
books/<book_id>/
  └── 02_Outlines/
        ├── volume_01.md             ← Markdown 格式卷纲
        ├── chapter_01_outline.md    ← Markdown 格式章纲
        └── ...
```

### 2.3 节点数据结构

扁平节点表 + parent/children 引用：

```json
{
  "tree_id": "book_001_plot_tree",
  "book_id": "book_001",
  "root_id": "node_001",
  "nodes": {
    "<node_id>": {
      "id": "string",
      "parent": "string | null",
      "children": ["string"],

      "type": "root | arc | plot_point | branch_point | convergence",
      "state": "exploring | candidate | confirmed | pruned | exported",

      "title": "string",
      "description": "string",

      "causality": {
        "depends_on": ["node_ids"],
        "enables": ["node_ids"]
      },

      "characters": ["character_ids"],
      "emotional_tone": "string",
      "tags": [],

      "export_ref": "string | null",
      "created_at": "timestamp",
      "confirmed_at": "timestamp | null",
      "pruned_reason": "string | null"
    }
  }
}
```

### 2.4 节点类型

| 类型 | 含义 | 示例 |
|------|------|------|
| `root` | 故事根节点 | 《青云宗主》 |
| `arc` | 大的故事弧线（≈卷） | 第一卷：潜龙在渊 |
| `plot_point` | 具体的剧情事件 | 林辰在宗门大比击败叶流云 |
| `branch_point` | 分叉点，此处有多条可能路径 | 林辰是否提前暴露重生秘密？ |
| `convergence` | 合流点，多条线在此汇合 | 宗门大比：所有势力集结 |

### 2.5 节点状态

| 状态 | 含义 | 谁触发 |
|------|------|--------|
| `exploring` | Agent 正在生成中 | Agent 自治循环自动设置 |
| `candidate` | 可能性路径，等待选择 | Agent 调用 `present_options()` 后 |
| `confirmed` | 已确认为正式剧情线 | 人类选择 / Agent `confirm_path()` |
| `pruned` | 已修剪，记录为"被放弃的可能性" | 人类 / Agent `prune_branch()` |
| `exported` | 已导出为大纲格式 | `generate_outline()` 完成后 |

### 2.6 因果链（Causality）

每个节点有：
- `depends_on: [node_id, ...]` — 此情节依赖哪些前置情节已发生
- `enables: [node_id, ...]` — 此情节发生后解锁了哪些后续可能

因果链与现有 `cascade_invalidation.py` 集成：修改某节点时，系统自动标记 `enables` 链上的下游节点需要审查。

### 2.7 导出机制（Tree → Outline）

`generate_outline` 是 AI 辅助生成，非机械转换：

1. Agent 读取 confirmed tree path
2. 加载 `skill_outline_generation.md` 学习大纲格式规范
3. 调用 `search_lore()` 补充角色/场景细节
4. 生成完整 Markdown 大纲（含场景拆分、情绪弧线、逻辑链、焦点指令）
5. 写入 `02_Outlines/` 目录
6. 更新树节点 `export_ref` 指向大纲文件——双向可溯

大纲 Markdown 格式示例：

```markdown
# 第一章：重生

## 章节目标
建立主角重生背景，展示性格转变，埋下复仇伏笔

## 场景一：背叛与死亡
- **视角**：林辰
- **地点**：禁地密室（前世）
- **情节**：林辰准备化神期突破 → 叶流云奉茶 → 察觉绝灵散 → 问心剑穿心
- **因果链**：闭关 → 奉茶 → 闻甜腥味 → 挥袖扫落 → 暴起偷袭 → 穿心
- **情绪弧**：期许 → 警觉 → 震惊 → 悲凉 → 恨意
- **创作焦点**：禁止排比式走马灯！重点通过对话展现师徒关系
- **目标字数**：~800字
```

---

## 三、三层 Skill 架构

### 3.1 核心原则

**一切通过工具自主获取，不预注入。**

System prompt 只放 L0 核心铁律。大纲、设定、树、skill 文档——全部通过 tools 按需读写。

### 3.2 L0 · Core Principles（始终在 system prompt）

极精简的 5-8 句铁律，来自 `core_memory/writing_principles.json` 中置信度最高的条目：

```
你是「作者」✍️，拥有工具箱的自主创作引擎。

【铁律】
- 动作泄密，不用旁白告知
- 一段只许一个特写
- 长短句交错呼吸
- 数据库即圣经，查不到就不写
- 写正文前先 load_skill('iceberg_writing')
- 构思剧情前先 read_tree() 了解当前全局

你有以下工具可用：[tool list]
用 list_skills() 查看所有可用 skill。
```

### 3.3 L1 · Methodology Skills（Agent 主动 load_skill）

按 category 分组的 skill 文件，`list_skills()` 返回分类索引。

Skill Registry 结构增强：

```python
SKILL_REGISTRY = {
    "<skill_name>": {
        "file": "skill_<name>.md",
        "category": "writing | plotting | worldbuilding | planning",
        "description": "简短描述",
        "when_to_use": "使用场景描述"
    }
}
```

#### 完整 Skill 清单

**📂 写作技法 (writing)**

| Skill | 文件 | 状态 | 说明 |
|-------|------|------|------|
| `iceberg_writing` | `skill_iceberg_writing.md` | 已有 | 冰山写作法五层方法论 |
| `scene_rhythm` | `skill_scene_rhythm.md` | 从 iceberg 拆分 | 场景节奏控制 |
| `exemplar_study` | `skill_exemplar_study.md` | **新写** | 范文研读方法论 |

**📂 剧情构建 (plotting)**

| Skill | 文件 | 状态 | 说明 |
|-------|------|------|------|
| `plot_tree_methodology` | `skill_plot_tree_methodology.md` | **新写** | 分支探索、合流设计、修剪原则 |
| `chapter_arc_design` | `skill_chapter_arc_design.md` | **新写** | 章节弧线：起承转合、钩子、情绪曲线 |

**📂 世界观与角色 (worldbuilding)**

| Skill | 文件 | 状态 | 说明 |
|-------|------|------|------|
| `lore_compliance` | `skill_lore_compliance.md` | 已有 | 设定忠实度约束 |
| `relationship_dynamics` | `skill_relationship_dynamics.md` | **新写** | 角色关系网推演 |

**📂 规划 (planning)**

| Skill | 文件 | 状态 | 说明 |
|-------|------|------|------|
| `outline_generation` | `skill_outline_generation.md` | **新写** | 从剧情树路径生成大纲的方法论和格式规范 |
| `volume_planning` | `skill_volume_planning.md` | **新写** | 卷级节奏规划 |

**合计**: 3 已有 + 7 新写 = 10 个 skill

### 3.4 L2 · Composite Task Packs（建议不强制）

在任务下发时作为提示词的一部分建议 Agent 加载哪些 skill，Agent 有自主权决定是否遵从：

```python
TASK_SKILL_SUGGESTIONS = {
    "explore_plot": "建议先 load_skill('plot_tree_methodology')，再 read_tree()",
    "write_draft": "建议先 load_skill('iceberg_writing')，再 load_skill('lore_compliance')",
    "generate_outline": "建议先 load_skill('outline_generation')，再 load_skill('chapter_arc_design')",
    "build_world": "建议先 load_skill('lore_compliance')，再 load_skill('relationship_dynamics')",
    "study_examples": "建议先 load_skill('exemplar_study')，再 browse_examples()",
}
```

---

## 四、Agent Loop 与状态管理

### 4.1 核心原则：阶段自治，节点交互

Agent 在一个阶段内完全自治地链式调用 tools。**无 tool call 上限，无 token 预算限制。** 仅在调用 terminal tool 时暂停等待人类。

### 4.2 三种运行模式

| 模式 | 触发场景 | Agent 行为 | 终止条件 |
|------|---------|-----------|---------|
| **自治探索** | 构建可能性树、初始大纲探索 | 自由链式 tool call | 调用 `present_options()` |
| **自治执行** | 正文撰写、大纲导出 | 自由链式 tool call | 调用 `submit_for_review()` |
| **对话协作** | 讨论、审核、细节调整 | 每轮人类发言后回复 | 人类结束对话 |

### 4.3 剧情树 Agent 状态机

```
IDLE
  │ [人类: "帮我探索第二卷的可能走向"]
  ▼
EXPLORING (自治模式)
  │ load_skill → search_lore → read_tree → add_plot_node × N → branch_plot → ...
  │ [Agent 判断"够了" → present_options()]
  ▼
AWAITING_SELECTION (等待人类)
  │ 展示多条候选路径
  │ [人类: "选路径B，加入C的元素"]
  ▼
CONFIRMING (自治模式)
  │ confirm_path → merge_branches → prune_branch → generate_outline
  │ [完成 → submit_for_review()]
  ▼
IDLE
```

### 4.4 Terminal Tools（触发人类交互的 tools）

| Tool | 用途 |
|------|------|
| `present_options` | 展示多个可能性供人类选择 |
| `submit_for_review` | 提交成果（草稿/大纲）等待审核 |
| `request_guidance` | Agent 遇到不确定时主动求助 |

其他所有 tools 均为非 terminal，Agent 可自由链式调用。

---

## 五、新增 Tools 完整清单

### 5.1 剧情树操作

| Tool | 参数 | 返回 | Terminal? |
|------|------|------|-----------|
| `read_tree` | `node_id?` (可选，默认全树摘要) | 树结构或子树 | No |
| `add_plot_node` | `parent, type, title, description, causality?` | 新节点 ID | No |
| `branch_plot` | `parent_node, count?, context?` | 创建的分支节点 IDs | No |
| `merge_branches` | `branch_ids, convergence_title` | 合流节点 ID | No |
| `prune_branch` | `node_id, reason` | 确认消息 | No |
| `confirm_path` | `node_id` | 确认消息 | No |
| `generate_outline` | `from_node, depth?` | 生成的大纲文件路径 | No |

### 5.2 范文库

| Tool | 参数 | 返回 | Terminal? |
|------|------|------|-----------|
| `browse_examples` | `category?, keyword?` | 范文片段 | No |

### 5.3 交互控制（Terminal）

| Tool | 参数 | 返回 | Terminal? |
|------|------|------|-----------|
| `present_options` | `description, options[]` | _(暂停等待人类)_ | **Yes** |
| `request_guidance` | `question, context?` | _(暂停等待人类)_ | **Yes** |
| `submit_for_review` | `task_id, content` | _(暂停等待人类)_ | **Yes** (已有) |

### 5.4 已有 tools（不变）

`read_file`, `search_lore`, `read_outline`, `save_draft`, `save_outline`, `save_lore`, `load_skill`, `list_skills`

---

## 六、前端 Tool Call 展示

### 6.1 消息数据模型

Agent 的一条消息不再是简单的 `{ content: string }`，而是有序段落列表：

```typescript
interface AgentMessage {
  id: string;
  agent: string;
  thinking?: string;
  segments: MessageSegment[];
}

type MessageSegment =
  | { type: 'content'; text: string }
  | { type: 'tool_call'; name: string;
      args: Record<string, any>;
      result?: string;
      status: 'running' | 'done' | 'error' }
```

### 6.2 SSE 事件流

一条 assistant message 的流式输出：

```
thinking_token(s)    ← thinking mode 内容
content_token(s)     ← message.content 的流式片段
tool_call_start      ← 工具调用开始
tool_call_args       ← 工具参数流式片段
tool_call_end        ← 工具调用完成 + 执行结果
(重复 content/tool_call 直到 message 结束)
```

### 6.3 渲染规则

- **Thinking**: 可折叠灰色区块，默认收起
- **Content**: 正常聊天气泡
- **Tool Call**: 青色左边框紧凑卡片，折叠时一行摘要（`🔧 search_lore('林辰') → ✓`），展开显示完整参数和返回值
- 连续 tool calls 紧密排列，与 content 段落交替出现
- **一条消息中 content 和 tool_calls 共存时，按到达顺序渲染，不合并、不重排、不丢弃**

---

## 七、集成影响

### 7.1 需修改的现有文件

| 文件 | 改动 |
|------|------|
| `src/core/agent_tools.py` | 扩展 SKILL_REGISTRY（加 category/when_to_use）；添加树操作 tools 和 browse_examples；添加 terminal tools |
| `src/core/workflow_engine.py` | 移除 `max_tool_loops` 上限；增加 terminal tool 判定逻辑 |
| `src/core/groupchat_orchestrator.py` | 更新 Author system prompt（L0 精简版）|
| `src/core/models.py` | 新增 PlotTreeNode, PlotTree 等 pydantic models |
| `frontend/src/components/AuthorChatPanel.jsx` | segments-based 渲染；tool call 卡片组件 |
| `frontend/src/components/GroupChatPanel.jsx` | 同上 |

### 7.2 需新建的文件

| 文件 | 类型 |
|------|------|
| `src/core/plot_tree.py` | 剧情树核心逻辑（CRUD、状态转移、快照、导出） |
| `prompts/skill_scene_rhythm.md` | 从 iceberg 第四层拆出 |
| `prompts/skill_exemplar_study.md` | 范文研读方法论 |
| `prompts/skill_plot_tree_methodology.md` | 剧情树构建方法论 |
| `prompts/skill_chapter_arc_design.md` | 章节弧线设计 |
| `prompts/skill_relationship_dynamics.md` | 角色关系网推演 |
| `prompts/skill_outline_generation.md` | 大纲生成方法论和格式规范 |
| `prompts/skill_volume_planning.md` | 卷级节奏规划 |

### 7.3 大纲格式迁移

现有 `chapter_01_outline.json` 迁移为 `chapter_01_outline.md`（Markdown 格式）。JSON 版本保留为 `.json.bak`。

**原则**：凡是可能出现在 Agent 创作 prompt 中的内容，一律 Markdown。JSON 只存在于工具黑箱内部（tree.json、characters.json 等）。
