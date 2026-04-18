import type { ModelMessage } from 'ai'

export interface ZoneBoundaries {
  hotTokens: number
  warmTokens: number
}

export const DEFAULT_ZONE_BOUNDARIES: ZoneBoundaries = {
  hotTokens: 20000,
  warmTokens: 40000,
}

export interface MessageZones {
  hot: ModelMessage[]
  warm: ModelMessage[]
  cold: ModelMessage[]
}

export function estimateMessageTokens(m: ModelMessage): number {
  const s = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  return Math.ceil(s.length / 2.5)
}

export function zoneByTokens(
  messages: ModelMessage[],
  boundaries: ZoneBoundaries = DEFAULT_ZONE_BOUNDARIES,
): MessageZones {
  const hot: ModelMessage[] = []
  const warm: ModelMessage[] = []
  const cold: ModelMessage[] = []
  let hotTok = 0
  let warmTok = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const tok = estimateMessageTokens(m)
    if (hotTok + tok <= boundaries.hotTokens) {
      hot.unshift(m)
      hotTok += tok
    } else if (warmTok + tok <= boundaries.warmTokens) {
      warm.unshift(m)
      warmTok += tok
    } else {
      cold.unshift(m)
    }
  }
  return { hot, warm, cold }
}
