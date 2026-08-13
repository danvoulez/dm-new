function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function requireWebAuthn() {
  if (!("PublicKeyCredential" in window) || !navigator.credentials) {
    throw new Error("Este navegador não oferece passkeys/WebAuthn.");
  }
}

type JsonCredentialDescriptor = { id: string; type?: string; transports?: AuthenticatorTransport[] };

export type CreationOptionsJSON = Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials"> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  excludeCredentials?: JsonCredentialDescriptor[];
};

export type RequestOptionsJSON = Omit<PublicKeyCredentialRequestOptions, "challenge" | "allowCredentials"> & {
  challenge: string;
  allowCredentials?: JsonCredentialDescriptor[];
};

export async function createPasskey(options: CreationOptionsJSON) {
  requireWebAuthn();
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: fromBase64Url(options.challenge),
    user: { ...options.user, id: fromBase64Url(options.user.id) },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      id: fromBase64Url(credential.id),
      type: "public-key",
      transports: credential.transports,
    })),
  };
  const created = await navigator.credentials.create({ publicKey });
  if (!(created instanceof PublicKeyCredential)) throw new Error("A passkey não foi criada.");
  const response = created.response as AuthenticatorAttestationResponse;
  return {
    id: created.id,
    rawId: toBase64Url(created.rawId),
    type: created.type,
    authenticatorAttachment: created.authenticatorAttachment,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
    clientExtensionResults: created.getClientExtensionResults(),
  };
}

export async function getPasskeyAssertion(options: RequestOptionsJSON) {
  requireWebAuthn();
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: fromBase64Url(options.challenge),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      id: fromBase64Url(credential.id),
      type: "public-key",
      transports: credential.transports,
    })),
  };
  const requested = await navigator.credentials.get({ publicKey });
  if (!(requested instanceof PublicKeyCredential)) throw new Error("A passkey não respondeu.");
  const response = requested.response as AuthenticatorAssertionResponse;
  return {
    id: requested.id,
    rawId: toBase64Url(requested.rawId),
    type: requested.type,
    authenticatorAttachment: requested.authenticatorAttachment,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
    },
    clientExtensionResults: requested.getClientExtensionResults(),
  };
}
