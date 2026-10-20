import type { Server } from 'node:http';

export default async function globalTeardown() {
  const server = (global as Record<string, unknown>).__indexerServer as Server | undefined;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
