---
description: "AutoNovel Evolution -- 以50章玄幻小说为靶心, 永不满足地迭代系统的创作能力"
---

# AutoNovel 自适应进化

以**真实产出**代替 mock 测试。系统的价值 = 它能写出的小说质量。

**声明**: "I'm using the AutoNovel Evolution skill. Target: {level}. Stability: {grade}."

---

## 第一步: 感知系统状态

每轮改进前，按以下顺序评估：

```
1. 代码健康
   python -m pytest tests/core/ -v -s 2>&1 | tail -5

2. 最近改动
   git log --oneline -10

3. 产出物评估（核心）
   检查 books/ 目录：是否有正在写的书？
   最新章节的 reader 评分是多少？
   是否有 NEEDS_HUMAN 卡死的场景？
   剧情树 confirmed 到第几章？
```

**稳定性等级判定:**

| 等级 | 条件 | 允许操作 |
|------|------|---------|
| [HIGH] | 测试全绿 + 最近5轮无回归 + pipeline能跑通至少3章 | L1-L5 |
| [MID] | 测试全绿但pipeline有报错/评分偏低 | L1-L3 |
| [LOW] | 有测试失败 或 pipeline完全跑不通 | L1-L2 |
| [BROKEN] | 服务启动失败 或 前端构建失败 | L0 紧急修复 |

---

## 第二步: 选择改进级别

### L0 -- 急救 (任何时候)
- 修复让服务无法启动的致命错误
- 修复前端构建失败
- 修复阻断 pipeline 的异常
- **判完即做, 不犹豫**

### L1 -- 工匠 (随时可做)
对象: prompt 文案、日志、类型标注、代码卫生

可做的事:
- 改进 system prompt 的措辞（必须基于真实产出反馈，不凭空优化）
- 消除 warning、清理死代码、修复 import 顺序
- 补 docstring、改 print -> logger
- 修复非阻断性 bug

禁止:
- 在没有看到真实输出问题之前改 prompt
- 加入占位符或假数据

产出: 1 个精确 commit

### L2 -- 工程师 (稳定性 >= MID)
对象: 工具函数、Skill 内容、Reader/Editor 模板

可做的事:
- 增强 agent tool 的边界处理和错误信息
- 改进 Skill .md 的内容（基于真实产出中的反复问题）
- 改进 Reader 评审 prompt 减少误判
- 优化 scene_pipeline 的重试策略
- 为核心路径补充测试
- 修复真实写作中发现的 bug

决策依据:
- 翻看 books/{book_id}/reviews/ 中的评审报告
- 统计 issues 的 error_type 分布
- 找到出现频率 >= 3 次的同类问题，针对性优化

产出: 1-2 个 commit

### L3 -- 架构师 (稳定性 = HIGH)
对象: 管线架构、新模块、跨模块重构

可做的事:
- 新增 pipeline 阶段（如: 章节间连贯性检查）
- 重构 scene_pipeline 的状态机
- 改进 plot_tree 与 outline 的衔接
- 新增 agent tool（必须有明确的使用场景）
- 统一 JSON 解析策略、错误处理模式

流程:
1. 先在 docs/improvements.md 记录设计意图和改动范围
2. 实施
3. 跑通至少 1 章 pipeline 验证
4. 后续至少 2 轮守（L1-L2）

产出: 1-3 个 commit + 文档

### L4 -- 技术总监 (稳定性 = HIGH + 连续 3 章以上产出)
对象: 新子系统、核心架构演进

可做的事:
- 新的 pipeline 模式（如: 卷级pipeline、多卷连续生成）
- 写作记忆系统升级（角色行为跟踪、伏笔清单自动化）
- 多模型协作优化（针对不同 LLM 的 prompt 适配层）
- 大纲到剧情树的自动化转换引擎
- 新的评审维度/评审 Agent

流程:
1. 在 docs/improvements.md 写设计 RFC
2. 分阶段实施（每阶段不超过 3 个文件改动）
3. 每阶段结束跑 pipeline 验证
4. 后续至少 3 轮守

产出: RFC + 分步 commit

### L5 -- 首席创意官 (里程碑节点 / L1-L4 收益递减 / 显式触发)
对象: 不写代码。做战略思考。

框架:
1. **产出审计**: 读最近 10 章的成品，打分（设定一致性/节奏/对话质量/信息差运用/AI味浓度）
2. **瓶颈定位**: 当前限制产出质量的最大瓶颈是什么？是 prompt？是 pipeline？是模型能力？
3. **Skill 有效性**: 9 个 Skill 哪些被高频使用？哪些从未使用？未使用的要么改要么删
4. **Reader 有效性**: 7 个 Reader Agent 哪些反馈有价值？哪些只在制造噪声？
5. **路线图**: 下一个里程碑是什么？需要什么系统改进才能到达？
6. **该砍什么**: 哪些模块增加了复杂度但没有提高产出质量？

产出: 写入 docs/strategy/ 目录

触发条件: 每 20 轮一次 / 完成一卷(10章)后 / 显式 --level=L5

---

## 第三步: 执行

### 通用铁律

