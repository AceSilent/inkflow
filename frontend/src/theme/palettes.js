export const themePalettes = [
  {
    id: 'mist',
    labelKey: 'settings.themeMist',
    preview: {
      surface: 'oklch(98.4% 0.006 255)',
      sidebar: 'oklch(94.5% 0.008 255)',
      accent: 'oklch(58% 0.18 250)',
      ink: 'oklch(25% 0.02 255)',
    },
    swatches: [
      'oklch(98.4% 0.006 255)',
      'oklch(58% 0.18 250)',
      'oklch(64% 0.14 145)',
    ],
  },
  {
    id: 'ink',
    labelKey: 'settings.themeInk',
    preview: {
      surface: 'oklch(18% 0.018 260)',
      sidebar: 'oklch(14% 0.014 260)',
      accent: 'oklch(70% 0.13 250)',
      ink: 'oklch(91% 0.01 255)',
    },
    swatches: [
      'oklch(18% 0.018 260)',
      'oklch(70% 0.13 250)',
      'oklch(78% 0.12 75)',
    ],
  },
  {
    id: 'paper',
    labelKey: 'settings.themePaper',
    preview: {
      surface: 'oklch(97.8% 0.018 86)',
      sidebar: 'oklch(93.5% 0.021 86)',
      accent: 'oklch(55% 0.12 42)',
      ink: 'oklch(25% 0.025 86)',
    },
    swatches: [
      'oklch(97.8% 0.018 86)',
      'oklch(55% 0.12 42)',
      'oklch(57% 0.11 182)',
    ],
  },
  {
    id: 'graphite',
    labelKey: 'settings.themeGraphite',
    preview: {
      surface: 'oklch(23% 0.01 255)',
      sidebar: 'oklch(18% 0.009 255)',
      accent: 'oklch(72% 0.11 205)',
      ink: 'oklch(92% 0.004 255)',
    },
    swatches: [
      'oklch(23% 0.01 255)',
      'oklch(72% 0.11 205)',
      'oklch(70% 0.13 15)',
    ],
  },
]

export function isThemeId(value) {
  return themePalettes.some(theme => theme.id === value)
}
