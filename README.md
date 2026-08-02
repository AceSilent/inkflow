# InkFlow

[![中文](https://img.shields.io/badge/中文-当前-8b3f2f)](README.md)
[![English](https://img.shields.io/badge/English-README-6b6257)](README.en.md)

InkFlow 是一个本地优先的 AI 小说创作工作台，面向个人长期写作项目。它把作者 Agent、设定库、大纲、剧情图、章节草稿、自检和编辑审稿整合到一个 Web UI 里，让创作者可以围绕一本书持续迭代，而不是一次性生成一段文本。

## 功能

- 在桌面应用或 Web UI 中创建和管理小说项目。
- 与作者 Agent 对话，生成和维护设定集、大纲、剧情图与章节草稿。
- 章节正文保留带来源的版本历史，可区分用户与作者 Agent 的修改、查看真实 diff、恢复旧版，并防止过期编辑器静默覆盖新稿。
- 设定集按“总纲 / 世界观 / 角色”分类，并在分类内按条目类型分组；支持用户直接编辑、Agent 增量更新、Markdown 正文、来源引用与版本冲突保护。
- 支持从未绑定的新对话讨论创意，再由用户或 Agent 绑定成新作品。
- 在保存草稿前执行自检，提前拦截常见 AI 腔、字数不足和格式问题。
- 支持设定考据、逻辑审核等慢审流程。
- 支持 Gemini、DeepSeek、OpenAI-compatible 服务，以及 ChatGPT Codex OAuth provider。
- 书籍数据、草稿、审稿结果和设置默认保存在本地文件中，关闭重开后可恢复状态。

## 环境要求

- Node.js 22 或更新版本
- npm
- macOS 12 或更新版本（桌面应用）
- Windows PowerShell（仅用于 `start.cmd` / `npm start` 启动脚本）

## 快速开始

安装依赖：

```powershell
npm run install:all
```

创建本地配置：

```powershell
copy .env.example .env
```

编辑 `.env`，填入你的 OpenAI-compatible 模型服务配置。

启动应用：

```powershell
npm start
```

Windows 下也可以双击：

```text
start.cmd
```

启动后访问：

- Backend: `http://127.0.0.1:3001`
- Frontend: `http://127.0.0.1:5173`

默认运行数据保存在仓库根目录的 `books/`。

## mac 桌面版

构建 Electron mac 应用：

```bash
npm run desktop:build:electron:mac
```

构建产物：

- `.app` / `.dmg`: `dist-electron/`

推送到 `master` 后，GitHub Actions 的 `Desktop CI` 也会在 macOS runner 上构建 Apple Silicon DMG。构建完成后可在该次运行的 `Artifacts` 中下载 `inkflow-macos-arm64-*`。当前仓库没有配置 Apple Developer ID 与公证凭证，因此 CI 产物是未签名、未公证版本；这不影响 DMG 生成，但其他 Mac 首次打开时可能出现 Gatekeeper 提示。

构建并安装到 `/Applications/InkFlow.app`：

```bash
npm run desktop:install:electron:mac
```

安装到本机应用程序目录后，运行数据默认保存在：

```text
~/Library/Application Support/com.inkflow.studio/books
```

每本作品会独立保存在自己的目录中，章节、设定、大纲、剧情图、运行记录和对话历史都在该目录下隔离。

### 正文版本

章节正文保存在 `04_Drafts/chXX.md`，对应版本保存在 `.draft_history/chXX/`。新版记录包含修改来源、保存时间、父版本和内容哈希；历史版本可在章节页查看和恢复，作者 Agent 也可通过 `list_draft_versions` 与 `compare_draft_versions` 核对双方改动。

旧版 InkFlow 已产生的纯 Markdown 历史会自动显示为“历史版本（来源未知）”，不会在升级时改写原稿或猜测作者。从升级后的第一次保存起，用户与作者 Agent 的来源会被准确记录。

### 设定集

右侧工作区顶部的“设定集”可直接进入设定页面。总纲、世界设定和角色设定分别保存在
`01_Global_Settings/story_bible.json`、`01_Global_Settings/world_lore.json` 和
`01_Global_Settings/characters.json`。

设定集使用统一的版本化条目格式。每条设定有稳定 ID、标题、类型、状态、标签、别名、来源引用和 Markdown 内容。用户可在设定集页面新增、编辑或删除条目；作者 Agent 通过 `search_lore` 定位条目，必要时用 `read_lore_entry` 阅读完整条目，再用 `save_lore` 按 ID 增量更新，默认不会覆盖未涉及的设定。`lore_authoring` Skill 负责指导 Agent 在开书前和写作过程中创建、归类和维护设定。

旧版设定文件可执行一次迁移：

```bash
npm run migrate:lore
```

迁移会在原文件旁保留 `*.pre-lore-v1.bak` 备份。

退出应用：

```text
stop.cmd
```

关闭浏览器页面不会自动关闭后端和前端进程。

## 配置

InkFlow 支持 Gemini、DeepSeek、OpenAI-compatible 服务和 ChatGPT Codex OAuth provider，可通过 `.env` 或设置页面配置。

常用 `.env` 示例：

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.example.com/v1
AUTHOR_MODEL=provider/model-name
EDITOR_MODEL=provider/editor-model-name
AUTONOVEL_DATA_DIR=books
```

启动脚本会自动映射兼容变量：

- `OPENAI_API_KEY` -> `LLM_API_KEY`
- `OPENAI_BASE_URL` -> `LLM_BASE_URL`
- `AUTHOR_MODEL` -> `LLM_MODEL`
- `EDITOR_MODEL` -> `EDITORIAL_MODEL`

### Codex OAuth

ChatGPT Codex OAuth provider 使用本地 OAuth 凭据，不需要在 InkFlow 中填写 API Key。它走 ChatGPT Codex Responses API，并在多步工具调用中显式使用 `store:false`，避免工具调用后续写时引用后端未持久化的 `item_reference`。

这意味着作者 Agent 可以稳定完成这类流程：

```text
用户消息 -> 模型调用 read_file/search/save_draft 等工具 -> 工具返回 -> 模型继续生成最终回复
```

## 开发

后端：

```powershell
cd server
npm run dev
npm test
npm run build
```

前端：

```powershell
cd frontend
npm run dev
npm run build
```

仓库根目录快捷命令：

```powershell
npm test
npm run build
```
