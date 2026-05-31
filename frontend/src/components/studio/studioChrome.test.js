import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { studioChromeLayout } from './studioChrome'

describe('studio chrome layout', () => {
  it('does not render app branding or a bottom status bar inside the mac window', () => {
    expect(studioChromeLayout).toEqual({
      showTitlebarBrand: false,
      showBottomStatusbar: false,
      titlebarLeftInset: 68,
      titlebarHeight: 40,
      draggableTitlebar: true,
      dragRegionStrategy: 'tauri-region-overlay',
    })
  })

  it('keeps native mac traffic lights vertically centered in the overlay titlebar', () => {
    const config = JSON.parse(readFileSync(new URL('../../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
    const [windowConfig] = config.app.windows

    expect(windowConfig.titleBarStyle).toBe('Overlay')
    expect(windowConfig.trafficLightPosition).toEqual({ x: 14, y: 22 })
  })
})
