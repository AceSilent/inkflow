# AutoNovel Evolution Log

## Round 1 -- 2026-03-30

**Phase**: A (系统稳固化)
**Stability**: [MID]
**Level**: L1
**Change**: 清除全部 Python 源码中的 emoji (23处 -> 0处)
**Reason**: emoji 浪费 LLM token, 污染模型注意力。涉及: AGENT_SYSTEM_PROMPTS、AGENT_ICONS、ROLE_LABELS、CATEGORY_LABELS、plot_tree state_icons、agent_memory anti_patterns、brainstorm/writing tool messages、author.py scene prompt
**Verify**: python -m pytest tests/core/ -v -s → 40 passed / emoji scan → 0 remaining in .py files
**Next**: 清除前端(.jsx)和模板(.j2, .md)中的 emoji (约96处残留)
