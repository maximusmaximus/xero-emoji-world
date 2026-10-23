import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/book/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBookWebhook } = await import("@/lib/book.server");
        return handleBookWebhook(request);
      },
    },
  },
});
