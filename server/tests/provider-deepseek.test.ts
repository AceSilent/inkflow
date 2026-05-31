import { describe, expect, it } from 'vitest'
import { createReasoningFetch } from '../src/llm/provider.js'

function sseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

function doneEvent(): Uint8Array {
  return new TextEncoder().encode('data: [DONE]\n\n')
}

async function readStreamBody(response: Response): Promise<string> {
  return await response.text()
}

describe('DeepSeek thinking tool-call compatibility', () => {
  it('preserves reasoning_content across streaming tool-call continuation requests', async () => {
    const requests: any[] = []
    const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent({
            choices: [{ index: 0, delta: { reasoning_content: '需要先查设定。' } }],
          }))
          controller.enqueue(sseEvent({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_read',
                  type: 'function',
                  function: { name: 'read_outline', arguments: '{}' },
                }],
              },
            }],
          }))
          controller.enqueue(doneEvent())
          controller.close()
        },
      }), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const compatFetch = createReasoningFetch('deepseek-v4-pro', undefined, fetchImpl)
    const first = await compatFetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'deepseek-v4-pro',
        stream: true,
        messages: [{ role: 'user', content: '写第一章' }],
      }),
    })
    await readStreamBody(first)

    await compatFetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'deepseek-v4-pro',
        stream: true,
        messages: [
          { role: 'user', content: '写第一章' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_read',
              type: 'function',
              function: { name: 'read_outline', arguments: '{}' },
            }],
          },
          { role: 'tool', tool_call_id: 'call_read', content: '{}' },
        ],
      }),
    })

    expect(requests[1].messages[1].reasoning_content).toBe('需要先查设定。')
    expect(requests[1].thinking).toEqual({ type: 'enabled' })
    expect(requests[1].reasoning_effort).toBe('high')
  })
})

describe('Gemini OpenAI-compatible tool-call compatibility', () => {
  it('strips Gemini private extra_content fields from streamed tool calls', async () => {
    const fetchImpl: typeof globalThis.fetch = async () => {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent({
            choices: [{
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [{
                  id: 'call_create',
                  type: 'function',
                  extra_content: {
                    google: { thought_signature: 'opaque-provider-token' },
                  },
                  function: {
                    name: 'create_book',
                    arguments: '{"name":"测试书"}',
                  },
                }],
              },
            }],
          }))
          controller.enqueue(doneEvent())
          controller.close()
        },
      }), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const compatFetch = createReasoningFetch('gemini-3.5-flash', undefined, fetchImpl)
    const response = await compatFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        stream: true,
        messages: [{ role: 'user', content: '创建作品' }],
      }),
    })

    const body = await readStreamBody(response)
    const firstEvent = JSON.parse(body.split('\n\n')[0].replace(/^data: /, ''))
    const [toolCall] = firstEvent.choices[0].delta.tool_calls

    expect(body).toContain('"tool_calls"')
    expect(body).toContain('"create_book"')
    expect(toolCall.index).toBe(0)
    expect(body).not.toContain('extra_content')
    expect(body).not.toContain('thought_signature')
  })

  it('restores Gemini tool-call extra_content on continuation requests', async () => {
    const requests: any[] = []
    const extraContent = {
      google: { thought_signature: 'opaque-provider-token' },
    }
    const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response(new ReadableStream({
        start(controller) {
          if (requests.length === 1) {
            controller.enqueue(sseEvent({
              choices: [{
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [{
                    id: 'call_create',
                    type: 'function',
                    extra_content: extraContent,
                    function: {
                      name: 'create_book',
                      arguments: '{"name":"测试书"}',
                    },
                  }],
                },
              }],
            }))
          }
          controller.enqueue(doneEvent())
          controller.close()
        },
      }), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const compatFetch = createReasoningFetch('gemini-3.5-flash', undefined, fetchImpl)
    const first = await compatFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        stream: true,
        messages: [{ role: 'user', content: '创建作品' }],
      }),
    })
    await readStreamBody(first)

    await compatFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        stream: true,
        messages: [
          { role: 'user', content: '创建作品' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_create',
              type: 'function',
              function: { name: 'create_book', arguments: '{"name":"测试书"}' },
            }],
          },
          { role: 'tool', tool_call_id: 'call_create', content: '{}' },
        ],
      }),
    })

    expect(requests[1].messages[1].tool_calls[0].extra_content).toEqual(extraContent)
  })
})
