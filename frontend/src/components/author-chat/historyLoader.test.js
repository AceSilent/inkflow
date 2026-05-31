import { describe, expect, it } from 'vitest'
import { fetchChatHistory } from './historyLoader'

describe('fetchChatHistory', () => {
  it('restores persisted assistant messages after a stream read failure', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      messages: [
        { role: 'user', content: '只回复两个字：可用' },
        { role: 'assistant', content: '可用' },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const restored = await fetchChatHistory('/api/v1/author-chat/sessions/session_a/history', fetchImpl)

    expect(restored).toHaveLength(2)
    expect(restored[1].segments).toEqual([{ type: 'content', text: '可用' }])
  })

  it('returns null for non-ok history responses', async () => {
    const fetchImpl = async () => new Response('not found', { status: 404 })

    await expect(fetchChatHistory('/missing', fetchImpl)).resolves.toBeNull()
  })
})
