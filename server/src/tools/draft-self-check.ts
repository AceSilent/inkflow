import fs from 'fs'
import path from 'path'

export type DraftSelfCheckType =
  | 'Length_Below_Review_Minimum'
  | 'Opening_Camera_Chain'
  | 'Opening_Camera_Blocking_Density'
  | 'Dash_Explanation'
  | 'Explanatory_Afterthought'
  | 'Analytical_Exposition'
  | 'Death_Word_Density'
  | 'Rhetoric_Pileup'
  | 'System_Info_Dump'
  | 'Style_Anti_Pattern'

export interface DraftSelfCheckIssue {
  type: DraftSelfCheckType
  severity: 1 | 2 | 3 | 4 | 5
  message: string
  quote?: string
  fixInstruction: string
}

export interface DraftSelfCheckResult {
  passed: boolean
  blockEditorial: boolean
  issues: DraftSelfCheckIssue[]
}

const CAMERA_WORDS = [
  '醒来', '撑起', '撑着', '坐起', '站在', '站起', '停下', '抬头', '低头',
  '看去', '看向', '看见', '盯着', '环顾', '回头', '转头', '闭眼', '睁眼',
  '视线', '聚焦', '扫了', '检查', '深吸', '意识到', '怔住', '眯起',
]

const OPENING_BODY_WORDS = [
  '撑', '坐起', '站起', '低头', '抬头', '闭眼', '睁眼', '喘息', '检查',
  '环顾', '转身', '走到', '推开', '停住', '伸手', '拍了拍',
]

const OPENING_SENSOR_WORDS = [
  '视线', '看', '听见', '闻到', '霉味', '腥气', '阳光', '灰尘', '木板',
  '屋子', '墙角', '窗边', '地板', '空气',
]

const OPENING_JUDGMENT_WORDS = [
  '不是', '没', '确认', '说明', '意识到', '得', '必须', '应该', '安全',
  '结构', '穿越', '开局',
]

const DEATH_WORDS = [
  '仿佛', '像是', '某种', '无形', '一丝', '一抹', '似乎', '说不上来',
  '不禁', '不可思议', '宛如',
]

const EXPLANATORY_PATTERNS = [
  /也就是说/g,
  /换句话说/g,
  /这说明/g,
  /这意味着/g,
  /不是[^。！？\n]{0,28}而是/g,
  /不是实时接收[^。！？\n]{0,80}/g,
]

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

function countWords(text: string, words: string[]): number {
  return words.reduce((sum, word) => sum + countMatches(text, new RegExp(word, 'g')), 0)
}

function compactQuote(text: string, max = 90): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern)
  return match?.[0] ? compactQuote(match[0]) : undefined
}

function readStyleAntiPatterns(bookDir?: string): string[] {
  if (!bookDir) return []
  const file = path.join(bookDir, '01_Global_Settings', 'style_profile.json')
  if (!fs.existsSync(file)) return []
  try {
    const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(profile.anti_patterns)
      ? profile.anti_patterns.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8)
      : []
  } catch {
    return []
  }
}

function openingParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
}

function hasAny(text: string, words: string[]): boolean {
  return words.some(word => text.includes(word))
}

function cameraBlockingScore(paragraph: string): number {
  let score = 0
  if (hasAny(paragraph, OPENING_BODY_WORDS)) score += 1
  if (hasAny(paragraph, OPENING_SENSOR_WORDS)) score += 1
  if (hasAny(paragraph, OPENING_JUDGMENT_WORDS)) score += 1
  if (paragraph.length <= 90) score += 1
  if (/^(他|她|我|林星|张墨)[^。！？\n]{0,18}(撑|坐|站|低头|抬头|闭眼|睁眼|看|听|走|推|停|检查)/.test(paragraph)) score += 1
  return score
}

