import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { StudioShell } from './StudioShell'

const storage = new Map()

function installWindow() {
  globalThis.window = {
    innerWidth: 1280,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

describe('StudioShell drag region', () => {
  beforeEach(() => {
    storage.clear()
    installWindow()
  })

  afterEach(() => {
    delete globalThis.window
  })

  it('uses a full-width CSS app-region drag region instead of mouse event dragging', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => key }}>
        <StudioShell
          theme="mist"
          currentBook={{ book_id: 'book_a', title: 'Book A' }}
          sidebar={<div>sidebar</div>}
          chat={<div>chat</div>}
          chapter={<div>chapter</div>}
          outline={<div>outline</div>}
          plot={<div>plot</div>}
          activeWorkspaceTab="chapter"
          onWorkspaceTabChange={() => {}}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('class="studio-titlebar"')
    expect(html).toContain('class="studio-titlebar-drag-region"')
    expect(html).toContain('data-window-drag-block="true"')
    expect(html).not.toContain('data-tauri-drag-region')
    expect(html).not.toContain('startNativeDrag')
  })

  it('puts the workspace toggle in the mac titlebar with a panel icon', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => key }}>
        <StudioShell
          theme="mist"
          currentBook={{ book_id: 'book_a', title: 'Book A' }}
          sidebar={<div>sidebar</div>}
          chat={<div>chat</div>}
          chapter={<div>chapter</div>}
          outline={<div>outline</div>}
          plot={<div>plot</div>}
          activeWorkspaceTab="chapter"
          onWorkspaceTabChange={() => {}}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('workspace-titlebar-toggle')
    expect(html).toContain('lucide-panel-right-open')
    expect(html).not.toContain('workspace-collapse')
    expect(html).not.toContain('lucide-chevron-left')
    expect(html).not.toContain('lucide-chevron-right')
  })

  it('mounts the creative flow notch as a direct chat overlay for the active book', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => key }}>
        <StudioShell
          theme="mist"
          currentBook={{ book_id: 'book_a', title: 'Book A' }}
          sidebar={<div>sidebar</div>}
          chat={<div>chat</div>}
          chapter={<div>chapter</div>}
          outline={<div>outline</div>}
          plot={<div>plot</div>}
          activeWorkspaceTab="chapter"
          onWorkspaceTabChange={() => {}}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('<section class="studio-chat"><section class="creation-notch')
    expect(html).toContain('creation-notch-shell')
  })

  it('accepts tree-style book ids for the creative flow overlay', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => key }}>
        <StudioShell
          theme="mist"
          currentBook={{ id: 'book_from_tree', title: 'Book From Tree' }}
          sidebar={<div>sidebar</div>}
          chat={<div>chat</div>}
          chapter={<div>chapter</div>}
          outline={<div>outline</div>}
          plot={<div>plot</div>}
          activeWorkspaceTab="chapter"
          onWorkspaceTabChange={() => {}}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('creation-notch')
    expect(html).toContain('Book From Tree')
  })

  it('keeps the creative flow overlay visible when only a book title is available', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => key }}>
        <StudioShell
          theme="mist"
          currentBook={{ title: 'Title Only' }}
          sidebar={<div>sidebar</div>}
          chat={<div>chat</div>}
          chapter={<div>chapter</div>}
          outline={<div>outline</div>}
          plot={<div>plot</div>}
          activeWorkspaceTab="chapter"
          onWorkspaceTabChange={() => {}}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('creation-notch')
    expect(html).toContain('Title Only')
  })
})
