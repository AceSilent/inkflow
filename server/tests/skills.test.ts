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
    expect(content).toContain('信息差地图')
    expect(content.length).toBeGreaterThan(100)
  })

  it('should return error for unknown skill', () => {
    const content = loadSkillContent('nonexistent_xyz', PROMPTS_DIR)
    expect(content).toContain('Error')
    expect(content).toContain('Unknown skill')
  })
})
