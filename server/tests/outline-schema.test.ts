import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { saveOutlineTool } from '../src/tools/write-tools.js'

describe('save_outline with epigraph + synopsis', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outl-'))
  const ctx = { dataDir: tmpDir, bookId: 'book1', mode: 'write' as const }
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })

  it('accepts book.epigraph + book.synopsis + volume.synopsis', async () => {
    const outline = {
      id: 'book1', type: 'book', label: '雨夜来信',
      epigraph: '记忆是…',
      synopsis: '这是一个关于…的故事',
      children: [
        {
          id: 'vol1', type: 'volume', label: '雨夜',
          synopsis: '林舟回乡',
          children: [
            { id: 'ch01', type: 'chapter', label: '雨夜', summary: '...' },
          ],
        },
      ],
    }
    const result = await saveOutlineTool.execute(
      { outline_json: JSON.stringify(outline) },
      ctx as any,
    )
    expect(result).toMatch(/Outline saved/)
    const saved = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'book1', '02_Outlines', 'outline.json'), 'utf8'))
    expect(saved.epigraph).toBe('记忆是…')
    expect(saved.synopsis).toContain('这是一个')
    expect(saved.children[0].synopsis).toBe('林舟回乡')
  })

  it('accepts outline without new fields (backward-compat)', async () => {
    const outline = {
      id: 'book1', type: 'book', label: 'X',
      children: [
        { id: 'vol1', type: 'volume', label: 'v', children: [
          { id: 'ch01', type: 'chapter', label: 'c', summary: 's' },
        ] },
      ],
    }
    const result = await saveOutlineTool.execute(
      { outline_json: JSON.stringify(outline) },
      ctx as any,
    )
    expect(result).toMatch(/Outline saved/)
  })

  it('rejects epigraph on volume node (only book gets epigraph)', async () => {
    const outline = {
      id: 'book1', type: 'book', label: 'X',
      children: [
        { id: 'vol1', type: 'volume', label: 'v',
          epigraph: 'bad — epigraph only on book',
          children: [] },
      ],
    }
    const result = await saveOutlineTool.execute(
      { outline_json: JSON.stringify(outline) },
      ctx as any,
    )
    expect(result).toMatch(/Error|schema/i)
  })
})
