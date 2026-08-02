import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { LoreWorkspace } from './LoreWorkspace'

const labels = {
  'lore.categories': '设定分类',
  'lore.storyBible': '总纲',
  'lore.world': '世界设定',
  'lore.characters': '角色设定',
  'lore.title': '设定集',
  'lore.search': '搜索设定',
  'lore.entryCount': '0 条',
  'lore.add': '新增设定',
  'lore.entryIndex': '设定目录',
  'lore.noEntries': '还没有设定',
  'lore.selectEntry': '选择一条设定',
}

describe('LoreWorkspace', () => {
  it('exposes world and character lore as an editable workspace', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => labels[key] || key }}>
        <LoreWorkspace currentBook={{ book_id: 'book-1', title: '测试作品' }} />
      </I18nContext.Provider>
    )

    expect(html).toContain('设定集')
    expect(html).toContain('总纲')
    expect(html).toContain('世界设定')
    expect(html).toContain('角色设定')
    expect(html).toContain('搜索设定')
    expect(html).toContain('新增设定')
    expect(html).toContain('lore-add-entry')
    expect(html).toContain('lore-workspace-panel')
  })
})
