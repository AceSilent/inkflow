/**
 * Tests for settings route integration — Zod validation + save/load roundtrip.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  getSettings,
  saveSettings,
  maskApiKey,
  type AppSettings,
} from '../src/routes/settings.js'
import { saveSettingsBody } from '../src/routes/schemas.js'

const TEST_DIR = path.join(process.cwd(), '__test_settings_routes__')

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

describe('Settings Zod Validation', () => {
  const validProvider = {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-test',
    models: ['deepseek-chat'],
  }

  it('should accept valid settings body', () => {
    const body = {
      providers: [validProvider],
      authorModel: 'deepseek/deepseek-chat',
      editorModel: 'deepseek/deepseek-chat',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(true)
  })

  it('should accept settings with empty providers', () => {
    const body = {
      providers: [],
      authorModel: '',
      editorModel: '',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(true)
  })

  it('should reject settings with more than 10 providers', () => {
    const body = {
      providers: Array(11).fill(validProvider),
      authorModel: '',
      editorModel: '',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('should reject provider with missing id', () => {
    const body = {
      providers: [{ name: 'Test', baseUrl: 'https://test.com', apiKey: '', models: [] }],
      authorModel: '',
      editorModel: '',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('should reject provider with invalid baseUrl', () => {
    const body = {
      providers: [{ id: 't', name: 'T', baseUrl: 'not-a-url', apiKey: '', models: [] }],
      authorModel: '',
      editorModel: '',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('should reject provider with too many models', () => {
    const body = {
      providers: [{ ...validProvider, models: Array(51).fill('model') }],
      authorModel: '',
      editorModel: '',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(false)
  })

  it('should produce readable error messages for invalid input', () => {
    const body = {
      providers: [{ id: '', name: 'X' }],
      authorModel: '',
      editorModel: '',
    }
    const result = saveSettingsBody.safeParse(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      expect(msg).toContain('providers')
    }
  })
})

describe('Settings Save/Load with Validated Data', () => {
  it('should save validated settings and reload them', () => {
    const settings: AppSettings = {
      providers: [{
        id: 'test-provider',
        name: 'Test Provider',
        baseUrl: 'https://api.test.com/v1',
        apiKey: 'sk-test-key-12345',
        models: ['model-a', 'model-b'],
      }],
      authorModel: 'test-provider/model-a',
      editorModel: 'test-provider/model-b',
      reviewerModels: {
        editorial_lore: 'test-provider/model-b',
      },
    }

    saveSettings(TEST_DIR, settings)
    const loaded = getSettings(TEST_DIR)

    expect(loaded.providers).toHaveLength(1)
    expect(loaded.providers[0].id).toBe('test-provider')
    expect(loaded.providers[0].apiKey).toBe('sk-test-key-12345')
    expect(loaded.authorModel).toBe('test-provider/model-a')
    expect(loaded.reviewerModels?.editorial_lore).toBe('test-provider/model-b')
  })

  it('should mask API keys correctly for display', () => {
    const longKey = 'sk-abcdefghijklmnop-12345'
    expect(maskApiKey(longKey)).toBe('sk-ab...2345')

    const shortKey = 'abc'
    expect(maskApiKey(shortKey)).toBe('****')

    const exactlyNine = '123456789'
    expect(maskApiKey(exactlyNine)).toBe('12345...6789')
  })
})

describe('Settings Edge Cases', () => {
  it('should handle corrupted settings file', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'settings.json'), 'invalid json{{{', 'utf-8')
    const settings = getSettings(TEST_DIR)
    expect(settings.providers).toEqual([])
    expect(settings.authorModel).toBe('')
  })

  it('should create data directory if missing', () => {
    const newDir = path.join(TEST_DIR, 'sub', 'dir')
    expect(fs.existsSync(newDir)).toBe(false)

    saveSettings(newDir, {
      providers: [],
      authorModel: '',
      editorModel: '',
    })

    expect(fs.existsSync(path.join(newDir, 'settings.json'))).toBe(true)
  })
})
