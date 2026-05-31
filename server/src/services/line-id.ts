interface PartialLine {
  id?: string
  text: string
  [key: string]: unknown
}

export function generateLineIds<T extends PartialLine>(
  packageId: string,
  stageId: string,
  lines: T[],
): (T & { id: string })[] {
  return lines.map((line, index) => ({
    ...line,
    id: line.id || `${packageId}.${stageId}.${String(index + 1).padStart(3, '0')}`,
  }))
}

export function detectIdCollisions(lines: { id: string }[]): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const line of lines) {
    if (seen.has(line.id) && !duplicates.includes(line.id)) duplicates.push(line.id)
    seen.add(line.id)
  }
  return duplicates
}

