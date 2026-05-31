/**
 * Outline renumber service — cascade-renames chapter IDs so they match
 * outline order (ch01, ch02, ...).
 *
 * Two-phase rename (temp prefix → final) is required: the outline may reorder
 * chapters such that the source and destination names overlap (e.g. old ch01
 * must become new ch02 while old ch02 must become new ch01). Renaming old ch01
 * → ch02 directly would clobber old ch02. Phase 1 moves every source to a
 * unique temp path; Phase 2 moves the temp paths to their final destinations.
 *
 * All related per-chapter artifacts follow the same rename:
 *   - 04_Drafts/{chId}.md                  (main draft)
 *   - 04_Drafts/review_{chId}.json         (editorial review results)
 *   - 04_Drafts/chapter_status_{chId}.json (workbench status)
 *   - 04_Drafts/annotations_{chId}.json    (workbench annotations)
 *   - .draft_history/{chId}/               (per-chapter draft history dir)
 *
 * plot_graph.json's node[].references array is also patched so plot-graph
 * chapter refs don't become stale.
 */
import fs from 'fs'
import path from 'path'
import { safeReadJson, writeJson } from '../utils/file-io.js'
import { createBackup, appendAuditLog } from '../tools/safety.js'

interface RenameOp { from: string; to: string }

export interface RenumberResult {
  renamed: RenameOp[]
  skipped: string[]
}

/** Leaf-level outline types that represent actual content units. */
const LEAF_OUTLINE_TYPES = new Set(['chapter', 'scene', 'stage'])

function walkChapters(node: any, acc: any[] = []): any[] {
  if (!node) return acc
  if (LEAF_OUTLINE_TYPES.has(node.type)) acc.push(node)
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkChapters(c, acc)
  }
  return acc
}

const RELATED_FILES = (chId: string): string[] => [
  `04_Drafts/${chId}.md`,
  `04_Drafts/review_${chId}.json`,
  `04_Drafts/chapter_status_${chId}.json`,
  `04_Drafts/annotations_${chId}.json`,
]

const RELATED_DIRS = (chId: string): string[] => [
  `.draft_history/${chId}`,
]

export async function renumberChapters(bookDir: string): Promise<RenumberResult> {
  const outlineFile = path.join(bookDir, '02_Outlines', 'outline.json')
  const outline = safeReadJson<any>(outlineFile)
  if (!outline) return { renamed: [], skipped: [] }

  const chapters = walkChapters(outline)
  const mapping: Record<string, string> = {}
  chapters.forEach((node, idx) => {
    const newId = 'ch' + String(idx + 1).padStart(2, '0')
    if (node.id !== newId) mapping[node.id] = newId
  })

  const renamed: RenameOp[] = []
  const skipped: string[] = []

  if (Object.keys(mapping).length === 0) return { renamed, skipped }

  // Two-phase rename: move all sources to a temp prefix first to avoid
  // collisions when destinations overlap with other sources' names.
  const tmpPrefix = '__renum_' + Date.now().toString(36) + '_'

  // Phase 1: old → tmp
  for (const [oldId, newId] of Object.entries(mapping)) {
    for (const rel of RELATED_FILES(oldId)) {
      const src = path.join(bookDir, rel)
      if (fs.existsSync(src)) {
        const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
        createBackup(src)
        fs.renameSync(src, tmp)
      }
    }
    for (const rel of RELATED_DIRS(oldId)) {
      const src = path.join(bookDir, rel)
      if (fs.existsSync(src)) {
        const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
        fs.renameSync(src, tmp)
      }
    }
  }

  // Phase 2: tmp → new
  for (const [oldId, newId] of Object.entries(mapping)) {
    for (const rel of RELATED_FILES(oldId)) {
      const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
      const dst = path.join(bookDir, rel.replace(oldId, newId))
      if (fs.existsSync(tmp)) fs.renameSync(tmp, dst)
    }
    for (const rel of RELATED_DIRS(oldId)) {
      const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
      const dst = path.join(bookDir, rel.replace(oldId, newId))
      if (fs.existsSync(tmp)) fs.renameSync(tmp, dst)
    }
    renamed.push({ from: oldId, to: newId })
  }

  // Update outline node ids
  chapters.forEach((node, idx) => {
    const newId = 'ch' + String(idx + 1).padStart(2, '0')
    if (mapping[node.id]) node.id = newId
  })
  createBackup(outlineFile)
  writeJson(outlineFile, outline)

  // Update plot_graph.json references
  const plotGraphFile = path.join(bookDir, 'plot_graph.json')
  const pg = safeReadJson<any>(plotGraphFile)
  if (pg && pg.nodes) {
    let changed = false
    for (const node of Object.values<any>(pg.nodes)) {
      if (Array.isArray(node.references)) {
        const original = node.references.slice()
        const updated = original.map((r: string) => mapping[r] ?? r)
        if (updated.some((r: string, i: number) => r !== original[i])) {
          node.references = updated
          changed = true
        }
      }
    }
    if (changed) {
      createBackup(plotGraphFile)
      writeJson(plotGraphFile, pg)
    }
  }

  appendAuditLog(
    path.join(bookDir, 'audit_log.jsonl'),
    'renumber_chapters',
    {},
    JSON.stringify({ mapping }),
    true,
  )

  return { renamed, skipped }
}
