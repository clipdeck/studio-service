import { prisma } from '../lib/prisma';
import { notFound, forbidden, conflict, badRequest } from '../lib/errors';
import { logger } from '../lib/logger';
import { getMemberRole } from './membershipService';
import type { StudioRole } from '@prisma/client';

/**
 * Invite a user to a studio
 */
export async function inviteUser(
  studioId: string,
  inviterId: string,
  userId: string,
  role?: StudioRole
) {
  const inviterRole = await getMemberRole(studioId, inviterId);
  if (!inviterRole || (inviterRole !== 'OWNER' && inviterRole !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can invite users');
  }

  // Cannot invite to OWNER role
  const inviteRole = role ?? 'MEMBER';
  if (inviteRole === 'OWNER') {
    throw badRequest('Cannot invite as OWNER');
  }

  // Moderators can only invite as MEMBER
  if (inviterRole === 'MODERATOR' && inviteRole === 'MODERATOR') {
    throw forbidden('Moderators cannot invite other moderators');
  }

  // Check if user is already a member
  const existingMember = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (existingMember) {
    throw conflict('User is already a member of this studio');
  }

  // Check for existing pending invite
  const existingInvite = await prisma.studioInvite.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (existingInvite) {
    if (existingInvite.status === 'PENDING') {
      throw conflict('User already has a pending invite');
    }
    // Update existing invite if previously rejected
    const updated = await prisma.studioInvite.update({
      where: { id: existingInvite.id },
      data: { status: 'PENDING', role: inviteRole },
    });
    logger.info({ studioId, inviterId, userId, role: inviteRole }, 'Studio invite re-sent');
    return updated;
  }

  const invite = await prisma.studioInvite.create({
    data: {
      studioId,
      userId,
      role: inviteRole,
    },
  });

  logger.info({ studioId, inviterId, userId, role: inviteRole }, 'Studio invite created');
  return invite;
}

/**
 * Respond to an invite (accept or reject)
 */
export async function respondToInvite(inviteId: string, userId: string, accept: boolean) {
  const invite = await prisma.studioInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw notFound('Invite not found');
  if (invite.userId !== userId) throw forbidden('This invite is not for you');
  if (invite.status !== 'PENDING') throw conflict('Invite is no longer pending');

  if (accept) {
    // Check if already a member (edge case)
    const existingMember = await prisma.studioMember.findUnique({
      where: { studioId_userId: { studioId: invite.studioId, userId } },
    });
    if (existingMember) {
      // Just update invite status
      await prisma.studioInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED' },
      });
      throw conflict('You are already a member of this studio');
    }

    // Accept: update invite and add as member
    const [updatedInvite, member] = await prisma.$transaction([
      prisma.studioInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED' },
      }),
      prisma.studioMember.create({
        data: {
          studioId: invite.studioId,
          userId,
          role: invite.role,
        },
      }),
    ]);

    logger.info({ inviteId, studioId: invite.studioId, userId }, 'Invite accepted');
    return { invite: updatedInvite, member };
  }

  // Reject
  const updatedInvite = await prisma.studioInvite.update({
    where: { id: inviteId },
    data: { status: 'REJECTED' },
  });

  logger.info({ inviteId, studioId: invite.studioId, userId }, 'Invite rejected');
  return { invite: updatedInvite };
}

/**
 * Get pending invites for a user
 */
export async function getInvites(userId: string) {
  return prisma.studioInvite.findMany({
    where: { userId, status: 'PENDING' },
    include: {
      studio: {
        select: { id: true, name: true, slug: true, logoUrl: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get invites sent by a studio
 */
export async function getStudioInvites(studioId: string) {
  return prisma.studioInvite.findMany({
    where: { studioId },
    orderBy: { createdAt: 'desc' },
  });
}
