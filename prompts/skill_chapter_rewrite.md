---
name: stage_rewrite
category: writing
description: 在 stage 结构、人物动机、因果链或文风整体失效时，按既有设定和大纲整个 stage 重写。
when_to_use: 审稿反馈显示 stage 需要整体重构，或用户明确要求重写整个 stage 时
---

# Stage 整体重写 (Stage Rewrite)

目标：保留本 stage 在大纲、设定和剧情图中的功能，重新生成一版完整 stage。适用于局部编辑无法解决的问题。

当 `submit_to_editorial` 返回 `revision_strategy.action = "stage_rewrite"` 时，使用本 skill。通常意味着审稿分数较低、多个结构性审稿人未过，或存在设定冲突、角色行为反转、因果断裂、stage 目标未完成等补丁式编辑无法解决的问题。

如果返回 `revision_strategy.action = "stop_auto_revision"`，不要再整 stage 重写。必须停下来向人类汇报未过审稿人、反复失败的问题和需要人类决定的创作取舍。

## 重写前检查

1. 用 `read_outline` 确认本 stage 目标、冲突、收束点和相邻 stage 关系。
2. 用 `search_lore` 确认人物设定、世界观、物品和地点约束。
3. 用 `read_graph` 或 `query_unresolved_setups` 确认本 stage 需要埋设、推进或回收的剧情节点。
4. 如有旧剧本，用 `read_file` 读取，只提取可保留的语气、笑点、伏笔和人物动态，不照抄失败结构。
5. 用 `load_skill("exemplar_study")` 研读范文库方法，再用 `browse_examples` 至少读取：
   - `category="opening", tags=["webnovel_clean"]`
   - `category="ai_tone", tags=["camera_blocking"]`

## 重写原则

- Stage 至少包含 8 行有效 Line，送审前不要提交过短的 stage。
- 保持推进感：开场给钩子，中段冲突升级，结尾有收束和下一 stage 牵引或分支选项。
- 角色行为必须能解释，不能为了过剧情突然降智或转性。
- 信息点成立后立刻停，不要追加后置说明/解释补丁。
- 与大纲不一致时，优先遵守已保存的大纲和剧情图；必要时先说明需要调整大纲。
- 不复用参考素材原文，只继承文风、节奏、主角气质和世界观感觉。

## 第一屏硬规则

- 不要从纯环境描写/氛围铺垫起手（除非是 stage 首次切换场景且需要 direction 指定 bg/bgm）。
- Stage 前 3 行优先给玩家三件事：角色处境、当前压力、下一步不得不做什么。
- 开篇可以有 action 行，但不能排队写连续动作链。

## 保存前自检

调用 `save_script` 前，先按 `self_check_before_save.md` 的清单在心里过一遍。若你自己已经能看出镜头链、破折号说明、后置解释，先改掉再保存。

## 输出流程

1. 先简短说明重写方案：本 stage 目标、主要冲突、末尾落点。
2. 生成完整 stage 的 lines 数组（包括 type、speaker、text、emotion、direction 等字段）。
3. 调用 `save_script` 保存完整新版本。
4. 若用户要求送审，调用 `submit_to_editorial`，并根据审稿结果决定是否再进入 `stage_edit`。
