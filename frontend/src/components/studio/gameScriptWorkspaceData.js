function childNodes(node) {
  return Array.isArray(node?.children) ? node.children : []
}

function displayLabel(node, fallback) {
  return typeof node?.label === 'string' && node.label.trim()
    ? node.label
    : fallback
}

export function summarizeGameOutline(outline) {
  const rootChildren = childNodes(outline)
  const arcNodes = rootChildren.filter(node => node?.type === 'arc')
  const loosePackages = rootChildren.filter(node => node?.type === 'story_package')
  let packageCount = loosePackages.length
  let stageCount = loosePackages.reduce((sum, pkg) => sum + childNodes(pkg).filter(node => node?.type === 'stage').length, 0)

  const arcs = arcNodes.map((arc) => {
    const packages = childNodes(arc).filter(node => node?.type === 'story_package')
    const looseStages = childNodes(arc).filter(node => node?.type === 'stage')
    const packageSummaries = packages.map((pkg) => {
      const stages = childNodes(pkg).filter(node => node?.type === 'stage')
      return {
        id: pkg.id,
        label: displayLabel(pkg, pkg.id),
        packageId: pkg.package_id || pkg.id,
        stageCount: stages.length,
      }
    })
    const arcStageCount = looseStages.length + packageSummaries.reduce((sum, pkg) => sum + pkg.stageCount, 0)

    packageCount += packageSummaries.length
    stageCount += arcStageCount

    return {
      id: arc.id,
      label: displayLabel(arc, arc.id),
      packageCount: packageSummaries.length,
      stageCount: arcStageCount,
      packages: packageSummaries,
    }
  })

  return {
    arcCount: arcs.length,
    packageCount,
    stageCount,
    arcs,
  }
}

export function summarizeScriptPackages(scripts) {
  const packages = Array.isArray(scripts) ? scripts : []

  return {
    packageCount: packages.length,
    stageCount: packages.reduce((sum, item) => sum + (Number(item?.stage_count) || 0), 0),
    lineCount: packages.reduce((sum, item) => sum + (Number(item?.line_count) || 0), 0),
    choiceCount: packages.reduce((sum, item) => sum + (Number(item?.choice_count) || 0), 0),
    packages,
  }
}
