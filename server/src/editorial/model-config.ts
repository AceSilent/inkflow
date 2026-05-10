import { type LLMConfig } from '../llm/provider.js'
import { getSettings } from '../routes/settings.js'
import { EDITORIAL_REVIEWERS, type EditorialReviewerName } from './pipeline.js'

function modelConfigFromSelector(dataDir: string, modelSelector: string): LLMConfig | undefined {
  const settings = getSettings(dataDir)
  if (modelSelector.includes('/')) {
    const [providerId, ...modelParts] = modelSelector.split('/')
    const model = modelParts.join('/')
    const provider = settings.providers.find(p => p.id === providerId)
    if (provider) {
      return { apiKey: provider.apiKey, baseURL: provider.baseUrl, model }
    }
  }
  return undefined
}

export function editorialLLMConfig(dataDir: string): LLMConfig {
  const settings = getSettings(dataDir)
  const modelSelector = settings.editorModel || settings.authorModel || ''
  const configured = modelConfigFromSelector(dataDir, modelSelector)
  if (configured) return configured

  return {
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL,
    model: process.env.EDITORIAL_MODEL || process.env.LLM_MODEL || '',
  }
}

export function reviewerLLMConfigs(dataDir: string): Partial<Record<EditorialReviewerName, LLMConfig>> {
  const settings = getSettings(dataDir)
  const configs: Partial<Record<EditorialReviewerName, LLMConfig>> = {}
  const reviewerModels = settings.reviewerModels ?? {}
  for (const reviewer of EDITORIAL_REVIEWERS) {
    const selector = reviewerModels[reviewer.name]
    if (!selector) continue
    const config = modelConfigFromSelector(dataDir, selector)
    if (config) configs[reviewer.name] = config
  }
  return configs
}
