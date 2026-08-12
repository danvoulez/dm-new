import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dmApi, type ProcessType } from "@/lib/dm-api";
import { useLocation } from "wouter";

function Field({ label, value, onChange, required, hint }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium">{label} {required && <span className="text-red-500">*</span>}</span>
      {hint && <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>}
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={label}
        className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px] placeholder:text-muted-foreground/50" />
    </label>
  );
}

export default function Novo() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [processId, setProcessId] = useState("");
  const [who, setWho] = useState("local@dm");
  const [fields, setFields] = useState<Record<string,string>>({});
  const [result, setResult] = useState<{ msg: string; ok: boolean; fingerprint?: string } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["process-types"], queryFn: () => dmApi.processTypes() });
  const types: ProcessType[] = data?.types ?? [];
  const runnable = types.filter(t => t.runnable);
  const selected = types.find(t => t.process_id === processId);

  const register = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { who, did: fields.did || "note", this: fields.this || "novo registro", status: fields.status || "open", when: new Date().toISOString(), if_ok: fields.if_ok || "", if_doubt: fields.if_doubt || "", if_not: fields.if_not || "", confirmed_by: fields.confirmed_by || "" };
      if (processId) body.process_id = processId;
      // contract-driven aux fields
      for (const k of [...(selected?.requires ?? []), ...(selected?.accepts ?? [])]) {
        if (fields[k] !== undefined && fields[k] !== "") body[k] = fields[k];
      }
      // also pass any extra descricao etc as aux
      if (fields.descricao) body.descricao = fields.descricao;
      return dmApi.register(body);
    },
    onSuccess: (d) => {
      const finger = (d as { fingerprint?: string | null }).fingerprint;
      const id = (d as { id?: string }).id;
      const activated = (d as { activated?: boolean }).activated;
      const waiting = (d as { waiting?: { message?: string } }).waiting;
      qc.invalidateQueries({ queryKey: ["now"] });
      qc.invalidateQueries({ queryKey: ["pendencies"] });
      if (activated) {
        setResult({ msg: `Registrado · Recibo ${finger ?? id?.slice(0,8) ?? "ok"} · já está avançando`, ok: true, fingerprint: finger ?? undefined });
        if (finger) setTimeout(()=> setLocation(`/casos/${finger}`), 600);
      } else if (waiting?.message) {
        setResult({ msg: `Registrado · ${waiting.message} Ver em Pendentes.`, ok: false, fingerprint: finger ?? undefined });
      } else {
        setResult({ msg: `Registrado · Recibo ${finger ?? id?.slice(0,8) ?? "ok"}`, ok: true, fingerprint: finger ?? undefined });
        if (finger) setTimeout(()=> setLocation(`/casos/${finger}`), 600);
      }
    },
    onError: (e) => setResult({ msg: `Não foi possível registrar: ${(e as Error).message}`, ok: false }),
  });

  const setField = (k: string, v: string) => setFields(f=> ({...f, [k]: v}));

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
        <h1 className="text-2xl font-bold">Novo registro</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">O formulário vem do contrato — obrigatório e opcional. Sem modelo, registra e vira pendente.</p>
      </header>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-6">
        <label className="block">
          <span className="text-[13px] font-medium">Modelo</span>
          <select value={processId} onChange={e=> setProcessId(e.target.value)} className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px]">
            <option value="">— sem modelo (registra e vira pendente)</option>
            <optgroup label="Prontos para usar">
              {runnable.map(t => <option key={t.process_id} value={t.process_id}>{t.title || t.process_id} {t.needs_approval?"· precisa confirmar":""} {t.irreversible?"· sem volta":""} · {t.danger_tier}</option>)}
            </optgroup>
            <optgroup label="Indisponíveis (só visualização / contrato)">
              {types.filter(t=>!t.runnable).map(t => <option key={t.process_id} value={t.process_id}>{t.title || t.process_id} · {t.readiness} · {t.danger_tier}</option>)}
            </optgroup>
          </select>
          {isLoading && <p className="mt-2 text-[12px] text-muted-foreground">Carregando modelos...</p>}
          {selected && (
            <div className="mt-2 rounded-xl bg-muted/50 p-3 text-[12px] leading-5">
              <p><span className="font-medium">Obrigatórios:</span> {selected.requires.join(", ")||"— nenhum"}</p>
              <p><span className="font-medium">Opcionais:</span> {selected.accepts.join(", ")||"—"}</p>
              <p><span className="font-medium">Slots 9:</span> {selected.required_slots.join(", ")}</p>
              {selected.evidence_must_include.length>0 && <p><span className="font-medium">Prova exigida:</span> {selected.evidence_must_include.join(", ")}</p>}
              {selected.needs_approval && <p className="text-amber-700 dark:text-amber-300">· Precisa de permissão antes de avançar</p>}
              {selected.irreversible && <p className="text-red-600">· Ação sem volta — confirmação extra</p>}
              {!selected.runnable && <p className="text-muted-foreground">· Indisponível: {selected.readiness_reason || selected.readiness}</p>}
            </div>
          )}
        </label>

        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Quem e o quê</h2>
          <Field label="Quem registra (who)" value={who} onChange={setWho} required hint="usado enquanto não há sessão" />
          <Field label="O que é (this)" value={fields.this ?? ""} onChange={v=>setField("this", v)} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ação (did)" value={fields.did ?? ""} onChange={v=>setField("did", v)} hint="ex: note, audit" />
            <Field label="Estado (status)" value={fields.status ?? ""} onChange={v=>setField("status", v)} hint="open/fechado" />
          </div>
          <label className="block"><span className="text-[13px] font-medium">Descrição / motivo</span><textarea value={fields.descricao ?? ""} onChange={e=>setField("descricao", e.target.value)} placeholder="Ex: revisão trimestral do balanço Q3" className="mt-1.5 min-h-24 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px]" /></label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Confirmado por" value={fields.confirmed_by ?? ""} onChange={v=>setField("confirmed_by", v)} hint="evidência" />
            <Field label="Se ok (if_ok)" value={fields.if_ok ?? ""} onChange={v=>setField("if_ok", v)} hint="próximo passo" />
          </div>
          {(selected?.requires.length ?? 0) > 0 && (
            <>
              <h3 className="pt-2 text-[13px] font-semibold">Campos do modelo — obrigatórios</h3>
              {selected!.requires.map(k => <Field key={k} label={k} value={fields[k] ?? ""} onChange={v=>setField(k, v)} required />)}
            </>
          )}
          {(selected?.accepts.length ?? 0) > 0 && (
            <>
              <h3 className="pt-2 text-[13px] font-semibold">Opcionais do modelo</h3>
              {selected!.accepts.map(k => <Field key={k} label={k} value={fields[k] ?? ""} onChange={v=>setField(k, v)} />)}
            </>
          )}
        </div>

        <button onClick={()=>register.mutate()} disabled={register.isPending || !fields.this} className="w-full rounded-full bg-foreground py-3 text-[15px] font-medium text-background hover:opacity-90 disabled:opacity-50">
          {register.isPending ? "Registrando..." : selected?.irreversible ? "Registrar — ação sem volta" : selected?.needs_approval ? "Registrar — precisa confirmar" : "Registrar"}
        </button>
        {result && <p className={`rounded-xl border p-3 text-[13px] ${result.ok?"bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30":"bg-amber-50 border-amber-200 dark:bg-amber-950/30"}`}>{result.msg} {result.fingerprint && <a href={`/casos/${result.fingerprint}`} className="font-medium underline">ver caso</a>}</p>}
        <p className="text-center text-[12px] text-muted-foreground">Tudo registra. Só avança o que está completo, com modelo compatível e permissão quando exigido. Sem recibo, sem check verde.</p>
      </div>
    </div>
  );
}
