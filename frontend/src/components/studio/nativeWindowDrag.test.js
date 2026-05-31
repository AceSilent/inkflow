import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWindowDragBlockedTarget, startNativeWindowDrag } from './nativeWindowDrag'

function eventFor(target, options = {}) {
  const boundary = { contains: vi.fn(node => node === target || node?.insideBoundary) }
  const invoke = options.invoke || vi.fn(() => Promise.resolve())
  const listeners = new Map()

  globalThis.window = {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
    requestAnimationFrame: vi.fn(callback => {
      callback()
      return 1
    }),
    cancelAnimationFrame: vi.fn(),
    __TAURI_INTERNALS__: { invoke },
  }

  if (options.currentWindow) {
    globalThis.window.__TAURI__ = {
      window: {
        getCurrentWindow: () => options.currentWindow,
      },
    }
  }

  return {
    event: {
      button: 0,
      detail: 1,
      pointerId: 1,
      screenX: 100,
      screenY: 120,
      target,
      currentTarget: boundary,
      preventDefault: vi.fn(),
      nativeEvent: { stopImmediatePropagation: vi.fn() },
    },
    invoke,
    listeners,
  }
}

describe('native window drag', () => {
  afterEach(() => {
    delete globalThis.window
  })

  it('moves the window through managed Tauri positioning from non-interactive titlebar space', async () => {
    const target = { closest: vi.fn(() => null) }
    const currentWindow = {
      scaleFactor: vi.fn(() => Promise.resolve(2)),
      outerPosition: vi.fn(() => Promise.resolve({ toLogical: () => ({ x: 20, y: 30 }) })),
      setPosition: vi.fn(() => Promise.resolve()),
      startDragging: vi.fn(() => Promise.resolve()),
    }
    const { event, invoke, listeners } = eventFor(target, { currentWindow })

    expect(startNativeWindowDrag(event)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.nativeEvent.stopImmediatePropagation).toHaveBeenCalled()
    await Promise.resolve()
    await Promise.resolve()

    listeners.get('mousemove')({ screenX: 140, screenY: 150 })
    expect(currentWindow.setPosition).toHaveBeenCalledWith({ type: 'Logical', x: 60, y: 60 })
    expect(currentWindow.startDragging).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('falls back to internal IPC when the global Tauri window API is unavailable', async () => {
    const target = { closest: vi.fn(() => null) }
    const { event, invoke } = eventFor(target)

    expect(startNativeWindowDrag(event)).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('plugin:window|start_dragging')
  })

  it('does not hijack titlebar buttons', () => {
    const button = { insideBoundary: true }
    const target = { closest: vi.fn(() => button) }
    const { event, invoke } = eventFor(target)

    expect(isWindowDragBlockedTarget(target, event.currentTarget)).toBe(true)
    expect(startNativeWindowDrag(event)).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('ignores double click so macOS can keep its native zoom behavior', () => {
    const target = { closest: vi.fn(() => null) }
    const { event, invoke } = eventFor(target)
    event.detail = 2

    expect(startNativeWindowDrag(event)).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})
