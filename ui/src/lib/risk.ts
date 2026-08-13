export type RiskPresentation = {
  tone: "green" | "yellow" | "red";
  icon: string;
  label: string;
};

export function riskPresentation(tier?: string | null): RiskPresentation {
  if (tier === "L5") return { tone: "red", icon: "🔴", label: "Não tem volta — exige Face ID" };
  if (tier === "L3" || tier === "L4") return { tone: "yellow", icon: "🟡", label: "Pede sua autorização" };
  return { tone: "green", icon: "🟢", label: "Avança sozinho" };
}

export function readinessLabel(readiness: string, runnable: boolean): string {
  if (readiness === "contract-only" || readiness === "not-runnable") return "ainda não executa";
  if (readiness === "blocked") return "pede autorização";
  return runnable ? "executa" : "ainda não executa";
}

export function riskClass(tone: RiskPresentation["tone"]): string {
  if (tone === "red") return "bg-red-500/10 text-red-800 dark:text-red-200";
  if (tone === "yellow") return "bg-amber-500/10 text-amber-800 dark:text-amber-200";
  return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
}
