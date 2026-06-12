// Theme → backdrop module registry. Each module exports init(canvas, getParams)
// and returns a controller with the shared contract:
//   { resize(reduced?), frame(dtSeconds), renderStatic(), refreshPalette(), destroy() }
// AtmosphereBackdrop owns the rAF loop and calls into these.

import { init as inkRiver } from './inkRiver'
import { init as mist } from './mist'
import { init as paper } from './paper'
import { init as graphite } from './graphite'

export const BACKDROP_INITS = {
  ink: inkRiver,
  mist,
  paper,
  graphite,
}

export const DEFAULT_BACKDROP_THEME = 'ink'

export function getBackdropInit(theme) {
  return BACKDROP_INITS[theme] || BACKDROP_INITS[DEFAULT_BACKDROP_THEME]
}
