import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  FolderKanban,
  UserCog,
  LogOut,
  GripVertical,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { MusardosLogo } from "@/components/brand/MusardosLogo";
import type { Project, Profile } from "@/components/kanban/types";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";

function SortableProjectItem({
  project,
  active,
  collapsed,
}: {
  project: Project;
  active: boolean;
  collapsed: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex items-center group", isDragging && "opacity-50 z-50")}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition p-1 -ml-1"
        aria-label="Arrastar projeto"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <SidebarMenuItem className="flex-1 min-w-0">
        <SidebarMenuButton asChild isActive={active} tooltip={project.name}>
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="flex items-center gap-2"
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: project.color }}
            />
            <span className="truncate">{project.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </div>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [projects, setProjects] = useState<Project[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    setProjects((data ?? []) as Project[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("sidebar-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setMe(data as Profile | null));
  }, [user?.id]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(projects, oldIndex, newIndex);
    setProjects(reordered);

    const updates = reordered
      .map((p, idx) => ({ id: p.id, position: idx * 1000 }))
      .filter((u, idx) => projects[idx]?.position !== u.position);

    await Promise.all(
      updates.map((u) =>
        supabase.rpc("update_project_order", {
          _project_id: u.id,
          _position: u.position,
        }),
      ),
    );
  };

  const isActive = (path: string) =>
    pathname === path || (path !== "/" && pathname.startsWith(path));

  const main = [
    { url: "/me", icon: LayoutDashboard, title: "Meu Kanban" },
    { url: "/calendar", icon: CalendarDays, title: "Calendário" },
    { url: "/projects", icon: FolderKanban, title: "Projetos" },
  ];

  const name = me?.display_name || user?.email?.split("@")[0] || "Usuário";

  const projectItems = useMemo(
    () =>
      projects.map((p) => {
        const active = pathname === `/projects/${p.id}`;
        return <SortableProjectItem key={p.id} project={p} active={active} collapsed={collapsed} />;
      }),
    [projects, pathname, collapsed],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <MusardosLogo size={28} withWordmark={!collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {projects.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Meus projetos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={projects.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {projectItems}
                  </SortableContext>
                </DndContext>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/profile")} tooltip="Perfil">
              <Link to="/profile" className="flex items-center gap-2">
                {me?.avatar_url ? (
                  <img src={me.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="text-sm truncate">{name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
                </div>
                <UserCog className="h-4 w-4 text-muted-foreground" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
