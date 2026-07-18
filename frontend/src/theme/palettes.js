export const themePalettes = [
  {
    id: 'monet',
    labelKey: 'settings.themeMonet',
    artwork: '/themes/monet-water.jpg',
    preview: {
      surface: 'oklch(96.8% 0.018 223)',
      sidebar: 'oklch(94.2% 0.028 187)',
      accent: 'oklch(55% 0.065 174)',
      ink: 'oklch(27% 0.022 230)',
    },
    swatches: [
      'oklch(91% 0.055 205)',
      'oklch(88% 0.07 155)',
      'oklch(89% 0.048 330)',
    ],
  },
  {
    id: 'sketch',
    labelKey: 'settings.themeSketch',
    artwork: '/themes/sketch-redhead.jpg',
    preview: {
      surface: 'oklch(97% 0.013 82)',
      sidebar: 'oklch(95% 0.017 78)',
      accent: 'oklch(55% 0.12 35)',
      ink: 'oklch(28% 0.018 70)',
    },
    swatches: [
      'oklch(97% 0.013 82)',
      'oklch(56% 0.04 70)',
      'oklch(55% 0.12 35)',
    ],
  },
]

export function isThemeId(value) {
  return themePalettes.some(theme => theme.id === value)
}
