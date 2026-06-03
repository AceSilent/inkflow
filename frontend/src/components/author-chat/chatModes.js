export const CHAT_MODES = [
  {
    id: 'author',
    labelKey: 'authorChat.mode.author',
  },
  {
    id: 'game_script',
    labelKey: 'authorChat.mode.gameScript',
  },
]

export function normalizeChatMode(mode) {
  return CHAT_MODES.some(item => item.id === mode) ? mode : 'author'
}
