import { prisma } from '../lib/prisma';
import { notFound, badRequest, forbidden, conflict } from '../lib/errors';
import { logger } from '../lib/logger';
import type { AuthUser } from '../middleware/auth';
import type { Prisma, StudioCategory, StudioJoinType } from '@prisma/client';

/**
 * Create a new studio and add the creator as OWNER member
 */
export async function createStudio(
  ownerId: string,
  data: {
    name: string;
    slug: string;
    description?: string;
    category?: StudioCategory;
    joinType?: StudioJoinType;
    language?: string;
  }
) {
  // Check slug uniqueness
  const existing = await prisma.studio.findUnique({ where: { slug: data.slug } });
  if (existing) {
    throw conflict(`Studio with slug "${data.slug}" already exists`);
  }

  const studio = await prisma.studio.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      category: data.category ?? 'OTHER',
      joinType: data.joinType ?? 'WAITLIST',
      language: data.language ?? 'es',
    },
  });

  // Add creator as OWNER member
  await prisma.studioMember.create({
    data: {
      studioId: studio.id,
      userId: ownerId,
      role: 'OWNER',
    },
  });

  logger.info({ studioId: studio.id, ownerId }, 'Studio created');
  return studio;
}

/**
 * Get studio by slug with member count
 */
export async function getStudio(slug: string) {
  const studio = await prisma.studio.findUnique({
    where: { slug },
    include: {
      _count: { select: { members: true } },
    },
  });

  if (!studio) throw notFound(`Studio with slug "${slug}" not found`);
  return studio;
}

/**
 * Get studio by ID
 */
export async function getStudioById(id: string) {
  const studio = await prisma.studio.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true } },
    },
  });

  if (!studio) throw notFound(`Studio ${id} not found`);
  return studio;
}

/**
 * Update studio (verify OWNER/MODERATOR)
 */
export async function updateStudio(
  studioId: string,
  userId: string,
  data: Record<string, unknown>
) {
  const member = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });

  if (!member || (member.role !== 'OWNER' && member.role !== 'MODERATOR')) {
    throw forbidden('Only studio owners and moderators can update the studio');
  }

  // Prevent updating protected fields
  const { id, createdAt, updatedAt, slug: _slug, ...updateData } = data as Record<string, unknown>;

  const updated = await prisma.studio.update({
    where: { id: studioId },
    data: updateData as Prisma.StudioUpdateInput,
  });

  logger.info({ studioId, userId }, 'Studio updated');
  return updated;
}

/**
 * List studios with filters and pagination
 */
export async function listStudios(
  filters?: {
    category?: string;
    isPublic?: boolean;
    search?: string;
  },
  page = 1,
  limit = 20
) {
  const skip = (page - 1) * limit;

  const where: Prisma.StudioWhereInput = {};
  if (filters?.category) where.category = filters.category as StudioCategory;
  if (filters?.isPublic !== undefined) where.isPublic = filters.isPublic;
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [studios, total] = await Promise.all([
    prisma.studio.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true } },
      },
    }),
    prisma.studio.count({ where }),
  ]);

  return { studios, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Delete studio (OWNER only)
 */
export async function deleteStudio(studioId: string, userId: string) {
  const member = await prisma.studioMember.findUnique({
    where: { studioId_userId: { studioId, userId } },
  });

  if (!member || member.role !== 'OWNER') {
    throw forbidden('Only the studio owner can delete the studio');
  }

  await prisma.studio.delete({ where: { id: studioId } });
  logger.info({ studioId, userId }, 'Studio deleted');
}
