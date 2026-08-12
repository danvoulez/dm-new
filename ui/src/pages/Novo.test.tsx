import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Novo from "./Novo";

vi.mock("@/lib/dm-api", () => ({
  dmApi: {
    processTypes: () => Promise.resolve({ count: 1, types: [{ process_id: "memory-register.v1", title: "Memória", requires: [], accepts: ["descricao"], required_slots: ["who","did","this"], evidence_must_include: [], runnable: true, danger_tier: "L0", needs_approval: false, irreversible: false, readiness: "runnable", readiness_reason: "" }] }),
    register: () => Promise.resolve({ registered: true, id: "b".repeat(64), fingerprint: "b".repeat(8), activated: true }),
  },
}));

function renderNovo() {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><Novo /></QueryClientProvider>);
}

describe("Novo", () => {
  it("renders contract-driven form and registers", async () => {
    renderNovo();
    await waitFor(()=> expect(screen.getByText(/Novo registro/)).toBeInTheDocument());
    const input = screen.getByPlaceholderText("O que é (this)");
    fireEvent.change(input, { target: { value: "teste" } });
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(()=> expect(screen.getByText(/Registrado/)).toBeInTheDocument());
  });
});
