import { prisma } from '../lib/prisma';
import { notFound, badRequest } from '../lib/errors';
import { logger } from '../lib/logger';

/**
 * Rate a studio (1-5). Creates or updates existing rating and recalculates avgRating.
 */
export async function rateStudio(studioId: string, userId: string, rating: number) {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    throw badRequest('Rating must be an integer between 1 and 5');
  }

  const studio = await prisma.studio.findUnique({ where: { id: studioId } });
  if (!studio) throw notFound(`Studio ${studioId} not found`);

  // Upsert the rating
  await prisma.studioRating.upsert({
    where: { studioId_userId: { studioId, userId } },
    create: {
      studioId,
      userId,
      rating,
    },
    update: {
      rating,
    },
  });

  // Recalculate average rating
  const aggregation = await prisma.studioRating.aggregate({
    where: { studioId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.studio.update({
    where: { id: studioId },
    data: {
      avgRating: aggregation._avg.rating ?? 0,
      ratingCount: aggregation._count.rating,
    },
  });

  logger.info({ studioId, userId, rating }, 'Studio rated');

  return {
    rating,
    avgRating: aggregation._avg.rating ?? 0,
    ratingCount: aggregation._count.rating,
  };
}

/**
 * Get paginated ratings for a studio
 */
export async function getRatings(studioId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [ratings, total] = await Promise.all([
    prisma.studioRating.findMany({
      where: { studioId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.studioRating.count({ where: { studioId } }),
  ]);

  return { ratings, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a specific user's rating for a studio
 */
export async function getUserRating(studioId: string, userId: string) {
  const rating = await prisma.studioRating.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });
  return rating;
}
