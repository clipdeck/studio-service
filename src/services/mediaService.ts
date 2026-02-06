import { prisma } from '../lib/prisma';
import { notFound, forbidden } from '../lib/errors';
import { logger } from '../lib/logger';
import { getMemberRole } from './membershipService';
import type { MediaType } from '@prisma/client';

/**
 * Add media to a studio (OWNER/MODERATOR only)
 */
export async function addMedia(
  studioId: string,
  userId: string,
  url: string,
  type: MediaType,
  order?: number
) {
  const role = await getMemberRole(studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can add media');
  }

  // If no order provided, place at the end
  let mediaOrder = order;
  if (mediaOrder === undefined) {
    const lastMedia = await prisma.studioMedia.findFirst({
      where: { studioId },
      orderBy: { order: 'desc' },
    });
    mediaOrder = (lastMedia?.order ?? -1) + 1;
  }

  const media = await prisma.studioMedia.create({
    data: {
      studioId,
      url,
      type,
      order: mediaOrder,
    },
  });

  logger.info({ studioId, mediaId: media.id, userId }, 'Media added to studio');
  return media;
}

/**
 * Remove media from a studio
 */
export async function removeMedia(mediaId: string, userId: string) {
  const media = await prisma.studioMedia.findUnique({ where: { id: mediaId } });
  if (!media) throw notFound('Media not found');

  const role = await getMemberRole(media.studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can remove media');
  }

  await prisma.studioMedia.delete({ where: { id: mediaId } });
  logger.info({ mediaId, studioId: media.studioId, userId }, 'Media removed from studio');
}

/**
 * Reorder media items
 */
export async function reorderMedia(studioId: string, userId: string, mediaIds: string[]) {
  const role = await getMemberRole(studioId, userId);
  if (!role || (role !== 'OWNER' && role !== 'MODERATOR')) {
    throw forbidden('Only owners and moderators can reorder media');
  }

  // Update order for each media item
  for (let i = 0; i < mediaIds.length; i++) {
    await prisma.studioMedia.update({
      where: { id: mediaIds[i] },
      data: { order: i },
    });
  }

  logger.info({ studioId, userId }, 'Media reordered');

  return prisma.studioMedia.findMany({
    where: { studioId },
    orderBy: { order: 'asc' },
  });
}
