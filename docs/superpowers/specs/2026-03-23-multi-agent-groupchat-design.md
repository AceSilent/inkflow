# 创意沙盘多Agent群聊重构设计规格书

> **日期**: 2026-03-23
> **版本**: v5.0
> **范围**: 创意沙盘（BrainstormPanel）从单Agent对话重构为多Agent群聊

---

## 一、现状问题

1. **单Agent瓶颈**：当前创意沙盘只有一个"AI Director"角色，缺乏多角度碰撞
2. **Agent未接入**：ProposerAgent、DevilsAdvocateAgent、AuthorAgent、EditorAgent 存在于代码中但从未被创意沙盘UI调用
3. **压缩破坏性**：`chat_session.py` 的 `maybe_compress` 直接删除旧消息（`session['messages'] = recent`），用户上滑看不到历史
4. **无思考可见性**：Agent 的推理过程完全黑盒
5. **无文件编辑能力**：创意沙盘无法直接修改大纲/设定等文件

---

## 二、群聊成员定义

| # | Agent角色 | 系统代号 | 人格与职责 | 特殊能力 |
|---|---|---|---|---|
| 1 | **总编辑** | `editor` | 群聊主持人、拍板者。始终最后发言，总结共识并执行 | ✅ 唯一有file-edit skill：可修改大纲/卷纲/设定/世界观文件 |
| 2 | **提案策划** | `proposer` | 推进创意、抛脑洞、提供多个方案选择 | 无文件权限 |
| 3 | **魔鬼代言人** | `devil` | 找逻辑漏洞、反对意见、挑战假设 | 无文件权限 |
| 4 | **作者** | `author` | 从实际写作角度评估：文笔可行性、场景能否写出精彩效果 | 无文件权限 |
| 5 | **人类** | `human` | 随时可在群里发言、发起话题、最终审批 | 完全控制权 |

---

## 三、对话轮转机制

### 3.1 顺序轮转 + PASS 机制

```
人类发言 → 提案策划 → 魔鬼代言人 → 作者 → 总编辑(总结+执行)
                ↓             ↓          ↓
              [PASS]        [PASS]     [PASS]
```

- 每轮从**提案策划**开始，按固定顺序轮转
- 任何Agent认为"没有新观点可以补充"时，返回 `PASS`（UI显示为灰色的"[无补充]"）
- **总编辑永远最后发言**，但不一定每轮都总结拍板——可以只是单纯发表看法参与讨论
- 只有总编辑**主动决定拍板**时，才执行文件编辑操作
- 人类随时可插入发言，打断轮转周期并开始新一轮

### 3.2 Agent 状态管理

每个Agent维护一个运行时状态：

```python
class AgentState(BaseModel):
    agent_id: str                  # "editor", "proposer", "devil", "author"
    display_name: str              # "总编辑", "提案策划" ...
    status: Literal["active", "idle", "thinking", "passed"]
    consecutive_passes: int = 0    # 连续PASS次数（用于终止检测）
    last_spoke_round: int = 0     # 上次发言的轮次
```

### 3.3 对话终止条件（防无限循环）

一轮讨论在满足以下**任一**条件时自动终止，等待人类下一条消息：

1. **全部PASS**：所有4个Agent在同一轮中全部PASS → 讨论已收敛，等待人类新话题
2. **总编辑拍板**：总编辑在回复中明确表示"拍板定案"→ 执行文件编辑并结束本轮
3. **人类插入**：人类随时发言 → 重置轮次、开启新话题

> **无最大轮次上限**。Agent们会通过PASS机制自然收敛，不需要人为设限。

### 3.4 话题聚焦控制

- 每个Agent的系统提示中注入当前 **话题锚点**（来自人类最新消息的关键词提取）
- Agent回复时必须包含 `relevance` 字段（0-10），若自评 ≤ 3 则自动 PASS
- 总编辑有权在总结时标注"话题偏离"

---

## 四、思考模式（Thinking Mode）

### 4.1 后端实现

所有Agent的LLM调用使用两阶段生成：

```python
# Phase 1: 思考（内部推理）
thinking = await llm.generate_text(
    system_prompt=agent_thinking_prompt,
    user_prompt=context,
    temperature=0.7
)

# Phase 2: 正式回复（基于思考结果）
reply = await llm.generate_text(
    system_prompt=agent_reply_prompt,
    user_prompt=f"你的思考过程：\n{thinking}\n\n请基于以上思考给出正式回复。",
    temperature=0.6
)
```

### 4.2 前端展示

每条Agent消息包含可折叠的思考区块：

