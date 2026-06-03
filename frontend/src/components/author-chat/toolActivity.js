const READ_TOOLS = new Set([
  'read_file',
  'read_outline',
  'read_graph',
  'search_lore',
  'query_unresolved_setups',
  'browse_examples',
  'list_skills',
  'list_files',
  'load_skill',
])

const EDIT_TOOLS = new Set([
  'save_draft',
  'save_outline',
  'save_lore',
  'create_book',
  'analyze_style_profile',
  'add_plot_node',
  'add_edge',
  'remove_edge',
  'confirm_path',
  'prune_branch',
  'merge_branches',
  'submit_for_review',
])

const VERBS = {
  read_file: ['authorChat.toolVerbRead', 'Read'],
  read_outline: ['authorChat.toolVerbRead', 'Read'],
  read_graph: ['authorChat.toolVerbRead', 'Read'],
  search_lore: ['authorChat.toolVerbSearch', 'Search'],
  query_unresolved_setups: ['authorChat.toolVerbQuery', 'Query'],
  browse_examples: ['authorChat.toolVerbBrowse', 'Browse'],
  list_skills: ['authorChat.toolVerbList', 'List'],
  list_files: ['authorChat.toolVerbList', 'List'],
  load_skill: ['authorChat.toolVerbLoad', 'Load'],
  save_draft: ['authorChat.toolVerbEdited', 'Edited'],
  save_outline: ['authorChat.toolVerbEdited', 'Edited'],
  save_lore: ['authorChat.toolVerbEdited', 'Edited'],
  create_book: ['authorChat.toolVerbCreated', 'Created'],
  analyze_style_profile: ['authorChat.toolVerbUpdated', 'Updated'],
  add_plot_node: ['authorChat.toolVerbUpdated', 'Updated'],
  add_edge: ['authorChat.toolVerbUpdated', 'Updated'],
  remove_edge: ['authorChat.toolVerbUpdated', 'Updated'],
  confirm_path: ['authorChat.toolVerbUpdated', 'Updated'],
  prune_branch: ['authorChat.toolVerbUpdated', 'Updated'],
  merge_branches: ['authorChat.toolVerbUpdated', 'Updated'],
  submit_for_review: ['authorChat.toolVerbReviewed', 'Reviewed'],
}

const SUMMARY_FALLBACKS = {
  'authorChat.toolExplored': '已探索 {count} 个文件',
  'authorChat.toolEdited': '已编辑 {count} 个文件',
  'authorChat.toolCalled': '已调用 {count} 个工具',
}

const ARG_LABEL_FIELDS = [
  'relative_path',
  'file_path',
  'path',
  'filename',
  'book_id',
  'bookId',
  'chapter_id',
  'chapterId',
  'title',
  'name',
]

function parseArgsPreview(argsPreview) {
  if (!argsPreview || typeof argsPreview !== 'string') return null
  try {
    return JSON.parse(argsPreview)
  } catch {
    return null
  }
}

function lastPathPart(value) {
  if (!value || typeof value !== 'string') return ''
  const normalized = value.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || normalized
}

function labelFromArgs(argsPreview) {
  const parsed = parseArgsPreview(argsPreview)
  if (parsed && typeof parsed === 'object') {
    for (const field of ARG_LABEL_FIELDS) {
      const label = lastPathPart(parsed[field])
      if (label) return label
    }
  }

  const loose = argsPreview?.match(/["']?([A-Za-z0-9_.-]+\.[A-Za-z0-9]+)["']?/)
  return loose?.[1] || ''
}

function isReadTool(segment) {
  return READ_TOOLS.has(segment.name)
}

function isEditTool(segment) {
  return EDIT_TOOLS.has(segment.name)
}

function formatWithCount(key, count, t) {
  const template = t ? t(key) : SUMMARY_FALLBACKS[key]
  return (template || SUMMARY_FALLBACKS[key]).replace('{count}', count)
}

function translatedVerb(segment, t) {
  const entry = VERBS[segment.name]
  if (!entry) return segment.name
  const [key, fallback] = entry
  return t ? t(key) : fallback
}

export function groupAssistantSegments(segments = []) {
  const grouped = []
  let currentToolGroup = null

  for (const segment of segments) {
    if (segment.type === 'tool_call') {
      if (!currentToolGroup) {
        currentToolGroup = { type: 'tool_group', segments: [] }
        grouped.push(currentToolGroup)
      }
      currentToolGroup.segments.push(segment)
      continue
    }

    currentToolGroup = null
    grouped.push(segment)
  }

  return grouped
}

export function toolActivitySummary(segments = [], t) {
  const count = segments.length
  if (count === 0) return formatWithCount('authorChat.toolCalled', count, t)
  if (segments.every(isReadTool)) return formatWithCount('authorChat.toolExplored', count, t)
  if (segments.every(isEditTool)) return formatWithCount('authorChat.toolEdited', count, t)
  return formatWithCount('authorChat.toolCalled', count, t)
}

export function toolActivityLine(segment, t) {
  const verb = translatedVerb(segment, t)
  const label = labelFromArgs(segment.argsPreview)
  return label ? `${verb} ${label}` : verb
}
