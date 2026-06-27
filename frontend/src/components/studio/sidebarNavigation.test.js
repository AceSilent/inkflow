import { describe, expect, it } from 'vitest'
import { bottomSidebarActions, primarySidebarActions, settingsSidebarSections } from './sidebarNavigation'

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

  it('turns the sidebar into settings categories while settings is active', () => {
    const t = key => ({
      'settings.nav.providers': '供应商',
      'settings.nav.models': '模型',
      'settings.nav.network': '网络',
      'settings.nav.context': '记忆',
      'settings.nav.appearance': '外观',
    }[key] || key)

    expect(settingsSidebarSections(t).map(section => section.id)).toEqual([
      'providers',
      'models',
      'network',
      'context',
      'appearance',
    ])
    expect(settingsSidebarSections(t).map(section => section.label)).toEqual([
      '供应商',
      '模型',
      '网络',
      '记忆',
      '外观',
    ])
  })
})
