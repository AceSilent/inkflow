# InkFlow

[![中文](https://img.shields.io/badge/中文-当前-8b3f2f)](README.md)
[![English](https://img.shields.io/badge/English-README-6b6257)](README.en.md)

InkFlow 是一个本地优先的 AI 小说创作工作台，面向个人长期写作项目。它把作者 Agent、设定库、大纲、剧情图、章节草稿、自检和编辑审稿整合到一个 Web UI 里，让创作者可以围绕一本书持续迭代，而不是一次性生成一段文本。

## 功能

- 在桌面应用或 Web UI 中创建和管理小说项目。
- 与作者 Agent 对话，生成设定、大纲、剧情图和章节草稿。
- 支持从未绑定的新对话讨论创意，再由用户或 Agent 绑定成新作品。
- 在保存草稿前执行自检，提前拦截常见 AI 腔、字数不足和格式问题。
- 支持设定考据、逻辑审核等慢审流程。
- 支持 Gemini、DeepSeek、OpenAI-compatible 服务，以及 ChatGPT Codex OAuth provider。
- 书籍数据、草稿、审稿结果和设置默认保存在本地文件中，关闭重开后可恢复状态。

## 环境要求

- Node.js 22 或更新版本
- npm
- macOS 12 或更新版本（桌面应用）
- Rust 和 Tauri CLI（仅在本地打包桌面应用时需要）
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

构建 mac 应用：

```bash
npm run desktop:build:mac
```

构建产物：

- `.app`: `src-tauri/target/release/bundle/macos/InkFlow.app`
- `.dmg`: `src-tauri/target/release/bundle/dmg/InkFlow_1.0.1_aarch64.dmg`

安装到本机应用程序目录后，运行数据默认保存在：

```text
~/Library/Application Support/com.inkflow.studio/books
```

每本作品会独立保存在自己的目录中，章节、设定、大纲、剧情图、运行记录和对话历史都在该目录下隔离。

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
