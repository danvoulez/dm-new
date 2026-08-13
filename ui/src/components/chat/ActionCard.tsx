import { Link } from "wouter";
import { PiArrowRight, PiCheckCircle, PiShieldCheck, PiWarning } from "react-icons/pi";
import type { ChatAction } from "@/lib/dm-api";

function riskBanner(action: ChatAction) {
  if (action.kind !== "confirm_register") return null;
  if (action.risk === "approval") return { icon: "🟡", text: "Pede sua autorização antes de avançar.", className: "bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" };
  if (action.risk === "irreversible") return { icon: "🔴", text: "Não tem volta. A etapa crítica exige Face ID.", className: "bg-red-50 text-red-950 dark:bg-red-950/20 dark:text-red-100" };
  return null;
}

function buttonLabel(action: ChatAction): string | null {
  if (action.kind === "confirm_register") return action.missing.length ? null : "Criar processo";
  if (action.kind === "confirm_new_type") return "Criar tipo";
  if (action.kind === "confirm_grant") return "Criar autorização";
  if (action.kind === "request_passkey") return "Assinar com Face ID";
  return null;
}

export function ActionCard({ action, busy, onConfirm, onAlternative }: {
  action: ChatAction;
  busy: boolean;
  onConfirm: () => void;
  onAlternative: () => void;
}) {
  const risk = riskBanner(action);
  const label = buttonLabel(action);
  const summary = "summary" in action ? action.summary : action.question;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
      {risk ? (
        <div className={`flex items-start gap-2 border-b px-4 py-3 text-[12px] font-medium ${risk.className}`}>
          <span aria-hidden>{risk.icon}</span><span>{risk.text}</span>
        </div>
      ) : null}
      <div className="p-4">
        <div className="flex items-start gap-2">
          {action.kind === "request_passkey" ? <PiShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : action.kind === "status" ? <PiCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <PiWarning className="mt-0.5 h-4 w-4 shrink-0" />}
          <p className="text-[13px] font-medium leading-5">{summary}</p>
        </div>

        {action.kind === "confirm_register" && action.missing.length ? (
          <div className="mt-3 rounded-xl bg-muted/70 px-3 py-2 text-[12px] leading-5">
            <span className="font-medium">Ainda falta:</span> {action.missing.join(" e ")}. Responda no chat, sem formulário.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {label ? (
            <button onClick={onConfirm} disabled={busy} className="rounded-full bg-foreground px-4 py-2 text-[12px] font-medium text-background disabled:opacity-40">
              {busy ? "Processando..." : label}
            </button>
          ) : null}
          {action.kind === "status" && action.case_hash ? (
            <Link href={`/processos/${action.case_hash}`} className="rounded-full border px-4 py-2 text-[12px] font-medium">Ver processo</Link>
          ) : null}
          {action.kind !== "status" && action.kind !== "clarify" ? (
            <button onClick={onAlternative} className="px-2 py-2 text-[12px] text-muted-foreground hover:text-foreground">Não é isso? <PiArrowRight className="inline h-3 w-3" /></button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
