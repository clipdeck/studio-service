import { prisma } from '../lib/prisma';
import { notFound, forbidden } from '../lib/errors';
import { logger } from '../lib/logger';
import { getMemberRole } from './membershipService';

/**
 * Get FAQs for a studio, ordered by order field
 */
export async function getFAQs(studioId: string) {
  return prisma.studioFAQ.findMany({
    where: { studioId },
    orderBy: { order: 'asc' },
  });
}

/**
 * Add a FAQ to a studio (OWNER/MODERATOR only)
 */
export async function addFAQ(
  studioId: string,
  userId: string,
  question: string,
  answer: string
) {
  const role = await getMemberRole(studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can manage FAQs');
  }

  // Auto-assign order
  const lastFaq = await prisma.studioFAQ.findFirst({
    where: { studioId },
    orderBy: { order: 'desc' },
  });
  const order = (lastFaq?.order ?? -1) + 1;

  const faq = await prisma.studioFAQ.create({
    data: {
      studioId,
      question,
      answer,
      order,
    },
  });

  logger.info({ studioId, faqId: faq.id, userId }, 'FAQ added');
  return faq;
}

/**
 * Update a FAQ
 */
export async function updateFAQ(
  faqId: string,
  userId: string,
  question?: string,
  answer?: string
) {
  const faq = await prisma.studioFAQ.findUnique({ where: { id: faqId } });
  if (!faq) throw notFound('FAQ not found');

  const role = await getMemberRole(faq.studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can update FAQs');
  }

  const data: { question?: string; answer?: string } = {};
  if (question !== undefined) data.question = question;
  if (answer !== undefined) data.answer = answer;

  const updated = await prisma.studioFAQ.update({
    where: { id: faqId },
    data,
  });

  logger.info({ faqId, studioId: faq.studioId, userId }, 'FAQ updated');
  return updated;
}

/**
 * Delete a FAQ
 */
export async function deleteFAQ(faqId: string, userId: string) {
  const faq = await prisma.studioFAQ.findUnique({ where: { id: faqId } });
  if (!faq) throw notFound('FAQ not found');

  const role = await getMemberRole(faq.studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can delete FAQs');
  }

  await prisma.studioFAQ.delete({ where: { id: faqId } });
  logger.info({ faqId, studioId: faq.studioId, userId }, 'FAQ deleted');
}

/**
 * Reorder FAQs
 */
export async function reorderFAQs(studioId: string, userId: string, faqIds: string[]) {
  const role = await getMemberRole(studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can reorder FAQs');
  }

  for (let i = 0; i < faqIds.length; i++) {
    await prisma.studioFAQ.update({
      where: { id: faqIds[i] },
      data: { order: i },
    });
  }

  logger.info({ studioId, userId }, 'FAQs reordered');

  return prisma.studioFAQ.findMany({
    where: { studioId },
    orderBy: { order: 'asc' },
  });
}
