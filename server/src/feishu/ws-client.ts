/**
 * Feishu WebSocket client — receives events without a public URL.
 */
import * as lark from '@larksuiteoapi/node-sdk'
import { type FeishuConfig } from './types.js'

export function startWebSocket(
  config: FeishuConfig,
  messageHandler: (event: any) => Promise<void>,
): lark.WSClient {
  const eventDispatcher = new lark.EventDispatcher({
    encryptKey: config.encryptKey || '',
  }).register({
    'im.message.receive_v1': async (data: any) => {
      await messageHandler(data)
    },
  })

  const wsClient = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: config.domain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.info,
  })

  wsClient.start({ eventDispatcher })
  return wsClient
}
