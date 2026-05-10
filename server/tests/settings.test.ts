import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  getSettings,
  saveSettings,
  maskApiKey,
  applyRuntimeSettingsFallback,
  type AppSettings,
  type ProviderConfig,
} from '../src/routes/settings.js'

const TEST_DIR = path.join(process.cwd(), '__test_settings__')

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

beforeEach(() => {
  cleanDir()
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  cleanDir()
})

describe('Settings route helpers', () => {
  it('should return defaults when no settings file exists', () => {
    const settings = getSettings(TEST_DIR)

    expect(settings.providers).toEqual([])
    expect(settings.authorModel).toBe('')
    expect(settings.editorModel).toBe('')
  })

  it('should save and load settings roundtrip', () => {
    const provider: ProviderConfig = {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-secret-key-12345',
      models: ['deepseek-chat', 'deepseek-reasoner'],
    }

    const original: AppSettings = {
      providers: [provider],
      authorModel: 'deepseek-chat',
      editorModel: 'deepseek-reasoner',
      reviewerModels: {
        editorial_lore: 'deepseek/deepseek-reasoner',
        editorial_ai_tone: 'dashscope/qwen3.6-plus',
      },
    }

    saveSettings(TEST_DIR, original)
    const loaded = getSettings(TEST_DIR)

    expect(loaded.providers).toHaveLength(1)
    expect(loaded.providers[0].id).toBe('deepseek')
    expect(loaded.providers[0].name).toBe('DeepSeek')
    expect(loaded.providers[0].baseUrl).toBe('https://api.deepseek.com/v1')
    expect(loaded.providers[0].apiKey).toBe('sk-secret-key-12345')
    expect(loaded.providers[0].models).toEqual(['deepseek-chat', 'deepseek-reasoner'])
    expect(loaded.authorModel).toBe('deepseek-chat')
    expect(loaded.editorModel).toBe('deepseek-reasoner')
    expect(loaded.reviewerModels?.editorial_lore).toBe('deepseek/deepseek-reasoner')
    expect(loaded.reviewerModels?.editorial_ai_tone).toBe('dashscope/qwen3.6-plus')
  })

  it('should mask API keys in GET response', () => {
    // Long key: show first 5 + ... + last 4
    expect(maskApiKey('sk-secret-key-12345')).toBe('sk-se...2345')

    // Another long key (19 chars): first 5 = "sk-ab", last 4 = "9xyz"
    expect(maskApiKey('sk-abc123456789xyz')).toBe('sk-ab...9xyz')

    // Key shorter than 9 chars: fully masked
    expect(maskApiKey('short')).toBe('****')

    // Exactly 8 chars: fully masked (threshold is 9)
    expect(maskApiKey('12345678')).toBe('****')

    // 9 chars: first 5 + ... + last 4
    expect(maskApiKey('123456789')).toBe('12345...6789')

    // Empty key
    expect(maskApiKey('')).toBe('****')
  })

  it('should expose runtime model fallbacks without adding providers', () => {
    const settings = applyRuntimeSettingsFallback(
      { providers: [], authorModel: '', editorModel: '' },
      {
        LLM_MODEL: 'qwen/test-author',
        EDITORIAL_MODEL: 'deepseek/test-editor',
      }
    )

    expect(settings.authorModel).toBe('qwen/test-author')
    expect(settings.editorModel).toBe('deepseek/test-editor')
    expect(settings.providers).toEqual([])
  })

  it('should prefer persisted model selections over runtime fallbacks', () => {
    const settings = applyRuntimeSettingsFallback(
      { providers: [], authorModel: 'saved/author', editorModel: 'saved/editor' },
      {
        LLM_MODEL: 'qwen/test-author',
        EDITORIAL_MODEL: 'deepseek/test-editor',
      }
    )

    expect(settings.authorModel).toBe('saved/author')
    expect(settings.editorModel).toBe('saved/editor')
  })
})
