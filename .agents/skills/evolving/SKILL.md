---
description: "AutoNovel Evolution -- 以50章玄幻小说为靶心, 永不满足地迭代系统的创作能力"
---

# AutoNovel 自适应进化

**系统的价值 = 它能写出的小说质量。** 但一个跑不通的系统写不出任何东西。

前几轮循环着重修复代码问题（emoji清除、死路径、未测试的管线）。
系统进化到能稳定跑通后，再开始写小说，用真实产出驱动后续迭代。

**声明**: "I'm using the AutoNovel Evolution skill. Level: {level}. Stability: {grade}. Phase: {code_stabilization|novel_production}."

---

## 系统现状快照（供首次执行参考）

当前架构中的审阅Agent（**不是**"读者"，是**编辑部**）：

**场景级审阅 (3 位)**:
- scene_lore_checker (reader_scene_lore.j2) -- 设定合规检查
- scene_pacing_reviewer (reader_scene_pacing.j2) -- 节奏/物理引擎检查
- scene_ai_tone_detector (reader_scene_ai_tone.j2) -- AI腔调检测

**章节级审阅 (4 位)**:
- lore_keeper (reader_lore_keeper.j2) -- 全章设定守门人
- pacing_junkie (reader_pacing_junkie.j2) -- 全章节奏审查
- anti_trope_scanner (reader_anti_trope.j2) -- 俗套/反矫情检测
- anti_ai_tone_scanner (reader_ai_tone.j2) -- 全章AI味检测

**终审 (1 位)**:
- editor (editor_review.j2) -- 总编辑仲裁, 决定 pass/reject

共 **8 位审阅Agent**，不是3位。代码注释和UI中残留"3位读者""4位读者"等过时描述需清理。

---

## 第一步: 感知系统状态

每轮改进前评估：

```
1. 代码健康
   python -m pytest tests/core/ -v -s 2>&1 | tail -5
   cd frontend && npx vite build 2>&1 | tail -3

2. 最近改动
   git log --oneline -10

3. 已知代码债务
   有多少 emoji 残留？
   有多少 hardcoded 字符串？
   有多少死代码/未使用的 import？
   哪些模块没有测试覆盖？

4. 产出物评估（稳定后才需要）
   books/ 下是否有书？
   最新章节评审评分？
   有没有 NEEDS_HUMAN 卡死的场景？
```

**稳定性等级判定:**

| 等级 | 条件 | 允许操作 |
|------|------|---------|
| [HIGH] | 测试全绿 + 前端构建通过 + pipeline完整跑通 >= 3章 | L1-L5 |
| [MID] | 测试全绿 + 前端构建通过 + pipeline报错但不崩溃 | L1-L3 |
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

**代码卫生 (前几轮优先)**:
- 清除代码中的 emoji（系统/角色提示词、前端组件、模板）
  - 用 lucide-react 图标 或纯文字替代前端 emoji
  - 用方括号标签替代提示词中的 emoji（如 `[作者]` 替代 `✍️`）
  - prompts/ 中教学用的对错标记(如示例中的 `正确:` `错误:`)用纯文字
- 消除 warning、清理死代码、修复 import 顺序
- 改 print -> logger
- 补 docstring 和类型标注
- 修复过时的注释（如"3位读者"应改为"8位编辑部成员"）

**Prompt 微调**:
- 只在有真实产出暴露问题时才改 prompt，不凭空优化
- 基于评审报告中出现频率 >= 3 次的同类 issue 做针对性调整

禁止:
- 在没有看到真实输出问题之前凭直觉改 prompt
- 加入任何占位符、假数据、硬编码常量
- 用 emoji 替代已清理的 emoji

产出: 1 个精确 commit

### L2 -- 工程师 (稳定性 >= MID)

**补测试 (前几轮优先)**:
- 为没有测试的核心模块补充测试
  - scene_pipeline.py: 测试 detail outline 生成、场景拆分、审阅流程
  - groupchat_orchestrator.py: 测试消息路由、轮转逻辑、PASS检测
  - book_manager.py: 测试 CRUD、路径管理、目录创建
  - agent_memory.py: 测试记忆存取、上下文构建
  - openai_client.py: 测试 JSON 解析策略、流式响应处理
- 测试必须使用 Mock 替代真实 LLM 调用（这是单元测试的 mock，不是产出的 mock）
- 每个测试文件 >= 5 个有意义的 test case

**代码修复**:
- 增强 agent tool 的边界处理和错误信息
- 修复 Skill .md 内容中的问题（基于真实产出中的反复错误）
- 修复审阅 prompt 模板减少误判
- 优化 scene_pipeline 的重试策略
- 统一 JSON 解析逻辑（当前 openai_client + scene_pipeline 各自重复实现）

