保存剧本前必须自检：

1. 结构完整：每个 stage 至少有一行 Line。空 stage 会被 self-check 阻断。
2. 分支闭合：所有 choices 的 next_stage 指向真实存在的 stage。断链会被阻断。
3. 终点可达：至少存在一个 terminal stage（无 choices 且无 advance_next），且从起点可达。
4. 孤岛检测：所有 stage 从第一个 stage 出发均可达。不可达的 stage 会被标记为 orphan。
5. 旁白节奏：是否存在连续超过 8 行纯 narration？穿插 dialogue 或 action 打破。
6. Stage 长度：是否有 stage 超过 40 行？考虑在自然断点拆分。
7. 选项标签：所有 choice label 是否 ≤20 字符？过长时精简措辞。
8. Speaker 一致：dialogue 类型的行是否都有 speaker？缺少 speaker 的 dialogue 无法正确渲染。
9. 模板变量：是否使用了 {var_name} 格式？拼写是否与 template_vars 配置一致？
10. Direction 资源：bgm/sfx/bg 引用的资源名是否已定义？缺失的资源不会导致崩溃但会静默跳过。

若自检发现 severity 5 的阻断级问题，必须先修复再调用 save_script。
用 validate_script 工具可以自动运行以上所有检查。
