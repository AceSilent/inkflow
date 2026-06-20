import fs from 'node:fs'
import path from 'node:path'

const CHAPTER_HEADING_RE = /^第[0-9一二三四五六七八九十百千万千零〇两兩]+[章节回卷][^\n]*/gm

export function decodeHtmlNumericEntities(text) {
  return text.replace(/&#(x?[0-9a-fA-F]+);/g, (_, raw) => {
    const codePoint = raw.toLowerCase().startsWith('x')
      ? Number.parseInt(raw.slice(1), 16)
      : Number.parseInt(raw, 10)
    if (!Number.isFinite(codePoint)) return _
    try {
      return String.fromCodePoint(codePoint)
    } catch {
      return _
    }
  })
}

function removeAdFragments(line) {
  return line
    .replace(/，?精彩小说无弹窗免费阅读！?/g, '')
    .replace(/手机端阅读[:：].*$/g, '')
    .replace(/[（(]?[^。！？!?；;\n]*xiaoshuo[^。！？!?；;\n]*[）)]?/giu, '')
    .replace(/[（(]?[^。！？!?；;\n]*小说网[^。！？!?；;\n]*[）)]?/giu, '')
    .replace(/^.*(?:爱下电子书|ixdzs|八二小说网|无弹窗阅读|书友所发表).*$/giu, '')
    .replace(/^[-—－\s]*章节内容开始[-—－\s]*$/g, '')
    .replace(/[ \t　]+$/g, '')
}

export function cleanNovelText(rawText) {
  const decoded = decodeHtmlNumericEntities(rawText)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')

  const firstChapter = decoded.search(CHAPTER_HEADING_RE)
  const body = firstChapter >= 0 ? decoded.slice(firstChapter) : decoded

  const lines = body
    .split('\n')
    .map(removeAdFragments)
    .map(line => line.trimEnd())
    .filter(line => {
      const compact = line.trim()
      if (!compact) return false
      return !/^[，。,.、！!…·\s　]+$/.test(compact)
    })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export function splitNovelChapters(cleanedText) {
  const matches = [...cleanedText.matchAll(CHAPTER_HEADING_RE)]
  if (matches.length === 0) return []

  return matches.map((match, index) => {
    const start = match.index ?? 0
    const end = index + 1 < matches.length
      ? (matches[index + 1].index ?? cleanedText.length)
      : cleanedText.length
    const content = cleanedText.slice(start, end).trim()
    const title = match[0].trim()
    return { index: index + 1, title, content }
  }).filter(chapter => chapter.content.length > chapter.title.length)
}

function pad(n) {
  return String(n).padStart(3, '0')
}

function safeFileTitle(title) {
  return title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
}

function yamlValue(value) {
  const text = String(value ?? '')
  if (/[:#\n\r]/.test(text)) return JSON.stringify(text)
  return text
}

function renderChapterMarkdown({ chapter, workId, workTitle, author, category, tags, sourcePath }) {
  return [
    '---',
    `id: ${workId}-${pad(chapter.index)}`,
    `work_id: ${workId}`,
    `work_title: ${yamlValue(workTitle)}`,
    `author: ${yamlValue(author)}`,
    `title: ${yamlValue(chapter.title)}`,
    `category: ${category}`,
    `tags: ${tags.join(', ')}`,
    'license: personal_study',
    sourcePath ? `source_path: ${yamlValue(sourcePath)}` : '',
    '---',
    '',
    chapter.content,
    '',
  ].filter(line => line !== '').join('\n')
}

export function writePersonalStudyChapters({
  text,
  outputDir,
  workId,
  workTitle,
  author,
  category,
  tags,
  sourcePath,
}) {
  const chapters = splitNovelChapters(text)
  const workDir = path.join(outputDir, workId)
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })

  const files = chapters.map(chapter => {
    const filePath = path.join(workDir, `${pad(chapter.index)}-${safeFileTitle(chapter.title)}.md`)
    fs.writeFileSync(filePath, renderChapterMarkdown({
      chapter,
      workId,
      workTitle,
      author,
      category,
      tags,
      sourcePath,
    }), 'utf8')
    return filePath
  })

  return { workDir, chapterCount: chapters.length, files }
}
