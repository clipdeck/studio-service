import { prisma } from '../lib/prisma';
import { notFound, badRequest, forbidden, conflict } from '../lib/errors';
import { logger } from '../lib/logger';
import type { StudioRole } from '@prisma/client';

/**
 * Get paginated members list for a studio
 */
export async function getMembers(studioId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [members, total] = await Promise.all([
    prisma.studioMember.findMany({
      where: { studioId },
      skip,
      take: limit,
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.studioMember.count({ where: { studioId } }),
  ]);

  return { members, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a user's role in a studio, or null if not a member
 */
export async function getMemberRole(studioId: string, userId: string): Promise<StudioRole | null> {
  const member = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  return member?.role ?? null;
}

/**
 * Request to join a studio (check joinType)
 */
export async function requestToJoin(studioId: string, userId: string, message?: string) {
  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw notFound(`Studio ${studioId} not found`);

  // Check if already a member
  const existingMember = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (existingMember) {
    throw conflict('You are already a member of this studio');
  }

  if (studio.joinType === 'INVITE_ONLY') {
    throw forbidden('This studio is invite-only');
  }

  if (studio.joinType === 'OPEN') {
    // Directly add as member
    const member = await prisma.studioMember.create({
      data: {
        studioId,
        userId,
        role: 'MEMBER',
      },
    });
    logger.info({ studioId, userId }, 'Member joined studio (open)');
    return { joined: true, member };
  }

  // WAITLIST - create join request
  const existingRequest = await prisma.studioJoinRequest.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (existingRequest) {
    if (existingRequest.status === 'PENDING') {
      throw conflict('You already have a pending join request');
    }
    if (existingRequest.status === 'REJECTED') {
      // Allow re-requesting after rejection
      const updated = await prisma.studioJoinRequest.update({
        where: { id: existingRequest.id },
        data: { status: 'PENDING', message },
      });
      return { joined: false, request: updated };
    }
  }

  const request = await prisma.studioJoinRequest.create({
    data: {
      studioId,
      userId,
      message,
    },
  });

  logger.info({ studioId, userId }, 'Join request created');
  return { joined: false, request };
}

/**
 * Approve a join request and add the user as a member
 */
export async function approveRequest(studioId: string, requestId: string, approverId: string) {
  const approverRole = await getMemberRole(studioId, approverId);
  if (!approverRole || (approverRole !== 'OWNER' && approverRole !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can approve join requests');
  }

  const joinRequest = await prisma.studioJoinRequest.findUnique({
    where: { id: requestId },
  });
  if (!joinRequest) throw notFound('Join request not found');
  if (joinRequest.studioId !== studioId) throw badRequest('Request does not belong to this studio');
  if (joinRequest.status !== 'PENDING') throw conflict('Request is not pending');

  // Update request status and add member in a transaction
  const [updatedRequest, member] = await prisma.$transaction([
    prisma.studioJoinRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED' },
    }),
    prisma.studioMember.create({
      data: {
        studioId,
        userId: joinRequest.userId,
        role: 'MEMBER',
      },
    }),
  ]);

  logger.info({ studioId, userId: joinRequest.userId, approverId }, 'Join request approved');
  return { request: updatedRequest, member };
}

/**
 * Reject a join request
 */
export async function rejectRequest(studioId: string, requestId: string, approverId: string) {
  const approverRole = await getMemberRole(studioId, approverId);
  if (!approverRole || (approverRole !== 'OWNER' && approverRole !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can reject join requests');
  }

  const joinRequest = await prisma.studioJoinRequest.findUnique({
    where: { id: requestId },
  });
  if (!joinRequest) throw notFound('Join request not found');
  if (joinRequest.studioId !== studioId) throw badRequest('Request does not belong to this studio');
  if (joinRequest.status !== 'PENDING') throw conflict('Request is not pending');

  const updated = await prisma.studioJoinRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED' },
  });

  logger.info({ studioId, userId: joinRequest.userId, approverId }, 'Join request rejected');
  return updated;
}

/**
 * Remove a member from a studio (OWNER/MODERATOR only)
 */
export async function removeMember(studioId: string, userId: string, removerId: string) {
  const removerRole = await getMemberRole(studioId, removerId);
  if (!removerRole || (removerRole !== 'OWNER' && removerRole !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can remove members');
  }

  const member = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (!member) throw notFound('Member not found');

  // Moderators cannot remove owners or other moderators
  if (removerRole === 'MODERATOR' && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
    throw forbidden('Moderators cannot remove owners or other moderators');
  }

  // Owners cannot remove themselves (use leaveStudio instead)
  if (member.role === 'OWNER' && userId === removerId) {
    throw badRequest('Owners cannot remove themselves. Use leave instead after transferring ownership.');
  }

  await prisma.studioMember.delete({
    where: { studioId_userId: { studioId, userId } },
  });

  logger.info({ studioId, userId, removerId }, 'Member removed from studio');
}

/**
 * Update a member's role (OWNER only)
 */
export async function updateMemberRole(
  studioId: string,
  userId: string,
  role: StudioRole,
  updaterId: string
) {
  const updaterRole = await getMemberRole(studioId, updaterId);
  if (updaterRole !== 'OWNER') {
    throw forbidden('Only the studio owner can change member roles');
  }

  const member = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (!member) throw notFound('Member not found');

  // Cannot change own role as owner
  if (userId === updaterId) {
    throw badRequest('Cannot change your own role');
  }

  // Cannot promote to OWNER (transfer ownership is a separate action)
  if (role === 'OWNER') {
    throw badRequest('Cannot promote to OWNER. Use ownership transfer instead.');
  }

  const updated = await prisma.studioMember.update({
    where: { studioId_userId: { studioId, userId } },
    data: { role },
  });

  logger.info({ studioId, userId, role, updaterId }, 'Member role updated');
  return updated;
}

/**
 * Leave a studio (prevent OWNER from leaving)
 */
export async function leaveStudio(studioId: string, userId: string) {
  const member = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (!member) throw notFound('You are not a member of this studio');

  if (member.role === 'OWNER') {
    throw badRequest('Owners cannot leave the studio. Transfer ownership first.');
  }

  await prisma.studioMember.delete({
    where: { studioId_userId: { studioId, userId } },
  });

  logger.info({ studioId, userId }, 'Member left studio');
}
