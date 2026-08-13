import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { dmApi, type ChatAction, type Pendency } from "@/lib/dm-api";
import { getPasskeyAssertion, type RequestOptionsJSON } from "@/lib/webauthn";
import { ActionCard } from "@/components/chat/ActionCard";
import { MarkdownText } from "@/components/chat/MarkdownText";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const FILTERS = ["Você", "Operador"] as const;

const HUMAN_FIELDS: Record<string, string> = {
  who: "quem está registrando",
  this: "o que está sendo registrado",
  confirmed_by: "quem confirma",
  grant_id: "a autorização",
};

function humanMissing(values: string[]): string {
  return values.map((value) => HUMAN_FIELDS[value] ?? value.replace(/[_-]+/g, " ")).join(", ");
}

function PendencyCard({ item, onResolve }: { item: Pendency; onResolve: (item: Pendency) => void }) {
  const isUser = item.resolved_by === "user";
  return (
    <article className={`rounded-2xl border bg-card p-5 ${isUser ? "" : "opacity-75"}`}>
      <p className="text-[15px] leading-6">{item.message}</p>
      {item.missing.length ? <p className="mt-2 text-[13px] text-muted-foreground">Falta: {humanMissing(item.missing)}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isUser ? (
          <button onClick={() => onResolve(item)} className="rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background">{item.action}</button>
        ) : <span className="rounded-full bg-muted px-4 py-2 text-[13px] text-muted-foreground">{item.action} · operador</span>}
        {item.source_hash ? <Link href={`/processos/${item.source_hash}`} className="text-[12px] text-muted-foreground hover:text-foreground">Ver processo</Link> : null}
      </div>
      <details className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">⋯ detalhes</summary>
        <dl className="mt-2 grid gap-1 font-mono">
          <div><dt className="inline">código: </dt><dd className="inline">{item.code}</dd></div>
          <div><dt className="inline">recibo: </dt><dd className="inline break-all">{item.id}</dd></div>
          {item.process_id ? <div><dt className="inline">process_id: </dt><dd className="inline">{item.process_id}</dd></div> : null}
          {item.danger_tier ? <div><dt className="inline">tier: </dt><dd className="inline">{item.danger_tier}</dd></div> : null}
        </dl>
      </details>
    </article>
  );
}

