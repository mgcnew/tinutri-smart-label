import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { THEME_BOOT_SCRIPT } from "../hooks/use-theme";
import { reportLovableError } from "../lib/lovable-error-reporting";

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

function ErrorComponent({ error: raised, reset }: { error: unknown; reset: () => void }) {
  const error = useMemo(
    () => (raised instanceof Error ? raised : new Error(String(raised))),
    [raised],
  );
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
      { name: "theme-color", content: "#007a46" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "TiNutri Smart Label® | Etiquetas de Validade para Alimentos" },
      { name: "description", content: "Emita etiquetas térmicas padronizadas de identificação e validade de alimentos em poucos segundos. Solução prática para restaurantes, padarias, supermercados e" },
      { name: "author", content: "TiNutri" },
      { property: "og:title", content: "TiNutri Smart Label® | Etiquetas de Validade para Alimentos" },
      { property: "og:description", content: "Emita etiquetas térmicas padronizadas de identificação e validade de alimentos em poucos segundos. Solução prática para restaurantes, padarias, supermercados e" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "TiNutri Smart Label® | Etiquetas de Validade para Alimentos" },
      { name: "twitter:description", content: "Emita etiquetas térmicas padronizadas de identificação e validade de alimentos em poucos segundos. Solução prática para restaurantes, padarias, supermercados e" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Gg5v2NjEbPXyIT0FQdEJfHuKC4n2/social-images/social-1782232984564-ChatGPT_Image_23_de_jun._de_2026,_13_37_23.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Gg5v2NjEbPXyIT0FQdEJfHuKC4n2/social-images/social-1782232984564-ChatGPT_Image_23_de_jun._de_2026,_13_37_23.webp" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900&family=DM+Sans:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
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
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div className="flex min-h-screen flex-col">
        <div className="flex-1"><Outlet /></div>
        <AppFooter />
      </div>
    </QueryClientProvider>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer border-t bg-card/60 px-5 py-4 text-center text-xs leading-relaxed text-muted-foreground">
      <p className="font-semibold text-foreground">TiNutri Smart Label®</p>
      <p className="italic">Validade simples. Segurança sempre.</p>
      <p className="mt-1">Desenvolvido por TiNutri Soluções em Consultoria de Alimentos.</p>
      <p>© 2026 TiNutri Smart Label® · Todos os direitos reservados.</p>
    </footer>
  );
}
