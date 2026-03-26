# AutoNovel-Studio 项目结构

```
AutoNovel-Studio/
├── 00_Config/              # 全局配置
│   └── book_meta.json      # 小说元数据（类型、基调、禁忌元素）
│
├── 01_Global_Settings/     # 全局设定
│   ├── characters.json     # 角色档案和实时状态
│   └── world_lore.json     # 世界观和设定字典
│
├── 02_Outlines/            # 大纲
│   ├── volume_01.md        # 卷大纲
│   └── chapter_01_outline.json  # 章节详细大纲（场景划分）
│
├── 03_Story_Memory/        # 故事记忆
│   ├── full_summaries.md   # 完整极简摘要
│   └── recent_chapters/    # 滑动窗口记忆（最近N章）
│
├── 04_Drafts/              # 草稿（带版本号，永不覆盖）
│   ├── ch01_v1.txt
│   ├── ch01_v2.txt
│   └── test_scene.txt      # 测试草稿
│
├── 05_Reviews/             # 审查反馈（带版本号）
│   ├── ch01_v1_reviews.json
│   ├── ch01_v2_reviews.json
│   └── ch01_v3_reviews.json
│
├── src/                    # 源代码
│   ├── agents/             # 智能代理
│   │   ├── author.py       # 作者代理（生成器）
│   │   ├── editor.py       # 编辑代理（损失函数）
│   │   ├── readers.py      # 读者代理（判别器矩阵）
│   │   │   ├── LoreKeeperAgent      # 考据党
│   │   │   ├── PacingJunkieAgent    # 节奏党
│   │   │   ├── AntiTropeScannerAgent # 反套路扫描
│   │   │   └── AIToneScannerAgent    # AI味扫雷 ✨新增
│   │   └── state_updater.py # 状态更新器（提交阶段）
│   │
│   ├── core/               # 核心组件
│   │   ├── models.py       # Pydantic数据模型
│   │   ├── llm_client.py   # LLM客户端基类
│   │   ├── openai_client.py # OpenAI兼容实现
│   │   └── state_machine.py # 状态机
│   │
│   └── utils/              # 工具函数
│       ├── file_utils.py   # 文件管理器（版本控制）
│       └── prompt_utils.py # Jinja2模板管理
│
├── prompts/                # Jinja2提示模板
│   ├── author_scene.j2     # 作者生成提示
│   ├── reader_lore_keeper.j2    # 考据党提示
│   ├── reader_pacing_junkie.j2  # 节奏党提示
│   ├── reader_anti_trope.j2     # 反套路提示
│   └── reader_ai_tone.j2        # AI味扫雷提示 ✨新增
│
├── tests/                  # 测试脚本 ✨已整理
│   ├── README.md           # 测试文档
│   ├── test_api.py         # API连接测试
│   ├── test_author.py      # 作者代理测试
│   ├── test_readers.py     # 4读者矩阵测试
│   ├── test_ai_tone.py     # AI味扫雷测试
│   ├── test_editor.py      # 编辑代理测试
│   ├── test_json.py        # JSON解析调试
│   └── test_system.py      # 完整系统测试
│
├── logs/                   # 运行日志
│   └── autonovel.log
│
├── .backup/                # 文件备份
├── .checkpoint/            # 检查点（恢复机制）
│
├── .env                    # 环境变量（API密钥）
├── .env.example            # 环境变量示例
├── .gitignore              # Git忽略规则
│
├── main.py                 # 主入口（CLI）
├── run_tests.py            # 测试运行器 ✨新增
├── requirements.txt        # Python依赖
├── CLAUDE.md               # Claude Code指南
├── README.md               # 项目说明
└── 系统开发文档.md          # 中文系统设计文档
```

---

## 📁 目录说明

### 核心数据目录

| 目录 | 用途 | NO_OVERWRITE |
|------|------|-------------|
| `00_Config/` | 全局配置 | ✅ |
| `01_Global_Settings/` | 角色和世界观 | ✅ |
| `02_Outlines/` | 大纲 | ✅ |
| `03_Story_Memory/` | 故事记忆 | ✅ |
| `04_Drafts/` | 生成草稿 | ✅ 版本控制 |
| `05_Reviews/` | 审查反馈 | ✅ 版本控制 |

