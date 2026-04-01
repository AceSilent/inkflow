import Fastify from 'fastify'

const app = Fastify({ logger: true })

app.get('/health', async () => ({ status: 'ok', engine: 'autonovel-ts' }))

const start = async () => {
  await app.listen({ port: 3001, host: '0.0.0.0' })
  console.log('AutoNovel TS backend running on :3001')
}
start()
