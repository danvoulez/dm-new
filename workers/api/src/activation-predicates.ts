import type { ProcessContract, Slot, SlotRule } from "./contracts";

export type SlotEvaluation = {
  predicate: string;
  expected: unknown;
  observed: unknown;
  passed: boolean;
  code: string;
};

export type PredicateContext = {
  contract: ProcessContract;
  receipt: Record<string, unknown>;
  slot: Slot;
  now?: Date;
};

const CONTENT_HASH = /^[0-9a-f]{64}$/;

function result(rule: SlotRule, observed: unknown, passed: boolean, code: string, expected: unknown): SlotEvaluation {
  return { predicate: rule.predicate, expected, observed, passed, code };
}

function present(value: unknown): boolean {
  return Boolean(String(value ?? "").trim());
}

function authorityExpected(context: PredicateContext): string[] {
  return context.contract.allowed_who?.length ? context.contract.allowed_who : ["authenticated_authority"];
}

function continuationExpected(rule: SlotRule, context: PredicateContext): string[] {
  if (rule.values?.length) return rule.values;
  const defaults: Record<"if_ok" | "if_doubt" | "if_not", string> = {
    if_ok: context.contract.process_id,
    if_doubt: String(context.contract.doubt_path ?? "attention-raise.v1"),
    if_not: "stop",
  };
  return [defaults[context.slot as "if_ok" | "if_doubt" | "if_not"]];
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type Predicate = (rule: SlotRule, value: unknown, context: PredicateContext) => SlotEvaluation;

const evaluatePresent: Predicate = (rule, value, context) => {
  const passed = present(value);
  return result(rule, value, passed, passed ? "present" : `${context.slot}_missing`, "non_empty");
};

const evaluateAuthorized: Predicate = (rule, value, context) => {
  const allowed = context.contract.allowed_who ?? [];
  const passed = present(value) && (!allowed.length || allowed.includes(String(value)));
  const failure = context.slot === "who" ? "who_not_authorized" : "confirmed_by_not_authorized";
  return result(rule, value, passed, passed ? "authorized" : failure, authorityExpected(context));
};

const evaluateAllowed: Predicate = (rule, value) => {
  const expected = rule.values ?? [];
  const passed = expected.length > 0 && expected.includes(String(value));
  return result(rule, value, passed, passed ? "did_admitted" : "did_not_admitted", expected);
};

const evaluateCanonical: Predicate = (rule, value) => {
  const passed = present(value);
  return result(rule, value, passed, passed ? "this_canonical" : "this_not_canonical", "non_empty_canonical_reference");
};

const evaluateHash: Predicate = (rule, value, context) => {
  const passed = CONTENT_HASH.test(String(value ?? ""));
  const failure = context.slot === "this" ? "this_not_content_hash" : "confirmation_evidence_invalid";
  return result(rule, value, passed, passed ? "content_hash" : failure, "64_lower_hex");
};

const evaluateRegisteredAt: Predicate = (rule, value) => {
  const passed = parseTime(value) !== null;
  return result(rule, value, passed, passed ? "when_registered_at" : "when_invalid", "timezone_aware_iso8601");
};

const evaluateFuture: Predicate = (rule, value, context) => {
  const now = context.now ?? new Date();
  const parsed = parseTime(value);
  const passed = parsed !== null && parsed > now.getTime();
  return result(rule, value, passed, passed ? "when_future" : "when_not_future", `after:${now.toISOString()}`);
};

const evaluateCompatible: Predicate = (rule, value, context) => {
  const expected = continuationExpected(rule, context);
  const passed = expected.includes(String(value));
  return result(
    rule,
    value,
    passed,
    passed ? `${context.slot}_compatible` : `${context.slot}_incompatible`,
    expected,
  );
};

const evaluateInitial: Predicate = (rule, value) => {
  const expected = rule.values?.length ? rule.values : ["registered"];
  const passed = expected.includes(String(value));
  return result(rule, value, passed, passed ? "status_initial" : "status_initial_invalid", expected);
};

const PREDICATES: Record<string, Predicate> = {
  "who.present": evaluatePresent,
  "who.authorized": evaluateAuthorized,
  "did.present": evaluatePresent,
  "did.allowed": evaluateAllowed,
  "this.present": evaluatePresent,
  "this.canonical": evaluateCanonical,
  "this.content_hash": evaluateHash,
  "when.registered_at": evaluateRegisteredAt,
  "when.future": evaluateFuture,
  "confirmed_by.present": evaluatePresent,
  "confirmed_by.authority": evaluateAuthorized,
  "confirmed_by.evidence_hash": evaluateHash,
  "if_ok.compatible": evaluateCompatible,
  "if_doubt.compatible": evaluateCompatible,
  "if_not.compatible": evaluateCompatible,
  "status.initial": evaluateInitial,
};

export function evaluateSlot(rule: SlotRule, value: unknown, context: PredicateContext): SlotEvaluation {
  const predicate = PREDICATES[rule.predicate];
  return predicate
    ? predicate(rule, value, context)
    : result(rule, value, false, "unknown_predicate", rule.predicate);
}
