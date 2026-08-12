import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dmApi, type Pendency } from "@/lib/dm-api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const FILTERS = ["Você", "Operador", "Todos"] as const;

function PendencyCard({ p, onResolve }: { p: Pendency; onResolve: (p: Pendency) => void }) {
  const isUser = p.resolved_by === "user";
  return (
    <div className={`rounded-2xl border bg-card p-5 ${!isUser ? "opacity-75" : ""}`}>
      <p className="text-[15px] leading-6">{p.message}</p>
      <p className="mt-2 text-[12px] text-muted-foreground">ID {p.fingerprint ?? p.id.slice(0,8)} · Código {p.code} · {isUser ? "Você resolve" : "Operador resolve"} {p.danger_tier ? `· ${p.danger_tier}` : ""}</p>
      {p.missing.length>0 && <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">Falta: {p.missing.join(", ")}</p>}
      <div className="mt-4 flex items-center gap-3">
        {isUser ? (
          <button onClick={()=>onResolve(p)} className="rounded-full bg-foreground px-4 py-2 text-[14px] font-medium text-background hover:opacity-90">{p.action}</button>
        ) : (
          <span className="rounded-full bg-muted px-4 py-2 text-[14px] font-medium text-muted-foreground">{p.action} · operador</span>
        )}
        <Link href={`/casos/${p.source_fingerprint ?? p.source_hash}`} className="text-[13px] text-muted-foreground hover:text-foreground">Ver caso →</Link>
      </div>
    </div>
  );
}

function ResolveSheet({ pendency, open, onOpenChange }: { pendency: Pendency | null; open: boolean; onOpenChange: (v: boolean)=>void }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string,string>>({});
  const [done, setDone] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => {
      if (!pendency) throw new Error("no pendency");
      // Correction is new register citing previous — append-only, no edit.
      // For missing_aux/missing_slots we fill them; for grant-related we hint in description.
      const body: Record<string, unknown> = {
        who: "local@dm",
        did: "correction",
        this: pendency.source_hash,
        status: "open",
        when: new Date().toISOString(),
        citations: [pendency.source_hash],
        _correction_for: pendency.id,
      };
      for (const k of pendency.missing) body[k] = values[k] ?? "";
      // also allow free descricao
      if (values.descricao) body.descricao = values.descricao;
      return dmApi.register(body);
    },
    onSuccess: (d) => {
      const fp = (d as { fingerprint?: string | null }).fingerprint;
      setDone(`Registrado · Recibo ${fp ?? "ok"} — novo registro cita o anterior. Agora em Pendentes/Agora.`);
      qc.invalidateQueries({ queryKey: ["pendencies"] });
      qc.invalidateQueries({ queryKey: ["now"] });
      qc.invalidateQueries({ queryKey: ["case"] });
    },
    onError: (e) => setDone(`Falha: ${(e as Error).message}`),
  });

  if (!pendency) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[92vw] max-w-[440px] overflow-y-auto">
        <SheetHeader><SheetTitle>Resolver — {pendency.code}</SheetTitle></SheetHeader>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{pendency.message}</p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">ID {pendency.fingerprint ?? pendency.id.slice(0,8)} · origem {pendency.source_fingerprint ?? pendency.source_hash.slice(0,8)}</p>
        <div className="mt-6 space-y-3">
          {pendency.missing.length===0 ? (
            <p className="rounded-xl bg-muted/50 p-3 text-[13px]">Este motivo não pede campos do registro — use a descrição ou avise o operador.</p>
          ) : pendency.missing.map(k => (
            <label key={k} className="block">
              <span className="text-[13px] font-medium">{k} <span className="text-red-500">*</span></span>
              <input value={values[k] ?? ""} onChange={e=> setValues(v=> ({...v, [k]: e.target.value}))} placeholder={k}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px]" />
            </label>
          ))}
          <label className="block"><span className="text-[13px] font-medium">Descrição (opcional)</span><textarea value={values.descricao ?? ""} onChange={e=> setValues(v=> ({...v, descricao: e.target.value}))} className="mt-1 min-h-20 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px]" placeholder="Contexto extra" /></label>
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Correção é novo registro que cita o anterior — ledger é só adição, nada é reescrito. O primeiro continua lá.</p>
        <button onClick={()=>submit.mutate()} disabled={submit.isPending || pendency.missing.some(k=>!values[k])} className="mt-4 w-full rounded-full bg-foreground py-3 text-[14px] font-medium text-background disabled:opacity-40">
          {submit.isPending ? "Registrando..." : pendency.action}
        </button>
        {done && <p className="mt-3 rounded-xl border bg-muted/50 p-3 text-[12px]">{done}</p>}
      </SheetContent>
    </Sheet>
  );
}

export default function Pendentes() {
  const [filter, setFilter] = useState<typeof FILTERS[number]>("Você");
  const [selected, setSelected] = useState<Pendency | null>(null);
  const [open, setOpen] = useState(false);
  const resolved_by = filter === "Todos" ? undefined : filter === "Você" ? "user" : "operator";
  const { data, isLoading, error } = useQuery({ queryKey: ["pendencies", resolved_by], queryFn: () => dmApi.pendencies(resolved_by) });
  const items: Pendency[] = data?.pendencies ?? [];

  const onResolve = (p: Pendency) => { setSelected(p); setOpen(true); };

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
        <h1 className="text-2xl font-bold">Pendentes</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">Cada pendência tem uma frase e um botão. Só você resolve o que é seu; resto é do operador — não mostramos igual.</p>
        <div className="mt-4 flex gap-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-[14px] font-medium ${filter===f?"bg-foreground text-background":"bg-muted text-muted-foreground hover:bg-muted/80"}`}>{f}</button>
          ))}
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {error && <p className="text-red-600">Falha ao carregar pendências.</p>}
        {!isLoading && items.length===0 && (
          filter==="Operador"
            ? <div className="rounded-2xl border bg-card p-8 text-center"><p className="text-muted-foreground">Nada que precise de operador agora.</p><p className="mt-2 text-[12px] text-muted-foreground">Configuração e permissões estão ok.</p></div>
            : <div className="rounded-2xl border bg-card p-8 text-center"><p className="text-muted-foreground">Nada pendente com você ✨</p><p className="mt-2 text-[12px] text-muted-foreground">Quando algo precisar de você, aparece aqui com o que falta e o botão.</p></div>
        )}
        <div className="space-y-3">
          {items.map((p) => <PendencyCard key={p.id} p={p} onResolve={onResolve} />)}
        </div>
      </div>
      <ResolveSheet pendency={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
