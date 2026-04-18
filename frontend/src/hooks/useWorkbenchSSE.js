/* eslint-disable no-unused-vars, no-empty */
// MVP stub — unused vars and empty catch are intentional placeholders (see plan Task 14).
import { useEffect } from 'react'

/**
 * Subscribes to a persistent SSE stream of Agent tool events.
 * Backend must expose GET /api/v1/author-chat/:bookId/events (see Risk: if the
 * backend sends tool events only during active chat streams, we don't have a
 * persistent event channel — then this hook becomes a no-op and locked-state
 * is driven by polling the workbench_lock file. Backend task to add persistent
 * stream is out of scope for this plan; poll fallback is used.).
 */
export function useWorkbenchSSE({ bookId, chapterId, onChapterWriteStart, onChapterWriteDone, onOtherChapterWrite }) {
  useEffect(() => {
    if (!bookId || !chapterId) return
    // Poll fallback: check workbench_lock file every 1.5s to detect Agent activity.
    // TODO: Wire to real SSE event stream when backend exposes it.
    let timer
    let lastLockedCh = null
    async function poll() {
      try {
        // Query all chapters in this book with an active workbench_lock OR a recent
        // save_draft SSE event. For MVP, we poll just this chapter's lock state and
        // also watch the chapter file mtime.
        const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`, { method: 'HEAD' })
        // HEAD is insufficient info here — this is a placeholder. Real integration comes via
        // a SSE broadcast route added when this project integrates realtime. For MVP wire
        // locked-state manually from send-annotations or resubmit-review buttons.
      } catch {}
      timer = setTimeout(poll, 1500)
    }
    poll()
    return () => clearTimeout(timer)
  }, [bookId, chapterId, onChapterWriteStart, onChapterWriteDone, onOtherChapterWrite])
}
