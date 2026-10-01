export type WorkspaceTab =
  | "dashboard"
  | "clients"
  | "products"
  | "team"
  | "emit"
  | "validades"
  | "history"
  | "acompanhamento";
const panels: WorkspaceTab[] = [
  "dashboard",
  "clients",
  "products",
  "team",
  "emit",
  "validades",
  "history",
  "acompanhamento",
];
const windows = ["all", "expired", "today", "three", "seven"] as const;
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
export function workspaceSearch(search: Record<string, unknown>): {
  empresa?: string;
  registro?: string;
  painel?: WorkspaceTab;
  janela?: (typeof windows)[number];
} {
  return {
    empresa: uuid(search.empresa),
    registro: uuid(search.registro),
    painel: panels.includes(search.painel as WorkspaceTab)
      ? (search.painel as WorkspaceTab)
      : undefined,
    janela: windows.includes(search.janela as (typeof windows)[number])
      ? (search.janela as (typeof windows)[number])
      : undefined,
  };
}
