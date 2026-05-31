import type { StoryPackage } from '../schemas/index.js'
import { detectIdCollisions } from '../services/line-id.js'

export enum ScriptSelfCheckType {
  EmptyLines = 'Empty_Lines',
  OrphanStage = 'Orphan_Stage',
  BrokenBranch = 'Broken_Branch',
  NoTerminal = 'No_Terminal',
  SpeakerUnknown = 'Speaker_Unknown',
  LongNarrationRun = 'Long_Narration_Run',
  DirectionAssetMissing = 'Direction_Asset_Missing',
  StageTooLong = 'Stage_Too_Long',
  ChoiceLabelTooLong = 'Choice_Label_Too_Long',
  DuplicateLineId = 'Duplicate_Line_Id',
}

export interface ScriptSelfCheckIssue {
  type: ScriptSelfCheckType
  severity: number
  message: string
  stageId?: string
}

export interface ScriptSelfCheckResult {
  passed: boolean
  blockReview: boolean
  issues: ScriptSelfCheckIssue[]
}

export function runScriptSelfCheck(pkg: StoryPackage): ScriptSelfCheckResult {
  const issues: ScriptSelfCheckIssue[] = []
  const stageIds = new Set(pkg.stages.map(stage => stage.id))
  const duplicateLineIds = detectIdCollisions(pkg.stages.flatMap(stage => stage.lines.map(line => ({ id: line.id }))))
  for (const duplicateId of duplicateLineIds) {
    issues.push({ type: ScriptSelfCheckType.DuplicateLineId, severity: 5, message: `Duplicate line id '${duplicateId}' found` })
  }

  for (const stage of pkg.stages) {
    if (!stage.lines || stage.lines.length === 0) {
      issues.push({ type: ScriptSelfCheckType.EmptyLines, severity: 5, message: `Stage '${stage.id}' has no lines`, stageId: stage.id })
    }
    for (const choice of (stage.choices || [])) {
      if (!stageIds.has(choice.next_stage)) {
        issues.push({ type: ScriptSelfCheckType.BrokenBranch, severity: 5, message: `Choice '${choice.id}' in '${stage.id}' points to unknown stage '${choice.next_stage}'`, stageId: stage.id })
      }
      if (choice.label.length > 20) {
        issues.push({ type: ScriptSelfCheckType.ChoiceLabelTooLong, severity: 2, message: `Choice '${choice.id}' label is ${choice.label.length} chars (max 20)`, stageId: stage.id })
      }
    }
    if (stage.advance_next && !stageIds.has(stage.advance_next)) {
      issues.push({ type: ScriptSelfCheckType.BrokenBranch, severity: 5, message: `Stage '${stage.id}' advance_next points to unknown stage '${stage.advance_next}'`, stageId: stage.id })
    }
    if (stage.lines && stage.lines.length > 40) {
      issues.push({ type: ScriptSelfCheckType.StageTooLong, severity: 3, message: `Stage '${stage.id}' has ${stage.lines.length} lines (recommend <=40)`, stageId: stage.id })
    }
    checkNarrationRun(stage, issues)
  }

  const terminals = pkg.stages.filter(stage => stage.is_terminal || (stage.choices.length === 0 && !stage.advance_next))
  if (terminals.length === 0) {
    issues.push({ type: ScriptSelfCheckType.NoTerminal, severity: 5, message: 'No terminal stage found' })
  }

  checkOrphanStages(pkg, issues)

  const blockReview = issues.some(issue => issue.severity >= 5)
  return { passed: issues.length === 0, blockReview, issues }
}

function checkNarrationRun(stage: any, issues: ScriptSelfCheckIssue[]) {
  let consecutive = 0
  for (const line of stage.lines || []) {
    if (!line.speaker && (line.type === 'narration' || !line.type)) consecutive++
    else consecutive = 0
    if (consecutive > 8) {
      issues.push({ type: ScriptSelfCheckType.LongNarrationRun, severity: 3, message: `Stage '${stage.id}' has ${consecutive}+ consecutive narration lines without a speaker`, stageId: stage.id })
      break
    }
  }
}

function checkOrphanStages(pkg: StoryPackage, issues: ScriptSelfCheckIssue[]) {
  if (pkg.stages.length <= 1) return
  const reachable = new Set<string>([pkg.stages[0].id])
  const queue = [pkg.stages[0].id]
  while (queue.length > 0) {
    const current = queue.shift()!
    const stage = pkg.stages.find(item => item.id === current)
    if (!stage) continue
    for (const choice of stage.choices || []) {
      if (!reachable.has(choice.next_stage)) {
        reachable.add(choice.next_stage)
        queue.push(choice.next_stage)
      }
    }
    if (stage.advance_next && !reachable.has(stage.advance_next)) {
      reachable.add(stage.advance_next)
      queue.push(stage.advance_next)
    }
  }
  for (const stage of pkg.stages) {
    if (!reachable.has(stage.id)) {
      issues.push({ type: ScriptSelfCheckType.OrphanStage, severity: 5, message: `Stage '${stage.id}' is unreachable from start`, stageId: stage.id })
    }
  }
}
