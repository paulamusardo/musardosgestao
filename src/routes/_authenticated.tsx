import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";

export const Route = createFileRoute("/_authenticated")({ component: Gate });

function Gate() {
  const { loading, user } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/login" />;
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0">
          <header className="h-12 flex items-center gap-2 border-b bg-card/60 backdrop-blur sticky top-0 z-20 px-3">
            <SidebarTrigger />
            <div className="text-sm font-medium text-muted-foreground">Musardos · Gestão</div>
            <div className="ml-auto flex items-center gap-1">
              <NotificationsBell />
              <ThemeToggle />
            </div>
          </header>
          <Outlet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