```
┌──────────────────────────────────────┐
│ 🧠 总编辑 · 思考中...               │
│ ▸ [思考过程] (可展开/折叠)           │
│                                      │
│ 正式回复内容...                      │
│                                      │
│ 📝 [已更新: 卷纲-第一卷.md]         │
└──────────────────────────────────────┘
```

### 4.3 数据模型

```python
class GroupChatMessage(BaseModel):
    id: str
    role: Literal["human", "editor", "proposer", "devil", "author"]
    display_name: str               # "总编辑", "魔鬼代言人" ...
    avatar_color: str               # UI头像颜色
    content: str                    # 正式回复
    thinking: Optional[str] = None  # 思考过程（可折叠展示）
    is_pass: bool = False           # 是否为PASS
    file_edits: List[FileEdit] = [] # 仅editor有，文件变更记录
    round_number: int               # 当前轮次
    ts: float                       # 时间戳
```

---

## 五、无感压缩（双层存储）

### 5.1 存储架构

```
books/{book_id}/brainstorm/
├── chat_full.json       # 完整聊天记录（只增不删，给UI用）
├── chat_context.json    # 压缩后的LLM上下文窗口
└── summaries/
    ├── summary_001.json # 第1次压缩的摘要
    └── summary_002.json # 第2次压缩的摘要
```

### 5.2 压缩策略

- **UI层**：`chat_full.json` 永远完整保存。用户上滑随时可见所有历史消息
- **LLM层**：当`chat_context.json`的token估算超过阈值时：
  1. 将旧消息生成摘要 → 存入 `summaries/`
  2. `chat_context.json` 只保留摘要 + 最近N条消息
  3. `chat_full.json` 不受影响

### 5.3 API 变更

```python
# 读取：前端显示用完整记录
GET /api/v1/groupchat/{book_id}/history
→ 返回 chat_full.json 的全部消息

# 写入：后端拼接LLM上下文时用压缩记录  
# (内部函数，不暴露API)
def build_llm_context(book_id) -> str:
    summaries = load_summaries(book_id)
    recent = load_recent_context(book_id)
    return f"[历史摘要]\n{summaries}\n\n[近期对话]\n{recent}"
```

---

## 六、总编辑的文件编辑 Skill

### 6.1 可编辑文件范围

| 文件类型 | 路径 | 操作 |
|---|---|---|
| 大纲 | `outlines/outline.json` | 修改章节标题/摘要、增删章节 |
| 卷纲 | `outlines/volume_{n}.md` | 修改卷级剧情走向 |
| 世界观 | `lore/world_setting.json` | 修改力量体系/地理/历史设定 |
| 角色设定 | `lore/characters.json` | 修改角色信息 |
| 书籍元数据 | `book_meta.json` | 修改标题/类型/基调 |

### 6.2 编辑操作流程

1. 总编辑在回复中声明要修改的文件和内容
2. 后端解析出 `FileEdit` 操作列表
3. 执行文件写入（带版本备份）
4. 在群聊中插入 `tool` 类型消息确认变更

```python
class FileEdit(BaseModel):
    file_path: str          # 相对于 book_dir 的路径
    edit_type: Literal["update", "create", "append"]
    content: str            # 新内容（JSON或Markdown）
    summary: str            # 变更摘要（显示在UI中）
```

---

## 七、后端 API 合约

### 7.1 新增端点

```
POST /api/v1/groupchat/{book_id}/send
  Body: { message: str }
  → 触发多Agent轮转，SSE 流式返回每个Agent的回复

GET  /api/v1/groupchat/{book_id}/history
  → 返回完整聊天记录（chat_full.json）

GET  /api/v1/groupchat/{book_id}/agents
  → 返回各Agent的当前状态

POST /api/v1/groupchat/{book_id}/upload
  Body: FormData(files)
  → 上传参考文件并触发分析
```

### 7.2 SSE 流式响应格式

```
POST /api/v1/groupchat/{book_id}/send 的响应：

event: agent_thinking
data: {"agent":"proposer","display_name":"提案策划","thinking":"..."}

event: agent_reply
data: {"agent":"proposer","display_name":"提案策划","content":"...","is_pass":false}

event: agent_thinking
data: {"agent":"devil","display_name":"魔鬼代言人","thinking":"..."}

event: agent_reply
data: {"agent":"devil","display_name":"魔鬼代言人","content":"...","is_pass":true}

event: file_edit
data: {"agent":"editor","file":"outlines/outline.json","summary":"更新了第一卷标题"}

event: round_complete
data: {"round":1,"next_action":"waiting_human"}
```

---

## 八、前端 UI 变更

