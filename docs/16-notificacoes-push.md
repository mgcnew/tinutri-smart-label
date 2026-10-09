# Notificações push de validade

Avisos no celular e no computador, com resumo (ex.: "2 etiquetas vencidas — Presunto, Queijo +1"), mesmo com o app fechado. Complementam o cartão de alertas e o som do app, que só funcionam com o app aberto.

## Como funciona

1. O app é instalável (PWA): `public/manifest.webmanifest` e `public/sw.js`.
2. Cada pessoa liga **Avisos no celular** no cabeçalho. O navegador pede permissão e a inscrição é gravada por `register_push_subscription` em `push_subscriptions`.
3. A cada 5 minutos o `pg_cron` chama a Edge Function `send-alert-push`, que executa `claim_alert_digests()`:
   - considera etiquetas ativas e impressas nos níveis **por vencer** (3 dias), **vence hoje** e **vencida**;
   - cada etiqueta gera no máximo um aviso por nível (`alert_dispatches`);
   - destinatários: quem tem a empresa no perfil (colaborador, gerente, admin da empresa) e nutricionistas com a empresa na carteira;
   - agrupa por pessoa em um resumo único. O aviso novo substitui o anterior (mesma `tag`).
4. Tocar no aviso abre o app em Validades, já filtrado.
5. Inscrições recusadas pelo serviço de push (404/410) são removidas.

## Limites conhecidos

- **iPhone:** só recebe push com o app instalado na tela inicial (Safari 16.4+). Fora disso o botão explica o caminho.
- A janela "por vencer" é fixa em 3 dias no envio; a antecedência configurada no navegador vale só para a tela.
- Quem se inscreve depois não recebe avisos que já foram enviados; recebe os próximos.
- Administradores master não têm empresa no perfil e, por isso, não recebem push das empresas.

## Ativação (uma vez)

1. **Chaves:** `node scripts/generate-vapid.mjs`. A pública vai em `VITE_VAPID_PUBLIC_KEY` (`.env` e ambiente de publicação, depois novo build). A privada, só nos segredos do Supabase.
2. **Segredos** (Supabase > Edge Functions > Secrets): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:seu@email`) e `CRON_SECRET` (texto longo aleatório).
3. **Banco:** aplicar a migration `20261006150000_push_alerts.sql` e ativar as extensões `pg_cron` e `pg_net`.
4. **Função:** publicar `send-alert-push` **sem** verificação de JWT (a chamada é protegida por `CRON_SECRET`).
5. **Agendamento** (SQL Editor, trocando URL e segredo):

```sql
select cron.schedule(
  'tinutri-alertas-push', '*/5 * * * *',
  $$select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/send-alert-push',
    headers := jsonb_build_object('x-cron-secret', 'O_MESMO_CRON_SECRET', 'content-type', 'application/json'),
    body := '{}'::jsonb
  )$$
);
```

Para pausar: `select cron.unschedule('tinutri-alertas-push');`

## Teste

Ative os avisos no cabeçalho em um aparelho, tenha uma etiqueta ativa e impressa que vença hoje, e espere até 5 minutos. Para forçar um novo envio: `delete from alert_dispatches;` (reenvia tudo o que ainda estiver nos níveis).
