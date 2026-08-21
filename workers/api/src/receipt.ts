export const SLOTS = [
  "who",
  "did",
  "this",
  "when",
  "confirmed_by",
  "if_ok",
  "if_doubt",
  "if_not",
  "status",
] as const;

export type Slot = (typeof SLOTS)[number];
export type Envelope = Record<string, unknown>;
export type ActFields = Record<string, unknown> & { envelope?: Envelope };

export type ReceiptV0 = Record<string, unknown> & {
  id: string;
  receipt_version: "logline.receipt.v0";
  json_canonicalization: "jcs-rfc8785";
  hashes: {
    tuple_hash: string;
    content_hash: string;
    algorithm: "sha256";
  };
};

export type ReceiptV1 = Record<string, unknown> & {
  id: string;
  receipt_version: "logline.receipt.v1";
  json_canonicalization: "jcs-rfc8785";
  envelope: Envelope;
  hashes: {
    tuple_hash: string;
    content_hash: string;
    envelope_hash: string;
    algorithm: "sha256";
  };
};

export type Receipt = ReceiptV0 | ReceiptV1;

const SYSTEM_FIELDS = new Set(["id", "receipt_version", "json_canonicalization", "hashes", "envelope"]);
const FORBIDDEN = new Set(["result", "evidence", "transport"]);

function assertValidString(value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("lone surrogate is not valid JCS input");
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("lone surrogate is not valid JCS input");
    }
  }
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertValidString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number is not valid JCS input");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error("unsafe integer is not valid JCS input");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort();
    return `{${keys.map((key) => {
      assertValidString(key);
      const item = object[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
        throw new Error(`unsupported JCS value at key ${key}`);
      }
      return `${JSON.stringify(key)}:${canonicalize(item)}`;
    }).join(",")}}`;
  }
  throw new Error(`unsupported JCS value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateInputFields(fields: ActFields): void {
  for (const key of Object.keys(fields)) {
    if (FORBIDDEN.has(key)) throw new Error(`forbidden top-level field: ${key}`);
  }
  for (const slot of SLOTS) {
    if (slot in fields && typeof fields[slot] !== "string") {
      throw new Error(`receipt slot ${slot} must be a string`);
    }
  }
  if ("envelope" in fields && (fields.envelope === null || typeof fields.envelope !== "object" || Array.isArray(fields.envelope))) {
    throw new Error("envelope must be a JSON object");
  }
}

function contentMaterial(input: ActFields): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const slot of SLOTS) content[slot] = typeof input[slot] === "string" ? input[slot] : "";
  for (const [key, value] of Object.entries(input)) {
    if (!SLOTS.includes(key as Slot) && !SYSTEM_FIELDS.has(key) && !FORBIDDEN.has(key)) content[key] = value;
  }
  return content;
}

/**
 * Mint the canonical v1 universal unit.
 *
 * content_hash  = H(JCS(LogLine 9 fields + AUX))
 * envelope_hash = H(JCS(envelope))
 * tuple_hash    = H(content_hash + envelope_hash)
 *
 * Receipt metadata is intentionally outside content identity. `envelope` is persisted
 * with the receipt so the contextual half of tuple identity can always be replayed.
 */
export async function mintReceipt(input: ActFields): Promise<ReceiptV1> {
  validateInputFields(input);
  const content = contentMaterial(input);
  const envelope: Envelope = input.envelope ? { ...input.envelope } : {};
  const contentHash = await sha256Hex(canonicalJson(content));
  const envelopeHash = await sha256Hex(canonicalJson(envelope));
  const tupleHash = await sha256Hex(`${contentHash}${envelopeHash}`);
  return {
    ...content,
    envelope,
    receipt_version: "logline.receipt.v1",
    json_canonicalization: "jcs-rfc8785",
    hashes: {
      tuple_hash: tupleHash,
      content_hash: contentHash,
      envelope_hash: envelopeHash,
      algorithm: "sha256",
    },
    id: contentHash,
  } as ReceiptV1;
}

/** Historical v0 minting retained only for parity/verification of existing ledger data. */
export async function mintReceiptV0(input: ActFields): Promise<ReceiptV0> {
  validateInputFields(input);
  const receipt: Record<string, unknown> = {};
  for (const slot of SLOTS) receipt[slot] = typeof input[slot] === "string" ? input[slot] : "";
  receipt.receipt_version = "logline.receipt.v0";
  receipt.json_canonicalization = "jcs-rfc8785";

  for (const [key, value] of Object.entries(input)) {
    if (!SLOTS.includes(key as Slot) && !SYSTEM_FIELDS.has(key) && !FORBIDDEN.has(key)) receipt[key] = value;
  }

  const tupleMaterial = Object.fromEntries(SLOTS.map((slot) => [slot, receipt[slot]]));
  const legacyContentMaterial = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "id" && key !== "hashes"));
  const tupleHash = await sha256Hex(canonicalJson(tupleMaterial));
  const contentHash = await sha256Hex(canonicalJson(legacyContentMaterial));
  receipt.hashes = { tuple_hash: tupleHash, content_hash: contentHash, algorithm: "sha256" };
  receipt.id = contentHash;
  return receipt as ReceiptV0;
}
