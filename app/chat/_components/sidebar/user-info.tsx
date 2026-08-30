"use client";

import { LogOutIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Balance } from "@/app/chat/_components/sidebar/balance";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeMenu } from "@/app/chat/_components/sidebar/theme-menu";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

export function UserInfo({
  user,
  balanceMicros,
}: {
  user: { id: string; name: string; email: string; image?: string | null };
  balanceMicros: number;
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
    }
  };

  return (
    <SidebarGroup className="py-0">
      <SidebarGroupContent className="relative">
        <DropdownMenu>
          <DropdownMenuTrigger className="hover:bg-sidebar-accent flex w-full items-center gap-3 rounded-md p-1 text-left">
            {user.image && (
              <Image
                src={user.image}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full"
                width={96}
                height={96}
              />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-muted-foreground truncate text-sm">
                {user.email}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <ThemeMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
              <LogOutIcon />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Balance micros={balanceMicros} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
