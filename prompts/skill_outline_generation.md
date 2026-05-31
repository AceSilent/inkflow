---
name: outline_generation
category: plotting
description: 大纲生成方法论：从剧情树的confirmed路径生成可执行大纲。
when_to_use: 需要将剧情树转化为剧本施工图时
---

# 大纲生成方法论 (Outline Generation)

> 从剧情图中已确认的主线、伏笔和回收计划生成 InkFlow 当前标准大纲。大纲是给编剧 Agent 的施工图纸，必须用 `save_outline()` 保存为规范 JSON，不要写成 Markdown 文件。

---

## 生成流程

1. `read_graph()` 获取当前剧情图，确认已有 event / setup / payoff / decision / turning_point / convergence 节点。
2. `query_unresolved_setups()` 检查未回收伏笔，决定哪些伏笔需要进入本故事包计划。
3. 将剧情图节点按因果顺序排列，形成一条可执行主线：开局事件 → 目标建立 → 阻碍升级 → 转折 → 汇合/爆点 → 分支选项。
4. 分组为 stage 节点，每个 stage 必须有目标、冲突、收束点、末尾钩子或分支选项。
5. 生成规范 outline JSON，并调用 `save_outline({ outline_json })` 保存。
6. 不要调用 `save_script()` 保存大纲；`save_script()` 只用于 stage 的 line-based 剧本。
7. 大纲确认后，按 stage 顺序逐个编写剧本。不要一次性生成整个故事包的所有 stage——先写第一个 stage、用 save_script(package_id, stage_id, stage_json) 保存，确认质量后再写下一个。

## InkFlow 大纲 JSON 规范

`save_outline` 只接受当前标准三层树：

```json
{
  "id": "cultivation-world",
  "type": "project",
  "label": "项目名",
  "children": [
    {
      "id": "prologue_wanderer",
      "type": "story_package",
      "label": "故事包名",
      "children": [
        {
          "id": "arrival",
          "type": "stage",
          "label": "到达",
          "summary": "stage目标；核心冲突；关键转折；收束点；分支或钩子"
        }
      ]
    }
  ]
}
```

硬约束：

- 顶层必须是 `{ id, type:'project', label, children }`。
- 故事包节点必须是 `{ id, type:'story_package', label, children }`。
- Stage 节点必须是 `{ id, type:'stage', label, summary }`。
- 分支 stage 的 id 建议用 `branch_` 前缀标识，如 `branch_calm_wit`。
- 合流 stage 建议用 `convergence` 命名，如 `convergence`。
- 不要使用旧字段 `volumes`、`chapters`、`plot_points`。
- 不要把角色库、世界观、系统设定塞进 outline；这些内容必须用 `save_lore()` 保存。

## Stage summary 写法

每个 stage.summary 用 1 段短文本覆盖：

- Stage 目标：本 stage 要推进什么主线。
- 核心冲突：人物当下要解决什么具体麻烦。
- 因果链：刺激 → 选择 → 行动 → 结果。
- 收束点：本 stage 结束时状态发生什么变化。
- 末尾钩子/分支：分支选项设计或悬念钩子。
- 创作禁区：本 stage 特别要避免的坏味道。

默认保持 project / story_package / stage 三层，方便前端侧栏、工作台、审稿和剧本文件一一对应。

## 从剧情图到大纲的映射规则

| 剧情图节点类型 | 大纲对应 |
|---|---|
| `event` | stage 内发生的关键事件 |
| `setup` | summary 中标注"本 stage 埋伏笔" |
| `payoff` | summary 中标注"回收哪个 setup" |
| `decision` | 分支选项设计或 stage 核心选择 |
| `turning_point` | 故事包中段或 stage 末尾强转折 |
| `convergence` | 多线汇合点，通常设计为 convergence stage |

## 质量检查清单

- [ ] outline JSON 能被 `save_outline()` 接受，没有旧字段。
- [ ] stage id 连续且有逻辑顺序。
- [ ] 每个 stage summary 都有目标、冲突、因果、收束点、分支或钩子。
- [ ] 每个 stage 都能在剧情图里找到相关节点或伏笔计划。
- [ ] 至少 2 个 setup 有明确 payoff 计划。
- [ ] 至少 1 个 turning_point 和 1 个 convergence 被映射到具体 stage。
- [ ] 分支 stage 都有对应的 convergence stage 合流。
- [ ] 创作禁区包含具体禁止事项，不写空话。
