import type { FastifyCorsOptions } from '@fastify/cors'

export const corsOptions: FastifyCorsOptions = {
  origin: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}
