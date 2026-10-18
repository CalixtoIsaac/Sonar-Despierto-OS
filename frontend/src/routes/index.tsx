import { createFileRoute, redirect } from "@tanstack/react-router";

// TODO(1.5): redirigir a /app si hay sesión
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
