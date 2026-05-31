import { describe, expect, it } from 'vitest'
import { bottomSidebarActions, primarySidebarActions } from './sidebarNavigation'

describe('studio sidebar navigation', () => {
  it('keeps only working primary actions visible', () => {
    const t = key => ({
      'sidebar.newChat': '新对话',
      'sidebar.newWork': '新作品',
      'sidebar.search': '搜索',
    }[key] || key)

    expect(primarySidebarActions(t).map(action => action.id)).toEqual(['new-chat', 'new-book', 'search'])
    expect(primarySidebarActions(t).map(action => action.label)).toEqual(['新对话', '新作品', '搜索'])
    expect(primarySidebarActions(t).every(action => action.shortcut === undefined)).toBe(true)
  })

  it('keeps settings as the only clickable bottom action for now', () => {
    expect(bottomSidebarActions().filter(action => action.enabled).map(action => action.id)).toEqual(['settings'])
    expect(bottomSidebarActions().find(action => action.id === 'mobile')?.enabled).toBe(false)
  })
})