### 源代码目录

| 目录 | 用途 |
|------|------|
| `src/agents/` | 智能代理实现 |
| `src/core/` | 核心组件（状态机、LLM、模型） |
| `src/utils/` | 工具函数 |

### 测试目录

| 目录 | 用途 |
|------|------|
| `tests/` | 所有测试脚本集中管理 |
| `prompts/` | Jinja2提示模板 |

---

## 🔄 工作流路径

### 生成一章的完整路径

```
1. 加载配置
   ├─ 00_Config/book_meta.json
   ├─ 01_Global_Settings/characters.json
   ├─ 01_Global_Settings/world_lore.json
   └─ 02_Outlines/chapter_01_outline.json

2. 生成草稿
   ├─ Author Agent (生成器)
   ├─ prompts/author_scene.j2
   └─ 04_Drafts/ch01_v1.txt ✅ 保存版本

3. 并发审查
   ├─ Lore Keeper Agent (考据党)
   ├─ Pacing Junkie Agent (节奏党)
   ├─ Anti-Trope Scanner Agent (反套路)
   └─ AI Tone Scanner Agent (AI味扫雷) ✨新增

4. 编辑仲裁
   ├─ Editor Agent (损失函数)
   ├─ 整合4读者反馈
   └─ 给出修改指令

5. 决策
   ├─ pass_status = True → 下一场景
   ├─ pass_status = False → 重试（最多3次）
   └─ circuit breaker → 人工干预

6. 人工干预
   ├─ 查看草稿: 04_Drafts/ch01_v*.txt
   ├─ 查看反馈: 05_Reviews/ch01_v*_reviews.json
   └─ 选择: 批准/重写/修改大纲/中止

7. 提交
   ├─ StateUpdater 更新状态
   ├─ 03_Story_Memory/recent_chapters/
   └─ 01_Global_Settings/characters.json (实时更新)
```

---

## 🧪 测试路径

### 快速测试

```bash
# 便捷测试运行器
python run_tests.py           # 显示菜单
python run_tests.py author    # 测试作者
python run_tests.py readers   # 测试4读者
python run_tests.py all       # 运行所有测试

# 直接运行
python tests/test_author.py
python tests/test_readers.py
python tests/test_ai_tone.py
```

### 测试依赖关系

```
test_api.py         (独立) ← 验证API连接
    ↓
test_author.py      (独立) ← 生成测试草稿
    ↓
test_readers.py     ← 依赖 test_author.py 的草稿
test_ai_tone.py     ← 依赖 test_author.py 的草稿
test_editor.py      ← 依赖 test_author.py 的草稿
    ↓
test_system.py      (独立) ← 完整系统验证
```

---

## 📊 关键文件

### 必需配置文件

| 文件 | 说明 | 必需 |
|------|------|------|
| `.env` | API密钥配置 | ✅ |
| `00_Config/book_meta.json` | 小说元数据 | ✅ |
| `01_Global_Settings/characters.json` | 角色设定 | ✅ |
| `02_Outlines/chapter_01_outline.json` | 章节大纲 | ✅ |

### 生成文件（运行时）

| 文件 | 说明 |
|------|------|
| `04_Drafts/chXX_vN.txt` | 第X章第N版草稿 |
| `05_Reviews/chXX_vN_reviews.json` | 第X章第N版反馈 |
| `logs/autonovel.log` | 运行日志 |
| `.checkpoint/chX_sceneY.json` | 恢复检查点 |

---

## 🎯 核心原则

1. **NO_OVERWRITE** - 所有数据持久化带版本号，永不覆盖
2. **纯Python架构** - 无LangChain等黑盒框架
3. **状态机驱动** - 使用transitions库管理流程
4. **Pydantic验证** - 严格的数据契约
5. **异步并发** - 4个读者并发执行
6. **提示模板化** - Jinja2分离提示和代码
7. **测试集中化** - 所有测试在tests/目录

---

## 🚀 快速开始

```bash
# 1. 配置环境
cp .env.example .env
# 编辑 .env 填入 API 密钥

# 2. 安装依赖
pip install -r requirements.txt

# 3. 运行测试
python run_tests.py all

# 4. 生成章节
python main.py 1
```
