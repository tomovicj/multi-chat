import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ChatSidebar } from "@/app/chat/_components/sidebar/sidebar"
import { ChatHeader } from "@/app/chat/_components/chat-header"
import { Toaster } from "sonner"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ChatSidebar />
      <SidebarInset>
        <ChatHeader />
        {children}
      </SidebarInset>
      <Toaster richColors position="top-center" />
    </SidebarProvider>
  )
}
