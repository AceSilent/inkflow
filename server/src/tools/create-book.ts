import { z } from 'zod'
import { createBookSpace } from '../routes/books.js'
import { type ToolDefinition } from './base-tool.js'

export const createBookTool: ToolDefinition = {
  name: 'create_book',
  description: 'Create a new isolated novel workspace from the current unbound conversation. Use this when the user explicitly wants to turn the discussion into a book/work.',
  parameters: z.object({
    name: z.string().min(1).max(128).describe('The user-facing work name and default directory name.'),
    book_id: z.string().min(1).max(128).optional().describe('Optional safe directory id. Defaults to name.'),
    concept: z.string().max(10000).optional().describe('Optional short premise captured from the conversation.'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ name, book_id, concept }, ctx) => {
    const book = createBookSpace(ctx.dataDir, {
      name,
      book_id,
      concept,
      source_session_id: ctx.sessionId,
    })
    await ctx.onBookCreated?.({ book_id: book.book_id, title: book.title })
    return `Created book workspace "${book.title}" (${book.book_id}).`
  },
}
