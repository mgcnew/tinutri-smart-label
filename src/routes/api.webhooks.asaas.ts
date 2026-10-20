import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receiveAsaas } = await import("@/lib/contracting/asaas-webhook.server");
        return receiveAsaas(request);
      },
    },
  },
});
