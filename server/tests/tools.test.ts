import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createAllTools } from '../src/tools/index.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Tool Registration', () => {
  it('should register all tools', () => {
    const registry = createAllTools()
    expect(registry.listNames().length).toBeGreaterThanOrEqual(13)
    expect(registry.get('read_file')).toBeDefined()
    expect(registry.get('save_script')).toBeDefined()
    expect(registry.get('read_graph')).toBeDefined()
    expect(registry.get('submit_for_review')).toBeDefined()
    expect(registry.get('present_options')).toBeDefined()
    expect(registry.get('browse_examples')).toBeDefined()
    expect(registry.get('analyze_style_profile')).toBeDefined()
  })

  it('should mark write tools correctly', () => {
    const registry = createAllTools()
    const writeTools = registry.getWriteTools()
    expect(writeTools).toContain('save_script')
    expect(writeTools).toContain('save_lore')
    expect(writeTools).toContain('save_outline')
    expect(writeTools).toContain('submit_for_review')
    expect(writeTools).toContain('analyze_style_profile')
    expect(writeTools).not.toContain('read_file')
    expect(writeTools).not.toContain('search_lore')
    expect(writeTools).not.toContain('browse_examples')
  })

  it('should identify terminal tools', () => {
    const registry = createAllTools()
    expect(registry.isTerminal('submit_for_review')).toBe(true)
    expect(registry.isTerminal('present_options')).toBe(true)
    expect(registry.isTerminal('request_guidance')).toBe(true)
    expect(registry.isTerminal('read_file')).toBe(false)
    expect(registry.isTerminal('save_script')).toBe(false)
  })
})

describe('BrowseExamples Tool', () => {
  it('should return matching micro examples by category and tag', async () => {
    const registry = createAllTools()
    const result = await registry.execute('browse_examples', {
      category: 'ai_tone',
      tags: ['camera_blocking'],
      limit: 1,
    }, { bookId: 'test-book', dataDir: '/tmp' })

    expect(result).toContain('开篇镜头编排过密')
    expect(result).toContain('只学习结构、节奏、信息分配和修订方向')
  })
})

describe('AnalyzeStyleProfile Tool', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'style-profile-'))
    fs.mkdirSync(path.join(tmpDir, 'test-book'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should persist a compact style profile for reference text', async () => {
    const registry = createAllTools()
    const reference = [
      '张墨看着手机，沉默了两秒。',
      '没有信号。',
      '也没有地图。',
      '他觉得这事多少有点离谱。',
      '“行吧。”他说，“至少我还活着。”',
    ].join('\n').repeat(30)

    const result = await registry.execute('analyze_style_profile', {
      reference_text: reference,
    }, { bookId: 'test-book', dataDir: tmpDir })

    expect(result).toContain('Style profile saved')
    const file = path.join(tmpDir, 'test-book', '01_Global_Settings', 'style_profile.json')
    expect(fs.existsSync(file)).toBe(true)
    const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(profile.metrics.avg_sentence_chars).toBeGreaterThan(0)
    expect(profile.style_rules.join('\n')).toContain('网文直叙')
    expect(profile.anti_patterns.join('\n')).toContain('镜头链')
  })
})

