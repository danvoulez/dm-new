import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dmApi, type GrantStanding } from "@/lib/dm-api";
import { riskClass, riskPresentation } from "@/lib/risk";

function dateLabel(value: string | null): string {
  if (!value) return "sem data";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : value;
}

function standingText(grant: GrantStanding): string {
  if (grant.revoked) return "revogada";
  if (grant.expired) return "expirada";
  if (grant.signed_off) return grant.signer ? `assinada por ${grant.signer}` : "assinada";
  return "aguardando assinatura";
}

export default function Regras() {
  const queryClient = useQueryClient();
  const grantsQuery = useQuery({ queryKey: ["grants"], queryFn: dmApi.grants });
  const typesQuery = useQuery({ queryKey: ["process-types"], queryFn: dmApi.processTypes });
  const typeMap = new Map((typesQuery.data?.types ?? []).map((type) => [type.process_id, type.title]));

  const revoke = useMutation({
    mutationFn: (grant: GrantStanding) => {
      if (!grant.granted_by) throw new Error("Esta autorização não informa a autoridade responsável.");
      return dmApi.revoke(grant.grant_id, { revoked_by: grant.granted_by });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grants"] }),
  });

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 pb-5 pl-20 pr-6 pt-5 backdrop-blur md:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Regras</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Autorizações ativas e como cada tipo se comporta quando há risco.</p>
      </header>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8">
        <section>
          <h2 className="text-[15px] font-semibold">Autorizações</h2>
          <div className="mt-3 space-y-3">
            {grantsQuery.isLoading ? <p className="text-[13px] text-muted-foreground">Carregando autorizações...</p> : null}
            {grantsQuery.error ? <p className="text-[13px] text-red-600">Não foi possível carregar as autorizações.</p> : null}
            {!grantsQuery.isLoading && !grantsQuery.error && (grantsQuery.data?.grants.length ?? 0) === 0 ? (
              <div className="rounded-2xl border bg-card p-5 text-[13px] text-muted-foreground">Nenhuma autorização criada.</div>
            ) : null}
            {grantsQuery.data?.grants.map((grant) => {
              const title = typeMap.get(String(grant.process ?? "")) ?? "este processo";
              const active = !grant.revoked && !grant.expired;
              return (
                <article key={grant.grant_id} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[14px] leading-6"><span className="font-medium">{grant.granted_to ?? "O agente"}</span> pode usar <span className="font-medium">{title}</span> até {dateLabel(grant.valid_until)}.</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{standingText(grant)}</p>
                    </div>
                    {active ? (
                      <button onClick={() => revoke.mutate(grant)} disabled={revoke.isPending} className="shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-40">Revogar</button>
                    ) : null}
                  </div>
                  <details className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer">⋯ detalhes</summary>
                    <dl className="mt-2 grid gap-1 font-mono">
                      <div><dt className="inline">grant: </dt><dd className="inline break-all">{grant.grant_id}</dd></div>
                      <div><dt className="inline">process: </dt><dd className="inline">{grant.process}</dd></div>
                      <div><dt className="inline">adapter: </dt><dd className="inline">{grant.adapter}</dd></div>
                      <div><dt className="inline">fs_scope: </dt><dd className="inline">{grant.fs_scope}</dd></div>
                      <div><dt className="inline">network_policy: </dt><dd className="inline">{grant.network_policy}</dd></div>
                      <div><dt className="inline">ACU: </dt><dd className="inline">{grant.acu_limit}</dd></div>
                    </dl>
                  </details>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold">Risco dos tipos</h2>
          <div className="mt-3 divide-y rounded-2xl border bg-card px-5">
            {typesQuery.data?.types.map((type) => {
              const risk = riskPresentation(type.danger_tier);
              return (
                <div key={type.process_id} className="flex items-center justify-between gap-4 py-4">
                  <span className="min-w-0 truncate text-[13px] font-medium">{type.title}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${riskClass(risk.tone)}`}>{risk.icon} {risk.label}</span>
                </div>
              );
            })}
          </div>
        </section>
        {revoke.error ? <p className="text-[12px] text-red-600">{(revoke.error as Error).message}</p> : null}
      </div>
    </div>
  );
}
