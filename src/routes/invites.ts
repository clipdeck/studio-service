import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';
import * as inviteService from '../services/inviteService';

export async function inviteRoutes(app: FastifyInstance) {
  // POST /studios/:slug/invites - Invite user
  app.post<{ Params: { slug: string } }>('/:slug/invites', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const { userId, role } = request.body as { userId: string; role?: string };
      const invite = await inviteService.inviteUser(
        studio.id,
        user.userId,
        userId,
        role as any
      );
      reply.status(201);
      return invite;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /invites/mine - Get my pending invites
  app.get('/invites/mine', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const invites = await inviteService.getInvites(user.userId);
      return { invites };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /invites/:id/respond - Accept/reject invite
  app.post<{ Params: { id: string } }>('/invites/:id/respond', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const { accept } = request.body as { accept: boolean };
      const result = await inviteService.respondToInvite(
        request.params.id,
        user.userId,
        accept
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });
}
