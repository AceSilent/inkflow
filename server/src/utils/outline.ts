/**
 * Outline tree helpers shared by routes/data.ts, editorial/editorial.ts,
 * memory/chapter-summarizer.ts, and routes/books.ts.
 *
 * The outline is a recursive tree of `{ id, label, type, summary?, children? }`
 * where `type ∈ {project, story_package, stage}` (new) or `{book, volume, chapter, scene}` (legacy).
 * Multiple call sites used to walk it independently — this module is the single
 * source of truth for that traversal.
 *
 * Kept intentionally `unknown`-typed at the boundary because the outline
 * comes from disk (could be malformed); narrow inside.
 */

export interface OutlineNode {
  id?: string
  label?: string
  type?: 'project' | 'story_package' | 'stage' | 'book' | 'volume' | 'chapter' | 'scene'
  status?: string
  summary?: string
  children?: OutlineNode[]
}

export interface ChapterRecord {
  id: string
  label?: string
  status?: string
  summary?: string
}

/** Leaf-level outline types that represent actual content units (chapters/stages). */
const LEAF_OUTLINE_TYPES = new Set(['chapter', 'scene', 'stage'])

/** True if `node` looks shaped like an outline node (defensive). */
function isNode(node: unknown): node is OutlineNode {
  return !!node && typeof node === 'object' && !Array.isArray(node)
}

/**
 * DFS walk over the outline tree. Visitor return value is ignored — use
 * a captured array if you need to collect.
 */
export function walkOutline(root: unknown, visit: (node: OutlineNode) => void): void {
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const cur = stack.pop()
    if (!isNode(cur)) continue
    visit(cur)
    if (Array.isArray(cur.children)) {
      // Push in reverse so left-to-right order is preserved on pop.
      for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i])
    }
  }
}

/**
 * Collect every chapter node in document order.
 */
export function collectChapters(root: unknown): ChapterRecord[] {
  const out: ChapterRecord[] = []
  walkOutline(root, n => {
    if (LEAF_OUTLINE_TYPES.has(n.type ?? '') && typeof n.id === 'string') {
      out.push({ id: n.id, label: n.label, status: n.status, summary: n.summary })
    }
  })
  return out
}

/**
 * Find a single chapter node by id. Returns null if missing or root is malformed.
 */
export function findChapterById(root: unknown, chapterId: string): ChapterRecord | null {
  let found: ChapterRecord | null = null
  walkOutline(root, n => {
    if (found) return
    if (LEAF_OUTLINE_TYPES.has(n.type ?? '') && n.id === chapterId) {
      found = { id: n.id, label: n.label, status: n.status, summary: n.summary }
    }
  })
  return found
}
