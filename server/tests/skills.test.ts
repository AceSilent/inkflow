import { describe, it, expect } from 'vitest'
import { discoverSkills, loadSkillContent } from '../src/tools/skills.js'
import path from 'path'

const PROMPTS_DIR = path.resolve(__dirname, '../../prompts')

describe('Skill Discovery', () => {
  it('should find all skill files', () => {
    const skills = discoverSkills(PROMPTS_DIR)
    expect(Object.keys(skills).length).toBeGreaterThanOrEqual(11)
    expect(skills['iceberg_writing']).toBeDefined()
    expect(skills['scene_rhythm']).toBeDefined()
    expect(skills['plot_tree_methodology']).toBeDefined()
    expect(skills['volume_planning']).toBeDefined()
    expect(skills['chapter_edit']).toBeDefined()
    expect(skills['chapter_rewrite']).toBeDefined()
    expect(skills['lore_authoring']).toBeDefined()
  })

  it('should parse YAML frontmatter correctly', () => {
    const skills = discoverSkills(PROMPTS_DIR)
    const iceberg = skills['iceberg_writing']
    expect(iceberg.category).toBe('writing')
    expect(iceberg.description).toContain('冰山写作法')
    expect(iceberg.whenToUse).toContain('正文')
  })

  it('should categorize skills correctly', () => {
    const skills = discoverSkills(PROMPTS_DIR)
    const categories = new Set(Object.values(skills).map(s => s.category))
    expect(categories.has('writing')).toBe(true)
    expect(categories.has('plotting')).toBe(true)
    expect(categories.has('worldbuilding')).toBe(true)
    expect(categories.has('planning')).toBe(true)
  })

  it('should load skill content without frontmatter', () => {
    const content = loadSkillContent('iceberg_writing', PROMPTS_DIR)
    expect(content).not.toMatch(/^---/)
    expect(content).toContain('给证据，不代替判断')
    expect(content.length).toBeGreaterThan(100)
  })

  it('should teach autonomous exemplar browsing with context-aware reuse', () => {
    const content = loadSkillContent('exemplar_study', PROMPTS_DIR)
    expect(content).toContain('个人书库')
    expect(content).toContain('read_exemplar_chapter')
    expect(content).toContain('上下文')
    expect(content).toContain("scope='library'")
    expect(content).toContain("scope='genres'")
    expect(content).toContain('不必依赖关键词')
    expect(content).toContain('没有固定章数上限')
    expect(content).toContain('可以再次读取')
    expect(content).toContain('不要建议用户加载 Skill')
  })

  it('treats omission as reader participation instead of a rigid prose formula', () => {
    const content = loadSkillContent('iceberg_writing', PROMPTS_DIR)
    expect(content).toContain('解释尾巴')
    expect(content).toContain('留白不能破坏因果')
    expect(content).not.toContain('每章最多')
    expect(content).not.toContain('完全禁止使用')
  })

  it('teaches structured lore authoring before and during drafting', () => {
    const content = loadSkillContent('lore_authoring', PROMPTS_DIR)
    expect(content).toContain('story_bible')
    expect(content).toContain('source_refs')
    expect(content).toContain('read_lore_entry')
    expect(content).toContain('默认 `merge`')
    expect(content).toContain('写作过程中产生新设定')
    expect(content).toContain('设定回收')
  })

  it('should return error for unknown skill', () => {
    const content = loadSkillContent('nonexistent_xyz', PROMPTS_DIR)
    expect(content).toContain('Error')
    expect(content).toContain('Unknown skill')
  })
})
