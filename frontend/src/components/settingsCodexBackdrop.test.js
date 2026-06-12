import { describe, expect, it } from 'vitest'
import { locales } from '../i18n/locales'
import { INTENSITY_OPTIONS } from '../hooks/useBackdropIntensity'

// Guards the i18n contract for the two settings additions: the backdrop
// intensity segmented control and the Codex (ChatGPT subscription) login entry.
// SettingsPanel itself relies on effects + fetch, which the node/SSR test env
// does not run, so we lock the locale keys here instead.

const REQUIRED_KEYS = [
  'settings.backdrop',
  'settings.backdropHint',
  'settings.backdropSubtle',
  'settings.backdropMedium',
  'settings.backdropRich',
  'settings.codexTitle',
  'settings.codexDesc',
  'settings.codexLogin',
  'settings.codexLoggingIn',
  'settings.codexWaitingHint',
  'settings.codexCancel',
  'settings.codexLogout',
  'settings.codexLoggedIn',
  'settings.codexAccount',
  'settings.codexPlan',
  'settings.codexStartFailed',
  'settings.codexAuthFailed',
  'settings.codexLoggedOut',
  'settings.codexLogoutFailed',
  'settings.codexSuccess',
  'settings.codexAddProvider',
  'settings.codexProviderName',
  'settings.codexProviderBadge',
  'settings.codexNoApiKey',
  'settings.codexCancelled',
  // Zero-friction Codex CLI credential reuse + gpt-5.5 default
  'settings.codexDetected',
  'settings.codexDetectedHint',
  'settings.codexReuseNote',
  'settings.codexRelogin',
  'settings.codexDisconnect',
  'settings.codexDisconnected',
  'settings.codexDefaultModelHint',
  'settings.codexSetDefaultModel',
  'settings.codexModelUpdated',
]

describe('settings backdrop + codex i18n', () => {
  it('defines every new key in both zh and en', () => {
    for (const key of REQUIRED_KEYS) {
      expect(locales.zh[key], `zh missing ${key}`).toBeTruthy()
      expect(locales.en[key], `en missing ${key}`).toBeTruthy()
    }
  })

  it('has a translatable label for every backdrop intensity option', () => {
    expect(INTENSITY_OPTIONS.map(o => o.value)).toEqual(['subtle', 'medium', 'rich'])
    for (const opt of INTENSITY_OPTIONS) {
      expect(locales.zh[opt.labelKey], `zh missing ${opt.labelKey}`).toBeTruthy()
      expect(locales.en[opt.labelKey], `en missing ${opt.labelKey}`).toBeTruthy()
    }
  })
})
