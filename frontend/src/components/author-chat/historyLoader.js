import { restoreChatMessages } from './messageUtils'

export async function fetchChatHistory(endpoint, fetchImpl = fetch) {
  const response = await fetchImpl(endpoint)
  if (!response.ok) return null
  const data = await response.json()
  if (!Array.isArray(data?.messages)) return null
  return restoreChatMessages(data.messages)
}
