import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { loadAuthorChatConfig } from '../src/routes/author-chat-support.js'
import { saveSettings, type AppSettings } from '../src/routes/settings.js'

const TEST_DIR = path.join(process.cwd(), '__test_author_chat_support__')

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

describe('loadAuthorChatConfig', () => {
  it('passes the enabled network proxy into the author LLM config', () => {
    const settings: AppSettings = {
      providers: [{
        id: 'gemini',
        name: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: 'test-key',
        models: ['gemini-3.5-flash'],
      }],
      authorModel: 'gemini/gemini-3.5-flash',
      editorModel: '',
      networkProxy: {
        enabled: true,
        url: 'http://127.0.0.1:7890',
      },
    }

    saveSettings(TEST_DIR, settings)

    const { llmConfig } = loadAuthorChatConfig(TEST_DIR)

    expect(llmConfig).toMatchObject({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: 'gemini-3.5-flash',
      proxyUrl: 'http://127.0.0.1:7890',
    })
  })
})
