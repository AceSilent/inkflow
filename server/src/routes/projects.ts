/**
 * Projects CRUD Route — Fastify route for managing projects as directory structures.
 *
 * Endpoints:
 *   GET    /api/v1/projects           — list all projects
 *   GET    /api/v1/projects/explorer  — tree structure for sidebar navigation
 *   GET    /api/v1/projects/:projectId — get single project metadata
 *   POST   /api/v1/projects           — create project with directory structure
 *   DELETE /api/v1/projects/:projectId — delete project directory
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'
import { createBookBody, bookIdParam } from './schemas.js'

// ── Types ──

export interface ProjectMeta {
  book_id: string
  title: string
  genre: string
  tone: string
  target_words: number
  created_at?: string
}

export interface TreeNode {
  id: string
  label: string
  type: 'book' | 'volume' | 'chapter' | 'scene' | 'draft'
  status?: string
  summary?: string
  children?: TreeNode[]
}

// ── Helper functions (exported for direct testing) ──

export function listProjects(dataDir: string): ProjectMeta[] {
  if (!fs.existsSync(dataDir)) return []

  const projects: ProjectMeta[] = []
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const meta = safeReadJson<ProjectMeta>(path.join(dataDir, entry.name, '00_Config', 'book_meta.json'))
    if (meta) projects.push(meta)
  }
  return projects
}

export function getProject(dataDir: string, projectId: string): ProjectMeta | null {
  return safeReadJson<ProjectMeta>(path.join(dataDir, projectId, '00_Config', 'book_meta.json'))
}

export function createProject(dataDir: string, meta: ProjectMeta): ProjectMeta {
  const projectDir = path.join(dataDir, meta.book_id)

  if (fs.existsSync(projectDir)) {
    throw new Error(`Project '${meta.book_id}' already exists`)
  }

  for (const sub of ['00_Config', '01_Global_Settings', '02_Outlines', 'memory']) {
    ensureDir(path.join(projectDir, sub))
  }

  const withTimestamp: ProjectMeta = {
    ...meta,
    created_at: meta.created_at || new Date().toISOString(),
  }
  writeJson(path.join(projectDir, '00_Config', 'book_meta.json'), withTimestamp)

  return withTimestamp
}

export function deleteProject(dataDir: string, projectId: string): void {
  const projectDir = path.join(dataDir, projectId)
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project '${projectId}' not found`)
  }
  fs.rmSync(projectDir, { recursive: true, force: true })
}

function scanOutlineNode(node: any): TreeNode {
  return {
    id: node.id || String(Math.random()),
    label: node.label || '',
    type: node.type || 'scene',
    status: node.status,
    summary: node.summary,
    children: node.children?.map(scanOutlineNode),
  }
}

export function explorerTree(dataDir: string): TreeNode[] {
  const projects = listProjects(dataDir)

  return projects.map((project) => {
    const projectDir = path.join(dataDir, project.book_id)
    const children: TreeNode[] = []
    const knownDraftFiles = new Set<string>()

    // Outline-defined chapters (canonical: outline.children → volumes → chapters)
    const outline = safeReadJson<{ children?: any[] }>(path.join(projectDir, '02_Outlines', 'outline.json'))
    if (outline?.children) {
      for (const vol of outline.children) children.push(scanOutlineNode(vol))
    }

    // Walk the just-built tree to learn which draft filenames are already
    // claimed by an outline chapter (chapter id → its draft file would be
    // ch01_v1.md / ch01.md / ${id}.txt). Anything else in 04_Drafts/ is
    // surfaced below as an orphan so the user actually sees it.
    const collectIds = (node: TreeNode) => {
      if (node.type === 'chapter') knownDraftFiles.add(node.id)
      node.children?.forEach(collectIds)
    }
    children.forEach(collectIds)

    const draftsDir = path.join(projectDir, '04_Drafts')
    if (fs.existsSync(draftsDir)) {
      const orphans: TreeNode[] = []
      for (const f of fs.readdirSync(draftsDir)) {
        if (f.startsWith('.') || f.startsWith('review_') || f.endsWith('.bak')) continue
        const stat = fs.statSync(path.join(draftsDir, f))
        if (!stat.isFile()) continue
        // Skip files clearly bound to an outline chapter (ch01.md, ch01_v1.md…)
        const bareName = f.replace(/\.(md|txt|markdown)$/i, '')
        const matchedKnown = [...knownDraftFiles].some((id) =>
          bareName === id || bareName.startsWith(`${id}_v`)
        )
        if (matchedKnown) continue
        orphans.push({
          id: `draft:${f}`,
          label: bareName,
          type: 'draft',
          summary: `${(stat.size / 1024).toFixed(1)} KB`,
        })
      }
      if (orphans.length > 0) {
        orphans.sort((a, b) => a.label.localeCompare(b.label))
        children.push({
          id: '__orphan_drafts__',
          label: '草稿（未关联大纲）',
          type: 'volume',
          children: orphans,
        })
      }
    }

    return {
      id: project.book_id,
      label: project.title,
      type: 'book',
      children,
    }
  })
}

// ── Fastify route registration ──

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  // GET /api/v1/projects — list all projects
  app.get('/api/v1/projects', async () => {
    return { projects: listProjects(dataDir()) }
  })

  // GET /api/v1/projects/explorer — tree structure for sidebar navigation
  app.get('/api/v1/projects/explorer', async () => {
    return explorerTree(dataDir())
  })

  // GET /api/v1/projects/:projectId — get single project metadata
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId',
    async (request, reply) => {
      const projectId = sanitizePathSegment(request.params.projectId, 'projectId')
      const project = getProject(dataDir(), projectId)
      if (!project) {
        reply.code(404)
        return { error: 'Project not found' }
      }
      return project
    }
  )

  // POST /api/v1/projects — create project
  app.post<{ Body: ProjectMeta }>(
    '/api/v1/projects',
    async (request, reply) => {
      try {
        const parsed = createBookBody.safeParse(request.body)
        if (!parsed.success) {
          reply.code(400)
          return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
        }
        const body = parsed.data as ProjectMeta
        sanitizePathSegment(body.book_id, 'book_id')
        const project = createProject(dataDir(), body)
        reply.code(201)
        return project
      } catch (err: any) {
        reply.code(err.message.includes('already exists') ? 409 : 400)
        return { error: err.message }
      }
    }
  )

  // DELETE /api/v1/projects/:projectId — delete project directory
  app.delete<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId',
    async (request, reply) => {
      try {
        const projectId = sanitizePathSegment(request.params.projectId, 'projectId')
        deleteProject(dataDir(), projectId)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(404)
        return { error: err.message }
      }
    }
  )
}
