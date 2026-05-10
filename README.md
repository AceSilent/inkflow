# InkFlow

InkFlow 是一个本地优先的 AI 小说创作工作台。它提供 Web UI、TypeScript 后端、作者 Agent 工具链、设定库、大纲、剧情图、章节草稿、自检和编辑审稿流程，适合个人长期创作项目。

InkFlow is a local-first AI novel authoring studio with a web UI, TypeScript backend, Author Agent tool loop, lore management, outlines, plot graph tracking, draft self-checks, and editorial review.

## 功能 / Features

- 通过 Web UI 创建和管理小说项目。
- 与作者 Agent 对话，生成设定、大纲、剧情图和章节草稿。
- 草稿保存前执行自检，拦截常见 AI 腔、字数不足和格式问题。
- 支持设定考据、逻辑审核等慢审流程。
- 书籍数据、草稿、审稿结果和设置默认保存在本地文件中，关闭重开后可恢复状态。

- Create and manage novel projects from the web UI.
- Chat with the Author Agent to build lore, outlines, plot graphs, and chapter drafts.
- Run draft self-checks before review.
- Review chapters with configurable editorial reviewers.
- Store book data, drafts, reviews, and settings locally on disk.

## 环境要求 / Requirements

- Node.js 22 或更新版本
- npm
- Windows PowerShell（用于 `start.cmd` / `npm start` 启动脚本）

## 快速开始 / Quick Start

安装依赖：

```powershell
npm run install:all
```

创建本地配置：

```powershell
copy .env.example .env
```

编辑 `.env`，填入你的 OpenAI-compatible 模型服务配置。不要提交真实 API key。

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

## 配置 / Configuration

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

## 开发 / Development

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

## 打包 / Packaging

GitHub Actions 会在 push 到 `master` 或手动触发 workflow 时构建免安装 zip 包。

打包流程：

1. 安装后端和前端依赖。
2. 运行后端测试。
3. 构建后端和前端。
4. 组装 `release/inkflow`。
5. 上传 `inkflow-<commit>.zip` 为 Actions artifact。

当前产物不是安装器。使用者解压后安装依赖、配置 `.env`，再运行 `npm start`。