function longestCameraBlockingRun(paragraphs: string[]): { run: string[]; runLength: number; scoredCount: number } {
  let best: string[] = []
  let current: string[] = []
  let scoredCount = 0
  for (const paragraph of paragraphs) {
    const score = cameraBlockingScore(paragraph)
    const isBlockingUnit = score >= 2
    if (isBlockingUnit) {
      current.push(paragraph)
      scoredCount += 1
      if (current.length > best.length) best = [...current]
    } else if (paragraph.length > 120 || !/[。！？]$/.test(paragraph)) {
      current = []
    } else {
      current = []
    }
  }
  return { run: best, runLength: best.length, scoredCount }
}

export function runDraftSelfCheck(
  content: string,
  opts: { minReviewChars: number; bookDir?: string } = { minReviewChars: 2500 },
): DraftSelfCheckResult {
  const issues: DraftSelfCheckIssue[] = []
  const opening = content.slice(0, 800)

  if (content.length < opts.minReviewChars) {
    issues.push({
      type: 'Length_Below_Review_Minimum',
      severity: 4,
      message: `草稿只有 ${content.length} 字，低于送审最低要求 ${opts.minReviewChars} 字。`,
      fixInstruction: '先补足有功能的内容：冲突推进、行动、对话、内心反应和章末钩子，再送审。',
    })
  }

  const openingCameraCount = countWords(opening, CAMERA_WORDS)
  if (openingCameraCount >= 8) {
    issues.push({
      type: 'Opening_Camera_Chain',
      severity: 5,
      message: `开篇 800 字命中 ${openingCameraCount} 个镜头/身体动作词，疑似连续分镜链。`,
      quote: compactQuote(opening),
      fixInstruction: '压缩“醒来/撑起/看/环顾/意识到”等动作排队，第一屏先写处境、压力和下一步选择。',
    })
  }

  const openingParas = openingParagraphs(opening)
  const cameraRun = longestCameraBlockingRun(openingParas.slice(0, 14))
  if (cameraRun.runLength >= 6 || (cameraRun.runLength >= 5 && cameraRun.scoredCount >= 8)) {
    issues.push({
      type: 'Opening_Camera_Blocking_Density',
      severity: 5,
      message: `开篇前 800 字存在连续 ${cameraRun.runLength} 个短段落级镜头调度单元，疑似“动作/视线/环境确认/心理判断”流水线。`,
      quote: compactQuote(cameraRun.run.join(' / '), 180),
      fixInstruction: '把前 300 字压成“处境 + 压力 + 当前选择”，删掉连续的坐起、闭眼、再睁眼、检查、环顾、确认环境等过场调度。',
    })
  }

  const dashCount = countMatches(content, /——/g)
  if (dashCount >= 2 || /不是[^。！？\n]{0,28}——/.test(content)) {
    issues.push({
      type: 'Dash_Explanation',
      severity: dashCount >= 4 ? 5 : 4,
      message: `草稿出现 ${dashCount} 处破折号，可能在用破折号做作者解释。`,
      quote: firstMatch(content, /[^。！？\n]{0,40}——[^。！？\n]{0,60}/),
      fixInstruction: '删除破折号解释，改成句号断开或直接删掉解释句；机制信息只保留当前决策需要的部分。',
    })
  }

  const explanatoryHits = EXPLANATORY_PATTERNS.reduce((sum, pattern) => sum + countMatches(content, pattern), 0)
  if (explanatoryHits >= 2) {
    issues.push({
      type: 'Explanatory_Afterthought',
      severity: explanatoryHits >= 4 ? 5 : 4,
      message: `草稿出现 ${explanatoryHits} 处后置解释/补丁说明。`,
      quote: EXPLANATORY_PATTERNS.map(pattern => firstMatch(content, pattern)).find(Boolean),
      fixInstruction: '信息已经成立时立刻停，删除“也就是说/这说明/不是X而是Y”式解释补丁，用行动结果替代机制说明。',
    })
  }

  const analyticalQuote = firstMatch(
    opening,
    /[^。！？\n]{0,25}(说明|意味着|绝对|必须|需要|得在|他得)[^。！？\n]{10,90}(结构|安全|水|机制|信号|模块|功能|商城|图鉴)[^。！？\n]{0,40}/,
  )
  if (analyticalQuote) {
    issues.push({
      type: 'Analytical_Exposition',
      severity: 4,
      message: '开篇出现偏作者旁白/理性分析式说明，容易把穿越现场写成设定报告。',
      quote: analyticalQuote,
      fixInstruction: '把分析压成角色当下的短判断或动作，例如“霉味太重，得先找水”，不要展开材料、结构、安全原理。',
    })
  }

  const deathWordHits = countWords(content, DEATH_WORDS)
  if (deathWordHits >= 10) {
    issues.push({
      type: 'Death_Word_Density',
      severity: deathWordHits >= 18 ? 5 : 3,
      message: `草稿命中 ${deathWordHits} 个虚化高风险词。`,
      quote: DEATH_WORDS.filter(word => content.includes(word)).join('、'),
      fixInstruction: '保留极少数有效表达，其余改成具体动作、物件、结果，或直接删除。',
    })
  }

  const rhetoricHits = countMatches(content, /像|仿佛|好像|宛如/g)
  const rhetoricDensity = rhetoricHits * 800 / Math.max(content.length, 1)
  if (rhetoricHits >= 6 && rhetoricDensity > 1.6) {
    issues.push({
      type: 'Rhetoric_Pileup',
      severity: 4,
      message: `明显比喻/类比约 ${rhetoricHits} 处，超过每 800 字 1 个的建议密度。`,
      quote: firstMatch(content, /[^。！？\n]{0,30}(像|仿佛|好像|宛如)[^。！？\n]{0,60}/),
      fixInstruction: '关键处境用白描，吐槽只留短而准的一处；不要每个信息点都包比喻。',
    })
  }

  const systemPanelLines = content
    .split(/\r?\n/)
    .filter(line => /【[^】]{2,80}】/.test(line)).length
  if (systemPanelLines >= 5) {
    issues.push({
      type: 'System_Info_Dump',
      severity: 4,
      message: `草稿包含 ${systemPanelLines} 行系统/面板样式信息，疑似信息说明水段。`,
      quote: firstMatch(content, /【[^】]{2,80}】/),
      fixInstruction: '只保留当前决策需要的系统提示，把商城、面板、图鉴等说明延后到需要使用时再出现。',
    })
  }

  for (const anti of readStyleAntiPatterns(opts.bookDir)) {
    const keyword = anti.match(/高风险词：(.+)$/)?.[1]
    if (keyword && content.includes(keyword)) {
      issues.push({
        type: 'Style_Anti_Pattern',
        severity: 2,
        message: `命中文风控制面的高风险词：${keyword}`,
        quote: keyword,
        fixInstruction: '按 style_profile 的文风禁区克制使用；如果不是必要表达，替换为更具体的行动或结果。',
      })
    }
  }

  const blockEditorial = issues.some(issue => issue.severity >= 5)
  return {
    passed: issues.length === 0,
    blockEditorial,
    issues,
  }
}

export function formatDraftSelfCheck(result: DraftSelfCheckResult): string {
  if (result.issues.length === 0) return 'Self-check passed.'
  const lines = [
    result.blockEditorial
      ? 'Self-check failed: 存在严重草稿问题，先自修再送审。'
      : 'Self-check warnings: 草稿已保存，但建议送审前自修以下问题。',
  ]
  result.issues.forEach((issue, index) => {
    lines.push(`${index + 1}. [sev${issue.severity}] ${issue.type}: ${issue.message}`)
    if (issue.quote) lines.push(`   片段：${issue.quote}`)
    lines.push(`   处理：${issue.fixInstruction}`)
  })
  return lines.join('\n')
}
