/**
 * Feishu API client wrapper — sends messages, creates/updates card entities.
 */
import * as lark from '@larksuiteoapi/node-sdk'
import { type FeishuConfig } from './types.js'

export class FeishuClient {
  private client: lark.Client
  private sequences: Map<string, number> = new Map()

  constructor(config: Pick<FeishuConfig, 'appId' | 'appSecret' | 'domain'>) {
    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      domain: config.domain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu,
      appType: lark.AppType.SelfBuild,
    })
  }

  private nextSeq(cardId: string): number {
    const seq = (this.sequences.get(cardId) || 0) + 1
    this.sequences.set(cardId, seq)
    return seq
  }

  /** Send plain text to a chat */
  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
  }

  /** Reply to a specific message */
  async replyText(messageId: string, text: string): Promise<void> {
    await this.client.im.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
  }

  /** Create a card entity and return its card_id */
  async createCardEntity(elements: Record<string, unknown>[]): Promise<string | null> {
    try {
      const resp = await this.client.cardkit.v1.card.create({
        data: {
          type: 1 as any,
          elements,
        } as any,
      })
      return resp.data?.card_id || null
    } catch (e: any) {
      console.error('[feishu] createCardEntity failed:', e.message)
      return null
    }
  }

  /** Update card entity content (for streaming) */
  async updateCardEntity(cardId: string, elements: Record<string, unknown>[]): Promise<boolean> {
    try {
      await this.client.cardkit.v1.card.update({
        path: { card_id: cardId },
        data: {
          elements,
          sequence: this.nextSeq(cardId),
        } as any,
      })
      return true
    } catch (e: any) {
      console.error('[feishu] updateCardEntity failed:', e.message)
      return false
    }
  }

  /** Send an inline card message (non-streaming, simple cards) */
  async sendCard(chatId: string, cardJson: Record<string, unknown>): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(cardJson),
      },
    })
  }

  /** Send a card entity as a message */
  async sendCardMessage(chatId: string, cardId: string): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify({ type: 'cardkit', card_id: cardId }),
      },
    })
  }
}
