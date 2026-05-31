import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const previewHtml = readFileSync(new URL('../../../../docs/design/creative-flow-preview.html', import.meta.url), 'utf8')
const tauriConfig = readFileSync(new URL('../../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8')

describe('visual polish direction', () => {
  it('adds frosted shell edges and animated theme ambience', () => {
    expect(indexCss).toContain('ambientDrift')
    expect(indexCss).toContain('starDrift')
    expect(indexCss).toContain('--ambient-star-opacity')
    expect(indexCss).toContain('--glass-shell: color-mix')
    expect(indexCss).toContain('backdrop-filter: blur(42px)')
    expect(indexCss).toContain('box-shadow: var(--glass-edge-shadow)')
    expect(indexCss).toContain('--frost-noise-opacity')
    expect(indexCss).toContain('frostGrain')
    expect(indexCss).toContain('mix-blend-mode: var(--ambient-blend')
    expect(tauriConfig).toContain('"windowEffects"')
    expect(tauriConfig).toContain('"underWindowBackground"')
  })

  it('softens hover, press, and expand/collapse motion', () => {
    expect(indexCss).toContain('--motion-smooth')
    expect(indexCss).toContain('transition: color var(--motion-fast)')
    expect(indexCss).toContain('transition: flex-basis var(--motion-smooth)')
    expect(indexCss).toContain('transition: max-height var(--motion-smooth)')
    expect(indexCss).toContain('creationNotchPulse')
  })

  it('keeps dark themes subtle instead of heavy and noisy', () => {
    expect(indexCss).toContain('--ambient-layer-opacity')
    expect(indexCss).toContain('--ambient-sheen-opacity')
    expect(indexCss).toContain('--frost-sheen-opacity')
    expect(indexCss).toContain('--frost-grain-opacity')

    expect(indexCss).toMatch(/\[data-theme="ink"\], \[data-theme="dark"\][\s\S]*--ambient-star-opacity:\s*0\.08;/)
    expect(indexCss).toMatch(/\[data-theme="ink"\], \[data-theme="dark"\][\s\S]*--frost-noise-opacity:\s*0\.08;/)
    expect(indexCss).toMatch(/\[data-theme="graphite"\][\s\S]*--ambient-star-opacity:\s*0\.035;/)
    expect(indexCss).toMatch(/\[data-theme="graphite"\][\s\S]*--frost-noise-opacity:\s*0\.07;/)
  })

  it('presents the creative flow as a modern creation notch preview', () => {
    expect(previewHtml).toContain('Creation Notch')
    expect(previewHtml).toContain('notch-shell')
    expect(previewHtml).toContain('notch-timeline')
    expect(previewHtml).toContain('pull-handle')
    expect(previewHtml).not.toContain('Chat 内折叠状态卡')
  })
})
