/**
 * Settings Route — Fastify route for managing app settings (LLM providers, models).
 *
 * Endpoints:
 *   GET /api/v1/settings  — return settings with masked API keys
 *   PUT /api/v1/settings  — save settings to settings.json
 */
import { type FastifyInstance } from 'fastify'
import path from 'path'
import { safeReadJson, writeJson } from '../utils/file-io.js'
import { saveSettingsBody } from './schemas.js'

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
}

const DEFAULT_SETTINGS: AppSettings = {
  providers: [],
  authorModel: '',
  editorModel: '',
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
  const raw = safeReadJson<Partial<AppSettings>>(settingsPath(dataDir))
  if (!raw) return { ...DEFAULT_SETTINGS }
  return {
    providers: raw.providers ?? [],
    authorModel: raw.authorModel ?? '',
    editorModel: raw.editorModel ?? '',
  }
}

export function saveSettings(dataDir: string, settings: AppSettings): void {
  // writeJson handles ensureDir(dirname) for us.
  writeJson(settingsPath(dataDir), settings)
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
        const parsed = saveSettingsBody.safeParse(request.body)
        if (!parsed.success) {
          reply.code(400)
          return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
        }
        saveSettings(dataDir(), parsed.data as AppSettings)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(500)
        return { error: err.message }
      }
    }
  )
}
