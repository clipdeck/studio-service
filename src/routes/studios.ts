import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';

export async function studioRoutes(app: FastifyInstance) {
  // POST /studios - Create studio
  app.post('/', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const body = request.body as {
        name: string;
        slug: string;
        description?: string;
        category?: string;
        joinType?: string;
        language?: string;
      };
      const studio = await studioService.createStudio(user.userId, body as any);
      reply.status(201);
      return studio;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /studios - List studios
  app.get('/', async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const result = await studioService.listStudios(
        {
          category: query.category,
          isPublic: query.isPublic === 'true' ? true : query.isPublic === 'false' ? false : undefined,
          search: query.search,
        },
        query.page ? parseInt(query.page, 10) : undefined,
        query.limit ? parseInt(query.limit, 10) : undefined
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /studios/:slug - Get studio by slug
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    try {
      const studio = await studioService.getStudio(request.params.slug);
      return studio;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // PUT /studios/:slug - Update studio
  app.put<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const updated = await studioService.updateStudio(
        studio.id,
        user.userId,
        request.body as Record<string, unknown>
      );
      return updated;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // DELETE /studios/:slug - Delete studio
  app.delete<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      await studioService.deleteStudio(studio.id, user.userId);
      reply.status(204).send();
    } catch (error) {
      sendError(reply, error);
    }
  });
}
