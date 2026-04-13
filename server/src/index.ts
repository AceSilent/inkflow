/**
 * AutoNovel-Studio TypeScript Backend — Entry Point
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authorChatRoutes } from './routes/author-chat.js'
import { booksRoutes } from './routes/books.js'
import { dataRoutes } from './routes/data.js'
import { settingsRoutes } from './routes/settings.js'
import { snapshotRoutes } from './routes/snapshots.js'
import { initFeishu } from './feishu/index.js'

const app = Fastify({ logger: true, ignoreTrailingSlash: true })

await app.register(cors, { origin: true })
await app.register(authorChatRoutes)
await app.register(booksRoutes)
await app.register(dataRoutes)
await app.register(settingsRoutes)
await app.register(snapshotRoutes)

app.get('/health', async () => ({ status: 'ok', engine: 'autonovel-ts' }))

const start = async () => {
  await app.listen({ port: 3001, host: '0.0.0.0' })
  console.log('AutoNovel TS backend running on :3001')
  await initFeishu(app)
}
start()
