#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanNovelText, writePersonalStudyChapters } from './novel-cleaner-core.mjs'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    args[key] = value
  }
  return args
}

function usage() {
  return [
    'Usage:',
    '  node scripts/import-personal-study-txt.mjs --input <txt> --work-id <id> --title <title> --author <author> --category <category> --tags <a,b,c>',
    '',
    'Options:',
    '  --encoding <encoding>  Defaults to gb18030.',
    '  --out <dir>           Defaults to ~/Library/Application Support/com.inkflow.studio/personal_study/exemplars',
  ].join('\n')
}

const args = parseArgs(process.argv.slice(2))
if (!args.input || !args['work-id'] || !args.title || !args.author || !args.category) {
  console.error(usage())
  process.exit(1)
}

const inputPath = path.resolve(args.input)
const encoding = args.encoding || 'gb18030'
const outputDir = args.out
  ? path.resolve(args.out)
  : path.join(os.homedir(), 'Library', 'Application Support', 'com.inkflow.studio', 'personal_study', 'exemplars')
const tags = String(args.tags || '')
  .split(',')
  .map(tag => tag.trim())
  .filter(Boolean)

const bytes = fs.readFileSync(inputPath)
const rawText = new TextDecoder(encoding).decode(bytes)
const cleaned = cleanNovelText(rawText)
const result = writePersonalStudyChapters({
  text: cleaned,
  outputDir,
  workId: args['work-id'],
  workTitle: args.title,
  author: args.author,
  category: args.category,
  tags,
  sourcePath: inputPath,
})

console.log(`Imported ${result.chapterCount} chapters`)
console.log(`Output: ${result.workDir}`)
for (const file of result.files.slice(0, 5)) {
  console.log(`- ${path.basename(file)}`)
}
if (result.files.length > 5) console.log(`... ${result.files.length - 5} more`)
