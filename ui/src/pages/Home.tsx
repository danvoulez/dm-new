import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { PiArrowUpBold, PiWaveform } from "react-icons/pi";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dmApi, type ChatAction, type RegistrationResult } from "@/lib/dm-api";
import { getPasskeyAssertion } from "@/lib/webauthn";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/chat/MarkdownText";
import { ActionCard } from "@/components/chat/ActionCard";
import { ModelPicker } from "@/components/chat/ModelPicker";

type ChatMsg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "system"; text: string; caseHash?: string };

function uid() { return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2); }

function registrationMessage(result: RegistrationResult) {
  const receipt = result.fingerprint ?? result.id.slice(0, 8);
  const movement = result.queued ? "Andando" : result.process_id ? "Esperando" : "Apenas registrado";
  const detail = result.waiting?.message ? ` · ${result.waiting.message}` : "";
  return `Registrado · ${receipt}\n${movement}${detail}`;
}

export default function Home() {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [action, setAction] = useState<ChatAction>();
  const [model, setModel] = useState("");
  const [, navigate] = useLocation();
  const landing = useQuery({ queryKey: ["now"], queryFn: dmApi.now });
  const models = useQuery({ queryKey: ["models"], queryFn: dmApi.models, retry: false, staleTime: 4 * 60 * 1000 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const chat = useMutation({
    mutationFn: (message: string) => dmApi.chatTurn(message, conversationId, model),
    onSuccess: (result) => {
      setConversationId(result.conversation_id);
      const receipts: ChatMsg[] = (result.registrations ?? []).map((registration) => ({ id: uid(), role: "system", text: registrationMessage(registration), caseHash: registration.id }));
      setMessages((items) => [...items, { id: uid(), role: "assistant", text: result.reply }, ...receipts]);
      setAction(result.action);
    },
    onError: (error) => {
      setAction(undefined);
      setMessages((items) => [...items, { id: uid(), role: "assistant", text: `Não consegui continuar: ${(error as Error).message}` }]);
    },
  });

  const append = useMutation({
    mutationFn: (body: Record<string, unknown>) => dmApi.append(body),
    onSuccess: (result) => {
      setAction(undefined);
      setMessages((items) => [...items, { id: uid(), role: "system", text: registrationMessage(result), caseHash: result.id }]);
    },
    onError: (error) => setMessages((items) => [...items, { id: uid(), role: "system", text: `O registro não foi concluído: ${(error as Error).message}` }]),
  });

  const createType = useMutation({
    mutationFn: (current: Extract<ChatAction, { kind: "confirm_new_type" }>) => dmApi.createProcessType(current.contract_draft),
    onSuccess: () => {
      setAction(undefined);
      setMessages((items) => [...items, { id: uid(), role: "system", text: "Tipo proposto. Ele só passa a executar quando o contrato entrar no catálogo ativo." }]);
    },
    onError: (error) => setMessages((items) => [...items, { id: uid(), role: "system", text: `A proposta não foi criada: ${(error as Error).message}` }]),
  });

  const createGrant = useMutation({
    mutationFn: (current: Extract<ChatAction, { kind: "confirm_grant" }>) => dmApi.createGrant(current.grant_draft),
    onSuccess: () => {
      setAction(undefined);
      setMessages((items) => [...items, { id: uid(), role: "system", text: "Autorização criada. Peça no chat para assiná-la com Face ID." }]);
    },
    onError: (error) => setMessages((items) => [...items, { id: uid(), role: "system", text: `A autorização não foi criada: ${(error as Error).message}` }]),
  });

  const signGrant = useMutation({
    mutationFn: async (current: Extract<ChatAction, { kind: "request_passkey" }>) => {
      const grant = await dmApi.grant(current.grant_id);
      const signer = String(grant.granted_by ?? "").trim();
      if (!signer) throw new Error("A autorização não informa quem deve assinar.");
      const assertion = await getPasskeyAssertion(current.sign_options as unknown as import("@/lib/webauthn").RequestOptionsJSON);
      return dmApi.webauthnSignVerify(signer, current.grant_id, assertion);
    },
    onSuccess: () => {
      setAction(undefined);
      setMessages((items) => [...items, { id: uid(), role: "system", text: "Autorização assinada com Face ID." }]);
    },
    onError: (error) => setMessages((items) => [...items, { id: uid(), role: "system", text: `A assinatura não foi concluída: ${(error as Error).message}` }]),
  });

  const busy = chat.isPending || append.isPending || createType.isPending || createGrant.isPending || signGrant.isPending;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, action, busy]);

  useEffect(() => {
    if (!landing.data || messages.length) return;
    if (sessionStorage.getItem("dream.landing-resolved")) return;
    sessionStorage.setItem("dream.landing-resolved", "1");
    if (landing.data.needs_you.length > 0) navigate("/pendencias", { replace: true });
  }, [landing.data, messages.length, navigate]);

  useEffect(() => {
    if (model && models.data && !models.data.data.some((candidate) => candidate.id === model && candidate.selectable)) setModel("");
  }, [model, models.data]);

  const submit = () => {
    const message = content.trim();
    if (!message || !model || busy) return;
    setMessages((items) => [...items, { id: uid(), role: "user", text: message }]);
    setContent("");
    setAction(undefined);
    chat.mutate(message);
  };

  const confirmAction = () => {
    if (!action || busy) return;
    if (action.kind === "confirm_append") {
      if (action.missing.length) return;
      append.mutate(action.append_body);
    } else if (action.kind === "confirm_new_type") createType.mutate(action);
    else if (action.kind === "confirm_grant") createGrant.mutate(action);
    else if (action.kind === "request_passkey") signGrant.mutate(action);
  };

  const newConversation = () => {
    setMessages([]);
    setAction(undefined);
    setConversationId(undefined);
    setContent("");
    queueMicrotask(() => textareaRef.current?.focus());
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-12 md:px-8">
            <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] md:text-[46px]">O que você precisa?</h1>
            <div className="mt-7 flex flex-wrap gap-2">
              {["Registrar uma decisão", "Ver o que está parado", "Criar um tipo de processo"].map((example) => (
                <button key={example} onClick={() => { setContent(example); textareaRef.current?.focus(); }} className="rounded-full border bg-card px-3.5 py-2 text-[12px] hover:bg-muted">
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-7 md:px-8">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3",
                  message.role === "user" ? "bg-foreground text-background" : message.role === "system" ? "border bg-card" : "bg-muted/55",
                )}>
                  {message.role === "assistant" ? <MarkdownText text={message.text} /> : <p className="whitespace-pre-wrap text-[14px] leading-6">{message.text}</p>}
                  {message.role === "system" && message.caseHash ? <Link href={`/processos/${message.caseHash}`} className="mt-2 inline-block text-[12px] font-medium underline underline-offset-2">Ver processo</Link> : null}
                </div>
              </div>
            ))}

            {chat.isPending ? (
              <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl bg-muted/55 px-4 py-3 text-[13px] text-muted-foreground"><PiWaveform className="h-4 w-4 animate-pulse" /> Pensando...</div></div>
            ) : null}

            {action ? <ActionCard action={action} busy={busy} onConfirm={confirmAction} onAlternative={() => { setAction(undefined); textareaRef.current?.focus(); }} /> : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-black/[0.04] bg-background px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.06] md:px-8 md:pb-7">
        <div className="mx-auto max-w-3xl">
          <div className={cn("rounded-[28px] border bg-[#f4f4f4] p-2 shadow-[0_16px_44px_rgba(0,0,0,0.10)] dark:bg-[#242424]", isFocused ? "border-black/15 shadow-[0_18px_50px_rgba(0,0,0,0.13)]" : "border-black/[0.045]")}>
            <label className="sr-only" htmlFor="new-chat-message">Mensagem</label>
            <textarea
              id="new-chat-message"
              ref={textareaRef}
              rows={1}
              className="max-h-48 min-h-[56px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3 text-[17px] leading-7 outline-none placeholder:text-black/38 dark:placeholder:text-white/38"
              placeholder="Escreva como você falaria..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1">
              <ModelPicker
                catalog={models.data}
                value={model}
                onChange={setModel}
                onRefresh={() => { void models.refetch(); }}
                loading={models.isLoading || models.isFetching}
                error={models.error ? (models.error as Error).message : undefined}
              />
              <div className="flex items-center gap-2">
                <span className="mr-1 hidden text-[11px] text-muted-foreground md:inline">Shift+Enter quebra linha</span>
                <button type="button" aria-label="Enviar" disabled={busy || !content.trim() || !model} onClick={submit} className="grid h-11 w-11 place-items-center rounded-full bg-[#0a8cff] text-white active:scale-95 disabled:opacity-40">
                {busy ? <PiWaveform className="h-5 w-5 animate-pulse" /> : <PiArrowUpBold className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
          {hasMessages ? (
            <div className="mt-3 flex justify-center"><button onClick={newConversation} className="text-[11px] text-muted-foreground underline underline-offset-2">Nova conversa</button></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
