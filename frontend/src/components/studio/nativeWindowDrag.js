const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[data-window-drag-block]',
].join(',')

export function isWindowDragBlockedTarget(target, boundary) {
  if (!target?.closest) return false

  const blocked = target.closest(INTERACTIVE_SELECTOR)
  if (!blocked) return false
  if (!boundary?.contains) return true

  return boundary.contains(blocked)
}

function screenPoint(event) {
  return {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  }
}

function createLogicalPosition(x, y) {
  return { type: 'Logical', x: Math.round(x), y: Math.round(y) }
}

async function startManagedWindowDrag(event, currentWindow) {
  if (
    typeof currentWindow?.outerPosition !== 'function'
    || typeof currentWindow?.setPosition !== 'function'
    || typeof currentWindow?.scaleFactor !== 'function'
  ) {
    return false
  }

  event.preventDefault?.()
  event.nativeEvent?.stopImmediatePropagation?.()
  event.currentTarget?.setPointerCapture?.(event.pointerId)

  const startPointer = screenPoint(event)
  let frame = 0
  let latestEvent = null
  let startWindow = null

  const applyMove = () => {
    frame = 0
    if (!latestEvent || !startWindow) return

    const pointer = screenPoint(latestEvent)
    void currentWindow.setPosition(createLogicalPosition(
      startWindow.x + pointer.x - startPointer.x,
      startWindow.y + pointer.y - startPointer.y
    )).catch(() => {})
  }

  const handleMove = (moveEvent) => {
    latestEvent = moveEvent
    if (!frame) frame = globalThis.window.requestAnimationFrame?.(applyMove) || setTimeout(applyMove, 0)
  }

  const cleanup = () => {
    if (frame) {
      globalThis.window.cancelAnimationFrame?.(frame)
      clearTimeout(frame)
      frame = 0
    }
    globalThis.window.removeEventListener('mousemove', handleMove)
    globalThis.window.removeEventListener('mouseup', cleanup)
    globalThis.window.removeEventListener('pointermove', handleMove)
    globalThis.window.removeEventListener('pointerup', cleanup)
    globalThis.window.removeEventListener('pointercancel', cleanup)
    globalThis.window.removeEventListener('blur', cleanup)
  }

  globalThis.window.addEventListener('mousemove', handleMove)
  globalThis.window.addEventListener('mouseup', cleanup, { once: true })
  globalThis.window.addEventListener('pointermove', handleMove)
  globalThis.window.addEventListener('pointerup', cleanup, { once: true })
  globalThis.window.addEventListener('pointercancel', cleanup, { once: true })
  globalThis.window.addEventListener('blur', cleanup, { once: true })

  const [scaleFactor, physicalPosition] = await Promise.all([
    currentWindow.scaleFactor(),
    currentWindow.outerPosition(),
  ])
  startWindow = typeof physicalPosition?.toLogical === 'function'
    ? physicalPosition.toLogical(scaleFactor)
    : physicalPosition

  if (latestEvent) applyMove()

  return true
}

async function startNativeDragFallback(currentWindow, invoke) {
  if (typeof currentWindow?.startDragging === 'function') {
    await currentWindow.startDragging()
    return true
  }

  if (typeof invoke === 'function') {
    await invoke('plugin:window|start_dragging')
    return true
  }

  return false
}

export function startNativeWindowDrag(event) {
  if (event.button !== 0 || event.detail > 1) return false
  if (isWindowDragBlockedTarget(event.target, event.currentTarget)) return false

  const currentWindow = globalThis.window?.__TAURI__?.window?.getCurrentWindow?.()
  const invoke = globalThis.window?.__TAURI_INTERNALS__?.invoke

  event.preventDefault?.()
  event.nativeEvent?.stopImmediatePropagation?.()

  void startManagedWindowDrag(event, currentWindow).then(started => {
    if (!started) return startNativeDragFallback(currentWindow, invoke)
    return true
  }).catch(() => startNativeDragFallback(currentWindow, invoke))

  return true
}
