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
      token: 'preparing',
      label: '准备上下文',
    })
  })
})
