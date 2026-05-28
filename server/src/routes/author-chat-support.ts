import fs from 'fs'
import path from 'path'
import { type LLMConfig } from '../llm/provider.js'
import { clearRunTimeline } from '../runs/run-timeline.js'
import { saveHistory } from './chat-history.js'
import { getSettings } from './settings.js'

export const USAGE_PERSIST_TIMEOUT_MS = 2000
const usagePersistTimedOut = Symbol('usagePersistTimedOut')

export function loadAuthorChatConfig(dataDirOverride?: string): { llmConfig: LLMConfig; dataDir: string } {
  const dataDir = dataDirOverride || process.env.AUTONOVEL_DATA_DIR || 'books'
  const settings = getSettings(dataDir)
  const modelSelector = settings.authorModel || ''

  if (modelSelector.includes('/')) {
    const [providerId, ...modelParts] = modelSelector.split('/')
    const model = modelParts.join('/')
    const provider = settings.providers.find(p => p.id === providerId)
    if (provider) {
      return {
        llmConfig: {
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl,
          model,
        },
        dataDir,
      }
    }
  }

  return {
    llmConfig: {
      apiKey: process.env.LLM_API_KEY || '',
      baseURL: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL || 'gpt-4o',
    },
    dataDir,
  }
}

export function previewValue(value: unknown, max = 320): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return (text ?? '').replace(/\s+/g, ' ').slice(0, max)
}

export function clearAuthorChatSession(dataDir: string, bookId: string): void {
  const bookDir = path.join(dataDir, bookId)
  saveHistory(dataDir, bookId, [])
  clearRunTimeline(dataDir, bookId)
  for (const file of ['last_usage.json', 'context_log.jsonl']) {
    fs.rmSync(path.join(bookDir, file), { force: true })
  }
  fs.rmSync(path.join(bookDir, 'session_summaries'), { recursive: true, force: true })
  fs.rmSync(path.join(bookDir, 'compact_breaker.json'), { force: true })
}

export async function persistUsageBestEffort(
  usagePromise: PromiseLike<unknown>,
  usageFile: string,
  timeoutMs = USAGE_PERSIST_TIMEOUT_MS,
): Promise<'written' | 'skipped' | 'timeout'> {
  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<typeof usagePersistTimedOut>((resolve) => {
    timer = setTimeout(() => resolve(usagePersistTimedOut), timeoutMs)
  })
  try {
    const usage = await Promise.race([Promise.resolve(usagePromise), timeout])
    if (usage === usagePersistTimedOut) return 'timeout'
    const total = (usage as any)?.totalTokens ?? (usage as any)?.total_tokens
    if (typeof total === 'number' && total > 0) {
      fs.writeFileSync(
        usageFile,
        JSON.stringify({ total_tokens: total }),
        'utf8',
      )
      return 'written'
    }
    return 'skipped'
  } finally {
    if (timer) clearTimeout(timer)
  }
}
