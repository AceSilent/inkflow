import { describe, expect, it } from 'vitest'
import { studioChromeLayout } from './studioChrome'

describe('studio chrome layout', () => {
  it('does not render app branding or a bottom status bar inside the mac window', () => {
    expect(studioChromeLayout).toEqual({
      showTitlebarBrand: false,
      showBottomStatusbar: false,
      titlebarLeftInset: 76,
    })
  })
})
