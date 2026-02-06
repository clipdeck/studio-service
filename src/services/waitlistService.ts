import { prisma } from '../lib/prisma';
import { notFound, forbidden, badRequest, conflict } from '../lib/errors';
import { logger } from '../lib/logger';
import { getMemberRole } from './membershipService';
import type { StudioJoinRequestStatus } from '@prisma/client';

/**
 * Get waitlist questions for a studio
 */
export async function getQuestions(studioId: string) {
  return prisma.studioWaitlistQuestion.findMany({
    where: { studioId },
    orderBy: { order: 'asc' },
  });
}

/**
 * Set waitlist questions (OWNER/MODERATOR only) - replaces all existing questions
 */
export async function setQuestions(
  studioId: string,
  userId: string,
  questions: Array<{ question: string; order: number }>
) {
  const role = await getMemberRole(studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can manage waitlist questions');
  }

  // Replace all questions in a transaction
  await prisma.studioWaitlistQuestion.deleteMany({ where: { studioId } });

  const created = [];
  for (let i = 0; i < questions.length; i++) {
    const q = await prisma.studioWaitlistQuestion.create({
      data: {
        studioId,
        question: questions[i].question,
        order: questions[i].order ?? i,
      },
    });
    created.push(q);
  }

  logger.info({ studioId, userId, count: created.length }, 'Waitlist questions updated');
  return created;
}

/**
 * Submit a waitlist response (user applying with answers)
 */
export async function submitResponse(
  studioId: string,
  userId: string,
  answers: Array<{ questionId: string; answer: string }>
) {
  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw notFound(`Studio ${studioId} not found`);

  if (studio.joinType !== 'WAITLIST') {
    throw badRequest('This studio does not use a waitlist');
  }

  // Check if already a member
  const existingMember = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (existingMember) {
    throw conflict('You are already a member of this studio');
  }

  // Check for existing response
  const existing = await prisma.studioWaitlistResponse.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  if (existing && existing.status === 'PENDING') {
    throw conflict('You already have a pending application');
  }

  if (existing) {
    // Update existing (re-apply after rejection)
    const updated = await prisma.studioWaitlistResponse.update({
      where: { studioId_userId: { studioId, userId } },
      data: { answers: answers as unknown as object, status: 'PENDING' },
    });
    return updated;
  }

  const response = await prisma.studioWaitlistResponse.create({
    data: {
      studioId,
      userId,
      answers: answers as unknown as object,
    },
  });

  logger.info({ studioId, userId }, 'Waitlist response submitted');
  return response;
}

/**
 * Get waitlist responses with optional status filter and pagination
 */
export async function getResponses(
  studioId: string,
  status?: StudioJoinRequestStatus,
  page = 1,
  limit = 20
) {
  const skip = (page - 1) * limit;

  const where: { studioId: string; status?: StudioJoinRequestStatus } = { studioId };
  if (status) where.status = status;

  const [responses, total] = await Promise.all([
    prisma.studioWaitlistResponse.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.studioWaitlistResponse.count({ where }),
  ]);

  return { responses, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Review a waitlist response (approve or reject)
 */
export async function reviewResponse(
  responseId: string,
  userId: string,
  status: 'APPROVED' | 'REJECTED'
) {
  const response = await prisma.studioWaitlistResponse.findUnique({
    where: { id: responseId },
  });
  if (!response) throw notFound('Waitlist response not found');

  const role = await getMemberRole(response.studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can review waitlist responses');
  }

  if (response.status !== 'PENDING') {
    throw conflict('Response has already been reviewed');
  }

  const updated = await prisma.studioWaitlistResponse.update({
    where: { id: responseId },
    data: { status },
  });

  // If approved, add as member
  if (status === 'APPROVED') {
    await prisma.studioMember.create({
      data: {
        studioId: response.studioId,
        userId: response.userId,
        role: 'MEMBER',
      },
    });
    logger.info({ studioId: response.studioId, userId: response.userId }, 'Waitlist applicant approved and added as member');
  } else {
    logger.info({ studioId: response.studioId, userId: response.userId }, 'Waitlist applicant rejected');
  }

  return updated;
}
