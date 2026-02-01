import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import Image from "next/image";

export function UserInfo({
  user,
}: {
  user: { name: string; email: string; image?: string | null };
}) {
  return (
    <SidebarGroup className="py-0">
      <SidebarGroupContent className="relative">
        <div className="flex items-center gap-3">
          {user.image && (
            <Image
              src={user.image}
              alt={`${user.name}'s profile picture`}
              className="h-10 w-10 rounded-full"
              width={96}
              height={96}
            />
          )}
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
