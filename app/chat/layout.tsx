import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ChatSidebar } from "@/app/chat/_components/sidebar/sidebar";
import { Separator } from "@/components/ui/separator";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          {/* <Separator orientation="vertical" className="h-6" /> */}
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
