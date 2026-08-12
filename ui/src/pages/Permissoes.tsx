import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dmApi } from "@/lib/dm-api";

function L5Hold({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const start = () => {
    setHolding(true);
    let p = 0;
    const id = setInterval(()=> {
      p += 8;
      setProgress(p);
      if (p >= 100) { clearInterval(id); onConfirm(); setHolding(false); setProgress(0); }
    }, 80);
    const stop = () => { clearInterval(id); setHolding(false); setProgress(0); window.removeEventListener("mouseup", stop); window.removeEventListener("touchend", stop); };
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
  };
  return (
    <button onMouseDown={start} onTouchStart={start} className="relative w-full overflow-hidden rounded-full bg-red-600 py-3 text-[14px] font-semibold text-white">
      <span className="absolute inset-y-0 left-0 bg-red-800 transition-all" style={{ width: `${progress}%`, opacity: holding?1:0 }} />
      <span className="relative">{holding ? `Segure... ${progress}%` : label}</span>
    </button>
  );
}

export default function Permissoes() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["grants"], queryFn: () => dmApi.grants() });
  const grants = (data?.grants ?? []) as Array<Record<string, unknown>>;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ process:"", granted_by:"", granted_to:"", valid_until:"", fs_scope:"", network_policy:"none", acu_limit:"10", timeout_seconds:"300", adapter:"*" });
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const create = useMutation({
    mutationFn: () => fetch(`/api/grants`, { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify({ process: form.process || "worker-run.v1", granted_by: form.granted_by || "admin@dm", granted_to: form.granted_to || "local@dm", valid_until: form.valid_until || new Date(Date.now()+86400000*7).toISOString(), fs_scope: form.fs_scope || "/tmp", network_policy: form.network_policy, acu_limit: parseInt(form.acu_limit||"10"), timeout_seconds: parseInt(form.timeout_seconds||"300"), adapter: form.adapter })}).then(async r=> { if(!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: ()=> { setMsg("Permissão criada — precisa ser assinada para valer."); qc.invalidateQueries({ queryKey: ["grants"] }); qc.invalidateQueries({ queryKey: ["process-types"] }); },
    onError: (e)=> setMsg(`Falha: ${(e as Error).message}`),
  });

  const signoff = useMutation({
    mutationFn: (gid: string) => fetch(`/api/grants/${gid}/signoff`, { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify({ signer: form.granted_by || "admin@dm", credential: "demo-credential" })}).then(async r=> { if(!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: ()=> { setMsg("Assinada."); qc.invalidateQueries({ queryKey: ["grants"] }); },
    onError: (e)=> setMsg(`Falha ao assinar: ${(e as Error).message}`),
  });

  const revoke = useMutation({
    mutationFn: (gid: string) => fetch(`/api/grants/${gid}/revoke`, { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify({ revoked_by: form.granted_by || "admin@dm" })}).then(async r=> { if(!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: ()=> { setMsg("Revogada."); qc.invalidateQueries({ queryKey: ["grants"] }); },
    onError: (e)=> setMsg(`Falha ao revogar: ${(e as Error).message}`),
  });

  const isL5 = form.process.includes("notification") || form.adapter==="notification";
  const canCreate = form.granted_by && form.granted_to && form.valid_until && form.fs_scope;

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
        <h1 className="text-2xl font-bold">Permissões</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">Quem pode fazer o quê, até quando e onde pode mexer. Sem os 4 campos (validade, timeout, onde mexe, rede), registra mas não avança.</p>
      </header>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6">
        <button onClick={()=>setOpen(o=>!o)} className="rounded-full border bg-card px-4 py-2 text-[14px] font-medium">{open?"Fechar":"Nova permissão"}</button>
        {open && (
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-[12px] font-medium">Processo</span><input value={form.process} onChange={e=>setForm(f=>({...f, process:e.target.value}))} placeholder="worker-run.v1" className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Adapter</span><input value={form.adapter} onChange={e=>setForm(f=>({...f, adapter:e.target.value}))} placeholder="*" className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Concedido por</span><input value={form.granted_by} onChange={e=>setForm(f=>({...f, granted_by:e.target.value}))} placeholder="admin@dm" className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Concedido para</span><input value={form.granted_to} onChange={e=>setForm(f=>({...f, granted_to:e.target.value}))} placeholder="local@dm" className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Válida até</span><input type="datetime-local" value={form.valid_until} onChange={e=>setForm(f=>({...f, valid_until:e.target.value ? new Date(e.target.value).toISOString() : ""}))} className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Onde pode mexer (fs_scope)</span><input value={form.fs_scope} onChange={e=>setForm(f=>({...f, fs_scope:e.target.value}))} placeholder="/tmp" className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Rede</span><select value={form.network_policy} onChange={e=>setForm(f=>({...f, network_policy:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]"><option value="none">none</option><option value="egress">egress</option><option value="isolated">isolated</option></select></label>
              <label className="block"><span className="text-[12px] font-medium">Limite (ACU)</span><input value={form.acu_limit} onChange={e=>setForm(f=>({...f, acu_limit:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
              <label className="block"><span className="text-[12px] font-medium">Timeout (s)</span><input value={form.timeout_seconds} onChange={e=>setForm(f=>({...f, timeout_seconds:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" /></label>
            </div>
            {isL5 && <div className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700 dark:bg-red-950/40">Ação sem volta — segure para confirmar. Sem atalho, sem lote.</div>}
            {isL5 ? (
              <div className="space-y-2">
                <input value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder={`Digite "${form.process||"notification.v1"}" para confirmar`} className="w-full rounded-xl border px-3 py-2 text-[13px]" />
                <L5Hold onConfirm={()=> { if(confirmText=== (form.process||"notification.v1")) create.mutate(); else setMsg("Digite o nome exato para confirmar."); }} label="Segure para criar permissão sem volta" />
              </div>
            ) : (
              <button onClick={()=>create.mutate()} disabled={!canCreate || create.isPending} className="w-full rounded-full bg-foreground py-3 text-[14px] font-medium text-background disabled:opacity-40">{create.isPending?"Criando...":"Criar permissão"}</button>
            )}
            {msg && <p className="rounded-xl bg-muted/50 p-3 text-[12px]">{msg}</p>}
          </div>
        )}

        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {error && <p className="text-red-600">Falha ao carregar permissões.</p>}
        {!isLoading && grants.length===0 && !open && <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Nenhuma permissão. Crie uma com validade, timeout, onde mexe e rede — sem os 4, não vale.</div>}
        <div className="space-y-3">
          {grants.map((g, i) => {
            const gid = String((g as { grant_id?: string }).grant_id ?? i);
            return (
              <div key={gid} className="rounded-2xl border bg-card p-5">
                <p className="font-mono text-[11px] text-muted-foreground">ID {(g as { fingerprint?: string }).fingerprint ?? gid.slice(0,8)} · {(g as { status?: string }).status ?? "—"}</p>
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-muted/50 p-3 text-[11px]">{JSON.stringify(g, null, 2)}</pre>
                <div className="mt-3 flex gap-2">
                  <button onClick={()=>signoff.mutate(gid)} disabled={signoff.isPending} className="rounded-full border px-3 py-1.5 text-[12px]">Assinar</button>
                  <button onClick={()=>revoke.mutate(gid)} disabled={revoke.isPending} className="rounded-full border px-3 py-1.5 text-[12px]">Revogar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
