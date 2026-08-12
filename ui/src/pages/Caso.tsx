import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";
import { useState } from "react";

function CopyId({ id, short }: { id: string; short: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async ()=> { await navigator.clipboard.writeText(id).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false), 1200); }} className="font-mono text-[11px] text-muted-foreground hover:text-foreground" title={id}>
      {short} {copied ? "· copiado" : "· copiar"}
    </button>
  );
}

export default function Caso() {
  const params = useParams<{ hash?: string }>();
  const hash = params.hash?.trim();
  if (!hash) return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-bold">Casos</h1>
      <p className="mt-2 text-muted-foreground">Abra um caso pelo ID curto (8 chars) ou pela lista de pendentes.</p>
      <p className="mt-4 text-[12px] font-mono text-muted-foreground">Ex: /casos/a3f9c2d1</p>
    </div>
  );
  return <CasoDetail hash={hash} />;
}

function CasoDetail({ hash }: { hash: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["case", hash], queryFn: () => dmApi.case(hash), enabled: !!hash });
  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando caso {hash}...</div>;
  if (error) return <div className="p-8"><p className="text-red-600">Caso não encontrado: {hash}</p><Link href="/pendentes" className="mt-4 inline-block text-[14px] text-foreground underline">Ver pendentes</Link></div>;
  if (!data) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
        <h1 className="text-xl font-bold">Caso <span className="font-mono text-[15px]">{data.fingerprint ?? data.hash.slice(0,8)}</span></h1>
        <p className="mt-1 font-mono text-[12px] text-muted-foreground break-all">{data.hash}</p>
        <div className="mt-2 flex gap-2">
          {data.valid ? <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-[12px] font-medium text-emerald-700">Válido</span> : <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 text-[12px] font-medium text-amber-700">Aguardando</span>}
          <CopyId id={data.hash} short={data.fingerprint ?? data.hash.slice(0,8)} />
        </div>
        {data.came_from.length>0 && <p className="mt-3 text-[12px]"><span className="text-muted-foreground">Veio de: </span>{data.came_from.map((c: unknown, i:number)=> typeof c==="string" ? <Link key={i} href={`/casos/${String(c).slice(0,64)}`} className="font-mono text-[11px] underline mr-2">{String(c).slice(0,8)}</Link> : <span key={i} className="font-mono text-[11px] mr-2">{JSON.stringify(c).slice(0,16)}</span>)}</p>}
      </header>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Registro</h2>
          <dl className="mt-3 grid gap-2 text-[14px]">
            {Object.entries(data.slots).map(([k,v]) => v ? <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 flex-1 break-words">{String(v)}</dd></div> : null)}
            {Object.entries(data.fields).map(([k,v]) => <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 flex-1 break-words font-mono text-[12px]">{typeof v==="string"?v:JSON.stringify(v)}</dd></div>)}
          </dl>
        </section>
        {data.produced.length>0 && (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Gerou</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.produced.map((p: { hash: string; fingerprint: string | null; did: string }, i:number)=> <Link key={i} href={`/casos/${p.hash}`} className="rounded-full border bg-background px-3 py-1.5 text-[12px] font-mono">{p.fingerprint ?? p.hash.slice(0,8)} · {p.did}</Link>)}
            </div>
          </section>
        )}
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Linha do tempo</h2>
          <div className="relative ml-2 border-l border-black/10 pl-6 dark:border-white/10">
            {data.timeline.map((t, i) => (
              <div key={i} className="relative pb-6">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background bg-foreground" />
                <p className="text-[14px] font-medium">{t.label} {t.fingerprint ? <span className="font-mono text-[11px] text-muted-foreground">· {t.fingerprint}</span> : null}</p>
                {t.message && <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{t.message} {t.action ? <span className="font-medium text-foreground">→ {t.action}</span> : null}</p>}
                <div className="mt-1 flex items-center gap-2">
                  <Link href={`/casos/${t.hash}`} className="font-mono text-[11px] underline text-muted-foreground">{t.hash.slice(0,16)}</Link>
                  <span className="text-[11px] text-muted-foreground">{t.when ? new Date(t.when).toLocaleString("pt-BR") : ""}</span>
                  <CopyId id={t.hash} short={t.hash.slice(0,8)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
