import type { AppContext } from './context';

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
export {};
