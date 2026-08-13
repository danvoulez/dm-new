import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PiFiles, PiGear, PiList, PiPlus, PiPuzzlePiece, PiShieldCheck, PiUserCircle, PiWarningCircle } from "react-icons/pi";
import { cn } from "@/lib/utils";
import { dmApi } from "@/lib/dm-api";
import { createPasskey, type CreationOptionsJSON } from "@/lib/webauthn";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const navItems = [
  { href: "/pendencias", label: "Pendências", icon: PiWarningCircle },
  { href: "/processos", label: "Todos os processos", icon: PiFiles },
  { href: "/tipos", label: "Tipos de processo", icon: PiPuzzlePiece },
  { href: "/regras", label: "Regras", icon: PiShieldCheck },
];

type SidebarProps = { className?: string; onNavigate?: () => void; onOpenSettings: () => void; pendingCount: number };

function startFreshConversation() {
  window.location.assign(import.meta.env.BASE_URL || "/");
}

export function Sidebar({ className, onNavigate, onOpenSettings, pendingCount }: SidebarProps) {
  const [location] = useLocation();
  const isCurrent = (href: string) => location.startsWith(href);

  return (
    <aside className={cn("flex h-full w-full flex-col border-r border-black/[0.055] bg-[#f7f7f5] text-[#111] dark:border-white/[0.07] dark:bg-[#171717] dark:text-white", className)}>
      <div className="flex items-center justify-between px-6 pb-5 pt-7">
        <Link href="/" onClick={onNavigate} className="text-[24px] font-semibold tracking-[-0.035em]">Dream</Link>
        <button type="button" onClick={onOpenSettings} className="flex items-center gap-1 rounded-full p-1.5 text-black/55 hover:bg-black/[0.05] hover:text-black dark:text-white/55 dark:hover:bg-white/[0.07] dark:hover:text-white" aria-label="Abrir configurações">
          <PiGear className="h-[19px] w-[19px]" /><PiUserCircle className="h-[22px] w-[22px]" />
        </button>
      </div>
      <nav className="px-3" aria-label="Navegação principal">
        {navItems.map((item) => {
          const active = isCurrent(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              className={cn("mb-0.5 flex min-h-12 items-center gap-3 rounded-[14px] px-4 text-[15px] font-medium transition-colors",
                active ? "bg-black/[0.055] text-black dark:bg-white/[0.08] dark:text-white" : "text-black/75 hover:bg-black/[0.04] hover:text-black dark:text-white/75 dark:hover:bg-white/[0.06]")}
              aria-current={active ? "page" : undefined}>
              <item.icon className="h-[21px] w-[21px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.href === "/pendencias" && pendingCount > 0 ? <span className="min-w-5 rounded-full bg-black px-1.5 py-0.5 text-center text-[10px] font-semibold text-white dark:bg-white dark:text-black">{pendingCount}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-4 pb-5 pt-8">
        <button type="button" onClick={startFreshConversation} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0a8cff] px-5 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(10,140,255,0.22)] active:scale-[0.98]">
          <PiPlus className="h-[19px] w-[19px]" /> Novo
        </button>
      </div>
    </aside>
  );
}

function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [identity, setIdentity] = useState(() => localStorage.getItem("dream.identity") ?? "");
  const [model, setModel] = useState(() => localStorage.getItem("dream.defaultModel") ?? "");
  const [message, setMessage] = useState<string>();
  const models = useQuery({ queryKey: ["models"], queryFn: dmApi.models, enabled: open });

  const enroll = useMutation({
    mutationFn: async () => {
      const currentIdentity = identity.trim();
      if (!currentIdentity) throw new Error("Informe sua identidade do lab antes de cadastrar a passkey.");
      const options = await dmApi.webauthnEnrollOptions(currentIdentity);
      const credential = await createPasskey(options as unknown as CreationOptionsJSON);
      return dmApi.webauthnEnrollVerify(currentIdentity, credential);
    },
    onSuccess: () => setMessage("Passkey cadastrada e verificada."),
    onError: (error) => setMessage(`Não foi possível cadastrar a passkey: ${(error as Error).message}`),
  });

  const saveIdentity = () => {
    localStorage.setItem("dream.identity", identity.trim());
    setMessage("Identidade salva neste navegador.");
  };

  const saveModel = (value: string) => {
    setModel(value);
    if (value) localStorage.setItem("dream.defaultModel", value);
    else localStorage.removeItem("dream.defaultModel");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[92vw] max-w-[440px] overflow-y-auto">
        <SheetHeader><SheetTitle>Configurações</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-7">
          <section>
            <h3 className="text-[13px] font-semibold">Tema</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">Segue o tema do sistema. Um modo visual novo fica fora desta fase.</p>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold">Modelo padrão</h3>
            <select value={model} onChange={(event) => saveModel(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-[13px]">
              <option value="">Automático</option>
              {models.data?.data.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
            </select>
            {models.error ? <p className="mt-2 text-[11px] text-muted-foreground">O catálogo de modelos está indisponível agora.</p> : null}
          </section>

          <section>
            <h3 className="text-[13px] font-semibold">Conta</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Até a fase de sessão real, a identidade continua explícita no modo lab.</p>
            <input value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="sua identidade" className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-[13px]" />
            <button onClick={saveIdentity} className="mt-2 rounded-full border px-3 py-1.5 text-[12px] font-medium">Salvar identidade</button>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold">Passkey</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Cadastre Face ID, Touch ID ou outra passkey da plataforma para assinar autorizações.</p>
            <button onClick={() => enroll.mutate()} disabled={enroll.isPending || !identity.trim()} className="mt-3 rounded-full bg-foreground px-4 py-2 text-[12px] font-medium text-background disabled:opacity-40">{enroll.isPending ? "Verificando..." : "Cadastrar passkey"}</button>
          </section>
          {message ? <p className="rounded-2xl border bg-card p-3 text-[12px] leading-5">{message}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileNav({ onOpenSettings, pendingCount }: { onOpenSettings: () => void; pendingCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Abrir navegação" onClick={() => setOpen(true)} className="fixed left-4 top-[calc(env(safe-area-inset-top)+14px)] z-40 grid h-12 w-12 place-items-center rounded-full border border-black/[0.045] bg-white/92 shadow-[0_8px_25px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:bg-[#202020] md:hidden"><PiList className="h-6 w-6" /></button>
      <button type="button" aria-label="Abrir configurações" onClick={onOpenSettings} className="fixed right-4 top-[calc(env(safe-area-inset-top)+14px)] z-40 grid h-12 w-12 place-items-center rounded-full border border-black/[0.045] bg-white/92 shadow-[0_8px_25px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:bg-[#202020] md:hidden"><PiGear className="h-5 w-5" /></button>
      <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" className="w-[88vw] max-w-[340px] border-r-0 p-0 [&>button]:hidden"><Sidebar onNavigate={() => setOpen(false)} onOpenSettings={() => { setOpen(false); onOpenSettings(); }} pendingCount={pendingCount} /></SheetContent></Sheet>
    </>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const now = useQuery({ queryKey: ["now", "layout"], queryFn: dmApi.now, refetchInterval: 60_000 });
  const pendingCount = now.data?.needs_you.length ?? 0;
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <div className="relative hidden w-[292px] shrink-0 md:flex"><Sidebar onOpenSettings={() => setSettingsOpen(true)} pendingCount={pendingCount} /></div>
      <MobileNav onOpenSettings={() => setSettingsOpen(true)} pendingCount={pendingCount} />
      <main className="relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