### 8.1 BrainstormPanel 重构

- 左侧：**群聊区**（替代当前单Agent对话）
  - 每个Agent有独特头像颜色和角色标识
  - 思考过程可折叠/展开
  - PASS 消息以灰色小字显示
  - 文件编辑操作以卡片形式嵌入
- 右侧：**设定书（Lore Book）** 保持不变

### 8.2 Agent 头像色彩方案

| Agent | 颜色 | 图标 |
|---|---|---|
| 总编辑 | `#E6A817` (金色) | 👑 |
| 提案策划 | `#4FC3F7` (天蓝) | 💡 |
| 魔鬼代言人 | `#EF5350` (红色) | 😈 |
| 作者 | `#66BB6A` (绿色) | ✍️ |
| 人类 | `#9E9E9E` (灰色) | 👤 |

---

## 九、Agent 私聊频道（QQ-style 1:1 Chat）

### 9.1 设计概念

除群聊外，任意两个成员（Agent↔Agent 或 人类↔Agent）可以有1对1私聊频道。人类对所有私聊拥有**全知视角（God View）**——可以看到并参与任何对话。

### 9.2 频道类型

| 频道 | 参与者 | 典型场景 |
|---|---|---|
| 群聊 | 全员 | 创意讨论、世界观制定、大纲讨论 |
| 作者↔编辑 | author + editor | 正文写作阶段的来回沟通 |
| 人类↔编辑 | human + editor | 人类直接给编辑下指令 |
| 人类↔作者 | human + author | 人类直接指导写作方向 |
| 人类↔策划 | human + proposer | 人类直接讨论创意 |
| 人类↔魔鬼 | human + devil | 人类请魔鬼代言人检查逻辑 |
| 其他组合 | 任意agent对 | 按需求

### 9.3 私聊轮转

私聊比群聊简单：
- 两个参与者来回对话
- 如果人类发起，Agent直接回复
- 如果是Agent↔Agent（如作者↔编辑），由人类或系统发起触发
- 人类随时可旁观或插入任何私聊

### 9.4 数据模型

```python
class ChatChannel(BaseModel):
    """A chat channel — group or private."""
    channel_id: str       # "group" | "author_editor" | "human_proposer" ...
    channel_type: str     # "group" | "private"
    participants: List[str]  # ["author", "editor"] or ["human", "author"]
    display_name: str     # "群聊" | "作者↔编辑" ...
```

### 9.5 存储

```
books/{book_id}/brainstorm/
├── channels/
│   ├── group/
│   │   ├── chat_full.json
│   │   └── chat_context.json
│   ├── author_editor/
│   │   ├── chat_full.json
│   │   └── chat_context.json
│   └── human_author/
│       ├── chat_full.json
│       └── chat_context.json
└── summaries/
```

### 9.6 API

```
POST /api/v1/channels/{book_id}/{channel_id}/send
GET  /api/v1/channels/{book_id}/{channel_id}/history
GET  /api/v1/channels/{book_id}/list              # 列出所有频道
```

### 9.7 前端 UI

左侧增加**频道列表**（类似QQ/Slack侧栏）：
```
┌─ 频道列表 ──────────┐
│ 💬 群聊              │  ← 默认显示
│ 👑↔✍️ 编辑↔作者      │
│ 👤↔👑 我↔编辑        │
│ 👤↔✍️ 我↔作者        │
│ 👤↔💡 我↔策划        │
│ 👤↔😈 我↔魔鬼        │
│ + 新建频道           │
└─────────────────────┘
```

---

## 十、两层记忆系统（Agent Memory）

### 10.1 架构总览

```
              ┌─────────────────────────┐
              │   Core Memory           │
              │   (跨书本·只读·持久)      │
              │   global/core_memory/   │
              └────────┬────────────────┘
                      ↓ 读取（注入 System Prompt）
              ┌────────┴────────────────┐
              │   Project Memory        │
              │   (按书本隔离·可读写)     │
              │   books/{id}/memory/    │
              └─────────────────────────┘
```

### 10.2 项目记忆（Episodic Memory — 按书本隔离）

**目的**：防止"串戏"（幻觉），保证当前作品的纯粹性。

```
books/{book_id}/memory/
├── world_state.json      # 当前世界观状态快照
├── character_states.json # 角色当前状态
├── plot_progress.json    # 剧情进展记录
├── decided_facts.json    # 已确定的设定事实
└── chapter_summaries/    # 各章摘要（滑动窗口）
```

- **读写**：Agent 在当前书本的创作过程中可读写
- **隔离**：切换书本后，完全加载新书本的记忆，旧书本记忆不可见
- **更新时机**：每次场景/章节完成后自动更新

