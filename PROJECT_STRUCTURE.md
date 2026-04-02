# AutoNovel-Studio 项目结构

> 单 Agent 架构 · TypeScript 后端 + React 前端

```
AutoNovel-Studio/
├── server/                    # [NEW] TypeScript 后端
│   ├── src/
│   │   ├── index.ts           # Fastify 入口 + CORS
│   │   ├── agent/
│   │   │   ├── agent-loop.ts  # Vercel AI SDK streamText + maxSteps
│   │   │   └── prompt-builder.ts  # 模块化 PromptSection 装配
│   │   ├── editorial/
│   │   │   ├── editorial.ts   # submit_to_editorial 工具
│   │   │   └── pipeline.ts    # 3 审稿人并行 (设定/节奏/文风)
│   │   ├── llm/
│   │   │   └── provider.ts    # @ai-sdk/openai 适配器
│   │   ├── memory/
│   │   │   ├── core-memory.ts     # 跨书核心记忆 (写作原则)
│   │   │   ├── project-memory.ts  # 单书项目记忆 (剧情进展)
│   │   │   └── context-builder.ts # 记忆 → 系统提示注入
│   │   ├── routes/
│   │   │   └── author-chat.ts # SSE 流式聊天路由
│   │   └── tools/
│   │       ├── base-tool.ts       # ToolDefinition + ToolRegistry
│   │       ├── safety.ts          # 审计日志 + 备份 + 注入检测
│   │       ├── index.ts           # 17 个工具注册中心
│   │       ├── read-file.ts       # 文件读取 (防遍历)
│   │       ├── search-lore.ts     # 设定数据库搜索
│   │       ├── write-tools.ts     # save_draft, save_outline, save_lore
│   │       ├── plot-tree.ts       # 剧情树操作 (5 tools)
│   │       ├── terminal.ts        # 人类交互暂停工具
│   │       └── skills.ts          # YAML frontmatter 动态发现
│   ├── tests/                     # Vitest 测试 (57 tests)
│   ├── package.json               # ESM + Fastify + AI SDK + Zod
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── src/                       # [LEGACY] Python 后端 (迁移中)
│   ├── agents/                # 旧 Agent 实现
│   ├── api/                   # FastAPI 路由
│   ├── core/                  # 核心引擎
│   └── utils/                 # 工具函数
│
├── frontend/                  # React 19 + Vite 前端
│   └── src/components/        # UI 组件
│
├── prompts/                   # 提示模板
│   ├── skill_*.md             # 9 个写作 Skill (带 YAML frontmatter)
│   ├── reader_scene_*.j2      # 3 个编辑部场景审稿模板
│   ├── reader_*.j2            # 4 个编辑部章节审稿模板
│   └── summary_*.j2           # 摘要模板
│
├── books/                     # 书籍数据 (每本书独立目录)
│   └── {book_id}/
│       ├── 00_Config/         # book_meta.json
│       ├── 01_Global_Settings/ # characters.json, world_lore.json
│       ├── 02_Outlines/       # outline.json
│       ├── memory/            # 项目记忆
│       ├── plot_tree.json     # 剧情树
│       └── audit_log.jsonl    # 工具调用审计日志
│
├── global/                    # 全局数据
│   └── core_memory/           # 跨书核心记忆
│
├── docs/                      # 文档
│   ├── spec.md                # 系统规格书
│   ├── tasks.md               # 当前执行进度
│   ├── improvements.md        # 进化日志
│   ├── superpowers/plans/     # 实施计划
│   └── superpowers/specs/     # 设计规格
│
├── .env                       # 环境变量
├── CLAUDE.md                  # AI 助手上下文
├── README.md                  # 项目说明
└── main.py                    # CLI 入口 (legacy)
```

---

## 架构概览

### 单 Agent 模式

```
User ←→ Author Agent (TS)
              ↓ 自治循环
        ┌─────────────────────────────────┐
        │  streamText({ maxSteps: 20 })   │
        │  ┌─ tool_call → execute → ─────┐│
        │  │  read_file, save_draft,     ││
        │  │  search_lore, read_tree,    ││
        │  │  load_skill, ...            ││
        │  └─ inject result → LLM → ────┘│
        └─────────────────────────────────┘
              ↓ 需要审核时
        submit_to_editorial
        ┌─ 设定审稿 ─┐
        ├─ 节奏审稿 ─┤ 并行
        └─ 文风审稿 ─┘
              ↓ JSON 反馈
        Author 自主修改
```

### 技术栈

| 层 | 技术 |
|----|------|
| TS 后端 | Fastify + Vercel AI SDK + Zod |
| Python 后端 (legacy) | FastAPI + OpenAI SDK |
| 前端 | React 19 + Vite |
| LLM | 任何 OpenAI 兼容端点 |
| 测试 (TS) | Vitest (57 tests) |
| 测试 (Python) | Pytest (128 tests) |

### 17 个注册工具

| 类型 | 工具 |
|------|------|
| Read | `read_file`, `search_lore`, `read_outline` |
| Write | `save_draft`, `save_outline`, `save_lore` |
| Plot Tree | `read_tree`, `add_plot_node`, `confirm_path`, `prune_branch`, `merge_branches` |
| Terminal | `submit_for_review`, `present_options`, `request_guidance` |
| Skill | `load_skill`, `list_skills` |
| Editorial | `submit_to_editorial` |

---

## 快速开始

```bash
# TS 后端
cd server && npm install && npm run dev    # :3001

# Python 后端 (legacy)
pip install -r requirements.txt
python src/api/main.py                     # :9864

# 前端
cd frontend && npm install && npm run dev  # :5173

# 测试
cd server && npm test                      # 57 TS tests
python -m pytest tests/                    # 128 Python tests
```
