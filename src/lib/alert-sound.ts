import type { SoundLevel } from "@/lib/alert-plan";

/** Sons sintetizados (sem arquivos): suave para aviso antecipado, insistente para hoje e vencida. */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** O navegador só libera áudio depois de um toque do usuário; chame isto dentro de um clique. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = audio();
  if (!ctx) return false;
  try {
    if (ctx.state !== "running") await ctx.resume();
  } catch {
    return false;
  }
  return ctx.state === "running";
}

export const audioReady = () => context?.state === "running";

type Beep = { freq: number; at: number; length: number; wave?: OscillatorType; volume?: number };

const PATTERNS: Record<SoundLevel, Beep[]> = {
  soon: [
    { freq: 660, at: 0, length: 0.18, volume: 0.12 },
    { freq: 880, at: 0.2, length: 0.28, volume: 0.12 },
  ],
  today: [
    { freq: 880, at: 0, length: 0.16, wave: "square", volume: 0.18 },
    { freq: 880, at: 0.24, length: 0.16, wave: "square", volume: 0.18 },
  ],
  urgent: [
    { freq: 988, at: 0, length: 0.14, wave: "square", volume: 0.25 },
    { freq: 784, at: 0.2, length: 0.14, wave: "square", volume: 0.25 },
    { freq: 988, at: 0.4, length: 0.14, wave: "square", volume: 0.25 },
    { freq: 784, at: 0.6, length: 0.22, wave: "square", volume: 0.25 },
  ],
};

export function playAlert(level: SoundLevel): boolean {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return false;
  const start = ctx.currentTime + 0.02;
  for (const beep of PATTERNS[level]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = beep.wave ?? "sine";
    osc.frequency.value = beep.freq;
    const t = start + beep.at;
    // Rampas curtas evitam o estalo no início e no fim de cada tom.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(beep.volume ?? 0.15, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + beep.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + beep.length + 0.02);
  }
  return true;
}
