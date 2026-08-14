import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ModelPicker } from "./ModelPicker";
import type { ModelCatalog } from "@/lib/dm-api";

const catalog: ModelCatalog = {
  object: "list",
  provider: "golden-bridge",
  generated_at: "2026-08-14T10:00:00.000Z",
  ttl_seconds: 300,
  certification_profile: "dream-agent.v1",
  sources: [
    { id: "local", label: "Local", status: "available", checked_at: "2026-08-14T10:00:00.000Z", model_count: 1 },
    { id: "vercel", label: "Vercel AI Gateway", status: "degraded", checked_at: "2026-08-14T10:00:00.000Z", model_count: 1, message: "catálogo indisponível" },
    { id: "cloudflare", label: "Cloudflare AI Gateway", status: "not_configured", checked_at: "2026-08-14T10:00:00.000Z", model_count: 0, message: "conta e gateway ausentes" },
  ],
  data: [
    { id: "local/qwen", object: "model", name: "Qwen", source: "local", upstream_model: "qwen", capabilities: {}, selectable: true, certification: { profile: "dream-agent.v1", status: "current", certified_at: "2026-08-14T10:00:00.000Z", expires_at: "2026-08-14T10:15:00.000Z", checks: { conversation: true, tool_call: true, tool_result: true, schema: true, system_prompt: true } } },
    { id: "vercel/openai/test", object: "model", name: "OpenAI Test", source: "vercel", upstream_model: "openai/test", capabilities: {}, selectable: false, certification: { profile: "dream-agent.v1", status: "failed", certified_at: "2026-08-14T10:00:00.000Z", expires_at: "2026-08-14T10:15:00.000Z", checks: { conversation: true, tool_call: false, tool_result: false, schema: true, system_prompt: true }, reason: "tool probe failed" } },
  ],
};

describe("ModelPicker", () => {
  it("groups all Golden Bridge origins, exposes honest states and has no Automatic option", () => {
    render(<ModelPicker catalog={catalog} value="" onChange={() => {}} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /escolher modelo/i }));
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("Vercel AI Gateway")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare AI Gateway")).toBeInTheDocument();
    expect(screen.getByText(/conta e gateway ausentes/i)).toBeInTheDocument();
    expect(screen.queryByText("Automático")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /OpenAI Test/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("returns only an explicit selectable canonical model", () => {
    const onChange = vi.fn();
    render(<ModelPicker catalog={catalog} value="" onChange={onChange} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /escolher modelo/i }));
    fireEvent.click(screen.getByRole("option", { name: /Qwen/ }));
    expect(onChange).toHaveBeenCalledWith("local/qwen");
  });
});
