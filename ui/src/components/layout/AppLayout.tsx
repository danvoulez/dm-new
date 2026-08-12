import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  PiChats,
  PiCheckCircle,
  PiClock,
  PiFileText,
  PiLightbulb,
  PiChartBar,
  PiShieldCheck,
  PiList,
  PiMagnifyingGlass,
  PiNotePencil,
} from "react-icons/pi";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// Tone-down: major-platform words, no cartório poetry.
// Bureaucracy is engine, not voice.
const navItems = [
  { href: "/", label: "Conversar", icon: PiChats },
  { href: "/agora", label: "Agora", icon: PiClock },
  { href: "/pendentes", label: "Pendentes", icon: PiCheckCircle },
  { href: "/casos", label: "Casos", icon: PiFileText },
  { href: "/sugestoes", label: "Sugestões", icon: PiLightbulb },
  { href: "/resumos", label: "Resumos", icon: PiChartBar },
  { href: "/permissoes", label: "Permissões", icon: PiShieldCheck },
];
// Novo vira secundário — centro é o chat que instancia tipos via LLM. Link discreto no rodapé.
const secondaryNav = { href: "/novo", label: "Novo (formulário)", icon: PiNotePencil };

type SidebarProps = { className?: string; onNavigate?: () => void };

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const [location] = useLocation();
  const isCurrent = (href: string) => href === "/" ? location === "/" : location.startsWith(href);

  return (
    <aside className={cn("flex h-full w-full flex-col border-r border-black/[0.055] bg-[#f7f7f5] text-[#111] dark:border-white/[0.07] dark:bg-[#171717] dark:text-white", className)}>
      <div className="flex items-center justify-between px-6 pb-5 pt-7">
        <Link href="/" onClick={onNavigate} className="text-[24px] font-semibold tracking-[-0.035em]">DM Lab</Link>
        <button type="button" aria-label="Buscar" className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/[0.055] dark:hover:bg-white/[0.08]"><PiMagnifyingGlass className="h-6 w-6" /></button>
      </div>
      <nav className="px-3" aria-label="Navegação principal">
        {navItems.map((item) => {
          const active = isCurrent(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              className={cn("mb-0.5 flex min-h-12 items-center gap-3 rounded-[14px] px-4 text-[16px] font-medium transition-colors",
                active ? "bg-black/[0.055] text-black dark:bg-white/[0.08] dark:text-white" : "text-black/75 hover:bg-black/[0.04] hover:text-black dark:text-white/75 dark:hover:bg-white/[0.06]")}
              aria-current={active ? "page" : undefined}>
              <item.icon className="h-[22px] w-[22px] shrink-0" /><span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 px-4">
        <p className="px-3 text-[12px] leading-5 text-black/45 dark:text-white/45">Tudo registra. Só avança o que está completo.</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#f7f7f5] via-[#f7f7f5] to-transparent px-4 pb-5 pt-9 dark:from-[#171717] dark:via-[#171717] space-y-3">
        <Link href="/" onClick={onNavigate} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#0a8cff] px-5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(10,140,255,0.22)] active:scale-[0.98]">
          <PiChats className="h-[20px] w-[20px]" /> Conversar — registrar via chat
        </Link>
        <Link href={secondaryNav.href} onClick={onNavigate} className="flex items-center justify-center gap-1.5 text-[11px] text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70">
          <secondaryNav.icon className="h-3 w-3" /> {secondaryNav.label}
        </Link>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Abrir navegação" onClick={() => setOpen(true)} className="fixed left-4 top-[calc(env(safe-area-inset-top)+14px)] z-40 grid h-12 w-12 place-items-center rounded-full border border-black/[0.045] bg-white/92 shadow-[0_8px_25px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden"><PiList className="h-6 w-6" /></button>
      <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" className="w-[88vw] max-w-[340px] border-r-0 p-0 [&>button]:hidden"><Sidebar onNavigate={() => setOpen(false)} /></SheetContent></Sheet>
    </>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <div className="relative hidden w-[292px] shrink-0 md:flex"><Sidebar /></div>
      <MobileNav />
      <main className="relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
