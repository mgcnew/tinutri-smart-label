# Ativação e confiabilidade da contratação

Evolução local em **20/10/2026**, a pedido do usuário: continuar no que puder ser concluído sem as contas de assinatura e Asaas e avisar conforme o trabalho avança.

## Entregue nesta evolução

- Webhook trata `refusal`, `cancel` e `deadline`, além dos eventos de assinatura. O cliente vê o motivo; o Master acompanha atividades recentes. Um evento atrasado não reabre uma solicitação interrompida ou desfaz uma assinatura concluída.
- Adaptador Clicksign testado com requisições simuladas: dois representantes, requisitos por e-mail, preservação dos IDs antes de avançar, cancelamento conforme o estágio e download sem repassar credenciais para o host do PDF.
- Nova configuração `CONTRACT_ACTIVATION_ENABLED=false`. A rotina real permanece desligada e sem ligação com uma fonte financeira externa.
- Confirmação financeira exclusiva de servidor em `record_verified_contract_payment`: valida total, moeda, ambiente e assinatura; preserva a confirmação, atualiza pagamento e enfileira ativação na mesma transação. Repetições não criam outra confirmação ou outra fila.
- Fila persistente e rotina de provisionamento: reserva uma execução, consulta o responsável pelo e-mail congelado, convida um novo usuário pelo Supabase quando necessário, preserva o ID e finaliza a vinculação como `admin_cliente` e a ativação em transação.
- Administrador já vinculado à mesma empresa é reutilizado; o perfil não é sobrescrito. Master, contas de outra empresa e promoção automática de gerente/operador já vinculados são bloqueados para revisão.
- Empresas suspensas não são reativadas automaticamente. Valor incorreto, sandbox, contrato incompleto ou confirmação financeira invalidada impedem liberação.
- Master pode retomar uma ativação bloqueada/pendente quando a rotina estiver habilitada. A ação continua sujeita às verificações do banco; não existe botão para “marcar como pago”.
- Uma adesão aberta por empresa, inclusive entre minutas diferentes, evita preparar duas contratações concorrentes inadvertidamente.

## Instalação e ordem dos SQLs

Para preparar sem conexão, execute `npm run sql:contracting`. O [roteiro de instalação manual](sql/README.md) explica o pacote gerado, os pré-requisitos e as consultas de conferência antes e depois. A geração não lê credenciais nem acessa o banco.

Aplicar [SQL 22](sql/22-contratacao-por-link.sql) e depois [SQL 23](sql/23-ativacao-contratacao.sql). Não foram aplicados ao Supabase remoto. Os scripts foram reaplicados em banco local isolado durante testes.

Se reaplicar o SQL 19 ou 22 posteriormente, reaplique o 23 por último: ele atualiza o guard da assinatura e a conclusão de assinatura com as regras mais recentes.

O SQL 23 não envia mensagens nem ativa empresas existentes. Cria a estrutura e funções exclusivas de servidor. O índice de adesão única aborta a instalação se houver dados concorrentes; não revoga registros automaticamente. Antes de instalar em ambiente que já tenha usado o SQL 22, conferir:

```sql
select client_id, array_agg(id) as offers
from public.contract_offers
where revoked_at is null and activated_at is null
group by client_id
having count(*) > 1;
```

Se houver resultado, revisar os contratos na Área Master e revogar a adesão que não deve prosseguir antes de reaplicar o script. Não apagar o histórico.

## Integração final com Asaas

A integração ainda precisa obter e verificar o pagamento na conta correta do Asaas. O código atual não faz essa consulta e não fornece checkout.

Depois de receber um evento autenticado, o adaptador futuro deve consultar a API do Asaas e conferir situação elegível, conta, ambiente, referência externa da contratação, moeda e valor integral do ciclo. Somente depois poderá chamar:

```text
record_verified_contract_payment(
  p_offer, p_account, p_payment, p_event,
  p_amount, p_currency, p_environment, p_confirmed_at
)
```

Essa RPC só tem permissão para `service_role`. Os argumentos não podem vir diretamente do navegador ou ser aceitos sem conferência na API. Uma mudança manual em `contract_offers.payment_status` não basta: a ativação também exige o registro de confirmação correspondente em `contract_payment_confirmations`.

Em seguida, o handler pode chamar `queueContractActivation(offerId)` de `activation.server.ts`. A fila é idempotente. Quando a flag estiver habilitada e o ambiente for produção, a rotina chama `activateContract` com o adaptador Supabase. Se a flag estiver desligada, o trabalho permanece pendente e nenhum convite é enviado.

