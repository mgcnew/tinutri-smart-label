import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Fila de impressão em rede: o navegador enfileira ZPL e o agente local entrega à impressora. */

// As tabelas da fila ainda não estão nos tipos gerados do Supabase.
const db = supabase as unknown as SupabaseClient;

export type NetworkPrinter = {
  id: string;
  client_id: string;
  name: string;
  host: string;
  port: number;
  active: boolean;
};
export type PrintAgent = { id: string; name: string; active: boolean; last_seen_at: string | null };
export type PrintJobStatus = "pendente" | "imprimindo" | "enviada" | "falha" | "cancelada";

/** O agente bate no servidor a cada poucos segundos; acima disso consideramos desligado. */
const AGENT_ONLINE_MS = 30_000;
/** Etiquetas por trabalho: mantém o ZPL pequeno e uma falha não perde o lote inteiro. */
export const LABELS_PER_JOB = 100;
const POLL_MS = 1500;
const JOB_TIMEOUT_MS = 60_000;

export const isAgentOnline = (agent: PrintAgent, now = Date.now()) =>
  agent.active &&
  agent.last_seen_at !== null &&
  now - new Date(agent.last_seen_at).getTime() < AGENT_ONLINE_MS;

export async function listPrinters(clientId: string): Promise<NetworkPrinter[]> {
  const { data, error } = await db
    .from("printers")
    .select("id,client_id,name,host,port,active")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as NetworkPrinter[];
}

export async function addPrinter(
  clientId: string,
  name: string,
  host: string,
  port: number,
): Promise<NetworkPrinter> {
  const { data, error } = await db
    .from("printers")
    .insert({ client_id: clientId, name: name.trim(), host: host.trim(), port })
    .select("id,client_id,name,host,port,active")
    .single();
  if (error) throw error;
  return data as NetworkPrinter;
}

export async function removePrinter(id: string) {
  const { error } = await db.from("printers").delete().eq("id", id);
  if (error) throw error;
}

export async function listAgents(clientId: string): Promise<PrintAgent[]> {
  const { data, error } = await db
    .from("print_agents")
    .select("id,name,active,last_seen_at")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PrintAgent[];
}

/** Devolve o token uma única vez: depois disso só o hash fica no banco. */
export async function createAgent(clientId: string, name: string): Promise<string> {
  const { data, error } = await db.rpc("create_print_agent", { _client_id: clientId, _name: name });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { token?: string } | null;
  if (!row?.token) throw new Error("Resposta inválida ao criar o agente.");
  return row.token;
}

export async function removeAgent(id: string) {
  const { error } = await db.from("print_agents").delete().eq("id", id);
  if (error) throw error;
}

export async function enqueueJob(job: {
  clientId: string;
  printerId: string;
  payload: string;
  labelIds: string[];
  userId: string;
}): Promise<string> {
  const { data, error } = await db
    .from("print_jobs")
    .insert({
      client_id: job.clientId,
      printer_id: job.printerId,
      payload: job.payload,
      label_ids: job.labelIds,
      label_count: job.labelIds.length,
      created_by: job.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export type JobResult = { ok: true } | { ok: false; reason: string };

/** Acompanha o trabalho até o agente concluir. Cancela o trabalho se o tempo acabar sem ninguém pegá-lo. */
export async function waitForJob(jobId: string, signal?: AbortSignal): Promise<JobResult> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) return { ok: false, reason: "Operação interrompida." };
    const { data, error } = await db
      .from("print_jobs")
      .select("status,error")
      .eq("id", jobId)
      .single();
    if (error) return { ok: false, reason: "Não foi possível acompanhar a impressão." };
    const job = data as { status: PrintJobStatus; error: string | null };
    if (job.status === "enviada") return { ok: true };
    if (job.status === "falha")
      return { ok: false, reason: job.error || "A impressora não aceitou o trabalho." };
    if (job.status === "cancelada") return { ok: false, reason: "Trabalho cancelado." };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  // Só dá para cancelar o que ainda não foi pego; se já está imprimindo, o agente decide o resultado.
  await db
    .from("print_jobs")
    .update({ status: "cancelada" })
    .eq("id", jobId)
    .eq("status", "pendente");
  return {
    ok: false,
    reason:
      "O agente de impressão não respondeu a tempo. Confira se ele está ligado no computador da impressora.",
  };
}
