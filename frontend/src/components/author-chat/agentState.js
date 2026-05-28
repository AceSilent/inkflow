const PHASE_STATES = {
  init: { token: 'preparing', label: '准备上下文' },
  agent_loop: { token: 'thinking', label: '模型与工具链运行中' },
}

export function agentLifecycleState(phase) {
  return PHASE_STATES[phase] || { token: 'working', label: '处理中' }
}