**前端修复**:
- 清除前端组件中的 emoji（GroupChatPanel, ChapterEditor, ReviewPanel 等）
- 用 lucide-react 图标组件替代（如 Crown, Lightbulb, Skull, PenTool, User）
- 更新 ReviewPanel 中的"3位/4位"硬编码描述
- 修复 UI 中任何硬编码的角色名/数量

产出: 1-2 个 commit

### L3 -- 架构师 (稳定性 = HIGH)

**管线改进**:
- 新增 pipeline 阶段（如: 章节间连贯性检查、伏笔跟踪）
- 重构 scene_pipeline 中重复的 JSON 解析代码为公共工具
- 改进 plot_tree 与 outline 的衔接（树 -> 大纲自动化）
- 新增 agent tool（必须有明确的使用场景和测试）
- 统一错误处理模式

**编辑部优化**:
- 评估 8 位审阅Agent 的有效性（哪些高价值、哪些冗余）
- 调整审阅 Agent 数量或合并职责
- 改进 editor 仲裁逻辑（当前过于简单的 pass/reject 二元判定）

流程:
1. 先在 docs/improvements.md 记录设计意图
2. 实施
3. 跑通至少 1 章 pipeline 验证
4. 后续至少 2 轮守 (L1-L2)

产出: 1-3 个 commit + 文档

### L4 -- 技术总监 (稳定性 = HIGH + 连续 3 章以上产出)

**新子系统**:
- 卷级 pipeline（多章连续生成 + 跨章连贯性保障）
- 写作记忆系统升级（角色行为轨迹追踪、伏笔清单自动化）
- 多模型适配层（针对不同 LLM 的 prompt 策略差异化）
- 大纲到剧情树的自动逆向工程（已有大纲 -> 导入树结构）
- 新的审阅维度或审阅 Agent

流程:
1. 在 docs/improvements.md 写设计 RFC
2. 分阶段实施（每阶段不超过 3 个文件改动）
3. 每阶段结束跑 pipeline 验证
4. 后续至少 3 轮守

产出: RFC + 分步 commit

### L5 -- 首席创意官 (里程碑节点 / L1-L4 收益递减)
不写代码。做战略审计。

框架:
1. **产出审计**: 读最近 10 章成品，逐项打分
2. **瓶颈定位**: 限制产出质量的最大瓶颈是 prompt / pipeline / 模型能力 / 系统架构？
3. **编辑部有效性**: 8 位审阅 Agent 哪些反馈有价值？哪些在制造噪声？
4. **Skill 有效性**: 9 个 Skill 哪些被高频使用？哪些从未使用？
5. **路线图**: 下一个里程碑需要什么系统级改进？
6. **该砍什么**: 哪些模块增加了复杂度但没有提高产出质量？

产出: 写入 docs/strategy/ 目录
触发: 每 20 轮一次 / 完成一卷(10章)后

---

## 第三步: 执行

### 通用铁律

1. **每轮只做一个改进**, 保持变更小而聚焦
2. **先 git log --oneline -10** 看最近提交, 不重复已做过的
3. **禁止 emoji**: 系统提示词、代码、前端、模板中不使用任何 emoji 字符
   - 前端状态指示用 lucide-react 图标
   - 提示词中角色标识用方括号 `[作者]` `[编辑]` 格式
   - 教学示例中"对/错"标记用 `[O]` `[X]` 或纯文字 `正确:` `错误:`
4. **禁止 mock 数据**: 不在代码中放置任何假数据作为功能替代。单元测试中 mock LLM 调用是允许的
5. **禁止硬编码**: 配置走 settings/env、常量走 models.py、提示词走 prompts/ 目录
6. **不改测试去适应代码**: 测试是规格书。代码必须通过测试, 不是反过来
7. **commit 前跑测试**: python -m pytest tests/core/ -v -s
8. **禁止终端 API 调用**: 不得用 curl/httpie/python 脚本直接调用系统 API 来测功能

### 攻守节奏

根据稳定性动态调整:
- [HIGH]: 攻 3-5 轮 -> 守 1-2 轮
- [MID]: 攻 1-2 轮 -> 守 1-2 轮
- [LOW]: 连续守直到全绿
- [BROKEN]: 修到能跑为止

---

## 第四步: 两阶段目标

### 阶段 A: 系统稳固化 (前 N 轮, 直到进入 [HIGH])

这个阶段不写小说，专注让系统本身跑通。

检查清单:

