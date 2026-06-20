import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT_DIR = path.join(ROOT, 'prompts', 'examples', 'chapters')

const SOURCES = [
  {
    workId: 'journey-to-the-west',
    title: '西遊記',
    author: '吳承恩',
    gutenbergId: '23962',
    category: 'fantasy',
    tags: ['fantasy', 'mythic', 'adventure', 'xianxia', 'chapter_corpus'],
  },
  {
    workId: 'fengshen-yanyi',
    title: '封神演義',
    author: '陸西星',
    gutenbergId: '23910',
    category: 'fantasy',
    tags: ['fantasy', 'mythic', 'war', 'divine_politics', 'chapter_corpus'],
  },
  {
    workId: 'romance-of-three-kingdoms',
    title: '三國志演義',
    author: '羅貫中',
    gutenbergId: '23950',
    category: 'historical',
    tags: ['historical', 'war', 'strategy', 'ensemble', 'chapter_corpus'],
  },
  {
    workId: 'water-margin',
    title: '水滸傳',
    author: '施耐庵',
    gutenbergId: '23863',
    category: 'action',
    tags: ['action', 'outlaw', 'ensemble', 'social', 'chapter_corpus'],
  },
  {
    workId: 'dream-of-red-chamber',
    title: '紅樓夢',
    author: '曹雪芹',
    gutenbergId: '24264',
    category: 'relationship',
    tags: ['relationship', 'family', 'dialogue', 'interior', 'chapter_corpus'],
  },
  {
    workId: 'scholars',
    title: '儒林外史',
    author: '吳敬梓',
    gutenbergId: '24032',
    category: 'satire',
    tags: ['satire', 'social', 'character', 'dialogue', 'chapter_corpus'],
  },
  {
    workId: 'three-heroes-five-gallants',
    title: '三俠五義',
    author: '石玉昆',
    gutenbergId: '25376',
    category: 'wuxia',
    tags: ['wuxia', 'detective', 'justice', 'dialogue', 'chapter_corpus'],
  },
  {
    workId: 'flowers-in-the-mirror',
    title: '鏡花緣',
    author: '李汝珍',
    gutenbergId: '23818',
    category: 'fantasy',
    tags: ['fantasy', 'satire', 'travel', 'strange_world', 'chapter_corpus'],
  },
  {
    workId: 'officialdom-unmasked',
    title: '官場現形記',
    author: '李伯元',
    gutenbergId: '24138',
    category: 'satire',
    tags: ['satire', 'officialdom', 'social', 'late_qing', 'chapter_corpus'],
  },
  {
    workId: 'travels-of-laocan',
    title: '老殘遊記',
    author: '劉鶚',
    gutenbergId: '23850',
    category: 'social',
    tags: ['social', 'travel', 'late_qing', 'observation', 'chapter_corpus'],
  },
]

function pad(n) {
  return String(n).padStart(3, '0')
}

function slugTitle(title) {
  return title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
}

function cleanHeading(raw) {
  let heading = raw.trim().replace(/\s+/g, ' ')
  for (const marker of ['話說', '话说', '且說', '且说', '卻說', '却说']) {
    const idx = heading.indexOf(marker)
    if (idx > 0) heading = heading.slice(0, idx).trim()
  }
  return heading
}

