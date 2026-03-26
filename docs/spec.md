# AutoNovel-Studio v4.5 — "双管齐下" 架构升级与审批流革命规格书

> **分析日期**: 2026-03-18
> **分析范围**: 全项目代码库 + 后端工作流引擎 + UI/UX 操作体验
> **流程状态**: 架构师分析阶段 (Locked by Superpower + Ralph-loop)
> **目标版本**: v4.5 (核心目标：建立自顶向下的防呆架构、探讨空间及 Inbox 审批界面)

---

## 一、 系统现状与痛点聚焦

在原有 v4.0 UI 革命设计（VSCode 式多 Tab 面板）基础上，暴露出深层次的架构断层：
1. **生成流程僵化，无全局管控**：当前的流程式“无头苍蝇式单点生成”，缺乏“作品 -> 卷 -> 章 -> 场景”自顶向下的层级结构强管控。
2. **缺乏细纲调整与讨论空间**：当正文生成偏离预期或被否决时，只能盲目重生。核心问题往往出在“细纲或提示词偏差”，必须允许人类在中间阶段进行干预（修改细纲）并向作者 Agent 注入“额外指令”。
3. **状态未做防呆持久化**：切 Tab 丢失状态，系统若崩溃进度全无，人工需一直盯着屏幕。
4. **自动化与审批割裂**：不能做真正的“挂机生成”，缺乏失败自愈循环与远程通知机制。

---

## 二、 核心架构重构设计

### 2.1 严格的数据流转护栏与 Checkpoint 持久化
全面引入基于文件的状态机检查点，绝不能丢失进度。
* **数据流转护栏**：`Book Meta -> Volume Outline(卷纲) -> Chapter Outline(章节细纲) -> Scene Beats(场景段落提示) -> Draft(正文草稿) -> Review(审查/打分)`
* **防呆写入**：在状态机每一次跃迁后，必须原子级覆写至 `.checkpoint/` 目录。
* **爆炸半径控制**：任一章节被打回，重写范围必须严格约束在该章的 `Chapter Outline` 之内。大纲不变，行文连贯性就不会崩盘。

### 2.2 Inbox 审批流与讨论空间 (Human-in-the-Loop)
抛弃“人盯屏幕看进度”的模式，重装为 **Inbox（收件箱）代码审查流**：
1. **异步队列**：后端由 `ShowrunnerWorkflow` 转为后台队列执行，生成至关键节点（如大纲完成、正文完成）自动挂起并推送至前端 Inbox。
2. **树状大纲编辑器区 (Tree Editor)**：系统生成细纲后阻塞停下，用户此时可在界面中对 Volume -> Chapter -> Scene Beat 每一层级进行可视化拖拽编辑与润色。
3. **细纲微调与作者指令注入（Discussion Space）**：若正文审查不通过，系统不是盲目重试，而是提供一个**“干预与讨论空间”**。人类此时可以：
   - A. 修改当前出问题的场景细纲 (Scene Beat)。
   - B. 补充一段“人类导演干预指令（Director Note）”，这会作为强制 Prompt 挂载到下述 Author Agent 的重试调用中。
4. **决策一键化**：用户只需点 `Approve` (通过并继续下一章) 或 `Request Changes` (打回并注入指令)。

### 2.3 闭环体系：引擎自愈纠错与 Webhook 远程通知
* **3-Retry 内部自愈**：当正文生成完毕立刻并发投喂 4 个 Reader Agent 打分 -> 汇总 -> 编辑 Agent 若判定不达标（如总分低于基准），内核触发自愈并带上 编辑 Agent 的批评意见重试。
* **挂起与通知**：重试 3 次仍不达标，或触发正常的人类大纲/正文审批节点，触发 Webhook（Telegram Bot / 飞书 Webhook）。通知将包含：
  - [任务状态]：等待大纲审核 / 场景生成失败等待指导 / 本章审核通过
  - [摘要内容]：Reader 的评分雷达、本段正文的一小段摘录。
  - 实现“电脑挂机，手机审批断点续传”。

---

## 三、 UI 界面映射调整 (V4.5)

向前端的 `VSCode 五区布局` 增加对应的专属面板：
* **Panel: 审批收件箱 (Inbox / PR List)**
  替代或融合审核仪表盘，作为用户的首要待办中心。
* **Main Tab: 大纲树编辑器 (Outline Tree Editor)**
  可展开/折叠的无限极树形节点，允许对小说骨架可视化编辑。
* **Side Panel: 讨论与干预台 (Director's Space)**
  当审核被打回时，展示 Reader 矩阵的痛批，上方为该段的细纲可改区域，下方为人类输入给 AI 强制听令的讨论框。
* **Modal: 全局新建项目防呆弹窗**
  补全 Sidebar，创建新书时即立刻初始化文件夹结构及占位 Outline 数据。

---

## 四、 自动化测试与防呆标准 (Tests & Specs)

> **Superpower 约定**：任何业务代码必须能通过这套自动化测试标准，失败则意味着无效提交。

### 4.1 Checkpoint 状态持久化测试 (`test_checkpointing.py`)
- **断言标准**：模拟完整的业务对象（带 Enum 状态、Pydantic 嵌套模型），序列化到 `.checkpoint/test.json` 后再读取，断言两边属性 100% 匹配。
- **容灾标准**：若系统强制模拟崩溃（抛出 Exception），系统重启并从该 Checkpoint 执行 `state_machine.resume()`，必须进入崩溃前的特定 `WAITING_XX` 状态。

### 4.2 引擎内循环自愈与重试逻辑测试 (`test_self_healing_loop.py`)
- **断言标准**：Mock 一个恶意常驻低分的 Reader（固定返回 2 分）。断言 `Editor Agent` 确实触发了拒绝（Reject），并且触发 `Showrunner Workflow` 重新调用了 `Author Agent`。
- **边界防呆**：断言在执行恰好 3 次重连失败后，工作流正确捕获异常并暂停在 `STATE_WAITING_HUMAN_INTERVENTION`，绝对不许死循环。

### 4.3 “干预指令 (Director Note)” 穿透性测试 (`test_human_intervention_prompt.py`)
- **断言标准**：给定人类在 Discussion Space 附带的一句话（例如："男主这里不能笑，要冷酷"），构建最终用于传给 `openai_client` 的 Prompt 时，断言这段字眼**一定出现**在渲染后的 `author_scene.j2` 结果中。

### 4.4 Webhook 非阻塞通知契约测试 (`test_notifier.py`)
- **断言标准**：测试若 Telegram 配置为空或网络不可用（Timeout Mock），Webhook 发送失败但主线程流程绝不能抛错阻断（`try..catch` 防火墙有效）。

---

## 五、 后端 REST API 合约拓展

**收件箱 (Inbox) API**
* `GET /api/v1/inbox` - 获取当前等待人类干预的所有挂起节点列表。
* `POST /api/v1/inbox/{task_id}/approve` - 通过，引擎恢复走向下个状态节点。
* `POST /api/v1/inbox/{task_id}/reject` - 打回。需接收附加的 JSON `{"director_note": "重写这段", "modified_outline": {...}}`。

**状态机节点 (StateMachine) 核心变更**
1. `STATE_GENERATING_DRAFT` (运行中)
2. `STATE_REVIEWING_DRAFT` (运行中)
3. `STATE_WAITING_OUTLINE_APPROVAL` (新阻塞点)
4. `STATE_WAITING_DRAFT_APPROVAL` (新阻塞点)
5. `STATE_WAITING_HUMAN_INTERVENTION` (新阻塞点：自愈彻底失败)
