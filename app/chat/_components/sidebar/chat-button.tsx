"use client";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { ChatActions } from "@/app/chat/_components/sidebar/chat-actions";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ChatButton({ chat }: { chat: { id: string; title: string } }) {
  const pathname = usePathname();
  const isActive = pathname === `/chat/${chat.id}`;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={`/chat/${chat.id}`} className="h-auto">
          {chat.title}
        </Link>
      </SidebarMenuButton>
      <ChatActions chat={chat} />
    </SidebarMenuItem>
  );
}
