import { useRef, useState, useEffect } from "react";
import { Link } from "wouter";
import { PiArrowUpBold, PiPaperclip, PiWaveform, PiCheckCircle, PiWarningCircle, PiSparkle, PiPlus, PiArrowRight } from "react-icons/pi";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dmApi, type ChatSuggestion } from "@/lib/dm-api";
import { cn } from "@/lib/utils";

type ChatMsg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; suggestion?: ChatSuggestion; candidates?: ChatSuggestion[] }
  | { id: string; role: "system"; text: string };

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function Home() {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newType, setNewType] = useState({ process_id: "", title: "", requires: "", accepts: "", danger_tier: "L0", description: "" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: typesData } = useQuery({ queryKey: ["process-types"], queryFn: () => dmApi.processTypes() });
  const types = typesData?.types ?? [];

  const compile = useMutation({
    mutationFn: (intent: string) => dmApi.chatCompile(intent),
    onSuccess: (res) => {
      const suggestion = res.suggestion;
      if (suggestion) {
        setEditing({ ...suggestion.fields });
        setMessages((m) => [...m, {
          id: uid(), role: "assistant",
          text: suggestion.note || `Entendi como **${suggestion.title}** (\`${suggestion.process_id}\`).`,
          suggestion, candidates: res.candidates,
        }]);
      } else {
        setMessages((m) => [...m, {
          id: uid(), role: "assistant",
          text: res.note || "Não encontrei um processo que case com isso. Quer cadastrar um novo tipo?",
          candidates: res.candidates,
        }]);
      }
    },
    onError: (e) => {
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: `Não foi possível compilar: ${(e as Error).message}` }]);
    },
  });

  const register = useMutation({
    mutationFn: (body: Record<string, unknown>) => dmApi.register(body),
    onSuccess: (data) => {
      const fp = (data as { fingerprint?: string | null }).fingerprint;
      const id = (data as { id?: string }).id;
      const activated = (data as { activated?: boolean }).activated;
      const waiting = (data as { waiting?: { message?: string } }).waiting;
      setMessages((m) => [...m, {
        id: uid(), role: "system",
        text: activated
          ? `Registrado · Recibo \`${fp ?? id?.slice(0, 8)}\` · já está avançando.`
          : `Registrado · Recibo \`${fp ?? id?.slice(0, 8)}\` · ${waiting?.message ?? "pendente — ver Pendentes."}`,
      }]);
      setEditing(null);
    },
  });

  const createType = useMutation({
    mutationFn: () => dmApi.createProcessType({
      process_id: newType.process_id.trim(),
      title: newType.title.trim(),
      requires: newType.requires.split(",").map(s => s.trim()).filter(Boolean),
      accepts: newType.accepts.split(",").map(s => s.trim()).filter(Boolean),
      danger_tier: newType.danger_tier,
      description: newType.description.trim() || undefined,
    }),
    onSuccess: (d) => {
      setMessages((m) => [...m, { id: uid(), role: "system", text: `Tipo criado: \`${d.process_id}\`. Já pode usar no chat.` }]);
      setShowNewType(false);
      setNewType({ process_id: "", title: "", requires: "", accepts: "", danger_tier: "L0", description: "" });
    },
  });

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, compile.isPending, register.isPending]);

  const handleSubmit = () => {
    const msg = content.trim();
    if (!msg || compile.isPending) return;
    setMessages((m) => [...m, { id: uid(), role: "user", text: msg }]);
    setContent("");
    setEditing(null);
    compile.mutate(msg);
  };

  const handleConfirm = (suggestion: ChatSuggestion, fields: Record<string, string>) => {
    const body: Record<string, unknown> = {
      who: "local@dm",
      did: "note",
      this: suggestion.title,
      status: "open",
      when: new Date().toISOString(),
      process_id: suggestion.process_id,
      citations: suggestion.citations,
    };
    for (const [k, v] of Object.entries(fields)) if (v) body[k] = v;
    register.mutate(body);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-[76px] shrink-0 items-center justify-center border-b border-black/[0.04] px-5 dark:border-white/[0.06]">
        <h1 className="text-[17px] font-semibold tracking-[-0.015em]">Conversar</h1>
      </header>

      {!hasMessages ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-40 pt-8 md:pb-48">
          <div className="max-w-2xl text-center">
            <h2 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.04em] md:text-[38px]">O que vamos registrar?</h2>
            <p className="mx-auto mt-3 max-w-lg text-[17px] leading-7 text-muted-foreground">
              Escreva como fala — o chat entende o tipo de processo, preenche os campos e só pede o que falta. Sem formulário.
            </p>
            <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-2">
              {[
                "auditar balanço Q3 motivo revisão",
                "criar processo de aprovação de compras com valor e fornecedor",
                "registrar memória: decisão de adiar pagamento",
              ].map((ex) => (
                <button key={ex} onClick={() => setContent(ex)} className="rounded-full border bg-card px-3 py-1.5 text-[12px] hover:bg-muted">
                  {ex}
                </button>
              ))}
            </div>
            <p className="mx-auto mt-4 max-w-lg text-[12px] text-muted-foreground">
              Tipos disponíveis: {types.length ? types.map(t => t.process_id).join(" · ") : "carregando..."} ·{" "}
              <Link href="/novo" className="underline">formulário clássico aqui</Link>
            </p>
          </div>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-6",
                  m.role === "user" ? "bg-[#0a8cff] text-white" :
                  m.role === "system" ? "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" :
                  "border bg-card"
                )}>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.role === "assistant" && (m as Extract<ChatMsg, { role: "assistant" }>).suggestion && (() => {
                    const s = (m as Extract<ChatMsg, { role: "assistant" }>).suggestion!;
                    return (
                      <div className="mt-3 rounded-xl border bg-background p-3">
                        <p className="text-[12px] font-semibold flex items-center gap-1.5"><PiSparkle className="h-4 w-4" /> {s.title} · <span className="font-mono font-normal">{s.process_id}</span> {s.irreversible && <span className="text-red-600">· sem volta</span>} {s.needs_approval && <span className="text-amber-600">· precisa aprovar</span>}</p>
                        {s.missing.length > 0 && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Falta: {s.missing.join(", ")}</p>}
                        <div className="mt-2 space-y-2">
                          {Object.keys(s.fields).length === 0 && s.missing.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum campo extra — pronto para registrar.</p>}
                          {[...Object.entries(s.fields), ...s.missing.map(k => [k, ""] as const)].filter(([k], i, arr) => arr.findIndex(([kk]) => kk === k) === i).map(([k]) => (
                            <label key={k} className="block">
                              <span className="text-[11px] font-medium">{k} {s.missing.includes(k) && <span className="text-red-500">* obrigatório</span>}</span>
                              <input
                                value={editing?.[k] ?? ""}
                                onChange={e => setEditing(prev => ({ ...(prev ?? {}), [k]: e.target.value }))}
                                placeholder={k}
                                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-[13px]"
                              />
                            </label>
                          ))}
                        </div>
                        <p className="mt-2 font-mono text-[10px] text-muted-foreground">citações: {s.citations.slice(0, 2).map(c => c.slice(0, 8)).join(", ") || "—"}</p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleConfirm(s, editing ?? s.fields)}
                            disabled={register.isPending || s.missing.some(k => !editing?.[k]?.trim())}
                            className="rounded-full bg-foreground px-4 py-2 text-[12px] font-medium text-background disabled:opacity-40"
                          >
                            {register.isPending ? "Registrando..." : "Confirmar e registrar"}
                          </button>
                          <button onClick={() => setEditing({ ...s.fields })} className="rounded-full border bg-background px-3 py-2 text-[12px]">Editar</button>
                        </div>
                      </div>
                    );
                  })()}
                  {m.role === "assistant" && (m as Extract<ChatMsg, { role: "assistant" }>).candidates?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(m as Extract<ChatMsg, { role: "assistant" }>).candidates!.slice(0, 3).map(c => (
                        <button key={c.process_id} onClick={() => {
                          setMessages(mm => [...mm, { id: uid(), role: "assistant", text: `Trocado para **${c.title}** (\`${c.process_id}\`).`, suggestion: c }]);
                          setEditing({ ...c.fields });
                        }} className="rounded-full border bg-background px-2.5 py-1 text-[11px]">Usar {c.process_id} <PiArrowRight className="inline h-3 w-3" /></button>
                      ))}
                      <button onClick={() => setShowNewType(true)} className="rounded-full border bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800 dark:bg-amber-950/30"><PiPlus className="inline h-3 w-3" /> Cadastrar novo tipo</button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {compile.isPending && <div className="flex justify-start"><div className="rounded-2xl border bg-card px-4 py-3 text-[13px] text-muted-foreground flex items-center gap-2"><PiWaveform className="h-4 w-4 animate-pulse" /> Compilando com o modelo...</div></div>}
            {register.isPending && <div className="flex justify-start"><div className="rounded-2xl border bg-card px-4 py-3 text-[13px] text-muted-foreground">Registrando no ledger...</div></div>}
          </div>
        </div>
      )}

      {showNewType && (
        <div className="mx-auto w-full max-w-3xl border-t bg-card px-4 py-4 md:px-8">
          <h3 className="text-[13px] font-semibold flex items-center gap-1.5"><PiPlus /> Cadastrar novo tipo de processo</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">Via chat mesmo — sem formulário solto. Depois já instancia por aqui.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input value={newType.process_id} onChange={e => setNewType(s => ({ ...s, process_id: e.target.value }))} placeholder="process_id ex: approval-compra.v1" className="rounded-xl border px-3 py-2 text-[12px]" />
            <input value={newType.title} onChange={e => setNewType(s => ({ ...s, title: e.target.value }))} placeholder="Título ex: Aprovação de compra" className="rounded-xl border px-3 py-2 text-[12px]" />
            <input value={newType.requires} onChange={e => setNewType(s => ({ ...s, requires: e.target.value }))} placeholder="obrigatórios (csv) ex: valor,fornecedor" className="rounded-xl border px-3 py-2 text-[12px]" />
            <input value={newType.accepts} onChange={e => setNewType(s => ({ ...s, accepts: e.target.value }))} placeholder="opcionais (csv) ex: centro_custo" className="rounded-xl border px-3 py-2 text-[12px]" />
            <select value={newType.danger_tier} onChange={e => setNewType(s => ({ ...s, danger_tier: e.target.value }))} className="rounded-xl border px-3 py-2 text-[12px]"><option>L0</option><option>L1</option><option>L3</option><option>L4</option><option>L5</option></select>
            <input value={newType.description} onChange={e => setNewType(s => ({ ...s, description: e.target.value }))} placeholder="descrição curta" className="col-span-2 rounded-xl border px-3 py-2 text-[12px]" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => createType.mutate()} disabled={createType.isPending || !newType.process_id || !newType.title} className="rounded-full bg-foreground px-4 py-2 text-[12px] font-medium text-background disabled:opacity-40">{createType.isPending ? "Criando..." : "Criar tipo"}</button>
            <button onClick={() => setShowNewType(false)} className="rounded-full border px-4 py-2 text-[12px]">Cancelar</button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background via-80% to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-16 md:px-8 md:pb-7">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          <div className={cn("rounded-[28px] border bg-[#f4f4f4] p-2 shadow-[0_16px_44px_rgba(0,0,0,0.10)] dark:bg-[#242424]", isFocused ? "border-black/15 shadow-[0_18px_50px_rgba(0,0,0,0.13)]" : "border-black/[0.045]")}>
            <label className="sr-only" htmlFor="new-chat-message">Mensagem</label>
            <textarea id="new-chat-message" ref={textareaRef} rows={1}
              className="max-h-48 min-h-[56px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3 text-[18px] leading-7 outline-none placeholder:text-black/38 dark:placeholder:text-white/38"
              placeholder="Descreva o que precisa — ex: auditar balanço Q3, motivo revisão — ou: criar processo de compra com valor e fornecedor"
              value={content} onChange={(e) => setContent(e.target.value)} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} />
            <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Cadastrar tipo" onClick={() => setShowNewType(v => !v)} className={cn("grid h-11 w-11 place-items-center rounded-full text-[18px]", showNewType ? "bg-foreground text-background" : "text-black/72 hover:bg-black/[0.055] dark:text-white/72")}><PiPlus /></button>
                <button type="button" aria-label="Anexar" className="grid h-11 w-11 place-items-center rounded-full text-[23px] text-black/72 hover:bg-black/[0.055] dark:text-white/72"><PiPaperclip /></button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="mr-1 hidden text-[11px] text-muted-foreground md:inline">Shift+Enter quebra linha</span>
                <button type="button" aria-label="Enviar" disabled={compile.isPending || register.isPending || !content.trim()} onClick={handleSubmit} className="grid h-11 w-11 place-items-center rounded-full bg-[#0a8cff] text-white active:scale-95 disabled:opacity-40">
                  {compile.isPending || register.isPending ? <PiWaveform className="h-5 w-5 animate-pulse" /> : <PiArrowUpBold className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            Centro de gravidade é o registro em forma de processo. Chat compila via LLM (process_ingress.v1) → confirma → registra. <Link href="/agora" className="underline">Ver Agora</Link> · <Link href="/pendentes" className="underline">Pendentes</Link>
            {messages.length === 0 ? null : <> · <button onClick={() => { setMessages([]); setEditing(null); }} className="underline">Limpar conversa</button></>}
          </p>
        </div>
      </div>
    </div>
  );
}