### 10.3 核心记忆（Semantic Memory — 跨书本持久）

**目的**：让 Agent "成长"。积累写作手法、用户偏好、经验法则。

```
global/core_memory/
├── writing_principles.json   # 写作原则（从编辑修改中提炼）
├── user_preferences.json     # 用户偏好（"不要全知视角"、"喜欢草蛇灰线"）
├── craft_skills.json         # 技能积累（"擅长蒸汽朋克细节描写"）
├── anti_patterns.json        # 反模式（"不要出现'他不禁XXX'句式"）
└── reflection_log.json       # 反思日志（提炼过程记录）
```

- **只读**：Agent 在生成文本时可读取，但**单次对话中不能修改**
- **持久**：跨书本保留，永不删除
- **注入**：作为 System Prompt 的一部分注入给所有 Agent

### 10.4 读写分离规则

```python
class MemoryAccess:
    """Memory access rules for agents."""
    
    @staticmethod
    def get_context_for_agent(agent_id: str, book_id: str) -> str:
        """Build memory context injected into agent's system prompt."""
        # Core memory: always read, never write in-session
        core = load_core_memory()
        # Project memory: read current book only
        project = load_project_memory(book_id)
        return f"[核心记忆]\n{core}\n\n[项目记忆]\n{project}"
```

---

## 十一、Memory Reflection（记忆提炼机制）

### 11.1 触发时机

**每卷完结时自动触发**（Option B）。

当一卷的所有章节定稿后，系统自动运行 Reflection：

```python
async def run_memory_reflection(book_id: str, volume_id: str):
    """Extract 1-2 writing principles from a completed volume."""
    # 1. 收集本卷所有的编辑修改记录（editing history）
    # 2. 收集正文被打回重写的case
    # 3. 汇总给Reflection Agent
    # 4. 提炼出1-2条新的写作原则
    # 5. 追加到 global/core_memory/writing_principles.json
```

### 11.2 提炼输出格式

```python
class WritingPrinciple(BaseModel):
    """A learned writing principle from experience."""
    id: str                     # "wp_001"
    principle: str              # "避免在悬疑场景中使用多余的心理描写"
    source: str                 # "深渊回响·第一卷·编辑反馈"
    confidence: float = 0.8    # 置信度（0-1）
    created_at: str            # ISO timestamp
    example_good: str = ""     # 正面示例
    example_bad: str = ""      # 反面示例
```

### 11.3 Core Memory 注入策略

- Core memory 内容作为 System Prompt 后缀注入
- 按 `confidence` 排序，优先注入高置信度原则
- Token 预算：最多占 System Prompt 的 20%

---

## 十二、需同步更新的设计文档

| 文档 | 更新内容 |
|---|---|
| `docs/spec.md` | 新增 §多Agent群聊架构、§私聊频道、§记忆系统 |
| `docs/系统开发文档.md` | 更新Agent角色定义、文件系统规范(memory/)、数据契约 |
| `docs/architecture.md` | 新增群聊+私聊组件架构图、记忆系统架构图 |

---

## 十三、验证计划

### 自动化测试
- 群聊轮转逻辑测试：验证顺序、PASS、终止条件
- 双层存储测试：压缩后UI仍能看到完整历史
- 文件编辑权限测试：只有editor能执行FileEdit
- 私聊频道测试：消息隔离、频道列表
- 记忆隔离测试：切换书本后项目记忆完全切换
- Core Memory只读测试：Agent不能在对话中修改核心记忆

### 浏览器E2E测试
- browser_subagent 操作群聊和私聊
- 验证频道切换、消息保持
- 验证思考折叠、文件变更
- 验证记忆注入后Agent回复质量变化

---

## 附录：实现状态 (2026-03-23)

| 模块 | 文件 | 状态 |
|---|---|---|
| 数据模型 | `src/core/models.py` | ✅ 已实现 |
| 双层存储 | `src/core/groupchat_storage.py` | ✅ 已实现 |
| 编排器 | `src/core/groupchat_orchestrator.py` | ✅ 已实现 |
| SSE API | `src/api/routes/groupchat.py` | ✅ 已实现 |
| 前端UI | `frontend/src/components/GroupChatPanel.jsx` | ✅ 已实现 |
| 两层记忆 | `src/core/agent_memory.py` | ✅ 已实现 |
| Memory Reflection | `src/core/agent_memory.py::run_memory_reflection` | ✅ 已实现 |
| 私聊频道 | 合并到编排器 + UI | ✅ 已实现 |
