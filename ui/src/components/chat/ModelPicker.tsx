import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { PiCaretDownBold, PiCheckBold, PiWarningCircle } from "react-icons/pi";
import type { ModelCatalog } from "@/lib/dm-api";
import { cn } from "@/lib/utils";

type ModelPickerProps = {
  catalog?: ModelCatalog;
  value: string;
  onChange: (model: string) => void;
  onRefresh: () => void;
  loading?: boolean;
  error?: string;
};

export function ModelPicker({ catalog, value, onChange, onRefresh, loading = false, error }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = catalog?.data.find((model) => model.id === value && model.selectable);
  const bySource = useMemo(() => new Map((catalog?.sources ?? []).map((source) => [
    source.id,
    (catalog?.data ?? []).filter((model) => model.source === source.id),
  ])), [catalog]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={selected ? `Modelo: ${selected.name}` : "Escolher modelo"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex max-w-[260px] items-center gap-1.5 rounded-full border bg-background/75 px-3 py-2 text-[12px] font-medium shadow-sm transition hover:bg-background",
          !selected && "border-amber-400/70 text-amber-800 dark:text-amber-300",
        )}
      >
        <span className="truncate">{loading ? "Consultando modelos..." : selected?.name ?? "Escolher modelo"}</span>
        <PiCaretDownBold className="h-3 w-3 shrink-0" />
      </button>

      {open ? (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[min(86vw,390px)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl">
          <Command label="Modelos da Golden Bridge" shouldFilter>
            <div className="border-b px-3 py-2.5">
              <Command.Input autoFocus placeholder="Buscar modelo..." className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
            </div>
            <Command.List className="max-h-[340px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-[12px] text-muted-foreground">Nenhum modelo encontrado.</Command.Empty>
              {error ? <CatalogState message={error} onRefresh={onRefresh} /> : null}
              {(catalog?.sources ?? []).map((source) => {
                const models = bySource.get(source.id) ?? [];
                return (
                  <Command.Group key={source.id} heading={source.label} className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground">
                    {source.status !== "available" ? (
                      <div className="mx-1 mb-1 rounded-xl border border-amber-300/50 bg-amber-50/60 px-3 py-2 text-[11px] leading-4 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                        <div className="flex gap-1.5"><PiWarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>{source.status === "degraded" ? "Parcialmente indisponível." : "Não configurado."}</strong> {source.message}</span></div>
                        <button type="button" onClick={onRefresh} className="mt-1.5 underline underline-offset-2">Atualizar catálogo</button>
                      </div>
                    ) : null}
                    {models.map((model) => (
                      <Command.Item
                        key={model.id}
                        value={`${model.name} ${model.id}`}
                        disabled={!model.selectable}
                        onSelect={() => {
                          if (!model.selectable) return;
                          onChange(model.id);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45 data-[selected=true]:bg-muted"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{model.name}</span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">{model.id}</span>
                          {!model.selectable ? <span className="mt-0.5 block text-[10px] text-amber-700 dark:text-amber-300">Falhou na certificação dream-agent.v1{model.certification.reason ? `: ${model.certification.reason}` : "."}</span> : null}
                        </span>
                        {value === model.id ? <PiCheckBold className="mt-1 h-3.5 w-3.5 shrink-0" /> : null}
                      </Command.Item>
                    ))}
                    {!models.length && source.status === "available" ? <p className="px-3 py-2 text-[11px] text-muted-foreground">Nenhum modelo certificado nesta origem.</p> : null}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}

function CatalogState({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <div className="m-1 rounded-xl border border-red-300/60 bg-red-50/60 px-3 py-2 text-[11px] leading-4 text-red-900 dark:bg-red-950/20 dark:text-red-200">
      <p>{message}</p>
      <button type="button" onClick={onRefresh} className="mt-1.5 underline underline-offset-2">Tentar novamente</button>
    </div>
  );
}
