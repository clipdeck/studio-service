import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';
import * as waitlistService from '../services/waitlistService';

export async function waitlistRoutes(app: FastifyInstance) {
  // GET /studios/:slug/waitlist/questions - Get questions
  app.get<{ Params: { slug: string } }>(
    '/:slug/waitlist/questions',
    async (request, reply) => {
      try {
        const studio = await studioService.getStudio(request.params.slug);
        const questions = await waitlistService.getQuestions(studio.id);
        return { questions };
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // PUT /studios/:slug/waitlist/questions - Set questions
  app.put<{ Params: { slug: string } }>(
    '/:slug/waitlist/questions',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        const { questions } = request.body as {
          questions: Array<{ question: string; order: number }>;
        };
        const result = await waitlistService.setQuestions(studio.id, user.userId, questions);
        return { questions: result };
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // POST /studios/:slug/waitlist/apply - Submit waitlist response
  app.post<{ Params: { slug: string } }>(
    '/:slug/waitlist/apply',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        const { answers } = request.body as {
          answers: Array<{ questionId: string; answer: string }>;
        };
        const result = await waitlistService.submitResponse(studio.id, user.userId, answers);
        return result;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // GET /studios/:slug/waitlist/responses - List responses
  app.get<{ Params: { slug: string } }>(
    '/:slug/waitlist/responses',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        const query = request.query as Record<string, string>;
        const result = await waitlistService.getResponses(
          studio.id,
          query.status as any,
          query.page ? parseInt(query.page, 10) : undefined,
          query.limit ? parseInt(query.limit, 10) : undefined
        );
        return result;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // POST /studios/:slug/waitlist/responses/:id/review - Review response
  app.post<{ Params: { slug: string; id: string } }>(
    '/:slug/waitlist/responses/:id/review',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const { status } = request.body as { status: 'APPROVED' | 'REJECTED' };
        const result = await waitlistService.reviewResponse(
          request.params.id,
          user.userId,
          status
        );
        return result;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );
}
