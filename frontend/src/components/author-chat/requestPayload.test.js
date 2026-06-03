import { describe, expect, it } from 'vitest'
import { buildAuthorChatRequestBody } from './requestPayload'

describe('buildAuthorChatRequestBody', () => {
  it('sends the selected chat mode to the backend', () => {
    expect(buildAuthorChatRequestBody({ message: '写一段任务对白', mode: 'game_script' })).toEqual({
      message: '写一段任务对白',
      mode: 'game_script',
    })
  })

  it('keeps checkpoint replacement ids when resending from a snapshot', () => {
    expect(buildAuthorChatRequestBody({ message: '重写这里', mode: 'author', replaceMessageId: 'm1' })).toEqual({
      message: '重写这里',
      mode: 'author',
      replace_message_id: 'm1',
    })
  })
})
