import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

/** Linha de preferência da sidebar: ícone, nome e o estado atual à direita. */
export function PreferenceRow({ icon, label, status, pressed, tone, disabled, onClick }: {
  icon: ReactNode;
  label: string;
  status: string;
  pressed?: boolean;
  tone?: "alert";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className={`workspace-nav-item h-11 w-full justify-start ${tone === "alert" ? "text-destructive" : ""}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="text-[11px] font-semibold text-muted-foreground">{status}</span>
    </Button>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return <PreferenceRow icon={dark ? <Moon /> : <Sun />} label="Modo noturno" status={dark ? "Ligado" : "Desligado"} pressed={dark} onClick={toggle} />;
}
