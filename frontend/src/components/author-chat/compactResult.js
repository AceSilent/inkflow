export function presentCompactResult(data, t) {
  const compactedCount = Number(data?.compactedCount || 0)
  const decayedCount = Number(data?.decayedCount || 0)

  if (data?.status === 'compacted' && compactedCount > 0) {
    const key = decayedCount > 0
      ? 'authorChat.manualCompactWithDecay'
      : 'authorChat.manualCompact'
    return {
      content: t(key)
        .replace('{count}', String(compactedCount))
        .replace('{decayed}', String(decayedCount)),
      toast: t('authorChat.contextCompactedSuccess'),
      tone: 'success',
    }
  }

  if (data?.status === 'decayed' || data?.reason === 'warm_history_decayed') {
    return {
      content: t('authorChat.compactDecayedOnly').replace('{count}', String(decayedCount)),
      toast: t('authorChat.compactOptimized'),
      tone: 'success',
    }
  }

  if (data?.reason === 'compact_failed') {
    return {
      content: t('authorChat.compactUnavailable'),
      toast: t('authorChat.compactUnavailable'),
      tone: 'warning',
    }
  }

  if (data?.reason === 'breaker_tripped') {
    return {
      content: t('authorChat.compactBreakerTripped'),
      toast: t('authorChat.compactBreakerTripped'),
      tone: 'warning',
    }
  }

  const content = data?.reason === 'no_history'
    ? t('authorChat.compactNoHistory')
    : t('authorChat.compactNoColdHistory')
  return { content, toast: content, tone: 'info' }
}
