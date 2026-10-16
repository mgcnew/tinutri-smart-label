export type WorkspaceTab =
  | "dashboard"
  | "clients"
  | "products"
  | "team"
  | "emit"
  | "validades"
  | "history"
  | "acompanhamento"
  | "settings"
  | "access";
const panels: WorkspaceTab[] = [
  "dashboard",
  "clients",
  "products",
  "team",
  "emit",
  "validades",
  "history",
  "acompanhamento",
  "settings",
  "access",
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

export const LABEL_TABS = ["emit", "validades", "history"] as const;
export function isLabelTab(tab: WorkspaceTab): tab is (typeof LABEL_TABS)[number] {
  return LABEL_TABS.some((item) => item === tab);
}
const masterSections = [
  "visao",
  "empresas",
  "contratos",
  "usuarios",
  "carteira",
  "acompanhamento",
  "atividades",
] as const;
export function masterSearch(search: Record<string, unknown>): {
  secao?: (typeof masterSections)[number];
  empresa?: string;
} {
  return {
    secao: masterSections.find((section) => section === search.secao),
    empresa: uuid(search.empresa),
  };
}
export function masterCompaniesUrl(companyId?: string) {
  const id = uuid(companyId);
  return `/admin?secao=empresas${id ? `&empresa=${id}` : ""}`;
}
