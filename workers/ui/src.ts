export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    // This worker is assets-only; Cloudflare serves ../ui/dist/public.
    // If assets miss, fall through (should not happen with SPA mode).
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<unknown>;