describe('ReadFile Tool', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'))
    const bookDir = path.join(tmpDir, 'test-book')
    fs.mkdirSync(bookDir, { recursive: true })
    fs.writeFileSync(path.join(bookDir, 'ch1.md'), '# Chapter 1\nHello world', 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('should read existing file', async () => {
    const registry = createAllTools()
    const result = await registry.execute('read_file', { relative_path: 'ch1.md' }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('# Chapter 1')
    expect(result).toContain('Hello world')
  })

  it('should return error for nonexistent file', async () => {
    const registry = createAllTools()
    const result = await registry.execute('read_file', { relative_path: 'nope.md' }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
  })

  it('should block path traversal', async () => {
    const registry = createAllTools()
    const result = await registry.execute('read_file', { relative_path: '../../etc/passwd' }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
  })
})

describe('SearchLore Tool', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'))
    const loreDir = path.join(tmpDir, 'test-book', '01_Global_Settings')
    fs.mkdirSync(loreDir, { recursive: true })
    fs.writeFileSync(path.join(loreDir, 'characters.json'), JSON.stringify({
      '萧炎': { level: '斗帝', age: 18 },
      '萧薰儿': { level: '斗宗', age: 17 },
    }), 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('should find matching character', async () => {
    const registry = createAllTools()
    const result = await registry.execute('search_lore', { query: '萧炎' }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('萧炎')
    expect(result).toContain('斗帝')
  })

  it('should return no results for unknown query', async () => {
    const registry = createAllTools()
    const result = await registry.execute('search_lore', { query: 'nonexistent_xyz' }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('No matching')
  })
})

describe('Write Tools', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'))
    fs.mkdirSync(path.join(tmpDir, 'test-book'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('save_script should create YAML file and audit log', async () => {
    const registry = createAllTools()
    fs.mkdirSync(path.join(tmpDir, 'test-book', '03_Scripts'), { recursive: true })
    const script = {
      id: 'intro',
      name: 'Intro',
      author: 'tester',
      motif: 'rescue',
      tier: 'short',
      description: 'intro scene',
      stages: [{ id: 'start', lines: [{ text: 'Welcome.' }] }],
    }
    const result = await registry.execute('save_script', {
      package_id: 'intro',
      script_json: JSON.stringify(script),
    }, { bookId: 'test-book', dataDir: tmpDir })

    expect(result).toContain('saved')
    const file = path.join(tmpDir, 'test-book', '03_Scripts', 'intro.yaml')
    expect(fs.existsSync(file)).toBe(true)

    // Verify audit log
    const log = path.join(tmpDir, 'test-book', 'audit_log.jsonl')
    expect(fs.existsSync(log)).toBe(true)
  })

  it('save_script should return error on invalid JSON', async () => {
    const registry = createAllTools()
    fs.mkdirSync(path.join(tmpDir, 'test-book', '03_Scripts'), { recursive: true })
    const result = await registry.execute('save_script', {
      package_id: 'bad',
      script_json: 'not-json',
    }, { bookId: 'test-book', dataDir: tmpDir })

    expect(result).toContain('Error: Invalid JSON')
  })

  it('save_outline should accept a valid chapter tree', async () => {
    const registry = createAllTools()
    const outline = JSON.stringify({
      id: 'test-book',
      type: 'book',
      label: '测试小说',
      children: [
        {
          id: 'vol1',
          type: 'volume',
          label: '第一卷',
          children: [
            { id: 'ch01', type: 'chapter', label: '开篇', summary: '主角登场' },
          ],
        },
      ],
    })
    const result = await registry.execute('save_outline', { outline_json: outline }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Outline saved')
  })

  it('read_outline should select a volume from the current children tree schema', async () => {
    const registry = createAllTools()
    const outline = JSON.stringify({
      id: 'test-book',
      type: 'book',
      label: '测试小说',
      children: [
        { id: 'vol1', type: 'volume', label: '第一卷', children: [{ id: 'ch01', type: 'chapter', label: '开篇' }] },
        { id: 'vol2', type: 'volume', label: '第二卷', children: [{ id: 'ch02', type: 'chapter', label: '进城' }] },
      ],
    })
    await registry.execute('save_outline', { outline_json: outline }, { bookId: 'test-book', dataDir: tmpDir })

    const result = await registry.execute('read_outline', { volume: 2 }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('"id": "vol2"')
    expect(result).toContain('"id": "ch02"')
  })

  it('save_outline should reject free-form JSON missing type', async () => {
    const registry = createAllTools()
    const outline = JSON.stringify({ title: '测试小说', volumes: [] })
    const result = await registry.execute('save_outline', { outline_json: outline }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
    expect(result).toContain('schema invalid')
  })

  it('save_lore should reject invalid category', async () => {
    const registry = createAllTools()
    const result = await registry.execute('save_lore', { category: 'invalid', content_json: '{}' }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
    expect(result).toContain('Unknown category')
  })

  it('save_lore should write to 01_Global_Settings/ only (single source of truth)', async () => {
    const registry = createAllTools()
    const chars = JSON.stringify({ '萧炎': { level: '斗帝' } })
    const result = await registry.execute('save_lore', { category: 'characters', content_json: chars }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('saved successfully')
    expect(fs.existsSync(path.join(tmpDir, 'test-book', '01_Global_Settings', 'characters.json'))).toBe(true)
    // The legacy `lore/` duplicate should no longer be produced.
    expect(fs.existsSync(path.join(tmpDir, 'test-book', 'lore', 'characters.json'))).toBe(false)
  })
})

describe('PlotGraph Tools', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'))
    fs.mkdirSync(path.join(tmpDir, 'test-book'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('read_graph should return empty message when no graph', async () => {
    const registry = createAllTools()
    const result = await registry.execute('read_graph', {}, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('No plot graph')
  })

  it('add_plot_node should create graph and node', async () => {
    const registry = createAllTools()
    const result = await registry.execute('add_plot_node', {
      node_type: 'event', title: '起点事件', description: '起始篇',
    }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Node created')
    expect(result).toContain('起点事件')

    // Graph file should exist now
    expect(fs.existsSync(path.join(tmpDir, 'test-book', 'plot_graph.json'))).toBe(true)
  })

  it('confirm_path should update node status', async () => {
    const registry = createAllTools()
    // First create a node
    const addResult = await registry.execute('add_plot_node', {
      node_type: 'turning_point', title: '第一转折',
    }, { bookId: 'test-book', dataDir: tmpDir })
    const nodeId = addResult.match(/Node created: (\S+)/)?.[1] ?? ''
    expect(nodeId).toBeTruthy()

    // Confirm it
    const result = await registry.execute('confirm_path', { node_id: nodeId }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('confirmed')
  })
})

describe('Terminal Tools', () => {
  it('submit_for_review should return terminal marker', async () => {
    const registry = createAllTools()
    const result = await registry.execute('submit_for_review', { draft_text: '测试草稿' }, { bookId: 'test', dataDir: '/tmp' })
    expect(result).toContain('TERMINAL:SUBMIT_FOR_REVIEW')
  })

  it('present_options should return options', async () => {
    const registry = createAllTools()
    const result = await registry.execute('present_options', {
      description: '选择方向', options: 'A: 战斗\nB: 探索',
    }, { bookId: 'test', dataDir: '/tmp' })
    expect(result).toContain('TERMINAL:PRESENT_OPTIONS')
    expect(result).toContain('战斗')
  })

  it('request_guidance should include context', async () => {
    const registry = createAllTools()
    const result = await registry.execute('request_guidance', {
      question: '接下来怎么写?', context: '主角刚打完boss',
    }, { bookId: 'test', dataDir: '/tmp' })
    expect(result).toContain('TERMINAL:REQUEST_GUIDANCE')
    expect(result).toContain('boss')
  })
})
