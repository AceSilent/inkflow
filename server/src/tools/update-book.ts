import { z } from 'zod'
import { updateBook } from '../routes/books.js'
import { type ToolDefinition } from './base-tool.js'

export const updateBookTool: ToolDefinition = {
  name: 'update_book_metadata',
  description:
    "Update the current book's metadata — most commonly its display title (rename the work), but also its concept/premise, genre, or tone. Use when the user asks to rename the book or when you've settled on a better title. The book_id (directory) never changes, so chapters and history are untouched. Only works in a book-bound conversation.",
  parameters: z
    .object({
      title: z.string().min(1).max(200).optional().describe('New display title / name for the book.'),
      concept: z.string().max(10000).optional().describe('Updated one-line premise/concept.'),
      genre: z.string().min(1).max(50).optional().describe('Updated genre.'),
      tone: z.string().min(1).max(50).optional().describe('Updated tone.'),
    })
    .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update.' }),
  permissionLevel: 'write',
  category: '写入',
  execute: async (patch, ctx) => {
    if (!ctx.bookId || ctx.bookId === '__unbound__') {
      throw new Error('update_book_metadata requires a book-bound conversation; there is no book to update yet.')
    }
    const book = updateBook(ctx.dataDir, ctx.bookId, patch)
    return `Updated book "${book.title}" (${book.book_id}).`
  },
}
