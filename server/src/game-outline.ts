export type GameOutlineNodeType = 'game_project' | 'arc' | 'story_package' | 'stage'

export interface GameOutlineNode {
  id: string
  type: GameOutlineNodeType
  label: string
  summary?: string
  status?: string
  package_id?: string
  stage_id?: string
  children?: GameOutlineNode[]
}

export interface GameOutlineRoot extends GameOutlineNode {
  type: 'game_project'
  children: GameOutlineNode[]
}

const VALID_GAME_OUTLINE_TYPES = new Set<GameOutlineNodeType>([
  'game_project',
  'arc',
  'story_package',
  'stage',
])

const ALLOWED_CHILD_TYPES: Record<GameOutlineNodeType, Set<GameOutlineNodeType>> = {
  game_project: new Set(['arc', 'story_package']),
  arc: new Set(['story_package', 'stage']),
  story_package: new Set(['stage']),
  stage: new Set(),
}

export function defaultGameOutline(bookId: string): GameOutlineRoot {
  return {
    id: bookId,
    label: '',
    type: 'game_project',
    children: [],
  }
}

export function validateGameOutlineRoot(value: unknown): string | null {
  const error = validateGameOutlineNode(value, 'root', null)
  if (error) return error

  const node = value as GameOutlineNode
  if (node.type !== 'game_project') {
    return `root: type must be 'game_project', got '${node.type}'`
  }
  if (!Array.isArray(node.children)) {
    return "root: 'children' must be an array"
  }
  return null
}

function validateGameOutlineNode(value: unknown, where: string, parentType: GameOutlineNodeType | null): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `${where}: must be an object, got ${Array.isArray(value) ? 'array' : typeof value}`
  }

  const node = value as Partial<GameOutlineNode>
  if (typeof node.type !== 'string' || !VALID_GAME_OUTLINE_TYPES.has(node.type as GameOutlineNodeType)) {
    return `${where}: missing or invalid 'type' (got ${JSON.stringify(node.type)}); must be one of game_project/arc/story_package/stage`
  }

  const nodeType = node.type as GameOutlineNodeType
  if (parentType && !ALLOWED_CHILD_TYPES[parentType].has(nodeType)) {
    return `${where}: ${parentType} cannot contain ${nodeType}`
  }
  if (typeof node.id !== 'string' || node.id.length === 0) {
    return `${where}: missing 'id' string`
  }
  if (node.id.length > 128) {
    return `${where}: 'id' is too long`
  }
  if (typeof node.label !== 'string') {
    return `${where}: missing 'label' string`
  }
  if (node.summary !== undefined && typeof node.summary !== 'string') {
    return `${where}: 'summary' must be a string`
  }
  if (node.status !== undefined && typeof node.status !== 'string') {
    return `${where}: 'status' must be a string`
  }
  if (node.package_id !== undefined && (typeof node.package_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(node.package_id))) {
    return `${where}: 'package_id' must be a safe script package id`
  }
  if (node.stage_id !== undefined && (typeof node.stage_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(node.stage_id))) {
    return `${where}: 'stage_id' must be a safe stage id`
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      return `${where}: 'children' must be an array if present`
    }
    for (let i = 0; i < node.children.length; i++) {
      const childError = validateGameOutlineNode(node.children[i], `${where}.children[${i}]`, nodeType)
      if (childError) return childError
    }
  }
  return null
}
