/**
 * Feishu HTTP webhook routes — fallback when WebSocket is not available.
 * Handles event callback and card action callback.
 */
import { type FastifyInstance } from 'fastify'
import * as lark from '@larksuiteoapi/node-sdk'
import { type FeishuConfig } from './types.js'

export async function feishuWebhookRoutes(
  app: FastifyInstance,
  opts: {
    config: FeishuConfig
    messageHandler: (event: any) => Promise<void>
  },
): Promise<void> {
  const { config, messageHandler } = opts

  const eventDispatcher = new lark.EventDispatcher({
    encryptKey: config.encryptKey || '',
  }).register({
    'im.message.receive_v1': async (data: any) => {
      await messageHandler(data)
    },
  })

  const cardDispatcher = new lark.CardActionHandler(
    {
      encryptKey: config.encryptKey || '',
      verificationToken: config.verificationToken || '',
    },
    async (data: any) => {
      // Handle card button actions (book selection, etc.)
      const action = data.action?.value
      if (typeof action === 'string') {
        try { return JSON.parse(action) } catch { /* not json */ }
      }
      return undefined
    },
  )

  // Event callback
  app.post('/feishu/webhook/event', async (request, reply) => {
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(request.headers)) {
      if (typeof v === 'string') headers[k] = v
    }
    const assigned = Object.assign(Object.create({ headers }), JSON.parse(body))
    const result = await eventDispatcher.invoke(assigned)
    return result
  })

  // Card action callback
  app.post('/feishu/webhook/card', async (request, reply) => {
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(request.headers)) {
      if (typeof v === 'string') headers[k] = v
    }
    const assigned = Object.assign(Object.create({ headers }), JSON.parse(body))
    const result = await cardDispatcher.invoke(assigned)
    return result
  })
}
