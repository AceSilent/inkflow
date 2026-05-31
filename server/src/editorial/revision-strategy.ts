import type { EditorialFeedback } from './pipeline.js'

export type RevisionStrategyAction = 'none' | 'stage_edit' | 'stage_rewrite' | 'ask_human' | 'stop_auto_revision'
export type RevisionStrategyGrade = 'pass' | 'light' | 'medium' | 'severe' | 'stuck'
export type RevisionReviewScope = 'failed_only' | 'full'

export interface RevisionStrategy {
  action: RevisionStrategyAction
  grade: RevisionStrategyGrade
  score: number
  reason: string
  instruction: string
  target_reviewers: string[]
  recommended_review_scope: RevisionReviewScope
  revision_brief: string
  auto_revision: {
    current_round: number
    max_auto_rounds: number
    exhausted: boolean
    stop_reason?: string
  }
}

export interface RevisionStrategyOptions {
  currentRound?: number
  maxAutoRounds?: number
  persistentIssues?: Array<{ fingerprint: string; count: number; first_seen_round: number }>
}

export const DEFAULT_MAX_AUTO_REVISION_ROUNDS = 2
export const SEVERITY_CRITICAL = 4
export const WEIGHTED_FAIL_THRESHOLD = 8

export function issueSeverity(i: { severity?: number }): number {
  const v = i.severity
  return typeof v === 'number' && v > 0 ? v : 3
}

export function reviewerMaxSeverity(fb: EditorialFeedback): number {
  return fb.issues.reduce((max, i) => Math.max(max, issueSeverity(i)), 0)
}

export function reviewerWeightedSeverity(fb: EditorialFeedback): number {
  return fb.issues.reduce((n, i) => n + issueSeverity(i), 0)
}

export function reviewerEffectivePass(fb: EditorialFeedback): boolean {
  if (!fb.pass_status) return false
  if (reviewerMaxSeverity(fb) >= SEVERITY_CRITICAL) return false
  if (reviewerWeightedSeverity(fb) >= WEIGHTED_FAIL_THRESHOLD) return false
  return true
}

export function computeOverallPass(feedbacks: EditorialFeedback[]): boolean {
  return feedbacks.every(reviewerEffectivePass)
}

function failingFeedbacks(feedbacks: EditorialFeedback[]): EditorialFeedback[] {
  return feedbacks.filter(fb => !reviewerEffectivePass(fb))
}

export function buildMergedSummary(feedbacks: EditorialFeedback[]): string {
  const sorted = [...feedbacks].sort((a, b) => {
    const passA = reviewerEffectivePass(a)
    const passB = reviewerEffectivePass(b)
    if (passA !== passB) return passA ? 1 : -1
    return reviewerMaxSeverity(b) - reviewerMaxSeverity(a)
  })
  const parts: string[] = []
  for (const fb of sorted) {
    if (!reviewerEffectivePass(fb)) {
      const weighted = reviewerWeightedSeverity(fb)
      parts.push(`[${fb.reviewer}] ❌ ${fb.quick_comment}  (加权严重度 ${weighted})`)
      const sortedIssues = [...fb.issues].sort((a, b) => issueSeverity(b) - issueSeverity(a))
      for (const issue of sortedIssues) {
        parts.push(`  - [${issue.type}|严重度${issueSeverity(issue)}] ${issue.fix_instruction ?? ''}`)
      }
    } else {
      parts.push(`[${fb.reviewer}] ✅ ${fb.quick_comment}`)
    }
  }
  return parts.join('\n')
}

const PROSE_LOCAL_ISSUE_TYPES = new Set([
  'AI_Tone',
  'Death_Words',
  'Dash_Abuse',
  'Cliche',
  'Redundant_Wording',
  'Style_Drift',
  'Weak_Hook',
  'Rhetoric_Pileup',
  'Camera_Blocking_Density',
])

