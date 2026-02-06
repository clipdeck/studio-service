import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';
import * as ratingService from '../services/ratingService';

export async function ratingRoutes(app: FastifyInstance) {
  // GET /studios/:slug/ratings - Get ratings
  app.get<{ Params: { slug: string } }>('/:slug/ratings', async (request, reply) => {
    try {
      const studio = await studioService.getStudio(request.params.slug);
      const query = request.query as Record<string, string>;
      const result = await ratingService.getRatings(
        studio.id,
        query.page ? parseInt(query.page, 10) : undefined,
        query.limit ? parseInt(query.limit, 10) : undefined
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /studios/:slug/rate - Rate studio
  app.post<{ Params: { slug: string } }>('/:slug/rate', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const { rating } = request.body as { rating: number };
      const result = await ratingService.rateStudio(studio.id, user.userId, rating);
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /studios/:slug/ratings/mine - Get my rating
  app.get<{ Params: { slug: string } }>('/:slug/ratings/mine', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const rating = await ratingService.getUserRating(studio.id, user.userId);
      return { rating };
    } catch (error) {
      sendError(reply, error);
    }
  });
}
