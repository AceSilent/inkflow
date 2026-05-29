import { describe, expect, it } from 'vitest'
import {
  clampWorkspaceWidth,
  defaultWorkspaceLayout,
  isWorkspaceTab,
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  storageKeyForBook,
} from './workspaceLayout'

describe('workspace layout helpers', () => {
  it('builds a per-book storage key', () => {
    expect(storageKeyForBook('book-one')).toBe('inkflow.workspaceLayout:book-one')
    expect(storageKeyForBook()).toBe('inkflow.workspaceLayout:global')
  })

  it('clamps workspace width between readable bounds', () => {
    expect(clampWorkspaceWidth(120, 1440)).toBe(320)
    expect(clampWorkspaceWidth(900, 1440)).toBe(720)
    expect(clampWorkspaceWidth(480, 1440)).toBe(480)
  })

  it('recognizes supported workspace tabs', () => {
    expect(isWorkspaceTab('chapter')).toBe(true)
    expect(isWorkspaceTab('outline')).toBe(true)
    expect(isWorkspaceTab('plot')).toBe(true)
    expect(isWorkspaceTab('settings')).toBe(false)
    expect(isWorkspaceTab(undefined)).toBe(false)
  })

  it('loads defaults when storage is empty or invalid', () => {
    const store = new Map<string, string>()
    expect(loadWorkspaceLayout('book-one', store)).toEqual({
      collapsed: true,
      width: 460,
      activeTab: 'chapter',
    })
    store.set(storageKeyForBook('book-one'), '{broken json')
    expect(loadWorkspaceLayout('book-one', store)).toEqual(defaultWorkspaceLayout)
  })

  it('saves and loads layout state', () => {
    const store = new Map<string, string>()
    saveWorkspaceLayout('book-one', { collapsed: true, width: 420, activeTab: 'plot' }, store)
    expect(loadWorkspaceLayout('book-one', store)).toEqual({
      collapsed: true,
      width: 420,
      activeTab: 'plot',
    })
  })

  it('can save and load widths against the current viewport cap', () => {
    const store = new Map<string, string>()
    saveWorkspaceLayout('book-one', { collapsed: false, width: 960, activeTab: 'chapter' }, store, 1920)

    expect(loadWorkspaceLayout('book-one', store, 1920).width).toBe(960)
    expect(loadWorkspaceLayout('book-one', store, 800).width).toBe(400)
  })
})
