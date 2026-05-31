# InkFlow

[![中文](https://img.shields.io/badge/中文-当前-8b3f2f)](README.md)
[![English](https://img.shields.io/badge/English-README-6b6257)](README.en.md)

InkFlow 是一个本地优先的 AI 游戏剧本创作工作台，面向游戏文案长期迭代项目。它把编剧 Agent、设定库、剧情图、line-based 剧本（dialogue/narration/action/thought + direction 演出指示）、分支自检和审核整合到一个 Web UI 里，让创作者可以围绕一款游戏持续打磨剧本，而不是一次性生成一段文本。

## 功能

- 在 Web UI 中创建和管理游戏剧本项目（project → story_package → stage 三级结构）。
- 与编剧 Agent 对话，生成世界设定、剧情图、大纲和 line-based 剧本。
- 支持 dialogue / narration / action / thought 四种行类型，配合 direction（bgm、sfx、bg、shake、flash、wait）演出指示。
- 支持 2-4 分支选项设计（choices），自检分支闭合、终点可达和孤岛检测。
- 保存剧本前执行自检，提前拦截断链、空 stage、旁白过长等结构问题。
- 支持设定考据、因果逻辑等审核流程（editorial pipeline）。
- 项目数据、剧本、审稿结果和设置默认保存在本地文件中，关闭重开后可恢复状态。
- 支持导出为 YAML / JSON / CSV / HTML 多种格式。

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

默认运行数据保存在仓库根目录的数据目录（默认 `books/`，可通过 `AUTONOVEL_DATA_DIR` 配置）。

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
