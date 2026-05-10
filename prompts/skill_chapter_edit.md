---
name: chapter_edit
category: writing
description: 按审稿意见或用户批注对已有章节做局部编辑、扩写和补强，尽量保留已成立的段落与文风。
when_to_use: 已有草稿基本可用，需要根据审稿意见、批注、字数不足或局部问题修订时
---

# 章节局部编辑 (Chapter Edit)

目标：在不推倒整章的前提下，把已有章节修到可送审状态。适用于审稿未过、用户批注、字数不足、局部节奏/设定/因果问题。

当 `submit_to_editorial` 返回 `revision_strategy.action = "chapter_edit"` 时，必须优先使用本 skill。尤其是 `grade = light/medium`、审稿分数较高、问题集中在 AI 腔、标点、局部动机链、局部伏笔补强、少量节奏调整时，不要整章重写。

如果返回里包含 `revision_strategy.revision_brief`，它是本轮最高优先级的改稿简报。先照 brief 修，不要把慢审意见和人类批注混成一次大重写。若 `revision_strategy.action = "stop_auto_revision"`，停止改稿并向人类汇报，不要继续自循环。

## 工作顺序

1. 先用 `read_file` 读取 `04_Drafts/{chapter_id}.md`，确认当前草稿。
2. 按需读取 `read_outline`、`search_lore`、`read_graph`，只补必要上下文。
3. 用 `load_skill("exemplar_study")` 与 `browse_examples` 查当前问题对应的短例子。AI 腔问题优先查 `ai_tone/camera_blocking`、`ai_tone/rhetoric_pileup`、`ai_tone/explanatory_afterthought`；系统说明问题查 `system_info/webnovel_clean`。
4. 把问题分成三类：
   - 必修：审稿失败项、用户明确批注、设定矛盾、因果断裂。
   - 应修：节奏塌陷、动作/环境/对话比例失衡、AI 腔明显。
   - 可留：不影响本章通过的风格偏好。
5. 优先做局部替换、插段、补桥段和收束，不要无理由整章重写。
6. 保存前自检：章节正文必须不少于 2500 字符；低于门槛时补动作、环境、对话、内心、冲突推进和章末钩子。若命中镜头链、破折号说明、后置解释或系统说明水段，先删改再保存。
7. 用 `save_draft` 保存完整新版本。若用户要求送审：
   - 轻微/局部修改默认调用 `submit_to_editorial` 时传 `review_scope: "failed_only"`，只复审上一轮未过的审稿人。
   - 如果你改动了章节结构、设定事实、角色动机或章末收束，改用 `review_scope: "full"`。
   - 无论局部复审还是全量复审，章节最终通过都必须满足本轮慢审通过并由用户在工作台明确“人类通过”，或用户直接人审通过。

## 编辑策略

- 保留已经有效的开头、人物互动、笑点、动作线和伏笔。
- 扩写时优先补“有功能”的内容：冲突升级、信息差、选择代价、人物反应。
- 不要机械加水。每个新增段落都要服务章节目标、角色状态或下一章钩子。
- 批注要求互相冲突时，先处理硬约束，再在回复里说明取舍。
- 如果审稿意见或 `revision_strategy.action` 明确指出结构整体不成立，切换到 `chapter_rewrite`。

## AI 腔局部手术

- 遇到 `Camera_Blocking_Density`，优先删除而不是换一种镜头写法：把连续“踩/停/举手机/看/抹汗/塞兜/抬头/呼吸”等动作链压成一两句处境判断。
- 不要用新增光线、脚步、湿气、呼吸、视线移动来补偿被删掉的镜头感。修完后检查开头 800 字，不能连续多段都靠身体动作推进。
- 遇到 `Rhetoric_Pileup`，每 800 字最多保留 1 个明显比喻；吐槽可以留下，但必须短、准、贴着主角当下判断。
- 遇到 `Explanatory_Afterthought` 或用户指出"后置说明/补丁解释"，优先直接删除解释句。保留前一句有效信息，不要换一种方式继续解释机制。
- 遇到系统/APP/短信水段，只保留“当下能做什么”和“代价/压力是什么”。功能列表、概率、背包、商城规则延后到真正需要使用时再写。
- 遇到 `Broken_Causality`、`PTSD_Missing` 这类局部桥段问题，插入必要因果或情绪反应即可，不要推翻章节主事件。

## 输出要求

- 保存的是完整章节，不是补丁片段。
- 回复用户时列出已处理的主要批注/审稿点。
- 如果仍未送审，明确说明原因和下一步。
