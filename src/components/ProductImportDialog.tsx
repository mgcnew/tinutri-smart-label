import { SystemSelect } from "@/components/ui/system-select";
import { useRef, useState } from "react";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  parseProductImport,
  PRODUCT_IMPORT_TEMPLATE,
  type ImportedProduct,
} from "@/lib/product-import";

type Props = {
  clients: { id: string; name: string; active: boolean }[];
  initialClient: string;
  refresh: () => Promise<void>;
  onSuccess: (message: string) => void;
  recordActivity: (
    action: string,
    clientId: string,
    entityType: string,
    entityId: string,
    name: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => Promise<void>;
};
export function ProductImportDialog({
  clients,
  initialClient,
  refresh,
  onSuccess,
  recordActivity,
}: Props) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [products, setProducts] = useState<ImportedProduct[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([PRODUCT_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-produtos.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = async () => {
    if (
      busy ||
      !products.length ||
      !clients.some((client) => client.id === clientId && client.active)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const payload = products.map((product) => ({ ...product, client_id: clientId }));
      const { data, error: saveError } = await supabase
        .from("products")
        .insert(payload)
        .select("id,name");
      if (saveError || !data)
        throw new Error("Não foi possível importar. Confira sua conexão e tente novamente.");
      // Clear the batch immediately after persistence to prevent duplicate retries.
      setProducts([]);
      let auditFailed = false;
      for (const product of data) {
        try {
          await recordActivity(
            "produto_criado",
            clientId,
            "product",
            product.id,
            product.name,
            {},
            payload.find((item) => item.name === product.name) ?? {},
          );
        } catch {
          auditFailed = true;
        }
      }
      setOpen(false);
      onSuccess(
        `${data.length} produto${data.length === 1 ? " importado" : "s importados"} com sucesso.${auditFailed ? " Algumas atividades não puderam ser registradas." : ""}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível importar os produtos.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="outline"
        className="h-11"
        disabled={!clients.length}
        onClick={() => {
          setClientId(
            clients.some((client) => client.id === initialClient)
              ? initialClient
              : clients.length === 1
                ? clients[0].id
                : "",
          );
          setProducts([]);
          setError("");
          setOpen(true);
        }}
      >
        <Upload />
        Importar produtos
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="client-dialog product-dialog max-h-[90svh] w-[calc(100%_-_2rem)] max-w-2xl thin-scroll overflow-y-auto rounded-2xl"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Importar produtos</DialogTitle>
            <DialogDescription>
              Escolha a empresa e envie um CSV com até 500 produtos. Confira a prévia antes de
              importar. Os produtos serão cadastrados como novos.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="min-w-0 space-y-4" aria-busy={busy}>
            <label className="block text-sm">
              Empresa *
              <SystemSelect
                className="mt-2"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">Selecione a empresa</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SystemSelect>
            </label>
            <Button type="button" variant="outline" onClick={download}>
              <Download />
              Baixar modelo CSV
            </Button>
            <p className="text-xs text-muted-foreground">
              Preencha produto, categoria e validade_dias. Os outros campos são opcionais. Em
              exige_lote, use sim ou não; inspeção aceita SIF, SISP ou SIM com o número
              correspondente. Salve a planilha como CSV UTF-8.
            </p>
            <label className="block text-sm">
              Arquivo CSV
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                className="mt-2"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  setProducts([]);
                  setError("");
                  if (!file) return;
                  setBusy(true);
                  try {
                    if (!file.name.toLowerCase().endsWith(".csv"))
                      throw new Error("Selecione um arquivo CSV.");
                    if (file.size > 2 * 1024 * 1024)
                      throw new Error("O arquivo deve ter até 2 MB.");
                    setProducts(parseProductImport(await file.text()));
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Não foi possível ler o arquivo.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {products.length > 0 && (
              <div className="space-y-2">
                <p role="status" className="text-sm font-medium">
                  {products.length} produtos prontos para importar
                </p>
                <div className="max-h-60 overflow-auto rounded-xl border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th className="p-3">Produto</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3">Dias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.name} className="border-t">
                          <td className="p-3 break-words">{product.name}</td>
                          <td className="p-3 break-words">{product.category}</td>
                          <td className="p-3">{product.shelf_life_days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="clients-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !clientId || !products.length} onClick={() => void save()}>
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Processando…
                </>
              ) : (
                "Importar produtos"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