function stripGutenbergWrapper(raw) {
  const withoutBom = raw.replace(/^\uFEFF/, '')
  const startMatch = withoutBom.match(/\*\*\* START OF (?:THE )?PROJECT GUTENBERG EBOOK [^\n]*\*\*\*/i)
  const afterStart = startMatch
    ? withoutBom.slice((startMatch.index ?? 0) + startMatch[0].length)
    : withoutBom
  const endMatch = afterStart.match(/\*\*\* END OF (?:THE )?PROJECT GUTENBERG EBOOK [^\n]*\*\*\*/i)
  const body = endMatch ? afterStart.slice(0, endMatch.index) : afterStart
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function splitChapters(text) {
  const chapterRe = /第[一二三四五六七八九十百千零〇○兩两]+回(?:(?:[：:\t \u3000\u00A0]+[^\n]{0,80})|(?=\n|\r))/gu
  const matches = [...text.matchAll(chapterRe)]
  if (matches.length === 0) return []

  return matches.map((match, index) => {
    const matchIndex = match.index ?? 0
    const start = matchIndex
    const end = index + 1 < matches.length
      ? (matches[index + 1].index ?? text.length)
      : text.length
    const content = text.slice(start, end).trim()
    const heading = cleanHeading(match[0])
    return { heading, content }
  }).filter(chapter => chapter.content.length > 500)
}

function frontmatter(entry, chapter, filePath, sourceUrl) {
  const meta = [
    '---',
    `id: ${entry.workId}-${pad(chapter.index)}`,
    `work_id: ${entry.workId}`,
    `work_title: ${entry.title}`,
    `author: ${entry.author}`,
    `title: ${chapter.heading}`,
    `category: ${entry.category}`,
    `tags: ${entry.tags.join(', ')}`,
    'license: public_domain_us',
    'source_name: Project Gutenberg',
    `source_url: ${sourceUrl}`,
    `relative_path: ${path.relative(ROOT, filePath).replaceAll(path.sep, '/')}`,
    '---',
    '',
  ].join('\n')
  return `${meta}${chapter.content.trim()}\n`
}

async function fetchText(entry) {
  const url = `https://www.gutenberg.org/files/${entry.gutenbergId}/${entry.gutenbergId}-0.txt`
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
      return { url, text: await res.text() }
    } catch (err) {
      lastError = err
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
  throw lastError
}

function resetOutputDir() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function writeReadme(summary) {
  const lines = [
    '# 章节级范文库',
    '',
    '这个目录收录 Project Gutenberg 公版中文小说文本，并按章节拆分为 Markdown 文件。作者 Agent 使用它来学习结构、节奏、信息分配和场景推进，不复用具体句子、设定或桥段。',
    '',
    '“进库”在 InkFlow 里表示进入作者的阅读材料，不表示 InkFlow 拥有文本版权。随应用分发的内置库只放公版/开放授权文本；用户本机私有学习库可以放自己导入的免费章节或文件，并标记来源与 `personal_study` 用途，但不应随应用或仓库再分发。',
    '',
    '## 来源与授权',
    '',
    '- Source: Project Gutenberg',
    '- License marker in files: `public_domain_us`',
    '- Project Gutenberg focuses on older works whose U.S. copyright has expired. Reuse outside the U.S. should still respect local copyright rules.',
    '',
    '## 收录作品',
    '',
    ...summary.map(item => `- ${item.title} / ${item.author}: ${item.count} chapters, category=${item.category}, tags=${item.tags.join(', ')}`),
    '',
  ]
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), lines.join('\n'), 'utf8')
}

resetOutputDir()
const summary = []

for (const entry of SOURCES) {
  const { url, text } = await fetchText(entry)
  const clean = stripGutenbergWrapper(text)
  const chapters = splitChapters(clean)
  if (chapters.length === 0) throw new Error(`No chapters found for ${entry.workId}`)

  const workDir = path.join(OUT_DIR, entry.workId)
  fs.mkdirSync(workDir, { recursive: true })

  chapters.forEach((chapter, index) => {
    const numbered = { ...chapter, index: index + 1 }
    const fileName = `${pad(index + 1)}-${slugTitle(chapter.heading)}.md`
    const filePath = path.join(workDir, fileName)
    fs.writeFileSync(filePath, frontmatter(entry, numbered, filePath, url), 'utf8')
  })

  summary.push({ ...entry, count: chapters.length })
  console.log(`${entry.workId}: ${chapters.length} chapters`)
}

writeReadme(summary)
console.log(`Wrote chapter corpus to ${path.relative(ROOT, OUT_DIR)}`)
