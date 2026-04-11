/**
 * Feishu module entry — initializes bot in WebSocket or webhook mode.
 */
import { type FastifyInstance } from 'fastify'
import { FeishuClient } from './client.js'
import { startWebSocket } from './ws-client.js'
import { feishuWebhookRoutes } from './webhook.js'
import { createMessageHandler } from './message-router.js'
import { type FeishuConfig } from './types.js'

export async function initFeishu(app: FastifyInstance): Promise<void> {
  const config: FeishuConfig = {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    encryptKey: process.env.FEISHU_ENCRYPT_KEY,
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    domain: (process.env.FEISHU_DOMAIN as 'feishu' | 'lark') || 'feishu',
    mode: (process.env.FEISHU_MODE as 'ws' | 'webhook') || 'ws',
  }

  if (!config.appId || !config.appSecret) {
    console.log('Feishu bot not configured (set FEISHU_APP_ID and FEISHU_APP_SECRET to enable)')
    return
  }

  const feishuClient = new FeishuClient(config)
  const messageHandler = createMessageHandler(feishuClient)

  if (config.mode === 'ws') {
    startWebSocket(config, messageHandler)
    console.log('Feishu bot started in WebSocket mode')
  } else {
    await app.register(feishuWebhookRoutes, { config, messageHandler })
    console.log('Feishu bot webhook routes registered')
  }
}
