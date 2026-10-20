import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/webhooks/clicksign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receiveClicksign } = await import("@/lib/contracting/webhook.server");
        return receiveClicksign(request);
      },
    },
  },
});
