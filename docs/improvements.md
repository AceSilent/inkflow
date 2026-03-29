# AutoNovel Evolution Log

## Round 1 -- 2026-03-30

**Phase**: A (系统稳固化)
**Stability**: [MID]
**Level**: L1
**Change**: 清除全部 Python 源码中的 emoji (23处 -> 0处)
**Reason**: emoji 浪费 LLM token, 污染模型注意力。涉及: AGENT_SYSTEM_PROMPTS、AGENT_ICONS、ROLE_LABELS、CATEGORY_LABELS、plot_tree state_icons、agent_memory anti_patterns、brainstorm/writing tool messages、author.py scene prompt
**Verify**: python -m pytest tests/core/ -v -s → 40 passed / emoji scan → 0 remaining in .py files
**Next**: 清除前端(.jsx)和模板(.j2, .md)中的 emoji (约96处残留)

## Round 2 -- 2026-03-30

**Phase**: A (系统稳固化)
**Stability**: [MID]
**Level**: L1
**Change**: 清除全部前端 JSX 中的 emoji (29处 -> 0处), 用 lucide-react 图标替代
**Reason**: emoji 在 UI 渲染中不一致(跨平台差异)且不够专业。同时修正了过时描述:"3位读者""4位读者""主编仲裁""总编辑"等旧管线术语
**Verify**: npx vite build → success / python tests → 40 passed / emoji scan → 0 remaining in .jsx files
**Files**: GroupChatPanel.jsx, ChapterEditor.jsx, BrainstormPanel.jsx, ReviewPanel.jsx, AuthorChatPanel.jsx, CharactersPanel.jsx
**Next**: 清除 prompts/ 模板(.j2, .md)中的 emoji 残留(约 64 处)
