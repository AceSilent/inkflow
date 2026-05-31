import { describe, expect, it } from 'vitest'
import { buildSseHeaders } from '../src/routes/author-chat.js'

describe('buildSseHeaders', () => {
  it('keeps streamed POST responses CORS-readable from the packaged Tauri webview', () => {
    const headers = buildSseHeaders('tauri://localhost')

    expect(headers['Content-Type']).toBe('text/event-stream')
    expect(headers['Access-Control-Allow-Origin']).toBe('tauri://localhost')
    expect(headers.Vary).toContain('Origin')
  })
})
