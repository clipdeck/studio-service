import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';
import * as faqService from '../services/faqService';

export async function faqRoutes(app: FastifyInstance) {
  // GET /studios/:slug/faqs - Get FAQs
  app.get<{ Params: { slug: string } }>('/:slug/faqs', async (request, reply) => {
    try {
      const studio = await studioService.getStudio(request.params.slug);
      const faqs = await faqService.getFAQs(studio.id);
      return { faqs };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /studios/:slug/faqs - Add FAQ
  app.post<{ Params: { slug: string } }>('/:slug/faqs', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const { question, answer } = request.body as { question: string; answer: string };
      const faq = await faqService.addFAQ(studio.id, user.userId, question, answer);
      reply.status(201);
      return faq;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // PUT /studios/:slug/faqs/:id - Update FAQ
  app.put<{ Params: { slug: string; id: string } }>(
    '/:slug/faqs/:id',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const { question, answer } = request.body as { question?: string; answer?: string };
        const faq = await faqService.updateFAQ(request.params.id, user.userId, question, answer);
        return faq;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // DELETE /studios/:slug/faqs/:id - Delete FAQ
  app.delete<{ Params: { slug: string; id: string } }>(
    '/:slug/faqs/:id',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        await faqService.deleteFAQ(request.params.id, user.userId);
        reply.status(204).send();
      } catch (error) {
        sendError(reply, error);
      }
    }
  );
}
