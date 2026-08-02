import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateLoreDocumentFile } from '../server/dist/lore/lore-document.js'

const defaultBooksDir = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'com.inkflow.studio',
  'books',
)
const booksDir = path.resolve(process.argv[2] || defaultBooksDir)

if (!fs.existsSync(booksDir)) {
  console.error(`Books directory does not exist: ${booksDir}`)
  process.exitCode = 1
} else {
  let migratedFiles = 0
  const bookIds = fs.readdirSync(booksDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  for (const bookId of bookIds) {
    const bookDir = path.join(booksDir, bookId)
    for (const category of ['story_bible', 'world_setting', 'characters']) {
      if (!migrateLoreDocumentFile(bookDir, category)) continue
      migratedFiles += 1
      console.log(`Migrated ${bookId}: ${category}`)
    }
  }

  console.log(`Lore migration complete: ${migratedFiles} file(s) migrated across ${bookIds.length} book(s).`)
}
