import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/PaginationControls";
import {
  EMPTY_PROFILE,
  loadTinutriProfile,
  saveTinutriProfile,
  type TinutriProfile,
} from "@/lib/tinutri-profile";
import { Heading, Field, Feedback, SaveButton } from "./Shared";

type TextKey = Exclude<keyof TinutriProfile, "export_days" | "updated_at">;
const COMPANY: [TextKey, string, string?][] = [
  ["legal_name", "Razão social"],
  ["cnpj", "CNPJ"],
  ["address", "Endereço"],
  ["email", "E-mail de contato"],
  ["phone", "Telefone"],
];
const SIGNER: [TextKey, string, string?][] = [
  ["representative", "Representante legal"],
  [
    "representative_email",
    "E-mail do representante",
    "Use o e-mail da conta Master que assina os contratos pela TiNutri.",
  ],
];
const SUPPORT: [TextKey, string, string?][] = [
  ["support_channel", "Canal de suporte", "Ex.: WhatsApp (11) 99999-9999 ou suporte@…"],
  ["support_hours", "Horário de suporte", "Ex.: segunda a sexta, 8h às 18h"],
];

export function SettingsPanel() {
  const [profile, setProfile] = useState<TinutriProfile>({ ...EMPTY_PROFILE });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const saved = await loadTinutriProfile(controller.signal);
        if (!controller.signal.aborted && saved) setProfile(saved);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Falha ao carregar os dados.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setProfile(await saveTinutriProfile(profile));
      setNotice("Dados salvos. Os próximos contratos já saem preenchidos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  const fields = (list: [TextKey, string, string?][]) =>
    list.map(([key, label, hint]) => (
      <Field key={key} label={label} hint={hint}>
        <input
          type={key.endsWith("email") ? "email" : "text"}
          maxLength={key === "representative_email" ? 160 : 240}
          value={profile[key]}
          onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
        />
      </Field>
    ));
  return (
    <section className="space-y-6">
      <Heading
        title="Configurações"
        description="Dados da TiNutri usados automaticamente nos contratos e nos links de contratação."
      />
      <div role="tablist" aria-label="Configurações" className="flex flex-wrap gap-2 border-b pb-3">
        <Button id="settings-tab-empresa" role="tab" aria-selected aria-controls="settings-empresa">
          Empresa
        </Button>
      </div>
      <div role="tabpanel" id="settings-empresa" aria-labelledby="settings-tab-empresa">
        {loading ? (
          <PageLoading error={null} retry={() => undefined} />
        ) : (
          <form id="tinutri-profile" className="space-y-6" onSubmit={submit}>
            <fieldset disabled={busy} className="space-y-6">
              <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Empresa</h2>
                <div className="grid gap-4 sm:grid-cols-2">{fields(COMPANY)}</div>
              </section>
              <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Quem assina pela TiNutri</h2>
                <div className="grid gap-4 sm:grid-cols-2">{fields(SIGNER)}</div>
              </section>
              <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Suporte e encerramento</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields(SUPPORT)}
                  <Field
                    label="Prazo para pedir exportação (dias)"
                    hint="Depois do encerramento do contrato. Entre 1 e 365."
                  >
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={profile.export_days ?? ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          export_days: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </Field>
                </div>
              </section>
            </fieldset>
            <p className="text-xs text-muted-foreground">
              Contratos já gerados não mudam. No gerador, os campos continuam editáveis para casos
              específicos.
            </p>
            <Feedback error={error} notice={notice} />
            <div className="flex justify-end">
              <SaveButton busy={busy} form="tinutri-profile" />
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
