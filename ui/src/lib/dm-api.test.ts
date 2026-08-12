import { describe, it, expect, vi } from "vitest";
import { dmApi } from "./dm-api";

describe("dmApi", () => {
  it("fetches /api/now via GET", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ needs_you: [], needs_operator: [], moving: [], closed_today: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmApi.now();
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/now"), expect.anything());
    fetchSpy.mockRestore();
  });
  it("registers via POST /api/register", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ registered: true, id: "a".repeat(64), fingerprint: "a".repeat(8) }), { status: 200 }));
    await dmApi.register({ who: "local@dm", did: "note", this: "hi" });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/register"), expect.objectContaining({ method: "POST" }));
    fetchSpy.mockRestore();
  });
});
