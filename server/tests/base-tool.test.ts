import { describe, it, expect } from 'vitest'
import { ToolRegistry, type ToolDefinition } from '../src/tools/base-tool.js'
import { z } from 'zod'

const mockReadTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a file from the book directory',
  parameters: z.object({ relative_path: z.string() }),
  permissionLevel: 'read',
  execute: async ({ relative_path }, ctx) => `content of ${relative_path}`,
}

const mockWriteTool: ToolDefinition = {
  name: 'save_draft',
  description: 'Save a draft file',
  parameters: z.object({ file_path: z.string(), content: z.string() }),
  permissionLevel: 'write',
  isTerminal: false,
  execute: async ({ file_path, content }, ctx) => `saved ${file_path}`,
}

const mockTerminalTool: ToolDefinition = {
  name: 'submit_for_review',
  description: 'Submit draft for human review',
  parameters: z.object({ draft_text: z.string() }),
  permissionLevel: 'write',
  isTerminal: true,
  execute: async ({ draft_text }, ctx) => 'submitted',
}

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    expect(reg.get('read_file')).toBe(mockReadTool)
    expect(reg.get('nonexistent')).toBeUndefined()
  })

  it('should identify terminal tools', () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    reg.register(mockTerminalTool)
    expect(reg.isTerminal('submit_for_review')).toBe(true)
    expect(reg.isTerminal('read_file')).toBe(false)
  })

  it('should generate Vercel AI SDK tool map', () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    reg.register(mockWriteTool)
    const toolMap = reg.toVercelTools({ bookId: 'test', dataDir: '/tmp' })
    expect(Object.keys(toolMap)).toEqual(['read_file', 'save_draft'])
  })

  it('should execute a tool', async () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    const result = await reg.execute('read_file', { relative_path: 'ch1.md' }, { bookId: 'b1', dataDir: '/tmp' })
    expect(result).toBe('content of ch1.md')
  })

  it('should list write tools', () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    reg.register(mockWriteTool)
    expect(reg.getWriteTools()).toEqual(['save_draft'])
  })

  it('should list read tools', () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    reg.register(mockWriteTool)
    expect(reg.getReadTools()).toEqual(['read_file'])
  })

  it('should generate tool summary', () => {
    const reg = new ToolRegistry()
    reg.register(mockReadTool)
    reg.register(mockWriteTool)
    const summary = reg.getToolSummary()
    expect(summary).toContain('read_file')
  })
})
