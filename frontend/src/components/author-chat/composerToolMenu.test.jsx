import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { ComposerToolMenu } from '../AuthorChatPanel'

const labels = {
  'authorChat.attachFile': '添加文件',
  'authorChat.openTools': '打开输入工具',
  'authorChat.closeTools': '收起输入工具',
  'authorChat.mode.author': '小说创作',
  'authorChat.mode.gameScript': '游戏文案',
  'authorChat.modeGroup': '创作模式',
}

function renderMenu() {
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ t: key => labels[key] || key }}>
      <ComposerToolMenu
        mode="game_script"
        onAttachFile={() => {}}
        onModeChange={() => {}}
        openByDefault
      />
    </I18nContext.Provider>
  )
}

describe('ComposerToolMenu', () => {
  it('places file upload and mode switching inside the plus menu', () => {
    const html = renderMenu()

    expect(html).toContain('aria-label="收起输入工具"')
    expect(html).toContain('chat-tool-menu-upload')
    expect(html).toContain('添加文件')
    expect(html).toContain('小说创作')
    expect(html).toContain('游戏文案')
    expect(html).toContain('aria-pressed="true"')
  })
})
