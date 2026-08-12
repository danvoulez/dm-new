import { type ReactNode } from "react";
// DM Lab has no session yet — lab/api.py accepts `who` from body.
// Pass-through gate until auth lands (see docs/UI_SPEC.md §08).
export function AuthGate({ children }: { children: ReactNode }) { return <>{children}</>; }
export function useAuth() { return { user: { id: "local", email: "local@dm" }, tenant: { id: "local" }, logout: async () => {} } as const; }
