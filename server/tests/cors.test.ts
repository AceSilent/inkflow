import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { corsOptions } from '../src/cors.js'

describe('CORS options', () => {
  it('allows desktop webview DELETE preflight requests', async () => {
    const app = Fastify()
    try {
      await app.register(cors, corsOptions)
      app.delete('/api/v1/books/:bookId', async () => ({ status: 'ok' }))

      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/books/delete%3Fui-smoke',
        headers: {
          origin: 'tauri://localhost',
          'access-control-request-method': 'DELETE',
        },
      })

      expect(response.statusCode).toBe(204)
      expect(response.headers['access-control-allow-methods']).toContain('DELETE')
    } finally {
      await app.close()
    }
  })
})
