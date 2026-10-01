import { useEffect, useRef, useState } from "react";
import { addDays, format, startOfDay, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { management, downloadCsv, errorMessage } from "@/lib/management";
import { scopeIds, scopeKey } from "@/lib/list-query";
import { MasterModal, Field, Feedback } from "./Shared";
import { RemoteSelect } from "./RemoteSelect";
export function ReportModal({
  open,
  onClose,
  scope = null,
  initialClient = "",
}: {
  open: boolean;
  onClose: () => void;
  scope?: string[] | null;
  initialClient?: string;
}) {
  const [client, setClient] = useState(initialClient);
  const [type, setType] = useState("care");
  const [start, setStart] = useState(format(addDays(new Date(), -30), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const key = scopeKey(scope);
  useEffect(() => setClient(initialClient), [initialClient]);
  useEffect(() => () => controller.current?.abort(), []);
  const exportRows = async () => {
    if (lock.current) return;
    const beginning = startOfDay(new Date(`${start}T00:00:00`));
    const ending = addDays(startOfDay(new Date(`${end}T00:00:00`)), 1);
    if (!isValid(beginning) || !isValid(ending) || beginning >= ending) {
      setError("Escolha um período válido.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60000);
    try {
      const ids = scopeIds(key);
      if (ids?.length === 0) throw new Error("Nenhuma empresa disponível.");
      let offset = 0,
        total: number | null = null;
      const rows: Record<string, unknown>[] = [];
      while (total === null || offset < total) {
        let q =
          type === "care"
            ? management
                .from("care_records")
                .select("*,company:clients(name)", { count: "exact" })
                .gte("created_at", beginning.toISOString())
                .lt("created_at", ending.toISOString())
                .order("created_at")
                .order("id")
            : management
                .from("issued_labels")
                .select("*", { count: "exact" })
                .gte("issued_at", beginning.toISOString())
                .lt("issued_at", ending.toISOString())
                .order("issued_at")
                .order("id");
        if (ids) q = q.in("client_id", ids);
        if (client) q = q.eq("client_id", client);
        const { data, count, error } = await q
          .range(offset, offset + 199)
          .abortSignal(abort.signal);
        if (error) throw new Error(errorMessage(error));
        if (count === null) throw new Error("A contagem não foi retornada. Tente novamente.");
        if (count > 5000)
          throw new Error(
            "O período contém mais de 5.000 registros. Escolha uma empresa ou reduza o período.",
          );
        total = count;
        const page = (data ?? []) as unknown as Record<string, unknown>[];
        if (!page.length && offset < total)
          throw new Error("A consulta ficou incompleta. Tente novamente.");
        rows.push(...page);
        offset += page.length;
        if (!total) break;
      }
      if (abort.signal.aborted)
        throw new Error("Exportação cancelada ou tempo de resposta excedido.");
      if (!rows.length) throw new Error("Nenhum registro encontrado neste período.");
      const fields =
        type === "care"
          ? [
              "id",
              "company",
              "kind",
              "title",
              "status",
              "priority",
              "assigned_name",
              "due_on",
              "next_visit_on",
              "reason",
              "product_name",
              "description",
              "resolution",
              "created_at",
              "completed_at",
            ]
          : [
              "id",
              "client_name",
              "product_name",
              "responsible_name",
              "lot_number",
              "quantity",
              "issued_at",
              "expires_at",
              "print_status",
              "label_status",
              "closed_at",
            ];
      const headers =
        type === "care"
          ? [
              "ID",
              "Empresa",
              "Tipo",
              "Título",
              "Situação",
              "Prioridade",
              "Responsável",
              "Prazo / visita",
              "Próxima visita",
              "Motivo",
              "Produto",
              "Observações",
              "Resultado",
              "Registro",
              "Conclusão",
            ]
          : [
              "ID",
              "Empresa",
              "Produto",
              "Responsável",
              "Lote",
              "Quantidade",
              "Emissão",
              "Validade",
              "Impressão",
              "Situação",
              "Baixa",
            ];
      downloadCsv(`tinutri-${type}-${start}-${end}.csv`, [
        headers,
        ...rows.map((row) =>
          fields.map((field) =>
            field === "company" ? (row.company as { name?: string } | null)?.name : row[field],
          ),
        ),
      ]);
      setNotice(`${rows.length} registros exportados.`);
    } catch (e) {
      setError(
        abort.signal.aborted
          ? "Exportação cancelada ou tempo de resposta excedido."
          : e instanceof Error
            ? e.message
            : "Não foi possível exportar.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      lock.current = false;
      controller.current = null;
    }
  };
  return (
    <MasterModal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Relatório por período"
      description="Exporte os registros para análise ou compartilhamento com o cliente."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {busy ? (
            <Button variant="outline" onClick={() => controller.current?.abort()}>
              Cancelar exportação
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          )}
          <Button className="dashboard-primary" disabled={busy} onClick={() => void exportRows()}>
            {busy ? "Exportando…" : "Exportar CSV"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Conteúdo">
          <select disabled={busy} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="care">Pendências, ocorrências e visitas</option>
            <option value="labels">Etiquetas e baixas</option>
          </select>
        </Field>
        <RemoteSelect
          label="Empresa"
          value={client}
          onChange={setClient}
          scope={scope}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Deixe a empresa em branco para incluir todas as empresas às quais você tem acesso.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data inicial">
            <input
              disabled={busy}
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Data final">
            <input
              disabled={busy}
              type="date"
              required
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Filtro pela data de registro ou emissão. A situação e a data da baixa refletem o estado
          atual. Até 5.000 registros por exportação.
        </p>
        <Feedback error={error} notice={notice} />
      </div>
    </MasterModal>
  );
}
