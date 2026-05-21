import { createFileRoute } from "@tanstack/react-router";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: BoardPage,
});

function BoardPage() {
  const { projectId } = Route.useParams();
  return <KanbanBoard projectId={projectId} />;
}
