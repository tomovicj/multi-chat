"use client";

import * as React from "react";
import { SearchForm } from "@/app/chat/_components/sidebar/search-form";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { UserInfo } from "@/app/chat/_components/sidebar/user-info";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChatButton } from "@/app/chat/_components/sidebar/chat-button";
import { getChats, ChatListItem } from "@/lib/actions/chat";
import { useDebounce } from "use-debounce";
import { useInView } from "react-intersection-observer";
import { Loader2 } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export function ChatSidebarContent({
  initialChats,
  user,
}: {
  initialChats: ChatListItem[];
  user: User;
}) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [chats, setChats] = React.useState<ChatListItem[]>(initialChats);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(initialChats.length >= 20);
  const [cursor, setCursor] = React.useState<string | null>(
    initialChats.length > 0 ? initialChats[initialChats.length - 1].id : null
  );

  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "100px",
  });

  // Fetch chats when search query changes
  React.useEffect(() => {
    async function fetchChats() {
      setIsLoading(true);
      try {
        const result = await getChats({
          query: debouncedQuery || undefined,
        });
        setChats(result.chats);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error("Failed to fetch chats:", error);
      } finally {
        setIsLoading(false);
      }
    }

    // Reset to initial chats when search is empty
    if (debouncedQuery === "") {
      setChats(initialChats);
      setCursor(
        initialChats.length > 0 ? initialChats[initialChats.length - 1].id : null
      );
      setHasMore(initialChats.length >= 20);
    } else {
      // Fetch filtered results
      fetchChats();
    }
  }, [debouncedQuery, initialChats]);

  // Load more chats when sentinel comes into view
  React.useEffect(() => {
    async function loadMore() {
      if (!hasMore || isLoading || !cursor) return;

      setIsLoading(true);
      try {
        const result = await getChats({
          query: debouncedQuery || undefined,
          cursor,
        });
        setChats((prev) => [...prev, ...result.chats]);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error("Failed to load more chats:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (inView) {
      loadMore();
    }
  }, [inView, hasMore, isLoading, cursor, debouncedQuery]);

  // Group chats by date
  const groupedChats = React.useMemo(() => {
    const grouped: { [date: string]: ChatListItem[] } = {};
    chats.forEach((chat) => {
      const date = new Date(chat.createdAt).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(chat);
    });
    return grouped;
  }, [chats]);

  return (
    <>
      <SidebarHeader>
        <Link href="/" className="flex items-center justify-center mt-2">
          <h1 className="text-3xl font-bold">Multi Chat</h1>
        </Link>
        <Separator className="my-2" />
        <UserInfo user={user} />
        <Separator className="my-2" />
        <Button asChild variant="outline" className="w-full">
          <Link href="/chat">New Chat</Link>
        </Button>
        <Separator className="my-2" />
        <SearchForm value={searchQuery} onChange={setSearchQuery} />
      </SidebarHeader>
      <SidebarContent className="gap-1">
        {isLoading && chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">
              Loading chats...
            </p>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <p className="text-sm text-muted-foreground">
              {debouncedQuery
                ? "No chats found matching your search"
                : "No chats yet"}
            </p>
          </div>
        ) : (
          <>
            {Object.entries(groupedChats).map(([date, dateChats]) => (
              <SidebarGroup key={date}>
                <SidebarGroupLabel>
                  {new Date(date).toLocaleDateString()}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {dateChats.map((chat) => (
                      <ChatButton key={chat.id} chat={chat} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </SidebarContent>
    </>
  );
}
