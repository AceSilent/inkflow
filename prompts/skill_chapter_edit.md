---
name: stage_edit
category: writing
description: 按审稿意见或用户批注对已有 stage 做局部编辑，保留已成立的台词与风格。
when_to_use: 已有剧本基本可用，需要根据审稿意见、批注或局部问题修订时
---

# Stage 局部编辑 (Stage Edit)

目标：在不推倒整个 stage 的前提下，把已有 stage 修到可送审状态。适用于审稿未过、用户批注、台词不足、局部节奏/设定/因果问题。

当 `submit_to_editorial` 返回 `revision_strategy.action = "stage_edit"` 时，必须优先使用本 skill。尤其是 `grade = light/medium`、审稿分数较高、问题集中在 AI 腔、局部动机链、局部伏笔补强、少量节奏调整时，不要整个 stage 重写。

如果返回里包含 `revision_strategy.revision_brief`，它是本轮最高优先级的改稿简报。先照 brief 修，不要把慢审意见和人类批注混成一次大重写。若 `revision_strategy.action = "stop_auto_revision"`，停止改稿并向人类汇报，不要继续自循环。

## 工作顺序

1. 先用 `read_file` 读取 `03_Scripts/{packageId}.yaml` 中对应 stage 的内容，确认当前剧本。
2. 按需读取 `read_outline`、`search_lore`、`read_graph`，只补必要上下文。
3. 用 `load_skill("exemplar_study")` 与 `browse_examples` 查当前问题对应的短例子。AI 腔问题优先查 `ai_tone/camera_blocking`、`ai_tone/rhetoric_pileup`、`ai_tone/explanatory_afterthought`。
4. 把问题分成三类：
   - 必修：审稿失败项、用户明确批注、设定矛盾、因果断裂。
   - 应修：节奏塌陷、dialogue/action/narration 比例失衡、AI 腔明显。
   - 可留：不影响本 stage 通过的风格偏好。
5. 优先做局部 line 替换、插入新 line、补桥段和收束，不要无理由整 stage 重写。
6. 保存前自检：stage 至少有 5 行有效 Line；dialogue 类型行必须有 speaker；direction 只在氛围转折时设置。若命中镜头链、破折号说明、后置解释，先删改再保存。
7. 用 `save_script` 保存完整新版本。若用户要求送审：
   - 轻微/局部修改默认调用 `submit_to_editorial` 时传 `review_scope: "failed_only"`，只复审上一轮未过的审稿人。
   - 如果你改动了 stage 结构、设定事实、角色动机或末尾收束，改用 `review_scope: "full"`。
   - 无论局部复审还是全量复审，stage 最终通过都必须满足本轮慢审通过并由用户在工作台明确"人类通过"，或用户直接人审通过。

## 编辑策略

- 保留已经有效的开头、人物互动、笑点、动作线和伏笔。
- 扩写时优先补"有功能"的 line：冲突升级、信息差、选择代价、人物反应。
- 不要机械加水。每条新增 line 都要服务 stage 目标、角色状态或下一 stage 钩子。
- 批注要求互相冲突时，先处理硬约束，再在回复里说明取舍。
- 如果审稿意见或 `revision_strategy.action` 明确指出结构整体不成立，切换到 `stage_rewrite`。

## AI 腔局部手术

- 遇到 `Camera_Blocking_Density`，优先删除而不是换一种镜头写法：把连续动作链压成一两句处境判断。
- 不要用新增光线、脚步、湿气、呼吸、视线移动来补偿被删掉的镜头感。
- 遇到 `Rhetoric_Pileup`，每 10 行最多保留 1 个明显比喻；吐槽可以留下，但必须短、准、贴着角色当下判断。
- 遇到 `Explanatory_Afterthought` 或用户指出"后置说明/补丁解释"，优先直接删除解释句。
- 遇到 `Broken_Causality`、`PTSD_Missing` 这类局部桥段问题，插入必要因果或情绪反应的 line 即可，不要推翻 stage 主事件。

## 输出要求

- 保存的是完整 stage 的所有 lines，不是补丁片段。
- 回复用户时列出已处理的主要批注/审稿点。
- 如果仍未送审，明确说明原因和下一步。
