import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../i18n/context'
import { ThemePaletteOption } from './SettingsPanel'

describe('ThemePaletteOption', () => {
  it('renders one rounded theme preview card instead of separate swatch blocks', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => key }}>
        <ThemePaletteOption
          palette={{
            id: 'mist',
            labelKey: 'settings.themeMist',
            preview: {
              surface: 'oklch(98% 0.004 255)',
              sidebar: 'oklch(96% 0.006 255)',
              accent: 'oklch(63% 0.16 255)',
              ink: 'oklch(25% 0.02 255)',
            },
          }}
          active
          onSelect={() => {}}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('theme-palette-preview-card')
    expect(html).toContain('theme-palette-preview-accent')
    expect(html).not.toContain('theme-palette-preview-swatch')
  })
})
