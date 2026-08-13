import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { dmApi } from "@/lib/dm-api";

function dateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : value;
}

export default function Caso() {
  const { hash } = useParams<{ hash: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: ["case", hash], queryFn: () => dmApi.case(hash), enabled: !!hash });

  if (isLoading) return <div className="flex-1 p-8 pl-20 text-[14px] text-muted-foreground md:pl-8">Carregando processo...</div>;
  if (error || !data) return (
    <div className="flex-1 p-8 pl-20 md:pl-8">
      <h1 className="text-xl font-semibold">Processo não encontrado</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">O registro pedido não existe ou não pôde ser lido.</p>
      <Link href="/processos" className="mt-5 inline-block text-[13px] underline underline-offset-4">Voltar aos processos</Link>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 pb-5 pl-20 pr-6 pt-5 backdrop-blur md:px-8">
        <p className="text-[12px] text-muted-foreground">{data.process_title}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{data.title}</h1>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-7 md:px-8">
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Linha do tempo</h2>
          <div className="relative ml-2 mt-5 border-l border-black/10 pl-7 dark:border-white/10">
            {data.timeline.map((item, index) => (
              <div key={`${item.hash}-${index}`} className="relative pb-7">
                <span className="absolute -left-[33px] top-1 h-3 w-3 rounded-full border-2 border-background bg-foreground" aria-hidden />
                <p className="text-[14px] font-medium">{item.label}</p>
                {item.message ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">{item.message}{item.action ? ` ${item.action}.` : ""}</p> : null}
                {item.when ? <p className="mt-1 text-[11px] text-muted-foreground">{dateTime(item.when)}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <details className="mt-3 rounded-2xl border bg-card p-4 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">⋯ detalhes</summary>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide">Hash</p>
              <p className="mt-1 break-all font-mono text-[11px]">{data.hash}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide">Registro</p>
              <dl className="mt-2 grid gap-1.5">
                {Object.entries(data.slots).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="inline font-mono">{key}: </dt><dd className="inline break-words">{String(value)}</dd></div>)}
                {Object.entries(data.fields).map(([key, value]) => <div key={key}><dt className="inline font-mono">{key}: </dt><dd className="inline break-words font-mono">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}
              </dl>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide">Recibos derivados</p>
              <div className="mt-2 space-y-1 font-mono text-[11px]">
                {data.produced.length ? data.produced.map((item) => <p key={item.hash} className="break-all">{item.did}: {item.hash}</p>) : <p>Nenhum.</p>}
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
