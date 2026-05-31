/**
 * Workbench routes — annotation CRUD for the chapter workbench UI.
 *
 * Annotations are stored per-chapter at `04_Drafts/annotations_{chId}.json`.
 * Every user highlight on the chapter text becomes one annotation record;
 * adopted editorial issues are materialised into this same list.
 */
import type { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'
import {
  createAnnotationSchema,
  updateAnnotationSchema,
  setStatusBodySchema,
  sendAnnotationsBodySchema,
  resubmitReviewBodySchema,
  type Annotation,
  type ChapterStatus,
} from './schemas.js'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { ensureDir, safeReadJson, writeJson } from '../utils/file-io.js'
import { MIN_REVIEW_DRAFT_CHARS } from '../tools/write-tools.js'
import { formatDraftSelfCheck, runDraftSelfCheck } from '../tools/draft-self-check.js'

interface WorkbenchOptions {
  dataDir: string
}

function annotationsFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  const safeCh = sanitizePathSegment(chId, 'chapterId')
  return path.join(dataDir, safeBook, '04_Drafts', `annotations_${safeCh}.json`)
}

function statusFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  const safeCh = sanitizePathSegment(chId, 'chapterId')
  return path.join(dataDir, safeBook, '04_Drafts', `chapter_status_${safeCh}.json`)
}

function lockFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  const safeCh = sanitizePathSegment(chId, 'chapterId')
  return path.join(dataDir, safeBook, '04_Drafts', `workbench_lock_${safeCh}`)
}

function loadAnnotations(file: string): Annotation[] {
  return safeReadJson<Annotation[]>(file) ?? []
}

function nanoId(): string {
  return 'ann_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function buildAnnotationPrompt(
  chId: string,
  _draftText: string,
  annotations: Annotation[],
  reviewAfterRevision: 'none' | 'failed_only' | 'full' = 'none',
): string {
  const lines: string[] = [
    `请根据以下批注修改 stage ${chId}（原文在 04_Drafts/${chId}.md）。`,
    '',
  ]
  annotations.forEach((a, i) => {
    lines.push(`【批注 ${i + 1}】引用："${a.quote}"`)
    if (a.source === 'adopted_review' && a.source_reviewer) {
      lines.push(`  （采纳自 ${a.source_reviewer}）`)
    }
    lines.push(`  评论：${a.comment}`)
    lines.push('')
  })
  lines.push(
    `请先 load_skill("stage_edit")，优先做局部编辑和必要扩写，保留已经成立的段落、语气和伏笔；只有结构整体失效时才 load_skill("stage_rewrite") 整个 stage 重写。`,
  )
  lines.push(
    `修改后用 save_script 保存完整新版本。保存稿必须不少于 ${MIN_REVIEW_DRAFT_CHARS} 字符。`,
  )
  if (reviewAfterRevision === 'failed_only') {
    lines.push('保存后调用 submit_to_editorial，并传 review_scope: "failed_only"、reset_auto_revision_budget: true，只复审上一轮未过的设定/逻辑审稿人；慢审通过后仍等待人类终审。')
  } else if (reviewAfterRevision === 'full') {
    lines.push('保存后调用 submit_to_editorial，并传 review_scope: "full"、reset_auto_revision_budget: true，重新跑设定考据和逻辑审核。慢审通过后仍等待人类终审。')
  } else {
    lines.push('保存后不要再次送审，先停下来向我汇报改了什么，等待我人工确认或另行要求送审。')
  }
  lines.push('最后告知哪些批注已处理，哪些未处理以及原因。')
  return lines.join('\n')
}