const REPAIRABLE_LOCAL_ISSUE_TYPES = new Set([
  ...PROSE_LOCAL_ISSUE_TYPES,
  'PTSD_Missing',
  'Weak_Opening_Pressure',
  'Motive_Chain_Weak',
  'Broken_Causality',
  'Logic_Bridge_Missing',
  'Lore_Clarification',
  'Minor_Lore_Patch',
  'Foreshadowing_Missing',
  'Dropped_Foreshadow',
  'Item_Error',
  'Character_Error',
  'Pacing_Drag',
  'Emotion_Gap',
  'Identity_Slip',
  'Floating_Hook',
  'Weak_Motive',
  'Coincidence_Driven',
])

const ROOT_STRUCTURAL_ISSUE_TYPES = new Set([
  'Lore_Contradiction',
  'Core_Setting_Break',
  'Character_Break',
  'Character_Contradiction',
  'Causality_Break',
  'Plot_Break',
  'Timeline_Conflict',
])

function isLocalProseIssue(issue: { type?: string }): boolean {
  return issue.type ? PROSE_LOCAL_ISSUE_TYPES.has(issue.type) : false
}

function isRepairableLocalIssue(issue: { type?: string; severity?: number }): boolean {
  if (!issue.type) return false
  if (ROOT_STRUCTURAL_ISSUE_TYPES.has(issue.type)) return false
  if (!REPAIRABLE_LOCAL_ISSUE_TYPES.has(issue.type)) return false
  return issueSeverity(issue) <= SEVERITY_CRITICAL
}

function hasRootStructuralIssue(fb: EditorialFeedback): boolean {
  return fb.issues.some(issue =>
    issue.type && ROOT_STRUCTURAL_ISSUE_TYPES.has(issue.type) && issueSeverity(issue) >= SEVERITY_CRITICAL
  )
}

function isStructuralReviewer(reviewer: string): boolean {
  return reviewer === 'editorial_lore' ||
    reviewer === 'editorial_pacing' ||
    reviewer === 'editorial_character' ||
    reviewer === 'editorial_causality'
}

function issueInstruction(issue: { type?: string; quote?: string; fix_instruction?: string }): string {
  const type = issue.type ?? 'Issue'
  const quote = issue.quote ? `「${issue.quote.slice(0, 80)}」` : ''
  const fix = issue.fix_instruction ?? '按审稿意见修正。'
  return `${type}${quote ? ` ${quote}` : ''}：${fix}`
}

export function buildRevisionBrief(
  feedbacks: EditorialFeedback[],
  action: RevisionStrategyAction = 'stage_edit',
  reviewScope: RevisionReviewScope = 'failed_only',
): string {
  const failing = failingFeedbacks(feedbacks)
  if (failing.length === 0) {
    return '本轮机器慢审已通过。除非人类提出新的创作意图或批注，不要继续改写本 stage。'
  }

  const lines: string[] = []
  const reviewers = failing.map(fb => fb.reviewer).join('、')
  lines.push(`本次只处理未过审稿人的明确问题：${reviewers}。`)

  const issues = failing
    .flatMap(fb => (fb.issues ?? []).map(issue => ({ reviewer: fb.reviewer, issue })))
    .sort((a, b) => issueSeverity(b.issue) - issueSeverity(a.issue))

  let idx = 1
  for (const { reviewer, issue } of issues.slice(0, 8)) {
    const prefix = reviewer === 'editorial_ai_tone'
      ? 'AI腔调'
      : reviewer === 'editorial_lore'
        ? '设定'
        : reviewer === 'editorial_causality'
          ? '因果'
          : reviewer === 'editorial_character'
            ? '角色'
            : '节奏'
    lines.push(`${idx}. ${prefix}：${issueInstruction(issue)}`)
    idx += 1
  }

  if (issues.some(({ issue }) => issue.type === 'Camera_Blocking_Density')) {
    lines.push(`${idx}. 开头 800 字优先删除连续镜头链，不要密集写“停下/抬头/看见/接受现实”式分镜调度。`)
    idx += 1
    lines.push(`${idx}. 处理镜头编排过密时先删再改：把“踩/停/举手机/看/抹汗/塞兜”这类连续动作链压成处境判断，不要新增光线、脚步、呼吸、湿气等补偿描写。`)
    idx += 1
  }
  if (issues.some(({ issue }) => issue.type === 'Rhetoric_Pileup')) {
    lines.push(`${idx}. 每 800 字最多保留 1 个明显比喻；轻吐槽要少而准，不要每个信息点都包装成比喻。`)
    idx += 1
  }
  if (issues.some(({ issue }) => issue.type === 'Dash_Abuse')) {
    lines.push(`${idx}. 删除破折号解释，改成普通断句或让动作/对话自己说明。`)
    idx += 1
  }

  lines.push(`${idx}. ${action === 'stage_rewrite' ? '可以整个 stage 重写，但必须保留大纲目标、核心事件和 stage 末尾落点。' : '保留 stage 目标和主要事件，不要整个 stage 换剧情。'}`)
  idx += 1
  lines.push(`${idx}. 保存后${reviewScope === 'failed_only' ? `只复审 ${reviewers}` : '全量复审设定考据与逻辑审核'}；最终仍需本轮慢审通过并由人类终审，或人类直接通过。`)
  return lines.join('\n')
}

