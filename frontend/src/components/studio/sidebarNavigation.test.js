import { describe, expect, it } from 'vitest'
import { bottomSidebarActions, primarySidebarActions } from './sidebarNavigation'

describe('studio sidebar navigation', () => {
  it('keeps only working primary actions visible', () => {
    expect(primarySidebarActions().map(action => action.id)).toEqual(['new-chat', 'search'])
    expect(primarySidebarActions().map(action => action.label)).toEqual(['新对话', '搜索'])
  })

  it('keeps settings as the only clickable bottom action for now', () => {
    expect(bottomSidebarActions().filter(action => action.enabled).map(action => action.id)).toEqual(['settings'])
    expect(bottomSidebarActions().find(action => action.id === 'mobile')?.enabled).toBe(false)
  })
})
