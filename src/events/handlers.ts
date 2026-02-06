import { createConsumer } from '@clipdeck/events';
import type { EventConsumer } from '@clipdeck/events';
import { logger } from '../lib/logger';
import { config } from '../config';

let consumer: EventConsumer | null = null;

/**
 * Set up event handlers for events this service consumes from other services.
 *
 * Studios are mostly self-contained, so minimal event handling is needed.
 * The routing keys below are placeholders for future studio-related events
 * that will be added to the shared-events package as the system evolves.
 */
export async function setupEventHandlers() {
  consumer = createConsumer({
    serviceName: 'studio-service',
    connectionUrl: config.rabbitmqUrl,
    exchange: config.eventExchange,
    queueName: 'studio.events',
    routingKeys: ['campaign.created', 'campaign.ended'],
    enableLogging: true,
    logger: {
      info: (msg, data) => logger.info(data, msg),
      error: (msg, err) => logger.error(err, msg),
      debug: (msg, data) => logger.debug(data, msg),
    },
  });

  // Listen for campaign created events to update studio campaign counts
  consumer.on(
    'campaign.created',
    async (event, ctx) => {
      const { studioId } = event.payload;
      if (studioId) {
        logger.debug({ studioId, campaignId: event.payload.campaignId }, 'Campaign created for studio');
      }
      ctx.ack();
    }
  );

  // Listen for campaign ended events to update studio active campaign counts
  consumer.on(
    'campaign.ended',
    async (event, ctx) => {
      logger.debug({ campaignId: event.payload.campaignId }, 'Campaign ended event received');
      ctx.ack();
    }
  );

  await consumer.start();
  logger.info('Event handlers started');
}

export async function stopEventHandlers() {
  if (consumer) {
    await consumer.stop();
    consumer = null;
  }
}
