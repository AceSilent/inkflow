/**
 * Settings Route — Fastify route for managing app settings (LLM providers, models).
 *
 * Endpoints:
 *   GET /api/v1/settings  — return settings with masked API keys
 *   PUT /api/v1/settings  — save settings to settings.json
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'

// ── Types ──

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface AppSettings {
  providers: ProviderConfig[]
  authorModel: string
  editorModel: string
  readerModel: string
}

const DEFAULT_SETTINGS: AppSettings = {
  providers: [],
  authorModel: '',
  editorModel: '',
  readerModel: '',
}

// ── Key masking ──

export function maskApiKey(key: string): string {
  if (!key || key.length < 9) return '****'
  return `${key.slice(0, 5)}...${key.slice(-4)}`
}

// ── Helper functions (exported for direct testing) ──

function settingsPath(dataDir: string): string {
  return path.join(dataDir, 'settings.json')
}

export function getSettings(dataDir: string): AppSettings {
  const p = settingsPath(dataDir)
  if (!fs.existsSync(p)) return { ...DEFAULT_SETTINGS }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return {
      providers: raw.providers ?? [],
      authorModel: raw.authorModel ?? '',
      editorModel: raw.editorModel ?? '',
      readerModel: raw.readerModel ?? '',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(dataDir: string, settings: AppSettings): void {
  const p = settingsPath(dataDir)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8')
}

// ── Mask all API keys in a settings object ──

function maskSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    providers: settings.providers.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    })),
  }
}

// ── Fastify route registration ──

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  // GET /api/v1/settings — return settings with masked API keys
  app.get('/api/v1/settings', async () => {
    const settings = getSettings(dataDir())
    return maskSettings(settings)
  })

  // PUT /api/v1/settings — save settings
  app.put<{ Body: AppSettings }>(
    '/api/v1/settings',
    async (request, reply) => {
      try {
        saveSettings(dataDir(), request.body)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(500)
        return { error: err.message }
      }
    }
  )
}
