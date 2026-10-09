import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
export function MasterModal({
  title,
  description,
  open,
  onClose,
  busy = false,
  children,
  footer,
  wide = false,
}: {
  title: string;
  description: string;
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent
        className={`client-dialog master-dialog flex max-h-[90svh] w-[calc(100%_-_2rem)] ${wide ? "max-w-3xl" : "max-w-xl"} flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0`}
        overlayClassName="bg-black/35"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 thin-scroll overflow-y-auto p-5">{children}</div>
        {footer && <div className="client-dialog-footer shrink-0 border-t p-5">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-medium">
        {label}
      </label>
      {cloneElement(children, { id })}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="clients-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="clients-notice">
          {notice}
        </p>
      )}
    </>
  );
}
export function SaveButton({
  busy,
  form,
  label = "Salvar",
}: {
  busy: boolean;
  form: string;
  label?: string;
}) {
  return (
    <Button type="submit" form={form} disabled={busy} className="dashboard-primary">
      {busy ? (
        <>
          <LoaderCircle className="animate-spin" />
          Salvando…
        </>
      ) : (
        label
      )}
    </Button>
  );
}
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="dashboard-heading flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
          Gestão TiNutri
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </header>
  );
}
