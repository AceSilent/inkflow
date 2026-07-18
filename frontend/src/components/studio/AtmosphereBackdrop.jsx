const VALID_THEMES = new Set(['monet', 'sketch'])

function resolveTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : 'monet'
}

/**
 * The two production themes use authored artwork instead of a procedural canvas.
 * Keeping the layer independent from the UI avoids duplicated screenshot chrome and
 * lets the real panels, selection and scroll state remain fully interactive.
 */
export function AtmosphereBackdrop({ theme }) {
  const resolvedTheme = resolveTheme(theme)

  return (
    <div className="atmosphere-backdrop" data-theme={resolvedTheme} aria-hidden="true">
      <div className="atmosphere-backdrop__artwork" />
      <div className="atmosphere-backdrop__paper" />
    </div>
  )
}
