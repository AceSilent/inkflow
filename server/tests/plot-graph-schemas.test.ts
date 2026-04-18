import { describe, it, expect } from 'vitest'
import {
  plotNodeSchema,
  plotEdgeSchema,
  addPlotNodeBodySchema,
  addEdgeBodySchema,
} from '../src/routes/schemas.js'

describe('plot graph schemas', () => {
  it('accepts a valid event node', () => {
    expect(plotNodeSchema.parse({
      id: 'evt_1', type: 'event', title: 't', description: '',
      references: ['ch01'], characters: [], status: 'draft',
      created_at: '2026-04-18T00:00:00Z',
    })).toBeTruthy()
  })

  it('rejects chapter type', () => {
    expect(() => plotNodeSchema.parse({
      id: 'evt_1', type: 'chapter', title: 't', description: '',
      references: [], characters: [], status: 'draft',
      created_at: '2026-04-18T00:00:00Z',
    })).toThrow()
  })

  it('rejects arc type', () => {
    expect(() => plotNodeSchema.parse({
      id: 'evt_1', type: 'arc', title: 't', description: '',
      references: [], characters: [], status: 'draft',
      created_at: '2026-04-18T00:00:00Z',
    })).toThrow()
  })

  it('accepts all 6 valid node types', () => {
    const types = ['event', 'setup', 'payoff', 'decision', 'turning_point', 'convergence']
    for (const t of types) {
      expect(plotNodeSchema.parse({
        id: 'n', type: t, title: 't', description: '',
        references: [], characters: [], status: 'draft',
        created_at: '2026',
      })).toBeTruthy()
    }
  })

  it('plotEdgeSchema accepts all 6 edge types', () => {
    const types = ['causes', 'triggers', 'enables', 'blocks', 'pays-off', 'parallel']
    for (const t of types) {
      expect(plotEdgeSchema.parse({
        id: 'e', from: 'a', to: 'b', type: t,
      })).toBeTruthy()
    }
  })

  it('addPlotNodeBodySchema parses valid body', () => {
    const body = {
      type: 'setup', title: '怀表',
      description: '北斗七星', references: ['ch01'],
      characters: ['林舟'],
    }
    expect(addPlotNodeBodySchema.parse(body)).toBeTruthy()
  })

  it('addEdgeBodySchema requires from/to different', () => {
    expect(() => addEdgeBodySchema.parse({
      from: 'a', to: 'a', type: 'causes',
    })).toThrow(/self/i)
  })
})
