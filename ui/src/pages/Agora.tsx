import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";

export default function Agora() {
  const { data, isLoading, error } = useQuery({ queryKey: ["now"], queryFn: () => dmApi.now() });
  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (error) return <div className="p-8 text-red-600">Não foi possível carregar. Verifique se a API está no ar.</div>;
  const needsYou = data?.needs_you ?? [];
  const moving = data?.moving ?? [];
  const closed = data?.closed_today ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur"><h1 className="text-2xl font-bold">Agora</h1><p className="mt-1 text-[14px] text-muted-foreground">O que precisa de você, o que está andando e o que fechou hoje.</p></header>
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:px-6">
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Precisa de você · {needsYou.length}</h2>
          {needsYou.length === 0 ? <p className="rounded-2xl border bg-card p-6 text-muted-foreground">Nada pendente com você. ✨</p> :
            <div className="space-y-3">{needsYou.map((p) => (
              <Link key={p.id} href={`/casos/${p.source_fingerprint ?? p.source_hash}`} className="block rounded-2xl border bg-card p-4 hover:bg-muted/50">
                <p className="text-[15px] leading-6">{p.message}</p>
                <p className="mt-2 text-[12px] text-muted-foreground">ID {p.fingerprint ?? p.id.slice(0,8)} · {p.code} · <span className="font-medium text-foreground">{p.action}</span></p>
              </Link>
            ))}</div>}
        </section>
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Andando · {moving.length}</h2>
          {moving.length === 0 ? <p className="text-muted-foreground">Nada em andamento agora.</p> :
            <div className="space-y-2">{moving.map((m) => (
              <Link key={m.source_hash} href={`/casos/${m.fingerprint ?? m.source_hash}`} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                <span className="text-[14px]">{m.process_id || "registro"} · <span className="font-mono text-[12px]">{m.fingerprint ?? m.source_hash.slice(0,8)}</span></span><span className="text-[12px] text-muted-foreground">{new Date(m.when).toLocaleString("pt-BR")}</span>
              </Link>
            ))}</div>}
        </section>
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Fechou hoje · {closed.length}</h2>
          {closed.length === 0 ? <p className="text-muted-foreground">Nada concluído hoje.</p> :
            <div className="space-y-2">{closed.map((c) => (
              <Link key={c.result_hash} href={`/casos/${c.fingerprint ?? c.result_hash}`} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                <span className="text-[14px]">{c.process_id || "recibo"} · <span className="font-mono text-[12px]">Recibo {c.fingerprint ?? c.result_hash.slice(0,8)}</span></span><span className="text-[12px] text-muted-foreground">{new Date(c.when).toLocaleString("pt-BR")}</span>
              </Link>
            ))}</div>}
        </section>
      </div>
    </div>
  );
}
