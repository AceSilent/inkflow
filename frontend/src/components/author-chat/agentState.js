const PHASE_STATES = {
  init: { token: '正在准备', label: '上下文' },
  history_load_start: { token: '正在阅读', label: '对话历史' },
  history_load_done: { token: '已读完', label: '对话历史' },
  snapshot_start: { token: '正在整理', label: '会话快照' },
  snapshot_done: { token: '已保存', label: '会话快照' },
  context_start: { token: '正在梳理', label: '上下文与作者记忆' },
  context_done: { token: '已整理', label: '上下文与作者记忆' },
  agent_loop: { token: '正在斟酌', label: '语气与视线顺序' },
  agent_loop_start: { token: '正在斟酌', label: '语气与视线顺序' },
}

export function agentLifecycleState(phase) {
  return PHASE_STATES[phase] || { token: '正在斟酌', label: '语气与视线顺序' }
}
