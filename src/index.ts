import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config';
import { logger } from './lib/logger';
import { studioRoutes } from './routes/studios';
import { memberRoutes } from './routes/members';
import { mediaRoutes } from './routes/media';
import { ratingRoutes } from './routes/ratings';
import { inviteRoutes } from './routes/invites';
import { waitlistRoutes } from './routes/waitlist';
import { faqRoutes } from './routes/faqs';
import { publisher } from './lib/events';

async function main() {
  const app = Fastify({
    logger: logger as any,
  });

  // Plugins
  await app.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
  });
  await app.register(helmet);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'studio-service' }));
  app.get('/ready', async () => {
    // Could add DB connectivity check here
    return { status: 'ready', service: 'studio-service' };
  });

  // Routes
  await app.register(studioRoutes, { prefix: '/studios' });
  await app.register(memberRoutes, { prefix: '/studios' });
  await app.register(mediaRoutes, { prefix: '/studios' });
  await app.register(ratingRoutes, { prefix: '/studios' });
  await app.register(inviteRoutes, { prefix: '/studios' });
  await app.register(waitlistRoutes, { prefix: '/studios' });
  await app.register(faqRoutes, { prefix: '/studios' });

  // Connect event publisher
  await publisher.connect();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await publisher.disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  await app.listen({ port: config.port, host: config.host });
  logger.info(`Studio service listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  logger.error(err, 'Failed to start studio service');
  process.exit(1);
});
