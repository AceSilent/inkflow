/**
 * Export Routes — Download a story script package in multiple formats.
 *
 * Endpoints:
 *   GET /books/:bookId/export/:packageId?format=yaml|json|csv|html
 *     — Reads the compiled script from 03_Scripts/<packageId>.yaml,
 *       validates it against StoryPackageSchema, and streams the result
 *       as a downloadable file in the requested format.
 */
import type { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { StoryPackageSchema } from '../schemas/index.js'
import { exportYaml, exportJson, exportCsv, exportHtml } from '../tools/export.js'

interface ExportOptions {
  dataDir: string
}

type FormatKey = 'yaml' | 'json' | 'csv' | 'html'

interface FormatSpec {
  content: string
  mime: string
  ext: string
}

const SUPPORTED_FORMATS = new Set<FormatKey>(['yaml', 'json', 'csv', 'html'])

function buildFormatSpec(format: FormatKey, content: string): FormatSpec {
  const specs: Record<FormatKey, { mime: string; ext: string }> = {
    yaml: { mime: 'text/yaml', ext: 'yaml' },
    json: { mime: 'application/json', ext: 'json' },
    csv:  { mime: 'text/csv', ext: 'csv' },
    html: { mime: 'text/html', ext: 'html' },
  }
  return { content, ...specs[format] }
}

export const exportRoutes: FastifyPluginAsync<ExportOptions> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/books/:bookId/export/:packageId', async (req, reply) => {
    const { bookId, packageId } = req.params as { bookId: string; packageId: string }
    const safeBookId = sanitizePathSegment(bookId, 'bookId')
    const safePackageId = sanitizePathSegment(packageId, 'packageId')
    const rawFormat = ((req.query as Record<string, string>).format ?? 'yaml').toLowerCase()

    if (!SUPPORTED_FORMATS.has(rawFormat as FormatKey)) {
      return reply.status(400).send({ error: `Unknown format: ${rawFormat}. Use: yaml, json, csv, html` })
    }
    const format = rawFormat as FormatKey

    const yamlPath = path.join(dataDir, safeBookId, '03_Scripts', `${safePackageId}.yaml`)
    if (!fs.existsSync(yamlPath)) {
      return reply.status(404).send({ error: `Script not found: ${safePackageId}` })
    }

    const raw = parseYaml(fs.readFileSync(yamlPath, 'utf-8'))
    const parseResult = StoryPackageSchema.safeParse(raw)
    if (!parseResult.success) {
      return reply.status(422).send({ error: 'Invalid script schema' })
    }

    const pkg = parseResult.data
    const exporters: Record<FormatKey, () => string> = {
      yaml: () => exportYaml(pkg),
      json: () => exportJson(pkg),
      csv:  () => exportCsv(pkg),
      html: () => exportHtml(pkg),
    }

    const { content, mime, ext } = buildFormatSpec(format, exporters[format]())
    reply.header('Content-Disposition', `attachment; filename="${safePackageId}.${ext}"`)
    return reply.type(mime).send(content)
  })
}
