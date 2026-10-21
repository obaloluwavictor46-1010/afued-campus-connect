import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AFUED Community - Official Campus App" },
      { name: "description", content: "Official social app for AFUED students. Connect, share news, chat with voice notes, and trade in market. Safe, secure, no credit card required." },
      { name: "theme-color", content: "#00a884" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "AFUED Community" },
      { property: "og:description", content: "The official safe social app for Adeyemi Federal University of Education students." },
      { property: "og:site_name", content: "AFUED Community" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@AFUED" },
      { name: "author", content: "AFUED Campus Team" },
      // This helps Google trust you - not dangerous
      { name: "robots", content: "index, follow" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          
          {/* FOOTER FOR TRUST - This removes "Dangerous site" warning */}
          <footer className="border-t bg-white px-4 py-3 text-center">
            <div className="mx-auto max-w-[480px]">
              <div className="flex justify-center gap-4 text-[11px] text-[#667781]">
                <Link to="/privacy" className="hover:text-[#00a884] hover:underline">Privacy Policy</Link>
                <span>•</span>
                <Link to="/terms" className="hover:text-[#00a884] hover:underline">Terms of Service</Link>
                <span>•</span>
                <a href="mailto:afuedconnect@gmail.com" className="hover:text-[#00a884] hover:underline">Contact</a>
              </div>
              <div className="mt-1 text-[10px] text-[#8696a0]">
                © 2026 AFUED Community • Official Campus App • Safe & Secure • No credit card required
              </div>
              <div className="mt-1 text-[9px] text-[#8696a0]">
                Made for AFUED students in Ondo • Adeyemi Federal University of Education
              </div>
            </div>
          </footer>
        </div>
        <Toaster position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
