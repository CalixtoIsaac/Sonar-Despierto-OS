import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.auth.isAuthenticated ? "/app" : "/login" });
  },
});
