import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as studioService from '../services/studioService';
import * as membershipService from '../services/membershipService';

export async function memberRoutes(app: FastifyInstance) {
  // GET /studios/:slug/members - List members
  app.get<{ Params: { slug: string } }>('/:slug/members', async (request, reply) => {
    try {
      const studio = await studioService.getStudio(request.params.slug);
      const query = request.query as Record<string, string>;
      const result = await membershipService.getMembers(
        studio.id,
        query.page ? parseInt(query.page, 10) : undefined,
        query.limit ? parseInt(query.limit, 10) : undefined
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /studios/:slug/join - Request to join
  app.post<{ Params: { slug: string } }>('/:slug/join', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      const body = request.body as { message?: string } | undefined;
      const result = await membershipService.requestToJoin(studio.id, user.userId, body?.message);
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /studios/:slug/requests/:id/approve - Approve join request
  app.post<{ Params: { slug: string; id: string } }>(
    '/:slug/requests/:id/approve',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        const result = await membershipService.approveRequest(
          studio.id,
          request.params.id,
          user.userId
        );
        return result;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // POST /studios/:slug/requests/:id/reject - Reject join request
  app.post<{ Params: { slug: string; id: string } }>(
    '/:slug/requests/:id/reject',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        const result = await membershipService.rejectRequest(
          studio.id,
          request.params.id,
          user.userId
        );
        return result;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // DELETE /studios/:slug/members/:userId - Remove member
  app.delete<{ Params: { slug: string; userId: string } }>(
    '/:slug/members/:userId',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        await membershipService.removeMember(studio.id, request.params.userId, user.userId);
        reply.status(204).send();
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // PATCH /studios/:slug/members/:userId/role - Update member role
  app.patch<{ Params: { slug: string; userId: string } }>(
    '/:slug/members/:userId/role',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const studio = await studioService.getStudio(request.params.slug);
        const { role } = request.body as { role: string };
        const result = await membershipService.updateMemberRole(
          studio.id,
          request.params.userId,
          role as any,
          user.userId
        );
        return result;
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // POST /studios/:slug/leave - Leave studio
  app.post<{ Params: { slug: string } }>('/:slug/leave', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const studio = await studioService.getStudio(request.params.slug);
      await membershipService.leaveStudio(studio.id, user.userId);
      return { success: true };
    } catch (error) {
      sendError(reply, error);
    }
  });
}