```
代码卫生:
  [ ] 全部源码(.py, .jsx, .j2, .md) 中 emoji 数量 = 0
  [ ] 全部 Agent 系统提示词已去除 emoji，用纯文字标识
  [ ] 前端组件已用 lucide-react 图标替代 emoji
  [ ] 没有 print() 调试语句残留（全用 logger）
  [ ] 没有未使用的 import
  [ ] 过时注释已更新（如"3位读者"）

测试覆盖:
  [ ] tests/core/ 目录下 >= 8 个测试文件
  [ ] 每个核心模块至少有基础的 CRUD/Happy-path 测试
  [ ] python -m pytest tests/core/ -v -s 全绿
  [ ] 前端 npx vite build 通过

管线可用:
  [ ] 服务能正常启动 (uvicorn)
  [ ] 创建书籍 -> 不报错
  [ ] AuthorChat 能发消息、收到流式回复
  [ ] Agent 能正确调用 tool（至少 list_skills, load_skill, read_tree）
  [ ] scene_pipeline 的 generate_chapter_detail_outline 能跑通（需要真实 LLM）
```

进入 [HIGH] 的判定:
- 上述 checklist 全部打勾
- 连续 3 轮无回归

### 阶段 B: 小说量产 (系统稳固后)

目标: 用本系统完整写出玄幻网文的前 50 章。

#### Phase B1: 基础通路 (第1-3章)
让 pipeline 完整跑通 1 章

验证:
- 书籍已创建, book_meta.json 存在
- 世界设定和角色设定已录入
- 剧情树根节点到第一卷第一弧已 confirmed
- 大纲已生成 (卷纲+章纲)
- scene_pipeline 能跑通: 大纲拆分 -> 场景 -> 冰山 -> 起草 -> 7位编辑部审阅 -> 总编仲裁 -> 组装
- 每章 3000-5000 字
- 编辑部平均评分 >= 5.0

#### Phase B2: 质量攀升 (第4-10章)
消灭高频 issue, 提升评分

验证:
- 编辑部平均评分 >= 6.5
- 0 个 severity >= 5 的 issue
- 没有连续 2 章出现相同 error_type
- AI 腔调检测(anti_ai_tone)通过率 >= 80%
- 角色对话有辨识度

#### Phase B3: 连贯性 (第11-30章)
跨章节连贯, 伏笔管理, 角色弧线

验证:
- 角色信息跨 5 章保持一致
- 伏笔有埋有收（通过剧情树 causality 跟踪）
- 卷级节奏符合三幕式结构
- 编辑部平均评分 >= 7.0
- 每章通过率(pass_status=true) >= 70%

#### Phase B4: 量产稳定 (第31-50章)
系统无需人工干预连续产出

验证:
- 连续 5 章零人工干预完成
- NEEDS_HUMAN 发生率 < 10%
- 编辑部平均评分 >= 7.5
- 总字数达到 15-25 万字
- 剧情树完整覆盖全卷

---

## 永不满足的判定

改进完成后回答以下问题。只要有一个"否"，就继续改进:

**阶段 A 判定 (系统稳固化)**:
```
emoji 残留数量是否 = 0 ?
全部单元测试是否通过 ?
前端是否能构建成功 ?
是否有核心模块缺少测试 ?
过时注释/文档是否全部更新 ?
```

**阶段 B 判定 (量产后)**:
```
已完成章节数是否 >= 50 ?
最新章节编辑部平均评分是否 >= 7.0 ?
最新章节是否通过总编仲裁 (pass_status = true) ?
最新章节是否有 0 个 severity >= 4 的 issue ?
连续 3 章是否没有相同 error_type 重复出现 ?
```

---

## 验证方式

所有验证必须通过以下方式完成（禁止终端 API/脚本调用）:

**A. 单元测试** -- python -m pytest tests/core/ -v -s
**B. 前端构建** -- cd frontend && npx vite build
**C. 文件系统检查** -- ls/cat/grep 查看产出文件
**D. 浏览器 UI** -- 在 AuthorChat 中实际操作，观察结果
**E. 代码审计** -- grep 搜索 emoji/hardcode/dead-code

---

## 参数

通过 $ARGUMENTS 控制:
- `--level=L0..L5` : 强制指定级别
- `--mode=attack` : 本轮强制攻
- `--mode=defend` : 本轮强制守
- `--mode=auto` (默认): 自适应
- `--target=<module>` : 指定目标模块 (如 scene_pipeline, groupchat, frontend)
- `--phase=A|B1|B2|B3|B4` : 强制指定当前阶段

---

## 改进记录

每轮改进后在 docs/improvements.md 追加:

```markdown
## Round {N} -- {date}

**Phase**: A / B{n}
**Stability**: [HIGH/MID/LOW/BROKEN]
**Level**: L{n}
**Change**: {一句话描述}
**Reason**: {基于什么问题做的改进}
**Verify**: {怎么确认改进有效}
**Next**: {下一轮应该做什么}
```
