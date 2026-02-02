import * as React from "react";

import { SearchForm } from "@/app/chat/_components/sidebar/search-form";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { UserInfo } from "@/app/chat/_components/sidebar/user-info";
import { Separator } from "@/components/ui/separator";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { headers } from "next/headers";
import auth from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ChatButton } from "@/app/chat/_components/sidebar/chat-button";

export async function ChatSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  const chats = await prisma.chat.findMany({
    where: {
      userId: session.user.id,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });

  const groupChatsByDate = (c: typeof chats) => {
    const grouped: { [date: string]: typeof chats } = {};
    c.forEach((chat) => {
      const date = chat.createdAt.toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(chat);
    });
    return grouped;
  };

  const groupedChats = groupChatsByDate(chats);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <Link href="/" className="flex items-center justify-center mt-2">
          <h1 className="text-3xl font-bold">Multi Chat</h1>
        </Link>
        <Separator className="my-2" />
        <UserInfo user={session.user} />
        <Separator className="my-2" />
        <Button asChild variant="outline" className="w-full">
          <Link href="/chat">New Chat</Link>
        </Button>
        <Separator className="my-2" />
        <SearchForm />
      </SidebarHeader>
      <SidebarContent className="gap-1">
        {Object.entries(groupedChats).map(([date, chats]) => (
          <SidebarGroup key={date}>
            <SidebarGroupLabel>
              {new Date(date).toLocaleDateString()}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {chats.map((chat) => (
                  <ChatButton key={chat.id} chat={chat} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