function buildStopAutoRevisionBrief(
  feedbacks: EditorialFeedback[],
  stopReason: string,
): string {
  const failing = failingFeedbacks(feedbacks)
  const reviewers = failing.map(fb => fb.reviewer).join('、') || '无'
  const issues = failing
    .flatMap(fb => (fb.issues ?? []).map(issue => ({ reviewer: fb.reviewer, issue })))
    .sort((a, b) => issueSeverity(b.issue) - issueSeverity(a.issue))
    .slice(0, 8)

  return [
    `自动修订已停止：${stopReason}`,
    `未过审稿人：${reviewers}。`,
    '',
    '需要向人类汇报的问题：',
    ...issues.map(({ reviewer, issue }, i) =>
      `${i + 1}. ${reviewer}：${issueInstruction(issue)}`
    ),
    '',
    '不要继续保存剧本或再次送审。请等待人类批注、人工通过、调整大纲，或明确授权开启新的修订批次。',
  ].join('\n')
}

function withStrategyDefaults(
  strategy: Omit<RevisionStrategy, 'target_reviewers' | 'recommended_review_scope' | 'revision_brief' | 'auto_revision'>,
  feedbacks: EditorialFeedback[],
  reviewScope: RevisionReviewScope,
  options: RevisionStrategyOptions,
): RevisionStrategy {
  const currentRound = options.currentRound ?? 0
  const maxAutoRounds = options.maxAutoRounds ?? DEFAULT_MAX_AUTO_REVISION_ROUNDS
  const failing = failingFeedbacks(feedbacks)
  const targetReviewers = failing.map(fb => fb.reviewer)
  const persistentIssues = options.persistentIssues ?? []
  const exhausted = strategy.action !== 'none' && (
    (currentRound > 0 && currentRound >= maxAutoRounds) ||
    persistentIssues.length > 0
  )

  if (exhausted) {
    const stopReason = persistentIssues.length > 0
      ? '同类问题已连续出现，继续自动改写大概率无效。'
      : `自动修订预算已用完（第 ${currentRound} 轮，预算 ${maxAutoRounds} 轮）。`
    return {
      action: 'stop_auto_revision',
      grade: 'stuck',
      score: strategy.score,
      reason: stopReason,
      instruction: [
        '停止自动重写。不要再调用 save_script 或 submit_to_editorial 进入下一轮自循环。',
        '请向人类汇报未过审稿人、关键问题和你需要的创作判断；等待人类批注、人工通过、调整大纲或明确授权重写。',
      ].join('\n'),
      target_reviewers: targetReviewers,
      recommended_review_scope: reviewScope,
      revision_brief: buildStopAutoRevisionBrief(feedbacks, stopReason),
      auto_revision: {
        current_round: currentRound,
        max_auto_rounds: maxAutoRounds,
        exhausted: true,
        stop_reason: stopReason,
      },
    }
  }

  return {
    ...strategy,
    target_reviewers: targetReviewers,
    recommended_review_scope: reviewScope,
    revision_brief: buildRevisionBrief(feedbacks, strategy.action, reviewScope),
    auto_revision: {
      current_round: currentRound,
      max_auto_rounds: maxAutoRounds,
      exhausted: false,
    },
  }
}

