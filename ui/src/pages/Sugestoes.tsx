import { useQuery } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";
import { Link } from "wouter";

export default function Sugestoes() {
  const { data, isLoading, error } = useQuery({ queryKey: ["candidates"], queryFn: () => dmApi.candidates() });
  const items = data?.candidates ?? [];
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur"><h1 className="text-2xl font-bold">Sugestões</h1><p className="mt-1 text-[14px] text-muted-foreground">Saídas de modelo já registradas — como tudo. Só não avançam sozinhas porque não têm modelo.</p></header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {error && <p className="text-red-600">Falha ao carregar sugestões.</p>}
        {!isLoading && items.length===0 && <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Nenhuma sugestão registrada.</div>}
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-2xl border bg-card p-5">
              <p className="font-mono text-[11px] text-muted-foreground">ID {c.fingerprint ?? c.id.slice(0,8)} · {new Date(c.when).toLocaleString("pt-BR")}</p>
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-muted/50 p-3 text-[12px]">{JSON.stringify(c.payload, null, 2) || "—"}</pre>
              {c.citations.length>0 && <p className="mt-2 text-[12px] text-muted-foreground">Fontes: {JSON.stringify(c.citations).slice(0,120)}</p>}
              <Link href={`/novo`} className="mt-3 inline-flex rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background">Usar em novo registro →</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
