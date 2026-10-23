import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin dashboard coming soon.
        </p>
      </div>
    </div>
  );
}
