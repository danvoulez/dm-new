import { CATALOG } from "./vocabulary";

function value(receipt: Record<string, unknown>, key: string): string {
  const item = receipt[key];
  return item == null ? "" : String(item);
}

function joinHuman(values: unknown): string {
  const items = Array.isArray(values) ? values.map(String).filter(Boolean) : [];
  if (!items.length) return "algum campo";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

export function renderMessage(reason: string, receipt: Record<string, unknown> = {}) {
  const entry = CATALOG[reason];
  const [template, action, resolvedBy] = entry ?? ["Parou por um motivo que esta interface ainda não sabe explicar.", "Ver detalhe", "operator"];
  const candidates = [receipt.missing_evidence, receipt.missing_aux, receipt.missing_slots];
  const missing = candidates.find((item) => Array.isArray(item) ? item.length > 0 : item != null) ?? [];
  const message = template
    .replace("{campos}", joinHuman(missing))
    .replace("{data}", value(receipt, "valid_until") || value(receipt, "expired_at") || "uma data anterior")
    .replace("{motivo}", value(receipt, "adapter_error") || value(receipt, "reason") || "sem detalhe");
  return { code: reason, message, action, resolved_by: resolvedBy, known: !!entry };
}
