const PHASE_STATES = {
  init: { token: 'thinking', label: '准备上下文' },
  history_load_start: { token: 'thinking', label: '读取对话历史' },
  history_load_done: { token: 'thinking', label: '对话历史已读取' },
  snapshot_start: { token: 'thinking', label: '创建会话快照' },
  snapshot_done: { token: 'thinking', label: '快照已保存' },
  context_start: { token: 'thinking', label: '整理上下文' },
  context_done: { token: 'thinking', label: '上下文已整理' },
  agent_loop: { token: 'thinking', label: '模型与工具链运行中' },
  agent_loop_start: { token: 'thinking', label: '模型与工具链运行中' },
}

export function agentLifecycleState(phase) {
  return PHASE_STATES[phase] || { token: 'thinking', label: '处理中' }
}
