/**
 * Session state — tracks recent read-tool results and the skills that are still
 * active in the current conversation branch.
 *
 * Skill state is rebuilt from persisted assistant segments on every request.
 * That makes its lifetime match the chat itself: editing from an older message
 * naturally drops later skills, and /clear removes them without a second store.
 */
import { loadSkillContent } from '../tools/skills.js'

export interface RecentRead {
  tool: string
  args: any
  excerpt: string
  timestamp: number
}

export interface LoadedSkill {
  name: string
  body: string
  activatedAt: number
}

export interface SessionState {
  recentReads: RecentRead[]
  loadedSkills: LoadedSkill[]
  decayedMessageIds: Set<string>
}

const READ_TOOLS = new Set(['read_file', 'read_outline', 'read_graph', 'search_lore'])
const MAX_LOADED_SKILLS = 3
const MAX_SKILL_BODY_CHARS = 12_000
export const PERSISTED_SKILL_STATE_HEADING = '# InkFlow 会话 Skill 状态'

interface SkillHistoryMessage {
  role?: string
  content?: unknown
  segments?: Array<{
    type?: string
    name?: string
    status?: string
    argsPreview?: string
    result?: string
  }>
}

function persistedSkillNames(content: unknown): string[] | null {
  if (typeof content !== 'string' || !content.startsWith(PERSISTED_SKILL_STATE_HEADING)) return null
  const payload = content.slice(PERSISTED_SKILL_STATE_HEADING.length).trim()
  try {
    const parsed = JSON.parse(payload)
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === 'string' && !!name.trim())
      : []
  } catch {
    return []
  }
}

function parseSkillName(argsPreview: string | undefined): string {
  if (!argsPreview) return ''
  try {
    const parsed = JSON.parse(argsPreview)
    return typeof parsed?.skill_name === 'string' ? parsed.skill_name.trim() : ''
  } catch {
    return ''
  }
}

function activateSkill(state: SessionState, name: string, body: string, activatedAt = Date.now()): void {
  if (!name || body.startsWith('Error: Unknown skill')) return
  const next: LoadedSkill = {
    name,
    body: body.slice(0, MAX_SKILL_BODY_CHARS),
    activatedAt,
  }
  state.loadedSkills = [
    next,
    ...state.loadedSkills.filter(skill => skill.name !== name),
  ].slice(0, MAX_LOADED_SKILLS)
}

export function createSessionState(history: SkillHistoryMessage[] = []): SessionState {
  const state: SessionState = {
    recentReads: [],
    loadedSkills: [],
    decayedMessageIds: new Set(),
  }

  history.forEach((message, messageIndex) => {
    const persistedNames = message.role === 'system'
      ? persistedSkillNames(message.content)
      : null
    if (persistedNames) {
      state.loadedSkills = []
      for (const skillName of [...persistedNames].reverse()) {
        activateSkill(state, skillName, loadSkillContent(skillName), messageIndex * 1000)
      }
    }
    if (message.role !== 'assistant' || !Array.isArray(message.segments)) return
    message.segments.forEach((segment, segmentIndex) => {
      if (segment.type !== 'tool_call' || segment.name !== 'load_skill' || segment.status !== 'done') return
      const skillName = parseSkillName(segment.argsPreview)
      if (!skillName) return
      const body = loadSkillContent(skillName)
      activateSkill(state, skillName, body, messageIndex * 1000 + segmentIndex)
    })
  })

  return state
}

export function buildPersistedSkillStateMessage(state: SessionState): { role: 'system'; content: string } | null {
  if (state.loadedSkills.length === 0) return null
  return {
    role: 'system',
    content: `${PERSISTED_SKILL_STATE_HEADING}\n${JSON.stringify(state.loadedSkills.map(skill => skill.name))}`,
  }
}

export function renderLoadedSkillsForPrompt(state: SessionState): string {
  if (state.loadedSkills.length === 0) {
    return [
      '当前对话尚未激活写作 Skill。',
      '仅当当前任务确实需要某项方法时，由你在内部直接调用 load_skill；不要建议、要求或提醒用户加载 Skill。',
    ].join('\n')
  }

  return [
    `当前对话已激活：${state.loadedSkills.map(skill => skill.name).join('、')}。`,
    '下列方法已经完整注入本轮上下文。不要再次调用 load_skill 加载同名 Skill，也不要向用户提及 Skill 调度；直接运用即可。',
    '',
    ...state.loadedSkills.flatMap(skill => [
      `## ${skill.name}`,
      skill.body,
      '',
    ]),
  ].join('\n').trim()
}

export function updateSessionStateAfterToolCall(
  state: SessionState,
  toolName: string,
  args: any,
  result: string,
): void {
  if (READ_TOOLS.has(toolName)) {
    state.recentReads.push({
      tool: toolName,
      args,
      excerpt: result.slice(0, 500),
      timestamp: Date.now(),
    })
    while (state.recentReads.length > 5) state.recentReads.shift()
  }
  if (toolName === 'load_skill') {
    const skillName = typeof args?.skill_name === 'string'
      ? args.skill_name.trim()
      : typeof args?.name === 'string'
        ? args.name.trim()
        : ''
    activateSkill(state, skillName, result)
  }
}
