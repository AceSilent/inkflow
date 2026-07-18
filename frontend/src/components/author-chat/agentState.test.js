import { describe, expect, it } from 'vitest'
import { agentLifecycleState } from './agentState'

describe('agentLifecycleState', () => {
  it('uses a thinking state for the model/tool loop', () => {
    expect(agentLifecycleState('agent_loop')).toEqual({
      token: '正在斟酌',
      label: '语气与视线顺序',
    })
  })

  it('uses a preparing state before the first backend phase arrives', () => {
    expect(agentLifecycleState('init')).toEqual({
      token: '正在准备',
      label: '上下文',
    })
  })

  it('keeps backend setup phases in the same animated thinking treatment', () => {
    expect(agentLifecycleState('history_load_start')).toEqual({
      token: '正在阅读',
      label: '对话历史',
    })
    expect(agentLifecycleState('context_start')).toEqual({
      token: '正在梳理',
      label: '上下文与作者记忆',
    })
  })

  it('falls back to thinking instead of the old working state', () => {
    expect(agentLifecycleState('unknown_future_phase')).toEqual({
      token: '正在斟酌',
      label: '语气与视线顺序',
    })
  })
})
