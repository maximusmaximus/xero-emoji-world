import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/book/printer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handlePrinterWebhook } = await import("@/lib/book.server");
        return handlePrinterWebhook(request);
      },
    },
  },
});
