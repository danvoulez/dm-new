import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";

export default function Resumos() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["projections"], queryFn: () => dmApi.projections() });
  const items = data?.projections ?? [];
  const [msg, setMsg] = useState<string|null>(null);

  const rebuild = useMutation({
    mutationFn: () => fetch(`/api/advance`, { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify({ worker:"ui-rebuild"})}).then(async r=> { if(!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: (d)=> { setMsg((d as { ran?: boolean; note?: string }).ran ? "Avançou um passo na fila." : (d as { note?: string }).note ?? "Nada na fila."); qc.invalidateQueries({ queryKey: ["projections"] }); qc.invalidateQueries({ queryKey: ["now"] }); qc.invalidateQueries({ queryKey: ["pendencies"] }); },
    onError: (e)=> setMsg(`Falha: ${(e as Error).message}`),
  });

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
        <h1 className="text-2xl font-bold">Resumos</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">{data?.note ?? "Resumos reconstruíveis. Não são a fonte."} · Sempre com data.</p>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <div className="flex gap-2 mb-6">
          <button onClick={()=>rebuild.mutate()} disabled={rebuild.isPending} className="rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:opacity-50">{rebuild.isPending?"Refazendo...":"Refazer do zero"}</button>
          <span className="text-[11px] text-muted-foreground self-center">Recalcula a partir dos registros (ledger é fonte).</span>
        </div>
        {msg && <p className="mb-4 rounded-xl border bg-muted/50 p-3 text-[12px]">{msg}</p>}
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {error && <p className="text-red-600">Falha ao carregar resumos.</p>}
        {!isLoading && items.length===0 && <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Nenhum resumo ainda. Eles são gerados dos registros — fonte é o ledger.</div>}
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.projection_hash} className="rounded-2xl border bg-card p-5">
              <p className="text-[14px] font-medium">{p.spec || p.class}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">ID {p.fingerprint ?? p.projection_hash.slice(0,8)} · {new Date(p.computed_at).toLocaleString("pt-BR")}</p>
              <p className="mt-2 inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px]">{p.class}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
import { useState } from "react";
