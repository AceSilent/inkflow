import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export type CreativeStage =
  | 'world_bible'
  | 'story_outline'
  | 'script_draft'
  | 'self_check'
  | 'review'
  | 'export'

export function getCreativeStage(projectDir: string): CreativeStage {
  if (!hasWorldBible(projectDir)) return 'world_bible'
  if (!hasOutline(projectDir)) return 'story_outline'
  if (!hasAllScripts(projectDir)) return 'script_draft'
  if (hasSelfCheckBlockers(projectDir)) return 'self_check'
  if (!hasPassingReview(projectDir)) return 'review'
  return 'export'
}

function hasWorldBible(dir: string): boolean {
  const chars = join(dir, '01_World_Settings', 'characters.json')
  const lore = join(dir, '01_World_Settings', 'world_lore.json')
  return existsSync(chars) && existsSync(lore)
}

function hasOutline(dir: string): boolean {
  return existsSync(join(dir, '02_Outlines', 'outline.json'))
}

function hasAllScripts(dir: string): boolean {
  const scriptsDir = join(dir, '03_Scripts')
  if (!existsSync(scriptsDir)) return false
  const files = readdirSync(scriptsDir).filter(f => f.endsWith('.yaml'))
  return files.length > 0
}

function hasSelfCheckBlockers(_dir: string): boolean {
  return false
}

function hasPassingReview(dir: string): boolean {
  const reviewsDir = join(dir, '04_Reviews')
  if (!existsSync(reviewsDir)) return false
  const files = readdirSync(reviewsDir).filter(f => f.startsWith('review_'))
  if (files.length === 0) return false
  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(reviewsDir, file), 'utf-8'))
      if (!content.pass_status) return false
    } catch { return false }
  }
  return true
}

export function getStageDescription(stage: CreativeStage): string {
  const descriptions: Record<CreativeStage, string> = {
    world_bible: '建立世界观：角色数据库 + 世界设定 + 势力',
    story_outline: '编写大纲：项目 → 剧情包 → 阶段结构树',
    script_draft: '撰写剧本：为每个 stage 编写 line-based 对话',
    self_check: '自检未通过：修复阻断级问题后重新提交',
    review: '等待审核：lore + causality reviewer 审核',
    export: '准备导出：YAML / JSON / CSV / HTML',
  }
  return descriptions[stage]
}
