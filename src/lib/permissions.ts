import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin_master" | "nutricionista" | "admin_cliente" | "gerente" | "operator";
export type Permission =
  | "gerir_produtos"
  | "gerir_colaboradores"
  | "gerir_impressoras"
  | "gerir_acessos"
  | "descartar"
  | "ver_historico";
export type Permissions = Record<Permission, boolean>;

export const PERMISSIONS: { id: Permission; label: string; description: string }[] = [
  {
    id: "descartar",
    label: "Descartar etiquetas",
    description: "Dar baixa como descartada, registrando o motivo.",
  },
  {
    id: "ver_historico",
    label: "Ver o histórico",
    description: "Abrir a tela de histórico de etiquetas da empresa.",
  },
  {
    id: "gerir_produtos",
    label: "Gerir produtos",
    description: "Cadastrar, editar e excluir produtos e validades.",
  },
  {
    id: "gerir_colaboradores",
    label: "Gerir colaboradores",
    description: "Cadastrar e desativar os responsáveis que aparecem nas etiquetas.",
  },
  {
    id: "gerir_impressoras",
    label: "Gerir impressoras",
    description: "Cadastrar impressoras de rede e agentes de impressão.",
  },
  {
    id: "gerir_acessos",
    label: "Gerir acessos",
    description: "Convidar, desativar e ajustar permissões de pessoas da equipe.",
  },
];

const RANK: Record<AppRole, number> = {
  admin_master: 5,
  nutricionista: 4,
  admin_cliente: 3,
  gerente: 2,
  operator: 1,
};
const NONE: Permissions = {
  gerir_produtos: false,
  gerir_colaboradores: false,
  gerir_impressoras: false,
  gerir_acessos: false,
  descartar: false,
  ver_historico: false,
};

/** Padrão de cada perfil: o mesmo que o banco aplica quando ninguém ajustou nada (e o que valia antes das permissões). */
export function defaultPermissions(role: AppRole | null): Permissions {
  if (!role) return NONE;
  const rank = RANK[role];
  return {
    gerir_produtos: rank >= 2,
    gerir_colaboradores: rank >= 2,
    gerir_impressoras: rank >= 2,
    gerir_acessos: rank === 2 || rank === 3 || rank === 5,
    descartar: true,
    ver_historico: true,
  };
}

/** Permissões efetivas (perfil + ajustes). Se a função do banco ainda não existir, vale o padrão do perfil. */
export function usePermissions(
  role: AppRole | null,
  userId: string | null,
  revision = 0,
): Permissions {
  // A tela de gestão de acessos só aparece depois que o banco confirma as permissões: sem a função, ela não funcionaria.
  const [permissions, setPermissions] = useState<Permissions>(() => ({ ...defaultPermissions(role), gerir_acessos: false }));

  useEffect(() => {
    setPermissions({ ...defaultPermissions(role), gerir_acessos: false });
    if (!role || !userId) return;
    let alive = true;
    void (async () => {
      try {
        const { data, error } = await (
          supabase as unknown as {
            rpc: (name: string) => Promise<{ data: unknown; error: unknown }>;
          }
        ).rpc("my_permissions");
        if (error || !data || typeof data !== "object") return;
        const next = { ...defaultPermissions(role), ...(data as Partial<Permissions>) };
        if (alive) setPermissions(next);
      } catch {
        /* sem a função, o padrão do perfil continua valendo */
      }
    })();
    return () => {
      alive = false;
    };
  }, [role, userId, revision]);

  return permissions;
}
