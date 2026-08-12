import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { PiArrowUpBold, PiMicrophone, PiPaperclip, PiWaveform, PiCheckCircle, PiWarningCircle } from "react-icons/pi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";
import { cn } from "@/lib/utils";

type RegisterResult = { id: string; fingerprint: string | null; activated?: boolean; waiting?: { message?: string; action?: string }; receipt?: unknown };

export default function Home() {
  const [content, setContent] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<RegisterResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const register = useMutation({
    mutationFn: (body: Record<string, unknown>) => dmApi.register(body) as Promise<RegisterResult>,
    onSuccess: (data) => {
      setLast(data);
      setContent("");
      qc.invalidateQueries({ queryKey: ["now"] });
      qc.invalidateQueries({ queryKey: ["pendencies"] });
      qc.invalidateQueries({ queryKey: ["case"] });
    },
    onError: () => setError("Não foi possível registrar. Tente novamente."),
  });

  const handleSubmit = async () => {
    const msg = content.trim();
    if (!msg || register.isPending) return;
    setError(null); setLast(null);
    register.mutate({ who: "local@dm", did: "note", this: msg, status: "open", when: new Date().toISOString() });
  };

  const fp = last?.fingerprint ?? last?.id?.slice(0,8);
  const advancing = !!last?.activated;
  const waitingMsg = last?.waiting?.message;

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-[76px] shrink-0 items-center justify-center border-0 px-5"><h1 className="text-[17px] font-semibold tracking-[-0.015em]">Conversar</h1></header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-40 pt-8 md:pb-48">
        <div className="max-w-2xl text-center">
          <h2 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.04em] md:text-[38px]">O que vamos registrar?</h2>
          <p className="mx-auto mt-3 max-w-lg text-[17px] leading-7 text-muted-foreground">Escreva como fala. Vira registro na hora. Se tiver tudo que precisa, avança sozinho.</p>
          {last && (
            <div className={`mx-auto mt-6 max-w-lg rounded-2xl border p-4 text-left ${advancing ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50 dark:bg-amber-950/30"}`}>
              <div className="flex items-start gap-2">
                {advancing ? <PiCheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" /> : <PiWarningCircle className="mt-0.5 h-5 w-5 text-amber-600" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">Registrado · Recibo <span className="font-mono">{fp ?? "—"}</span></p>
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{advancing ? "Já está avançando." : waitingMsg ?? "Registrado. Falta completar para avançar."}</p>
                  <div className="mt-3 flex gap-2">
                    {fp && <Link href={`/casos/${last!.fingerprint ?? last!.id}`} className="rounded-full bg-foreground px-3 py-1.5 text-[12px] font-medium text-background">Ver caso</Link>}
                    {!advancing && <Link href="/pendentes" className="rounded-full border bg-background px-3 py-1.5 text-[12px] font-medium">Ver pendentes</Link>}
                  </div>
                </div>
              </div>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground break-all">{last!.id}</p>
            </div>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background via-80% to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-16 md:px-8 md:pb-7">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          {error && <p role="alert" className="mb-2 px-4 text-[14px] font-medium text-red-600">{error}</p>}
          <div className={cn("rounded-[28px] border bg-[#f4f4f4] p-2 shadow-[0_16px_44px_rgba(0,0,0,0.10)] dark:bg-[#242424]", isFocused ? "border-black/15 shadow-[0_18px_50px_rgba(0,0,0,0.13)]" : "border-black/[0.045]")}>
            <label className="sr-only" htmlFor="new-chat-message">Mensagem</label>
            <textarea id="new-chat-message" ref={textareaRef} rows={1}
              className="max-h-48 min-h-[56px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3 text-[18px] leading-7 outline-none placeholder:text-black/38 dark:placeholder:text-white/38"
              placeholder="Descreva o que precisa — ex: auditar balanço Q3, motivo revisão"
              value={content} onChange={(e) => setContent(e.target.value)} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); } }} />
            <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1">
              <div className="flex items-center gap-1"><button type="button" aria-label="Anexar" className="grid h-11 w-11 place-items-center rounded-full text-[23px] text-black/72 hover:bg-black/[0.055] dark:text-white/72"><PiPaperclip /></button></div>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Ditado" className="grid h-11 w-11 place-items-center rounded-full text-[23px] text-black/72 hover:bg-black/[0.055] dark:text-white/72"><PiMicrophone /></button>
                <button type="button" aria-label="Enviar" disabled={register.isPending} onClick={() => void handleSubmit()} className="grid h-11 w-11 place-items-center rounded-full bg-[#0a8cff] text-white active:scale-95 disabled:opacity-60">
                  {register.isPending ? <PiWaveform className="h-5 w-5 animate-pulse" /> : <PiArrowUpBold className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-muted-foreground">Tudo registra. Só avança o que está completo e tem permissão.</p>
        </div>
      </div>
    </div>
  );
}
