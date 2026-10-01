import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";

import tinutriLogo from "@/assets/tinutri-logo.png";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export function AuthLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"login" | "google" | "recovery" | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFeedback(null);
    setPending("login");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error)
        setFeedback({
          text: "Não foi possível entrar. Confira seu e-mail e sua senha.",
          error: true,
        });
      else window.location.reload();
    } catch {
      setFeedback({
        text: "Não foi possível conectar. Tente novamente em instantes.",
        error: true,
      });
    } finally {
      setPending(null);
    }
  };

  const recoverPassword = async () => {
    if (pending) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFeedback({
        text: "Informe um e-mail válido acima para recuperar sua senha.",
        error: true,
      });
      document.getElementById("login-email")?.focus();
      return;
    }
    setFeedback(null);
    setPending("recovery");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setFeedback(
        error
          ? { text: "Não foi possível solicitar a recuperação. Tente novamente.", error: true }
          : {
              text: "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.",
              error: false,
            },
      );
    } catch {
      setFeedback({
        text: "Não foi possível conectar. Tente novamente em instantes.",
        error: true,
      });
    } finally {
      setPending(null);
    }
  };

  const signInWithGoogle = async () => {
    if (pending) return;
    setFeedback(null);
    setPending("google");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error)
        setFeedback({ text: "Não foi possível entrar com Google. Tente novamente.", error: true });
      else if (!result.redirected) window.location.reload();
    } catch {
      setFeedback({ text: "Não foi possível conectar ao Google. Tente novamente.", error: true });
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <header className="auth-brand">
          <img
            src={tinutriLogo}
            alt="TiNutri — Soluções em consultoria de alimentos"
            width={1022}
            height={1152}
            className="auth-logo"
          />
          <p className="auth-product">
            Smart Label<span aria-hidden="true">®</span>
          </p>
          <span className="auth-brand-accent" aria-hidden="true" />
        </header>

        <div className="auth-heading">
          <h1 id="login-title">Bem-vindo de volta</h1>
          <p>Acesse sua conta para gerenciar suas etiquetas.</p>
        </div>

        <form onSubmit={signIn} className="auth-form" aria-busy={pending !== null}>
          <div className="auth-field">
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="seu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending !== null}
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="login-password">Senha</label>
              <button
                type="button"
                className="auth-recovery"
                onClick={recoverPassword}
                disabled={pending !== null}
              >
                {pending === "recovery" ? "Enviando…" : "Esqueci minha senha"}
              </button>
            </div>
            <div className="auth-password">
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending !== null}
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                aria-controls="login-password"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {feedback && (
            <p
              className={`auth-feedback ${feedback.error ? "auth-feedback-error" : "auth-feedback-success"}`}
              role={feedback.error ? "alert" : "status"}
            >
              {feedback.text}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={pending !== null}>
            {pending === "login" ? (
              <>
                <LoaderCircle size={18} className="animate-spin" /> Entrando…
              </>
            ) : (
              <>
                Entrar na minha conta <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-divider">
          <span>ou continue com</span>
        </div>

        <button
          type="button"
          className="auth-google"
          onClick={signInWithGoogle}
          disabled={pending !== null}
        >
          {pending === "google" ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.61 4.61 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.9 6.62-2.39l-3.24-2.52c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.6A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.4 13.94a6 6 0 0 1 0-3.88v-2.6H3.05a10 10 0 0 0 0 9.08l3.35-2.6Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.94c1.47 0 2.79.5 3.82 1.49l2.86-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.46l3.35 2.6A5.99 5.99 0 0 1 12 5.94Z"
              />
            </svg>
          )}
          {pending === "google" ? "Conectando…" : "Google"}
        </button>

        <p className="auth-access-note">
          <LockKeyhole size={14} aria-hidden="true" /> Acesso exclusivo para clientes e equipe
          TiNutri.
        </p>
      </section>
    </main>
  );
}
