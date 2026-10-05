// Núcleo do agente de impressão TiNutri: sem dependências, só módulos nativos do Node 18+.
import net from "node:net";

const PRIVATE_V4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^127\./,
];

/** Por padrão o agente só fala com impressoras da rede local e na porta 9100. */
export function isAllowedTarget(host, port, { allowedPorts = [9100], allowPublic = false } = {}) {
  if (!allowedPorts.includes(port)) return false;
  if (allowPublic) return true;
  if (PRIVATE_V4.some((re) => re.test(host))) return true;
  return /^[a-z0-9-]+(\.(local|lan|home|internal))?$/i.test(host) && !/^\d+(\.\d+){3}$/.test(host);
}

/** Envia o conteúdo bruto (ZPL) por TCP e espera a conexão fechar. */
export function sendToPrinter({ host, port, payload, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs, () => finish(new Error(`Tempo esgotado ao falar com ${host}:${port}.`)));
    socket.once("error", (error) => finish(new Error(describeNetworkError(error, host, port))));
    socket.once("connect", () => {
      socket.write(Buffer.from(payload, "utf8"), (error) => {
        if (error) return finish(error);
        socket.end();
      });
    });
    socket.once("close", () => finish());
  });
}

export function describeNetworkError(error, host, port) {
  const code = error && error.code;
  if (code === "ECONNREFUSED") return `Impressora recusou a conexão em ${host}:${port}. Confira o IP e a porta.`;
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return `Impressora ${host} inacessível na rede. Confira cabo, Wi-Fi e IP.`;
  if (code === "ENOTFOUND") return `Endereço ${host} não encontrado.`;
  if (code === "ETIMEDOUT") return `Tempo esgotado ao falar com ${host}:${port}.`;
  return `Falha ao enviar para ${host}:${port}: ${(error && error.message) || error}`;
}

/** Cliente das funções do Supabase (PostgREST /rpc). */
export function createRpc({ supabaseUrl, anonKey, token, fetchImpl = fetch }) {
  const base = supabaseUrl.replace(/\/+$/, "");
  return async function rpc(name, args = {}) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
      body: JSON.stringify({ _token: token, ...args }),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try { message = JSON.parse(text).message ?? text; } catch { /* corpo não é JSON */ }
      const error = new Error(message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  };
}

/** Uma rodada: reserva trabalhos, imprime e informa o resultado. Retorna quantos foram tratados. */
export async function processOnce({ rpc, send = sendToPrinter, log = () => {}, policy = {}, batch = 5 }) {
  const jobs = (await rpc("agent_claim_jobs", { _limit: batch })) ?? [];
  for (const job of jobs) {
    const target = `${job.host}:${job.port}`;
    try {
      if (!isAllowedTarget(job.host, job.port, policy)) {
        throw new Error(`Destino ${target} não permitido pelo agente (somente rede local, porta 9100).`);
      }
      await send({ host: job.host, port: job.port, payload: job.payload });
      await rpc("agent_finish_job", { _job_id: job.job_id, _ok: true });
      log(`✔ ${job.label_count} etiqueta(s) → ${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`✖ ${target}: ${message}`);
      try {
        await rpc("agent_finish_job", { _job_id: job.job_id, _ok: false, _error: message });
      } catch (reportError) {
        log(`Não foi possível informar a falha: ${reportError.message}`);
      }
    }
  }
  return jobs.length;
}

/** Laço contínuo com espera curta quando ocioso e recuo progressivo em caso de erro de rede/token. */
export async function run({ rpc, send, log = console.log, policy, pollMs = 2000, signal }) {
  let failures = 0;
  const sleep = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true }); });
  while (!signal?.aborted) {
    try {
      const handled = await processOnce({ rpc, send, log, policy });
      if (failures > 0) log("Conexão com a TiNutri restabelecida.");
      failures = 0;
      if (handled === 0) await sleep(pollMs);
    } catch (error) {
      failures += 1;
      if (error.status === 400 && /Token de agente inválido/.test(error.message)) {
        log("Token inválido ou agente desativado. Gere um novo token no TiNutri e atualize o config.json.");
      } else if (failures === 1 || failures % 10 === 0) {
        log(`Sem conexão com a TiNutri (${error.message}). Tentando novamente…`);
      }
      await sleep(Math.min(pollMs * 2 ** Math.min(failures, 4), 30000));
    }
  }
}
