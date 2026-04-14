/**
 * ReadFile tool — reads a file from the book's directory.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'

const MAX_FILE_CHARS = 10_000

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取书籍目录中的文件。支持 .md, .json, .txt 等格式。',
  parameters: z.object({
    relative_path: z.string().describe('相对于书籍目录的文件路径'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ relative_path }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const target = path.resolve(bookDir, relative_path)

    // Path traversal check
    if (!target.startsWith(path.resolve(bookDir))) {
      return 'Error: Access denied — path outside book directory.'
    }

    if (!fs.existsSync(target)) {
      return `Error: File not found: ${relative_path}`
    }

    const stat = fs.statSync(target)
    if (!stat.isFile()) {
      return `Error: '${relative_path}' is not a file.`
    }

    const content = fs.readFileSync(target, 'utf-8')
    if (content.length > MAX_FILE_CHARS) {
      return content.slice(0, MAX_FILE_CHARS) + `\n...[truncated, ${content.length} total chars]`
    }
    return content
  },
}