export function buildRevisionStrategy(feedbacks: EditorialFeedback[], options: RevisionStrategyOptions = {}): RevisionStrategy {
  const failing = failingFeedbacks(feedbacks)
  if (failing.length === 0) {
    return withStrategyDefaults({
      action: 'none',
      grade: 'pass',
      score: 100,
      reason: '全部审稿人通过，无需修订。',
      instruction: 'Stage 已通过编辑部。不要继续改写，除非用户提出新的创作意图或批注。',
    }, feedbacks, 'full', options)
  }

  const failedCount = failing.length
  const weightedSeverity = failing.reduce((sum, fb) => sum + reviewerWeightedSeverity(fb), 0)
  const maxSeverity = failing.reduce((max, fb) => Math.max(max, reviewerMaxSeverity(fb)), 0)
  const structuralCriticals = failing.filter(fb =>
    isStructuralReviewer(fb.reviewer) && reviewerMaxSeverity(fb) >= SEVERITY_CRITICAL
  ).length
  const rootStructuralFailures = failing.filter(hasRootStructuralIssue).length
  const allLocalProse = failing.every(fb =>
    fb.issues.length > 0 && fb.issues.every(issue => isLocalProseIssue(issue))
  )
  const allRepairableLocal = failing.every(fb =>
    fb.issues.length > 0 && fb.issues.every(issue => isRepairableLocalIssue(issue))
  )
  const score = Math.max(0, 100 - Math.min(90, weightedSeverity * 5 + failedCount * 8 + structuralCriticals * 18))

  if (allLocalProse || (score >= 70 && structuralCriticals === 0)) {
    return withStrategyDefaults({
      action: 'stage_edit',
      grade: 'light',
      score,
      reason: `Stage 基础成立；失败集中在局部问题（${failedCount} 个审稿人未过，加权严重度 ${weightedSeverity}）。`,
      instruction: '本 stage 禁止整个 stage 重写。请先 load_skill("stage_edit")，严格按 revision_brief 做局部替换、插段或删改，然后 save_script，并用 failed_only 复审未过审稿人。',
    }, feedbacks, 'failed_only', options)
  }

  if (allRepairableLocal && rootStructuralFailures === 0) {
    return withStrategyDefaults({
      action: 'stage_edit',
      grade: 'medium',
      score,
      reason: `Stage 主干仍可保留；问题集中在可局部手术的文风、节奏压力或因果桥补丁（${failedCount} 个审稿人未过，最高严重度 ${maxSeverity}，加权严重度 ${weightedSeverity}）。`,
      instruction: '优先 load_skill("stage_edit")。保留 stage 目标和主要事件，按 revision_brief 做局部删除、替换和补桥段；不要整个 stage 重写。因为牵涉多个审稿维度，保存后用 full 复审设定考据与逻辑审核。',
    }, feedbacks, failedCount > 1 ? 'full' : 'failed_only', options)
  }

  if (score >= 50 && failedCount <= 2 && structuralCriticals <= 1) {
    return withStrategyDefaults({
      action: 'stage_edit',
      grade: 'medium',
      score,
      reason: `Stage 主干仍可保留，但需要较明显的局部补强（${failedCount} 个审稿人未过，最高严重度 ${maxSeverity}，加权严重度 ${weightedSeverity}）。`,
      instruction: '优先 load_skill("stage_edit") 并严格按 revision_brief 处理。可以新增或替换若干段落来补强因果、动机、设定或节奏，但不要推翻 stage 目标；若改动结构、设定事实或角色动机，复审用 full。',
    }, feedbacks, structuralCriticals > 0 ? 'full' : 'failed_only', options)
  }

  return withStrategyDefaults({
    action: 'stage_rewrite',
    grade: 'severe',
    score,
    reason: `Stage 存在结构性失败或低分审稿结果（${failedCount} 个审稿人未过，最高严重度 ${maxSeverity}，加权严重度 ${weightedSeverity}）。`,
    instruction: '本 stage 不适合补丁式修。请先 load_skill("stage_rewrite")，重新确认大纲、设定和剧情图后整个 stage 重写，再 save_script 并重新 submit_to_editorial。',
  }, feedbacks, 'full', options)
}
