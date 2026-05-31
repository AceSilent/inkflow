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
  kind?: 'openai-compatible' | 'gemini-openai-compatible'
}

export type ContextManagerMode = 'auto' | 'decay_only' | 'disabled'

export interface ContextBudgetCustom {
  green?: number
  yellow?: number
  orange?: number
}

export interface AppSettings {
  providers: ProviderConfig[]
  authorModel: string
  editorModel: string
  reviewerModels?: Record<string, string>
  contextManager?: ContextManagerMode
  contextBudgetCustom?: ContextBudgetCustom
}

type RuntimeSettingsEnv = Partial<Record<
  'LLM_MODEL' |
  'AUTHOR_MODEL' |
  'EDITORIAL_MODEL' |
  'EDITOR_MODEL',
  string
>>

const DEFAULT_SETTINGS: AppSettings = {
  providers: [],
  authorModel: '',
  editorModel: '',
  contextManager: 'auto',
}

const RECOMMENDED_PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini',
    name: 'Gemini',
    kind: 'gemini-openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: '',
    models: ['gemini-3.5-flash'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
]

// ── Key masking ──

export function maskApiKey(key: string): string {
  if (!key || key.length < 9) return '****'
  return `${key.slice(0, 5)}...${key.slice(-4)}`
}

function isMaskedApiKey(key: string): boolean {
  return key === '****' || key.includes('...')
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
    reviewerModels: raw.reviewerModels ?? {},
    contextManager: raw.contextManager ?? 'auto',
    ...(raw.contextBudgetCustom ? { contextBudgetCustom: raw.contextBudgetCustom } : {}),
  }
}

export function saveSettings(dataDir: string, settings: AppSettings): void {
  // writeJson handles ensureDir(dirname) for us.
  writeJson(settingsPath(dataDir), settings)
}

export function mergeMaskedApiKeys(incoming: AppSettings, existing: AppSettings): AppSettings {
  const existingById = new Map(existing.providers.map(provider => [provider.id, provider]))
  return {
    ...incoming,
    providers: incoming.providers.map(provider => {
      if (!isMaskedApiKey(provider.apiKey)) return provider
      const previous = existingById.get(provider.id)?.apiKey
      return {
        ...provider,
        apiKey: previous || '',
      }
    }),
  }
}

export function applyRecommendedProviderDefaults(settings: AppSettings): AppSettings {
  const providers = [...(settings.providers ?? [])]

  for (const recommended of RECOMMENDED_PROVIDERS) {
    const existingIndex = providers.findIndex(provider => provider.id === recommended.id)
    if (existingIndex >= 0) {
      const existing = providers[existingIndex]
      providers[existingIndex] = {
        ...existing,
        name: existing.name || recommended.name,
        kind: recommended.kind,
        baseUrl: recommended.baseUrl,
        models: recommended.models,
      }
    } else {
      providers.push({ ...recommended })
    }
  }

  return {
    ...settings,
    providers,
    authorModel: settings.authorModel || 'gemini/gemini-3.5-flash',
    editorModel: settings.editorModel || 'deepseek/deepseek-v4-pro',
    reviewerModels: {
      editorial_lore: settings.reviewerModels?.editorial_lore || 'deepseek/deepseek-v4-pro',
      editorial_causality: settings.reviewerModels?.editorial_causality || 'deepseek/deepseek-v4-pro',
      ...(settings.reviewerModels || {}),
    },
  }
}

export function applyRuntimeSettingsFallback(
  settings: AppSettings,
  env: RuntimeSettingsEnv = process.env
): AppSettings {
  return {
    ...settings,
    authorModel: settings.authorModel || env.LLM_MODEL || env.AUTHOR_MODEL || '',
    editorModel: settings.editorModel || env.EDITORIAL_MODEL || env.EDITOR_MODEL || env.LLM_MODEL || env.AUTHOR_MODEL || '',
  }
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
    const settings = applyRuntimeSettingsFallback(getSettings(dataDir()))
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
        const nextSettings = mergeMaskedApiKeys(parsed.data as AppSettings, getSettings(dataDir()))
        saveSettings(dataDir(), nextSettings)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(500)
        return { error: err.message }
      }
    }
  )
}
