import { useQuery } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";
import { readinessLabel, riskClass, riskPresentation } from "@/lib/risk";

function humanField(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requirements(values: string[]): string {
  if (!values.length) return "Não pede informações extras.";
  const human = values.map(humanField);
  if (human.length === 1) return `Pede ${human[0].toLowerCase()}.`;
  return `Pede ${human.slice(0, -1).join(", ").toLowerCase()} e ${human.at(-1)?.toLowerCase()}.`;
}

export default function TiposProcesso() {
  const { data, isLoading, error } = useQuery({ queryKey: ["process-types"], queryFn: dmApi.processTypes });
  const types = data?.types ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 pb-5 pl-20 pr-6 pt-5 backdrop-blur md:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Tipos de processo</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">O que o Dream sabe registrar e o que realmente consegue executar agora.</p>
      </header>
      <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 md:grid-cols-2 md:px-8">
        {isLoading ? <p className="text-[14px] text-muted-foreground">Carregando tipos...</p> : null}
        {error ? <p className="text-[13px] text-red-600">Não foi possível carregar o catálogo.</p> : null}
        {types.map((type) => {
          const risk = riskPresentation(type.danger_tier);
          return (
            <article key={type.process_id} className="rounded-3xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{type.title}</h2>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${riskClass(risk.tone)}`}>{risk.icon} {risk.label}</span>
              </div>
              <p className="mt-4 text-[13px] leading-5 text-muted-foreground">{requirements(type.requires)}</p>
              <p className="mt-3 text-[12px] font-medium">{readinessLabel(type.readiness, type.runnable)}</p>
              <details className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer select-none">⋯ detalhes</summary>
                <dl className="mt-3 grid gap-1.5 font-mono">
                  <div><dt className="inline">process_id: </dt><dd className="inline">{type.process_id}</dd></div>
                  <div><dt className="inline">readiness: </dt><dd className="inline">{type.readiness}</dd></div>
                  <div><dt className="inline">adapter: </dt><dd className="inline">{type.adapter ?? "nenhum"}</dd></div>
                  <div><dt className="inline">tier: </dt><dd className="inline">{type.danger_tier}</dd></div>
                  <div className="font-sans"><dt className="inline">Motivo: </dt><dd className="inline">{type.readiness_reason}</dd></div>
                </dl>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
