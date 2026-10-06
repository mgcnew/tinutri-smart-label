import { useCallback, useEffect, useRef, useState } from "react";

import { planSound, type AlertCounts, type LastPlayed } from "@/lib/alert-plan";
import { audioReady, playAlert, unlockAudio } from "@/lib/alert-sound";

const KEY = "tinutri.alert-sound";
const TICK_MS = 30_000;

const readPreference = () => {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
};

/**
 * Som dos alertas e tela sempre ligada (para tablet de bancada). A preferência fica no navegador;
 * como o áudio exige um toque após cada recarga, "blocked" avisa quando é preciso reativar.
 */
export function useAlertSound(counts: AlertCounts | null) {
  const [enabled, setEnabled] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const previous = useRef<AlertCounts | null>(null);
  const last = useRef<LastPlayed>({ urgent: 0, today: 0 });
  const latest = useRef<AlertCounts | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const stored = readPreference();
    setEnabled(stored);
    setBlocked(stored && !audioReady());
  }, []);

  const evaluate = useCallback(() => {
    const next = latest.current;
    if (!next) return;
    const level = planSound(previous.current, next, last.current, Date.now());
    previous.current = next;
    if (!level) return;
    if (!playAlert(level)) { setBlocked(true); return; }
    if (level === "urgent") last.current.urgent = Date.now();
    if (level === "urgent" || level === "today") last.current.today = Date.now();
  }, []);

  useEffect(() => {
    latest.current = counts;
    if (enabled && !blocked) evaluate();
    else if (counts) previous.current = counts;
  }, [counts, enabled, blocked, evaluate]);

  useEffect(() => {
    if (!enabled || blocked) return;
    const timer = setInterval(evaluate, TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, blocked, evaluate]);

  // Tela ligada: o navegador solta o bloqueio ao esconder a aba, então pede de novo ao voltar.
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let alive = true;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible" && !wakeLock.current) {
          const lock = await navigator.wakeLock.request("screen");
          if (!alive) { void lock.release(); return; }
          wakeLock.current = lock;
          lock.addEventListener("release", () => { wakeLock.current = null; });
        }
      } catch { /* Sem suporte ou sem permissão: o som continua funcionando. */ }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
  }, [enabled]);

  /** Precisa rodar dentro de um clique para o navegador liberar o áudio. */
  const enable = useCallback(async () => {
    const ok = await unlockAudio();
    setBlocked(!ok);
    setEnabled(true);
    try { window.localStorage.setItem(KEY, "1"); } catch { /* Preferência local opcional. */ }
    if (!ok) return;
    // Já há pendência? Toca o som dela agora, para o usuário saber que o aviso está funcionando.
    const now = latest.current;
    const level = now && now.expired > 0 ? "urgent" : now && now.today > 0 ? "today" : "soon";
    playAlert(level);
    if (level === "urgent") last.current.urgent = Date.now();
    if (level !== "soon") last.current.today = Date.now();
    if (now) previous.current = now;
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    try { window.localStorage.setItem(KEY, "0"); } catch { /* Preferência local opcional. */ }
  }, []);

  return { enabled, blocked, enable, disable };
}
