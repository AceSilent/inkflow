import { describe, expect, it } from 'vitest'
import * as settingsPanel from './SettingsPanel.jsx'

const GPT_56_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
]

describe('Codex recommended models', () => {
  it('offers every GPT-5.6 preview tier', () => {
    expect(settingsPanel.CODEX_DEFAULT_MODELS).toEqual(
      expect.arrayContaining(GPT_56_MODELS),
    )
  })

  it('adds missing recommendations to existing Codex providers without changing assignments', () => {
    const input = {
      providers: [
        {
          id: 'codex-main',
          name: 'Codex',
          kind: 'codex-oauth',
          baseUrl: '',
          apiKey: '',
          models: ['custom-preview', 'gpt-5.5'],
        },
        {
          id: 'local',
          name: 'Local',
          kind: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:1234/v1',
          apiKey: '',
          models: ['local-model'],
        },
      ],
      authorModel: 'codex-main/custom-preview',
      editorModel: 'local/local-model',
      reviewerModels: { editorial_lore: 'codex-main/gpt-5.5' },
    }

    const output = settingsPanel.withRecommendedProviders?.(input)

    expect(output).toBeDefined()
    expect(output.providers[0].models.slice(0, 2)).toEqual(['custom-preview', 'gpt-5.5'])
    expect(output.providers[0].models).toEqual(expect.arrayContaining(GPT_56_MODELS))
    expect(output.providers[1].models).toEqual(['local-model'])
    expect(output.authorModel).toBe(input.authorModel)
    expect(output.editorModel).toBe(input.editorModel)
    expect(output.reviewerModels.editorial_lore).toBe(input.reviewerModels.editorial_lore)
  })
})
