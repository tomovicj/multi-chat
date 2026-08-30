import * as React from "react";

import { Sidebar } from "@/components/ui/sidebar";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import auth from "@/lib/auth";
import { readBalanceMicros } from "@/lib/billing";
import { ChatSidebarContent } from "@/app/chat/_components/sidebar/sidebar-content";

export async function ChatSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  const balanceMicros = await readBalanceMicros(session.user.id);

  // Fetch initial page of chats (first 20)
  const initialChats = await prisma.chat.findMany({
    where: {
      userId: session.user.id,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  return (
    <Sidebar {...props}>
      <ChatSidebarContent
        initialChats={initialChats}
        user={session.user}
        balanceMicros={balanceMicros}
      />
    </Sidebar>
  );
}
