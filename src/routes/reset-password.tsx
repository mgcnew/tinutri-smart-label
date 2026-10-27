import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha · TiNutri Smart Label®" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase coloca o token no hash quando o usuário chega de um link de recuperação.
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError("Use no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Senha atualizada. Você pode acessar o sistema.");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl">
        <h1 className="text-2xl font-bold">Redefinir senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Defina uma nova senha de acesso ao TiNutri Smart Label®.
        </p>
        {!ready ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Verificando link de recuperação… abra esta página pelo link enviado para seu e-mail.
          </p>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
            <label className="block text-sm font-semibold">
              Nova senha
              <input
                type="password"
                required
                minLength={8}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Confirmar senha
              <input
                type="password"
                required
                minLength={8}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            <Button type="submit" size="xl" className="w-full">
              Salvar nova senha
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="font-semibold underline">
            Voltar ao login
          </Link>
        </p>
      </section>
    </main>
  );
}
