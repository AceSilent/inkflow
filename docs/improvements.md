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

## Round 3 -- 2026-03-30

**Phase**: A (系统稳固化)
**Stability**: [MID]
**Level**: L1
**Change**: 清除全部 prompts/ 模板中的 emoji (62处 -> 0处, 13 files)
**Reason**: 这些 emoji 被注入 LLM prompt, 浪费 token 且干扰模型注意力
**Verify**: pytest → 40 passed / full codebase emoji scan → 0 remaining
**MILESTONE**: CODEBASE 100% EMOJI-FREE (py + jsx + j2 + md)

## Round 4 -- 2026-03-30

**Phase**: A (系统稳固化)
**Stability**: [MID]
**Level**: L1/L3
**Change**: 删除死代码 scene_generator.py + scene_readers.py (-613 lines) + print->logger
**Reason**: scene_generator 和 scene_readers 无任何活跃引用, 是彻底的死代码; task_manager 中的 print 不走日志系统
**Verify**: pytest → 40 passed / import check OK
**Finding**: BookManager.create_book() 因 model 漂移而实际上已坏(BookState 从 BaseModel 变成了 Enum)

## Round 5 -- 2026-03-30

**Phase**: A (系统稳固化)
**Stability**: [MID -> HIGH]
**Level**: L2
**Change**: 新增 42 个测试 (40 -> 82 total): test_book_manager.py(25) + test_groupchat_storage.py(17)
**Reason**: 进化技能要求核心模块必须有测试覆盖; 这两个模块是纯 I/O 无需 mock LLM
**Verify**: pytest → 82 passed
**Next**: 继续补测试: chat_session.py, agent_memory.py; 然后修复 BookManager model drift
