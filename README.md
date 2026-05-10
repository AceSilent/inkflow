# InkFlow

[![中文](https://img.shields.io/badge/中文-当前-8b3f2f)](README.md)
[![English](https://img.shields.io/badge/English-README-6b6257)](README.en.md)

InkFlow 是一个本地优先的 AI 小说创作工作台，面向个人长期写作项目。它把作者 Agent、设定库、大纲、剧情图、章节草稿、自检和编辑审稿整合到一个 Web UI 里，让创作者可以围绕一本书持续迭代，而不是一次性生成一段文本。

## 功能

- 在 Web UI 中创建和管理小说项目。
- 与作者 Agent 对话，生成设定、大纲、剧情图和章节草稿。
- 在保存草稿前执行自检，提前拦截常见 AI 腔、字数不足和格式问题。
- 支持设定考据、逻辑审核等慢审流程。
- 书籍数据、草稿、审稿结果和设置默认保存在本地文件中，关闭重开后可恢复状态。

## 环境要求

- Node.js 22 或更新版本
- npm
- Windows PowerShell（用于 `start.cmd` / `npm start` 启动脚本）

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

退出应用：

```text
stop.cmd
```

关闭浏览器页面不会自动关闭后端和前端进程。

## 配置

InkFlow 支持 OpenAI-compatible 服务，可通过 `.env` 或设置页面配置。

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
