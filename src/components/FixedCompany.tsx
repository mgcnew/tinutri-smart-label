/** Empresa única do acesso: mostrada fixa, sem seletor nem busca (cada login de empresa pertence a uma só). */
export function FixedCompany({ name, id }: { name: string; id?: string }) {
  return <input id={id} value={name} readOnly aria-readonly="true" className="company-fixed" />;
}
