import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';
import * as mediaService from '../services/mediaService';

export async function mediaRoutes(app: FastifyInstance) {
  // POST /studios/:slug/media - Add media
  app.post<{ Params: { slug: string } }>('/:slug/media', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const body = request.body as { url: string; type: string; order?: number };
      const media = await mediaService.addMedia(
        studio.id,
        user.userId,
        body.url,
        body.type as any,
        body.order
      );
      reply.status(201);
      return media;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // DELETE /studios/:slug/media/:id - Remove media
  app.delete<{ Params: { slug: string; id: string } }>(
    '/:slug/media/:id',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        await mediaService.removeMedia(request.params.id, user.userId);
        reply.status(204).send();
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // PUT /studios/:slug/media/reorder - Reorder media
  app.put<{ Params: { slug: string } }>('/:slug/media/reorder', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const { mediaIds } = request.body as { mediaIds: string[] };
      const result = await mediaService.reorderMedia(studio.id, user.userId, mediaIds);
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });
}