1. **先看产出再改代码**: 每轮必须先读 1 章最新成品和评审报告，再决定改什么
2. **一轮一改**: 每轮只做一个改进，保持变更小而聚焦
3. **禁止 mock 数据**: 所有验证必须走真实 LLM 调用（通过 UI 操作 或阅读已有产出文件）
4. **禁止硬编码**: 配置走 settings、常量走 models、提示词走 prompts/ 目录
5. **不改测试去适应代码**: 测试是规格书。代码必须通过测试,不是反过来
6. **commit 前跑测试**: python -m pytest tests/core/ -v -s
7. **禁止终端 API 调用**: 不得用 curl/httpie/python 脚本直接调用系统 API 来"测试功能"——所有功能验证通过检查产出文件或浏览器 UI 完成

### 永不满足的判定标准

改进完成后，必须回答以下问题。只要有一个答案是"否"，就继续改进：

```
产出存在检查:
  books/ 下是否有至少一本书？
  该书是否有 plot_tree/tree.json ?
  该书是否有至少 1 章 committed 的 draft?

如果以上有"否": 优先让系统能完整跑通 1 章

质量检查（需要有产出后才问）:
  最新章节的 reader 平均评分是否 >= 7.0 / 10 ?
  最新章节是否通过 editor 审核（pass_status = true）?
  最新章节是否有 0 个 severity >= 4 的 issue?
  连续 3 章是否没有相同 error_type 重复出现?

如果以上有"否": 定位原因,做针对性改进

规模检查:
  已完成章节数是否 >= 50?
  剧情树 confirmed 路径是否覆盖到第 50 章?
  每章字数是否在 3000-5000 字范围内?

如果以上有"否": 继续推进
```

### 攻守节奏

不设死板交替。根据稳定性动态调整：
- [HIGH]: 攻 3-5 轮 -> 守 1-2 轮
- [MID]: 攻 1-2 轮 -> 守 1-2 轮
- [LOW]: 连续守直到全绿
- [BROKEN]: 修到能跑为止

### 验证方式（禁用脚本调用）

所有验证必须通过以下方式之一完成：

**A. 文件系统检查**（允许）
```
# 检查最新产出
ls books/{book_id}/drafts/
cat books/{book_id}/reviews/{chapter_id}.json | python -m json.tool | head -30
cat books/{book_id}/plot_tree/tree.json | python -m json.tool | head -50

# 检查评分
grep -r "immersion_score" books/{book_id}/reviews/ | tail -20
grep -r "pass_status" books/{book_id}/reviews/ | tail -10
```

**B. 浏览器 UI 操作**（允许）
- 打开 AuthorChat，发指令让 Agent 写作
- 观察 tool call 渲染、thinking 展示是否正常
- 检查 Agent 是否正确调用工具链

**C. 单元测试**（允许）
```
python -m pytest tests/core/ -v -s
```

**D. 前端构建**（允许）
```
cd frontend && npx vite build
```

---

## 第四步: 50章目标拆解

### Phase 1: 基础通路 (第1-3章)
优先级: 让 pipeline 能完整跑通 1 章

检查清单:
- 书籍已创建，book_meta.json 存在
- 世界设定和角色设定已录入
- 剧情树根节点到第一卷第一弧已 confirmed
- 大纲（卷纲+章纲）已生成
- scene_pipeline 能跑通: 大纲拆分 -> 3-5 场景 -> 冰山 -> 起草 -> 3读者 -> 编辑 -> 组装
- 每章 3000-5000 字
- reader 平均评分 >= 5.0

### Phase 2: 质量攀升 (第4-10章)
优先级: 消灭高频 issue，提升评分

检查清单:
- reader 平均评分 >= 6.5
- 0 个 severity >= 5 的 issue
- 没有连续 2 章出现相同 error_type
- AI 味道检测(anti_ai_tone)通过率 >= 80%
- 角色对话有辨识度（不是所有人说话一个味道）

### Phase 3: 连贯性 (第11-30章)
优先级: 跨章节连贯性、伏笔管理、角色弧线

检查清单:
- 角色信息在 chapter N 和 chapter N+5 之间一致
- 伏笔有埋有收（通过剧情树的 causality 跟踪）
- 卷级节奏符合三幕式结构
- reader 平均评分 >= 7.0
- 每章通过率(pass_status=true) >= 70%

### Phase 4: 量产稳定 (第31-50章)
优先级: 系统无需人工干预连续产出

检查清单:
- 连续 5 章零人工干预完成
- NEEDS_HUMAN 发生率 < 10%
- reader 平均评分 >= 7.5
- 总字数达到 15-25 万字
- 剧情树完整覆盖全卷

---

## 参数

通过 $ARGUMENTS 控制:
- `--level=L0..L5` : 强制指定级别
- `--mode=attack` : 本轮强制攻
- `--mode=defend` : 本轮强制守
- `--mode=auto` (默认): 自适应
- `--target=<module>` : 指定目标模块
- `--phase=1..4` : 强制指定当前 phase（覆盖自动检测）

---

## 改进记录

每轮改进后，在 docs/improvements.md 追加记录:

```markdown
## Round {N} -- {date}

**稳定性**: [HIGH/MID/LOW]
**级别**: L{n}
**改动**: {一句话描述}
**理由**: {基于什么产出问题做的改进}
**验证**: {怎么确认改进有效}
**下一步**: {下一轮应该做什么}
```
