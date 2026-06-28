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
      dragRegionStrategy: 'css-app-region',
    })
  })

  it('keeps native mac traffic lights vertically centered in the overlay titlebar', () => {
    const main = readFileSync(new URL('../../../../electron/main.cjs', import.meta.url), 'utf8')

    expect(main).toContain("titleBarStyle: 'hiddenInset'")
    expect(main).toMatch(/trafficLightPosition:\s*\{\s*x:\s*14,\s*y:\s*22\s*\}/)
  })
})
