import { describe, it, expect, vi } from "vitest";
import { dmApi } from "./dm-api";

describe("dmApi", () => {
  it("fetches /api/now via GET", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ needs_you: [], needs_operator: [], moving: [], closed_today: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmApi.now();
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/now"), expect.anything());
    fetchSpy.mockRestore();
  });
  it("appends semantic proposals via POST /api/append", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ registered: true, id: "a".repeat(64), fingerprint: "a".repeat(8) }), { status: 200 }));
    await dmApi.append({ who: "local@dm", did: "note", this: "hi", when: "2026-08-21T17:00:00Z", confirmed_by: "local@dm", if_ok: "", if_doubt: "", if_not: "", status: "ok", envelope: {} });
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/append"), expect.objectContaining({ method: "POST" }));
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("/api/register"), expect.anything());
    fetchSpy.mockRestore();
  });
});
