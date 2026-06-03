import { describe, expect, it } from 'vitest'
import { agentLifecycleState } from './agentState'

describe('agentLifecycleState', () => {
  it('uses a thinking state for the model/tool loop', () => {
    expect(agentLifecycleState('agent_loop')).toEqual({
      token: 'thinking',
      label: '模型与工具链运行中',
    })
  })

  it('uses a preparing state before the first backend phase arrives', () => {
    expect(agentLifecycleState('init')).toEqual({
      token: 'thinking',
      label: '准备上下文',
    })
  })

  it('keeps backend setup phases in the same animated thinking treatment', () => {
    expect(agentLifecycleState('history_load_start')).toEqual({
      token: 'thinking',
      label: '读取对话历史',
    })
    expect(agentLifecycleState('context_start')).toEqual({
      token: 'thinking',
      label: '整理上下文',
    })
  })

  it('falls back to thinking instead of the old working state', () => {
    expect(agentLifecycleState('unknown_future_phase')).toEqual({
      token: 'thinking',
      label: '处理中',
    })
  })
})
