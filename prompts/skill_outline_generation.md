---
name: outline_generation
category: plotting
description: 大纲生成方法论：从剧情树的confirmed路径生成可执行Markdown大纲。
when_to_use: 需要将剧情树转化为写作施工图时
---

# 大纲生成方法论 (Outline Generation)

> 从剧情图中已确认的主线、伏笔和回收计划生成 AutoNovel 当前标准大纲。大纲是给 Author Agent 的施工图纸，必须用 `save_outline()` 保存为规范 JSON，不要写成 Markdown 文件。

---

## 生成流程

1. `read_graph()` 获取当前剧情图，确认已有 event / setup / payoff / decision / turning_point / convergence 节点。
2. `query_unresolved_setups()` 检查未回收伏笔，决定哪些伏笔需要进入本卷计划。
3. 将剧情图节点按因果顺序排列，形成一条可执行主线：开局事件 → 目标建立 → 阻碍升级 → 转折 → 汇合/爆点 → 章末钩子。
4. 分组为 10 个章节 `ch01` 到 `ch10`，每章必须有目标、冲突、收束点、章末钩子。
5. 生成规范 outline JSON，并调用 `save_outline({ outline_json })` 保存。
6. 不要调用 `save_draft()` 保存大纲；`save_draft()` 只用于 `04_Drafts/chXX.md` 正文章节。

## AutoNovel 大纲 JSON 规范

`save_outline` 只接受当前标准章节树：

```json
{
  "id": "book",
  "type": "book",
  "label": "书名",
  "synopsis": "全书/测试书核心卖点与主线方向",
  "children": [
    {
      "id": "vol1",
      "type": "volume",
      "label": "第一卷：卷名",
      "synopsis": "本卷目标、核心矛盾和阶段结局",
      "children": [
        {
          "id": "ch01",
          "type": "chapter",
          "label": "第一章：章名",
          "summary": "章节目标；核心冲突；关键转折；收束点；章末钩子"
        }
      ]
    }
  ]
}
```

硬约束：

- 顶层必须是 `{ id, type:'book', label, children }`。
- 卷节点必须是 `{ id:'vol1', type:'volume', label, synopsis, children }`。
- 章节节点必须是 `{ id:'ch01', type:'chapter', label, summary }`，id 必须与正文文件 `ch01.md` 对齐。
- 不要使用旧字段 `volumes`、`chapters`、`plot_points`。
- 不要把角色库、世界观、系统设定塞进 outline；这些内容必须用 `save_lore()` 保存。

## 章节 summary 写法

每个 chapter.summary 用 1 段短文本覆盖：

- 章节目标：本章要推进什么主线。
- 核心冲突：人物当下要解决什么具体麻烦。
- 因果链：刺激 → 选择 → 行动 → 结果。
- 收束点：本章结束时状态发生什么变化。
- 章末钩子：读者为什么想看下一章。
- 创作禁区：本章特别要避免的坏味道。

不要写成复杂多层 scene 树，除非用户明确要求精细场景施工图。默认保持 book/volume/chapter 三层，方便前端侧栏、工作台、审稿和正文文件一一对应。

## 从剧情图到大纲的映射规则

| 剧情图节点类型 | 大纲对应 |
|---|---|
| `event` | 章节内发生的关键事件 |
| `setup` | summary 中标注“本章埋伏笔” |
| `payoff` | summary 中标注“回收哪个 setup” |
| `decision` | 章节核心选择或转折动作 |
| `turning_point` | 卷中段或章末强转折 |
| `convergence` | 多线汇合点，通常放在阶段高潮 |

## 质量检查清单

- [ ] outline JSON 能被 `save_outline()` 接受，没有旧字段。
- [ ] 章节 id 从 `ch01` 到 `ch10` 连续，正文文件应对应 `ch01.md` 到 `ch10.md`。
- [ ] 每章 summary 都有目标、冲突、因果、收束点、钩子。
- [ ] 每章都能在剧情图里找到相关节点或伏笔计划。
- [ ] 至少 2 个 setup 有明确 payoff 计划。
- [ ] 至少 1 个 turning_point 和 1 个 convergence 被映射到具体章节。
- [ ] 创作禁区包含具体禁止事项，不写空话。
