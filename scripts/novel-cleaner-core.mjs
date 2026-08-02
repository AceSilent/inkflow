import fs from 'node:fs'
import path from 'node:path'

const CHAPTER_HEADING_RE = /^第[0-9一二三四五六七八九十百千万千零〇两兩]+[章节回][^\n]*/gm
const NON_STORY_HEADING_RE = /(?:月总结|季度总结|年度总结|上架感言|完本感言|请假|感谢名单|获奖感言|推书|单章)/
const NON_STORY_SECTION_START_RE = /^(?:汇报一下成绩|完结感言|上架感言|完本感言|月总结|季度总结|年度总结|作者有话说|作者的话|推书[:：])/i

function isStoryHeading(match) {
  return !NON_STORY_HEADING_RE.test(match[0])
}

function trimNonStoryTail(content) {
  const lines = content.split('\n')
  const start = lines.findIndex((line, index) =>
    index > 0 && NON_STORY_SECTION_START_RE.test(line.trim()))
  return (start >= 0 ? lines.slice(0, start) : lines).join('\n').trim()
}

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
    .replace(/^.*(?:爱下电子书|ixdzs|八二小说网|精校吧|无弹窗阅读|书友所发表).*$/giu, '')
    .replace(/^[-—－\s]*章节内容开始[-—－\s]*$/g, '')
    .replace(/[ \t　]+$/g, '')
}

export function cleanNovelText(rawText) {
  const decoded = decodeHtmlNumericEntities(rawText)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')

  const firstChapter = [...decoded.matchAll(CHAPTER_HEADING_RE)]
    .find(isStoryHeading)?.index ?? -1
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
  const allMatches = [...cleanedText.matchAll(CHAPTER_HEADING_RE)]
  const matches = allMatches.filter(isStoryHeading)
  if (matches.length === 0) return []

  return matches.map(match => {
    const start = match.index ?? 0
    const rawIndex = allMatches.indexOf(match)
    const end = rawIndex + 1 < allMatches.length
      ? (allMatches[rawIndex + 1].index ?? cleanedText.length)
      : cleanedText.length
    const content = trimNonStoryTail(cleanedText.slice(start, end))
    const title = match[0].trim()
    return { title, content }
  }).filter(chapter => chapter.content.length > chapter.title.length)
    .map((chapter, index) => ({ ...chapter, index: index + 1 }))
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0')
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

function renderChapterMarkdown({ chapter, indexWidth, workId, workTitle, author, category, tags, sourcePath }) {
  return [
    '---',
    `id: ${workId}-${pad(chapter.index, indexWidth)}`,
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

  const indexWidth = Math.max(3, String(chapters.length).length)
  const files = chapters.map(chapter => {
    const filePath = path.join(workDir, `${pad(chapter.index, indexWidth)}-${safeFileTitle(chapter.title)}.md`)
    fs.writeFileSync(filePath, renderChapterMarkdown({
      chapter,
      indexWidth,
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
