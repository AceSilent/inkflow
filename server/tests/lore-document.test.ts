import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  LoreRevisionConflictError,
  mergeLoreDocuments,
  migrateLoreDocumentFile,
  normalizeLoreDocument,
  readLoreDocument,
  renderLoreDocumentForPrompt,
  updateLoreDocument,
} from '../src/lore/lore-document.js'

describe('Lore document model', () => {
  let bookDir: string

  beforeEach(() => {
    bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkflow-lore-'))
    fs.mkdirSync(path.join(bookDir, '01_Global_Settings'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(bookDir, { recursive: true, force: true })
  })

  it('normalizes keyed world lore without losing nested information', () => {
    const document = normalizeLoreDocument('world_setting', {
      sacrificial_mechanism: {
        nature: '以圣盐净化为名的献祭',
        rules: ['需要见证者', '发生在退潮之后'],
      },
    })

    expect(document.entries).toHaveLength(1)
    expect(document.entries[0].id).toBe('sacrificial-mechanism')
    expect(document.entries[0].title).toBe('献祭机制')
    expect(document.entries[0].content).toContain('以圣盐净化为名的献祭')
    expect(document.entries[0].content).toContain('需要见证者')
    expect(renderLoreDocumentForPrompt(document)).toContain('发生在退潮之后')
  })

  it('normalizes array-based character lore and preserves the book title', () => {
    const document = normalizeLoreDocument('characters', {
      book_title: '一寸山河一寸灯',
      characters: [{
        id: 'jing-ping',
        name: '静平',
        role: '师兄',
        traits: ['实诚', '惜物'],
      }],
    })

    expect(document.entries.map(entry => entry.title)).toEqual(['静平', '作品角色说明'])
    expect(document.entries[0].entry_type).toBe('师兄')
    expect(document.entries[0].content).toContain('实诚')
    expect(document.entries[1].content).toContain('一寸山河一寸灯')
  })

  it('merges by stable entry id while preserving untouched entries', () => {
    const current = normalizeLoreDocument('characters', {
      alan: { name: '艾伦', role: '调查者', background: '来自北岸' },
      vera: { name: '薇拉', role: '招募者' },
    })
    const incoming = normalizeLoreDocument('characters', {
      alan: { name: '艾伦', role: '调查者', background: '来自南岸' },
    })

    const merged = mergeLoreDocuments(current, incoming)
    expect(merged.entries).toHaveLength(2)
    expect(merged.entries.find(entry => entry.id === 'alan')?.content).toContain('来自南岸')
    expect(merged.entries.find(entry => entry.id === 'vera')?.title).toBe('薇拉')
  })

  it('supports story-bible entries with source references', () => {
    const document = normalizeLoreDocument('story_bible', {
      schema_version: 1,
      category: 'story_bible',
      revision: 0,
      entries: [{
        id: 'core-premise',
        title: '核心前提',
        entry_type: '核心前提',
        status: 'draft',
        tags: ['主线'],
        aliases: [],
        content: '恶魔通过情绪锚点接近现实。',
        updated_at: '',
        source_refs: [{
          source_name: '大纲.md',
          source_section: '世界观 / 寄生与献祭',
          source_type: 'attachment',
        }],
      }],
    })

    expect(document.category).toBe('story_bible')
    expect(document.entries[0].source_refs).toEqual([{
      source_name: '大纲.md',
      source_section: '世界观 / 寄生与献祭',
      source_type: 'attachment',
    }])
  })

  it('rejects stale user saves using the document revision', async () => {
    const first = await updateLoreDocument(
      bookDir,
      'world_setting',
      current => ({
        ...current,
        entries: [{
          id: 'old-city',
          title: '旧城',
          entry_type: '世界与地点',
          status: 'draft',
          tags: [],
          aliases: [],
          content: '终年落雪。',
          updated_at: '',
        }],
      }),
      { expectedRevision: 0, auditTool: 'test' },
    )
    expect(first.revision).toBe(1)

    await expect(updateLoreDocument(
      bookDir,
      'world_setting',
      current => current,
      { expectedRevision: 0, auditTool: 'test' },
    )).rejects.toBeInstanceOf(LoreRevisionConflictError)
  })

  it('migrates a legacy file once and leaves a permanent pre-migration backup', () => {
    const target = path.join(bookDir, '01_Global_Settings', 'world_lore.json')
    fs.writeFileSync(target, JSON.stringify({
      old_city: { setting: '终年落雪', secret: '地下盐矿仍在运转' },
    }), 'utf-8')

    expect(migrateLoreDocumentFile(bookDir, 'world_setting')).toBe(true)
    expect(migrateLoreDocumentFile(bookDir, 'world_setting')).toBe(false)
    expect(fs.existsSync(`${target}.pre-lore-v1.bak`)).toBe(true)

    const migrated = readLoreDocument(bookDir, 'world_setting')
    expect(migrated.schema_version).toBe(1)
    expect(migrated.revision).toBe(1)
    expect(migrated.entries[0].content).toContain('地下盐矿仍在运转')
  })
})
