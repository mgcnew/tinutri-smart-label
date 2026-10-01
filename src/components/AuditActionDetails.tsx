import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EVENT_NAMES, type RecentAction } from "@/lib/dashboard";

const FIELD_NAMES: Record<string, string> = {
  name: "Nome",
  category: "Categoria",
  shelf_life_days: "Validade em dias",
  requires_lot: "Exige lote",
  requires_inspection: "Exige inspeção",
  inspection_type: "Tipo de inspeção",
  inspection_number: "Registro de inspeção",
  notes: "Observações",
  active: "Ativo",
  role_title: "Função",
  status: "Status",
  city: "Cidade",
  state: "UF",
  plan: "Plano",
  legal_name: "Razão social",
  cnpj: "CNPJ",
  responsible_name: "Responsável",
  email: "E-mail",
  phone: "Telefone",
  address: "Endereço",
};
const display = (value: unknown) =>
  value === true
    ? "Sim"
    : value === false
      ? "Não"
      : value === null || value === undefined || value === ""
        ? "Não informado"
        : String(value);
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function AuditActionDetails({
  action,
  onClose,
  onOpenEntity,
}: {
  action: RecentAction | null;
  onClose: () => void;
  onOpenEntity?: () => void;
}) {
  const metadata = object(action?.metadata);
  const before = object(metadata.before);
  const after = object(metadata.after);
  const fields = Object.keys(after).filter(
    (field) => FIELD_NAMES[field] && JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl bg-card">
        <DialogHeader>
          <DialogTitle>Registro da ação</DialogTitle>
          <DialogDescription>
            {action?.entity_name ?? "Atividade registrada pela equipe"}
          </DialogDescription>
        </DialogHeader>
        {action && (
          <>
            <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
              <p>
                <strong>{action.user_name ?? "Usuário não identificado"}</strong>{" "}
                {EVENT_NAMES[action.event_type] ?? "registrou uma ação"} {action.entity_name}.
              </p>
              <time className="mt-2 block text-xs text-muted-foreground">
                {format(new Date(action.created_at), "dd/MM/yyyy 'às' HH:mm")}
              </time>
            </div>
            {fields.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">Informações registradas</h3>
                <dl className="space-y-3">
                  {fields.map((field) => (
                    <div key={field} className="rounded-lg border p-3 text-sm">
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {FIELD_NAMES[field]}
                      </dt>
                      <dd className="mt-1 break-words">
                        {field in before && (
                          <span className="text-muted-foreground">{display(before[field])} → </span>
                        )}
                        {display(after[field])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {!fields.length && (
              <p className="text-sm text-muted-foreground">
                Este registro não contém detalhes dos campos alterados.
              </p>
            )}
            {onOpenEntity && (
              <Button variant="outline" onClick={onOpenEntity}>
                Abrir cadastro
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
