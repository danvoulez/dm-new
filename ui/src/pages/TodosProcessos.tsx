import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { dmApi, type ProcessListItem } from "@/lib/dm-api";

const STATE: Record<ProcessListItem["state"], { label: string; dot: string }> = {
  registered: { label: "Registrado", dot: "bg-slate-400" },
  moving: { label: "Em andamento", dot: "bg-blue-500" },
  waiting: { label: "Esperando", dot: "bg-amber-500" },
  closed: { label: "Concluído", dot: "bg-emerald-500" },
};

function whenLabel(value: string | null): string {
  if (!value) return "data indisponível";
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  if (!Number.isFinite(delta)) return value;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days === 1 ? "" : "s"}`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export default function TodosProcessos() {
  const { data, isLoading, error } = useQuery({ queryKey: ["processes"], queryFn: dmApi.processes });
  const processes = data?.processes ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 pb-5 pl-20 pr-6 pt-5 backdrop-blur md:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Todos os processos</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">O que foi registrado, o que está andando e o que ainda precisa de atenção.</p>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {isLoading ? <p className="text-[14px] text-muted-foreground">Carregando processos...</p> : null}
        {error ? <p className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-[13px] text-red-700 dark:text-red-200">Não foi possível carregar os processos.</p> : null}
        {!isLoading && !error && processes.length === 0 ? (
          <div className="rounded-3xl border bg-card p-8 text-center">
            <p className="text-[15px] font-medium">Nenhum processo registrado ainda.</p>
            <Link href="/" className="mt-3 inline-block text-[13px] text-muted-foreground underline underline-offset-4">Criar pelo chat</Link>
          </div>
        ) : null}
        <div className="divide-y rounded-3xl border bg-card px-5">
          {processes.map((process) => {
            const state = STATE[process.state];
            return (
              <Link key={process.hash} href={`/processos/${process.hash}`} className="flex items-center gap-4 py-5 transition-opacity hover:opacity-70">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{process.title}</p>
                  {process.process_title !== process.title ? <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{process.process_title}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-medium">{state.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{whenLabel(process.when)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