function ResolveSheet({ pendency, open, onOpenChange }: { pendency: Pendency | null; open: boolean; onOpenChange: (value: boolean) => void }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [reply, setReply] = useState<string>();
  const [action, setAction] = useState<ChatAction>();
  const [result, setResult] = useState<string>();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pendencies"] });
    queryClient.invalidateQueries({ queryKey: ["now"] });
    queryClient.invalidateQueries({ queryKey: ["processes"] });
  };

  const askAgent = useMutation({
    mutationFn: async () => {
      if (!pendency) throw new Error("Pendência indisponível.");
      const text = answer.trim();
      if (!text) throw new Error("Escreva a informação que falta.");
      return dmApi.chatTurn(`Quero resolver a pendência associada ao processo ${pendency.source_hash}. Minha resposta é: ${text}`, conversationId);
    },
    onSuccess: (turn) => {
      setConversationId(turn.conversation_id);
      setReply(turn.reply);
      setAction(turn.action);
      setAnswer("");
      setResult(undefined);
    },
    onError: (error) => setResult(`Não consegui interpretar a resposta: ${(error as Error).message}`),
  });

  const sign = useMutation({
    mutationFn: async (input?: Extract<ChatAction, { kind: "request_passkey" }>) => {
      const grantId = input?.grant_id ?? pendency?.grant_id ?? "";
      if (!grantId) throw new Error("Esta pendência não aponta para uma autorização.");
      const grant = await dmApi.grant(grantId);
      const signer = String(grant.granted_by ?? "").trim();
      if (!signer) throw new Error("A autorização não informa quem deve assinar.");
      const options = input?.sign_options ?? await dmApi.webauthnSignOptions(signer, grantId);
      const credential = await getPasskeyAssertion(options as unknown as RequestOptionsJSON);
      return dmApi.webauthnSignVerify(signer, grantId, credential);
    },
    onSuccess: () => { setAction(undefined); setResult("Autorização assinada com Face ID."); refresh(); },
    onError: (error) => setResult(`A assinatura não foi concluída: ${(error as Error).message}`),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("Não há ação para confirmar.");
      if (action.kind === "confirm_register") {
        if (action.missing.length) throw new Error("Ainda faltam informações. Responda em texto acima.");
        return dmApi.register(action.register_body);
      }
      if (action.kind === "confirm_new_type") return dmApi.createProcessType(action.contract_draft);
      if (action.kind === "confirm_grant") return dmApi.createGrant(action.grant_draft);
      if (action.kind === "request_passkey") return sign.mutateAsync(action);
      throw new Error("Esta ação não precisa de confirmação.");
    },
    onSuccess: () => { setAction(undefined); setResult("Resolvido. O novo registro foi acrescentado sem reescrever o anterior."); refresh(); },
    onError: (error) => setResult((error as Error).message),
  });

  if (!pendency) return null;
  const directPasskey = !!pendency.grant_id && (pendency.code === "grant_unsigned" || pendency.code === "signoff_signer_mismatch");
  const busy = askAgent.isPending || sign.isPending || confirm.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[92vw] max-w-[460px] overflow-y-auto">
        <SheetHeader><SheetTitle>Resolver pendência</SheetTitle></SheetHeader>
        <p className="mt-3 text-[14px] leading-6">{pendency.message}</p>

        {directPasskey ? (
          <button onClick={() => sign.mutate(undefined)} disabled={busy} className="mt-6 w-full rounded-full bg-foreground py-3 text-[13px] font-medium text-background disabled:opacity-40">Assinar com Face ID</button>
        ) : (
          <div className="mt-6">
            <label htmlFor="pendency-answer" className="text-[12px] font-medium">Responda com suas palavras</label>
            <textarea id="pendency-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-2xl border bg-background px-4 py-3 text-[14px] leading-6 outline-none focus:border-foreground/30" placeholder={pendency.missing.length ? `Conte ${humanMissing(pendency.missing)}.` : "Conte o que mudou ou a informação que resolve esta pendência."} />
            <button onClick={() => askAgent.mutate()} disabled={busy || !answer.trim()} className="mt-3 w-full rounded-full bg-foreground py-3 text-[13px] font-medium text-background disabled:opacity-40">Enviar resposta</button>
          </div>
        )}

        {reply ? <div className="mt-5 rounded-2xl bg-muted/60 p-4"><MarkdownText text={reply} /></div> : null}
        {action ? <ActionCard action={action} busy={busy} onConfirm={() => confirm.mutate()} onAlternative={() => { setAction(undefined); setReply(undefined); }} /> : null}
        {result ? <p className="mt-4 rounded-2xl border bg-card p-4 text-[12px] leading-5">{result}</p> : null}

        <p className="mt-5 text-[11px] leading-4 text-muted-foreground">Correções entram como novos registros. O histórico anterior permanece intacto.</p>
      </SheetContent>
    </Sheet>
  );
}

export default function Pendentes() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Você");
  const [selected, setSelected] = useState<Pendency | null>(null);
  const [open, setOpen] = useState(false);
  const resolvedBy = filter === "Você" ? "user" : "operator";
  const { data, isLoading, error } = useQuery({ queryKey: ["pendencies", resolvedBy], queryFn: () => dmApi.pendencies(resolvedBy) });
  const items = data?.pendencies ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 pb-5 pl-20 pr-6 pt-5 backdrop-blur md:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Pendências</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">O que está esperando uma pessoa antes de poder continuar.</p>
        <div className="mt-4 flex gap-2">
          {FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${filter === item ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{item}</button>)}
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {isLoading ? <p className="text-[13px] text-muted-foreground">Carregando pendências...</p> : null}
        {error ? <p className="text-[13px] text-red-600">Não foi possível carregar as pendências.</p> : null}
        {!isLoading && !error && !items.length ? <div className="rounded-3xl border bg-card p-8 text-center text-[14px] text-muted-foreground">{filter === "Você" ? "Nada esperando por você. ✨" : "Nada esperando pelo operador."}</div> : null}
        <div className="space-y-3">{items.map((item) => <PendencyCard key={item.id} item={item} onResolve={(pendency) => { setSelected(pendency); setOpen(true); }} />)}</div>
      </div>
      <ResolveSheet key={selected?.id ?? "none"} pendency={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