export const workbenchRoutes: FastifyPluginAsync<WorkbenchOptions> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/books/:bookId/chapters/:chId/annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = annotationsFile(dataDir, bookId, chId)
      return reply.send(loadAnnotations(file))
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.post('/books/:bookId/chapters/:chId/annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const body = createAnnotationSchema.parse(req.body)
      const file = annotationsFile(dataDir, bookId, chId)
      ensureDir(path.dirname(file))
      const list = loadAnnotations(file)
      const newAnn: Annotation = {
        ...body,
        id: nanoId(),
        status: 'open',
        created_at: new Date().toISOString(),
      }
      list.push(newAnn)
      writeJson(file, list)
      return reply.code(201).send(newAnn)
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.patch('/books/:bookId/chapters/:chId/annotations/:annId', async (req, reply) => {
    const { bookId, chId, annId } = req.params as { bookId: string; chId: string; annId: string }
    try {
      const patch = updateAnnotationSchema.parse(req.body)
      const file = annotationsFile(dataDir, bookId, chId)
      const list = loadAnnotations(file)
      const idx = list.findIndex((a) => a.id === annId)
      if (idx < 0) return reply.code(404).send({ error: 'Annotation not found' })
      list[idx] = { ...list[idx], ...patch }
      writeJson(file, list)
      return reply.send(list[idx])
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.delete('/books/:bookId/chapters/:chId/annotations/:annId', async (req, reply) => {
    const { bookId, chId, annId } = req.params as { bookId: string; chId: string; annId: string }
    try {
      const file = annotationsFile(dataDir, bookId, chId)
      const list = loadAnnotations(file)
      const next = list.filter((a) => a.id !== annId)
      writeJson(file, next)
      return reply.code(204).send()
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.get('/books/:bookId/chapters/:chId/status', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = statusFile(dataDir, bookId, chId)
      const existing = safeReadJson<ChapterStatus>(file)
      if (existing) return reply.send(existing)
      return reply.send({ chapter_id: chId, user_decision: null })
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.put('/books/:bookId/chapters/:chId/status', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const body = setStatusBodySchema.parse(req.body)
      const file = statusFile(dataDir, bookId, chId)
      ensureDir(path.dirname(file))
      const existing = safeReadJson<ChapterStatus>(file)
      const humanGate = { ...(existing?.human_gate ?? {}) }
      if (body.gate === 'pre_review') {
        humanGate.pre_review_decision = body.pre_review_decision ?? (
          body.user_decision === 'approved' ? 'approved' : 'needs_revision'
        )
      } else if (body.gate === 'post_review') {
        humanGate.post_review_decision = body.post_review_decision ?? (
          body.user_decision === 'approved' ? 'approved' : 'needs_revision'
        )
      }
      if (body.note) humanGate.note = body.note
      const status: ChapterStatus = {
        chapter_id: chId,
        user_decision: body.user_decision,
        human_gate: Object.keys(humanGate).length > 0 ? humanGate : undefined,
        decided_at: body.user_decision ? new Date().toISOString() : undefined,
        note: body.note,
      }
      writeJson(file, status)
      return reply.send(status)
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  // Batch-send selected annotations to the Author Agent. This route does NOT
  // directly invoke the Agent — it composes a prompt from the chosen
  // annotations, marks them as `sent` with a shared batch_id, and returns the
  // prompt text. The frontend then POSTs that prompt to the existing SSE chat
  // endpoint (`/api/v1/author-chat/:bookId/send`) to drive the Agent run.
  app.post('/books/:bookId/chapters/:chId/send-annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const body = sendAnnotationsBodySchema.parse(req.body)
      const safeBook = sanitizePathSegment(bookId, 'bookId')
      const safeCh = sanitizePathSegment(chId, 'chapterId')
      const annFile = annotationsFile(dataDir, bookId, chId)
      const all = loadAnnotations(annFile)
      const chosen = all.filter((a) => body.annotation_ids.includes(a.id))
      if (chosen.length === 0) {
        return reply.code(400).send({ error: 'No matching annotations found' })
      }
      const draftFile = path.join(dataDir, safeBook, '04_Drafts', `${safeCh}.md`)
      const draftText = fs.existsSync(draftFile) ? fs.readFileSync(draftFile, 'utf8') : ''
      const batchId =
        'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const promptText = buildAnnotationPrompt(chId, draftText, chosen, body.review_after_revision)
      const now = new Date().toISOString()
      const chosenIds = new Set(chosen.map((a) => a.id))
      const updated: Annotation[] = all.map((a) =>
        chosenIds.has(a.id)
          ? { ...a, status: 'sent' as const, sent_batch_id: batchId, sent_at: now }
          : a,
      )
      writeJson(annFile, updated)
      return reply.send({ batch_id: batchId, prompt: promptText, count: chosen.length })
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  // Re-submit an already-saved draft to the Editorial department without going
  // through the Author Agent. The Agent path uses the same
  // runEditorialPipelineForChapter() helper, so both entry points converge.
  //
  // Dynamic import of ../editorial/editorial.js is deliberate: it lets vitest
  // `vi.doMock()` intercept the pipeline function per-test without having to
  // plumb a dependency-injection hook through the Fastify options.
  app.post('/books/:bookId/chapters/:chId/resubmit-review', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const safeBook = sanitizePathSegment(bookId, 'bookId')
      const safeCh = sanitizePathSegment(chId, 'chapterId')
      const bookDir = path.join(dataDir, safeBook)
      const draftFile = path.join(bookDir, '04_Drafts', `${safeCh}.md`)
      if (!fs.existsSync(draftFile)) {
        return reply.code(400).send({ error: `Draft ${safeCh}.md not found.` })
      }
      const draftText = fs.readFileSync(draftFile, 'utf8')
      if (draftText.length < MIN_REVIEW_DRAFT_CHARS) {
        return reply.code(400).send({
          error: `Draft ${safeCh}.md has ${draftText.length} chars; minimum for editorial review is ${MIN_REVIEW_DRAFT_CHARS}.`,
          code: 'DRAFT_TOO_SHORT_FOR_REVIEW',
          current_chars: draftText.length,
          minimum_chars: MIN_REVIEW_DRAFT_CHARS,
        })
      }
      const selfCheck = runDraftSelfCheck(draftText, {
        minReviewChars: MIN_REVIEW_DRAFT_CHARS,
        bookDir,
      })
      if (selfCheck.blockEditorial) {
        return reply.code(400).send({
          error: '保存剧本未通过本地快速自检，暂不进入慢审稿。',
          code: 'DRAFT_SELF_CHECK_FAILED',
          self_check: selfCheck,
          message: formatDraftSelfCheck(selfCheck),
        })
      }
      const meta = safeReadJson<{ tone?: string; genre?: string }>(
        path.join(bookDir, '00_Config', 'book_meta.json'),
      ) ?? {}
      const body = resubmitReviewBodySchema.parse(req.body ?? {})

      const { runEditorialPipelineForChapter } = await import('../editorial/editorial.js')
      const result = await runEditorialPipelineForChapter({
        bookDir,
        chapterId: safeCh,
        draftText,
        bookTone: meta.tone,
        bookGenre: meta.genre,
        reviewScope: body?.review_scope,
        reviewers: body?.reviewers ?? ['editorial_lore', 'editorial_causality'],
        resetAutoRevisionBudget: true,
      })
      return reply.code(200).send(result)
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.post('/books/:bookId/chapters/:chId/workbench-lock', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = lockFile(dataDir, bookId, chId)
      ensureDir(path.dirname(file))
      fs.writeFileSync(file, new Date().toISOString(), 'utf8')
      return reply.code(201).send({ locked: true })
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.delete('/books/:bookId/chapters/:chId/workbench-lock', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = lockFile(dataDir, bookId, chId)
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      } catch {
        // swallow — idempotent
      }
      return reply.code(204).send()
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })
}
