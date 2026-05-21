import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/board")({
  component: () => <Navigate to="/projects" />,
});
