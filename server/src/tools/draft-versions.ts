import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { type ToolDefinition } from './base-tool.js'
import {
  compareDraftVersions,
  listDraftVersions,
  type DraftRevisionActor,
} from './draft-history.js'

const actorLabel: Record<DraftRevisionActor, string> = {
  user: '用户',
  agent: '作者 Agent',
  system: '系统',
  legacy: '历史版本（来源未知）',
}

function chapterDraftPath(dataDir: string, bookId: string, chapterId: string): string {
  return path.join(dataDir, bookId, '04_Drafts', `${chapterId}.md`)
}

export const listDraftVersionsTool: ToolDefinition = {
  name: 'list_draft_versions',
  description: [
    '列出某章的正文版本、保存时间和修改来源。',
    '当用户提到“我刚改的”“你改的”“上一版”“之前的写法”或要求比较修改时，先调用此工具，不要凭当前文字或聊天语感猜归属。',
    '旧版 InkFlow 留下但没有来源元数据的记录会明确标为“来源未知”。',
  ].join('\n'),
  parameters: z.object({
    chapter_id: z.string().regex(/^ch\d{1,4}$/i).describe('章节 id，如 ch01'),
    limit: z.number().int().min(1).max(50).optional().describe('最多返回多少条，默认 20'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ chapter_id, limit = 20 }, ctx) => {
    const chapterId = chapter_id.toLowerCase()
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const draftPath = chapterDraftPath(ctx.dataDir, ctx.bookId, chapterId)
    if (!fs.existsSync(draftPath)) return `Error: Draft not found: 04_Drafts/${chapterId}.md`

    const versions = listDraftVersions(bookDir, chapterId, draftPath).slice(0, limit)
    if (versions.length === 0) return `No saved revisions for ${chapterId}.`

    return [
      `${chapterId} 正文版本（新到旧）`,
      ...versions.map(version => [
        `- ${version.id}${version.is_current ? ' [当前]' : ''}`,
        `${actorLabel[version.actor]}`,
        `${version.created_at}`,
        `${version.chars} 字`,
        version.source === 'restore' && version.restored_from
          ? `由 ${version.restored_from} 恢复`
          : '',
      ].filter(Boolean).join(' · ')),
      '',
      '需要判断具体改动时，继续调用 compare_draft_versions；仅凭版本时间不能推断文字归属。',
    ].join('\n')
  },
}

export const compareDraftVersionsTool: ToolDefinition = {
  name: 'compare_draft_versions',
  description: [
    '比较同一章节的两个正文版本，返回真实的逐行增删 diff 和双方来源。',
    'to_revision 可使用 current；版本 id 先由 list_draft_versions 获取。',
    '只有 diff 和版本来源明确支持时，才能把某处改动归因给用户或作者 Agent。',
  ].join('\n'),
  parameters: z.object({
    chapter_id: z.string().regex(/^ch\d{1,4}$/i).describe('章节 id，如 ch01'),
    from_revision: z.string().min(1).describe('较早版本 id'),
    to_revision: z.string().min(1).optional().describe("较新版本 id，默认 'current'"),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ chapter_id, from_revision, to_revision = 'current' }, ctx) => {
    const chapterId = chapter_id.toLowerCase()
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const draftPath = chapterDraftPath(ctx.dataDir, ctx.bookId, chapterId)
    if (!fs.existsSync(draftPath)) return `Error: Draft not found: 04_Drafts/${chapterId}.md`

    const result = compareDraftVersions(
      bookDir,
      chapterId,
      from_revision,
      to_revision,
      draftPath,
    )
    if (!result) return 'Error: One or both draft revisions were not found.'

    const diff = result.unified_diff.length > 24_000
      ? `${result.unified_diff.slice(0, 24_000)}\n...[diff truncated]`
      : result.unified_diff
    return [
      `比较 ${result.from.id} -> ${result.to.id}`,
      `较早版本：${actorLabel[result.from.actor]} · ${result.from.created_at}`,
      `较新版本：${actorLabel[result.to.actor]} · ${result.to.created_at}`,
      `变化：+${result.additions} 行 / -${result.deletions} 行`,
      '',
      diff,
    ].join('\n')
  },
}
