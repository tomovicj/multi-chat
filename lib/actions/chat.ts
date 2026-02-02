"use server";

import prisma from "@/lib/prisma";
import auth from "@/lib/auth";
import { headers } from "next/headers";

export type ChatListItem = {
  id: string;
  title: string;
  createdAt: Date;
};

export type PaginatedChatsResult = {
  chats: ChatListItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Fetch chats with pagination and optional search
 * @param query - Optional search query to filter by title
 * @param cursor - Cursor for pagination (chat ID)
 * @param limit - Number of chats per page (default: 20)
 */
export async function getChats(options?: {
  query?: string;
  cursor?: string;
  limit?: number;
}): Promise<PaginatedChatsResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const { query, cursor, limit = 20 } = options || {};

  const where = {
    userId: session.user.id,
    ...(query &&
      query.trim() !== "" && {
        title: {
          contains: query.trim(),
          mode: "insensitive" as const,
        },
      }),
  };

  const chats = await prisma.chat.findMany({
    where,
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit + 1, // Fetch one extra to check if there are more
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
  });

  const hasMore = chats.length > limit;
  const results = hasMore ? chats.slice(0, limit) : chats;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  return {
    chats: results,
    nextCursor,
    hasMore,
  };
}
