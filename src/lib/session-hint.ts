/**
 * Indício local de sessão, sem ir ao servidor: o Supabase guarda o login em `sb-<projeto>-auth-token`.
 * Na prévia do Lovable (em iframe) o login vem do editor, então a estação sempre é carregada para conferir.
 * O indício só decide o que baixar primeiro; a estação continua validando a sessão de verdade.
 */
export const SESSION_BOOT_SCRIPT = `(function(){try{var s=window.parent!==window;for(var i=0;!s&&i<localStorage.length;i++){s=/^sb-.+-auth-token$/.test(localStorage.key(i)||"")}if(s)document.documentElement.setAttribute("data-session","")}catch(e){}})()`;

/** Lê a marca deixada pelo script do <head>, que roda antes da primeira pintura. */
export function hasSessionHint(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-session");
}
