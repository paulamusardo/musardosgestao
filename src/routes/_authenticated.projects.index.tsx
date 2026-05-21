import { createFileRoute } from "@tanstack/react-router";
import { ProjectsList } from "@/components/kanban/ProjectsList";

export const Route = createFileRoute("/_authenticated/projects/")({ component: ProjectsList });