A confirmação de sandbox pode ser registrada para homologar checkout, mas não enfileira nem libera acesso real. Falta conectar esse fluxo ao provedor, configurar o ambiente e validar a entrega real dos convites.

A reversão financeira futura deve invalidar a confirmação e executar a política comercial de suspensão/estorno em transação própria. A proteção atual impede uma ativação ainda pendente após invalidar a confirmação; não implementa cobrança recorrente, reembolso ou suspensão de acesso já ativo.

## Convite e conta de acesso

O convite usa o e-mail do `access_contact` congelado na contratação e redireciona para `/reset-password`. O domínio precisa estar em `CONTRACT_PUBLIC_ORIGIN` e na lista de redirect URLs do Supabase Auth. Homologar o template de convite, configuração de e-mail e criação de senha com a conta real antes de habilitar a rotina.

O convite é uma operação externa à transação PostgreSQL. O fluxo salva o ID retornado antes de ativar. Se a finalização falhar e o ID estiver preservado, a retomada reutiliza essa conta sem reenviar o convite. Se a resposta do convite se perdeu e o ID não foi preservado, uma conta encontrada sem vínculo comprovado é bloqueada para revisão; o fluxo não a apropria nem repete o convite cegamente.

A posse do e-mail continua sendo verificada pelo fluxo de convite Supabase. A aplicação não cria senha compartilhada nem registra senha no contrato. Para conta já ativada que precise receber outro link, a Área Master já possui a recuperação de senha em Usuários; não é necessário repetir ativação ou cobrança.

## Recuperação de ativação

- `pending`: pagamento verificado e fila aguardando execução. Habilitar a rotina somente após homologação e então processar pelo handler ou pelo controle administrativo.
- `processing`: uma execução possui reserva persistente. Outra chamada retorna ocupada e não convida novamente. Não há liberação automática por tempo: confirmar que a requisição original terminou antes de uma intervenção administrativa auditada.
- `blocked`: o motivo aparece no Master. Revisar conta, convite, confirmação e disponibilidade. Retomar preserva o ID salvo e revalida os dados antes de concluir.
- `completed`: nova chamada não repete convite, papel ou evento de ativação.

Uma execução interrompida em `processing` exige revisão operacional, pois o convite pode ter sido entregue. Confirmada a interrupção, a operação administrativa de recuperação deve preservar `user_id`, marcar `blocked`, limpar `worker_token` e registrar o motivo na trilha. Não alterar estado financeiro ou assinatura para destravar. Não há endpoint público que execute essa intervenção.

Não usar uma adesão nova para renovar automaticamente uma empresa já ativada por outra contratação: a rotina bloqueia esse caso. Renovação do ciclo e inadimplência devem ser tratadas na integração de assinaturas/cobranças do Asaas.

## Testes reproduzíveis

```sh
npm run test:contracting
npx playwright install chromium
npm run test:contracting:browser
npx tsc --noEmit
npm run build
```

Os testes de banco usam PGlite com papéis isolados; os de webhook/provedor/provisionamento usam portas e respostas locais. Não consultam Asaas/Clicksign, não convidam usuários reais e não acessam o Supabase remoto. O navegador usa componentes reais com serviços simulados em uma aplicação de teste separada.

Resultados em 20/10/2026:

- **51 testes do fluxo** passaram: domínio, geração de PDF, HMAC/HTTP, adaptador Clicksign, banco/RLS, confirmação financeira, orquestração e ativação.
- **7 testes de navegador** passaram, incluindo motivo de recusa, histórico e retomada no Master. Página e modal conferidos em 320, 375, 768 e 1440 px.
- **13 testes de regressão** passaram para planos, datas, gerador anterior e alertas. O adaptador de assinatura também foi revalidado após a revisão final.
- Build de produção, TypeScript, lint da implementação e revisão de espaços aprovados.

Foram adicionados testes para contrato sem comprovante, total incorreto, sandbox, contrato incompleto, conta de outro vínculo, Master, gerente, empresa suspensa, confirmação invalidada durante a execução, eventos repetidos e resposta incerta do convite. A gravação de assinatura/ativação foi executada mais de uma vez para confirmar idempotência. Os SQLs foram aplicados duas vezes em cada banco isolado.

Os resultados não substituem homologação externa. Continuam pendentes: aplicar os SQLs no ambiente escolhido, configurar/homologar Clicksign, obter acesso ao Asaas e implementar seu gateway, validar convites/redirects no Supabase real e habilitar a ativação somente depois desse fluxo completo. Nenhum usuário real foi convidado e nenhuma cobrança ou contrato real foi enviado nesta evolução.
