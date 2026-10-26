# Assinatura própria TiNutri — implementação e homologação

Atualizado em **24/10/2026**. A implementação local segue a proposta do documento 28. Não exige Clicksign ou Autentique. O Gmail foi escolhido pelo usuário, que pediu para configurar a senha de app posteriormente. Nenhum e-mail real, assinatura de cliente real ou novo acesso foi criado nesta etapa.

## O que está implementado

- Contratações novas podem registrar o método `tinutri`; o método fica imutável. Contratos anteriores continuam como `clicksign` e não são convertidos.
- Cliente lê o contrato no link secreto, confirma o texto de aceite e solicita um código para o e-mail congelado. Digita seis dígitos na própria página e confirma novamente o aceite.
- Representante TiNutri assina pela Área Master, autenticado. O e-mail do representante deve ser o e-mail da própria conta Master, validado também no SQL; uma conta Master não declara a assinatura do cliente.
- Master pode consultar o PDF original preservado, retomar envio pendente, finalizar o documento após falha recuperável e baixar o contrato com comprovante.
- PDF original é preservado antes do primeiro código e identificado por SHA-256. Os dois aceites guardam representante, e-mail, hash original, desafio, horário do servidor, versão e texto de aceite. Não são criados recibos fictícios do provedor externo.
- Depois dos dois aceites, o sistema mantém as páginas do contrato e acrescenta um comprovante. Original e arquivo final têm hashes distintos e permanecem privados. O manifesto estruturado recebe HMAC-SHA256 com JSON canônico, compatível com reordenação de campos pelo PostgreSQL jsonb.
- Código aleatório com validade de dez minutos, cinco tentativas, reenvio após sessenta segundos, até dez pedidos por representante/oferta por dia e trinta por origem por hora. Reenvio invalida o anterior; consumo e gravação do aceite são atômicos.
- HMAC do código e payload de e-mail criptografado com AES-256-GCM, ambos vinculados ao desafio, representante, contrato, PDF e contexto. Há versões de chaves e segredos separados para código, envio e evidências. Nenhum código é retornado ao navegador ou gravado em logs.
- Outbox persistente: SMTP só é acionado depois da gravação; reserva exclusiva, recuperação após interrupção e até três tentativas por desafio. Depois de falha, o Master pode retomar o envio elegível, ou o signatário solicitar novo código respeitando o intervalo.
- Não utiliza Supabase Auth para os códigos: usuários e convites continuam posteriores ao pagamento verificado. Sandbox nunca libera acesso real.

A aceitação SMTP significa que o servidor de e-mail aceitou o envio, não que a mensagem chegou à caixa de entrada. A identidade civil e os poderes de representação não são certificados pelo código de e-mail. O comprovante não é certificado ICP-Brasil.

## Instalação manual no Supabase

1. Se ainda estiver pendente, executar integralmente `docs/sql/25-fila-webhooks-asaas.sql` depois dos SQLs 22–24 já instalados.
2. Executar integralmente `docs/sql/26-assinatura-propria.sql` no SQL Editor administrativo do mesmo projeto.
3. Executar `docs/sql/99-conferir-contratacao.sql` atualizado e conferir todos os conjuntos e mensagens. A migração e suas verificações foram ensaiadas em PostgreSQL local isolado; isso não comprova instalação remota.
4. Rodar `npm run supabase:contracting:check` para conferir metadados via API. Essa consulta não substitui grants/RLS do SQL 99.

O SQL 26 cria quatro tabelas privadas, funções exclusivas do servidor e uma nova assinatura da RPC de publicação com `p_method`. Chamadas antigas continuam com padrão `clicksign`. Se uma migração antiga recriar essa RPC/guardas depois, reaplicar o SQL 26 por último e repetir a conferência. Nunca reaplicar o SQL 22 isoladamente como correção desta integração.

Para instalação completa: `npm run sql:contracting` gera 22–26 em uma transação em `.output/sql-contratacao/`, com manifesto de fontes. O build remove `.output`; gerar novamente depois do build, antes da aplicação.

Antes do SQL 26, a listagem tenta preservar leitura das contratações anteriores quando falta apenas `signature_method`. Publicar contratação própria exige a migração; não existe fallback que registre um contrato novo como Clicksign silenciosamente.

## Configuração local e Gmail

A `.env` local foi preparada sem expor seus valores. Para outra máquina:

```sh
npm run signature:setup -- --enable-sandbox
```

O script cria chaves ausentes/vazias e preserva segredos já configurados, inclusive a chave Asaas com dólar literal. Usa permissão 0600 no arquivo. Não executar para substituir chaves perdidas: preserve backup privado e mantenha versões antigas necessárias para validar os comprovantes.

Configuração esperada:

```dotenv
CONTRACT_SIGNATURE_PROVIDER="tinutri"
CONTRACT_SIGNATURE_ENVIRONMENT="sandbox"
OWN_SIGNATURE_KEY_ID="v1"
OWN_SIGNATURE_KEYS='JSON_PRIVADO_GERADO_PELO_SCRIPT'
OWN_SIGNATURE_PRODUCTION_ENABLED="false"
OWN_SIGNATURE_MAIL_TRANSPORT="smtp"
SIGNATURE_SMTP_HOST="smtp.gmail.com"
SIGNATURE_SMTP_PORT="465"
SIGNATURE_SMTP_USER="tinutri50@gmail.com"
SIGNATURE_SMTP_PASSWORD="SENHA_DE_APP_DO_GOOGLE"
SIGNATURE_MAIL_FROM="tinutri50@gmail.com"
CONTRACT_ACTIVATION_ENABLED="false"
```

Não copiar os placeholders como credenciais. No Google, ativar verificação em duas etapas e gerar uma senha de app para o TiNutri. A senha normal do Gmail não deve ser usada. Algumas contas não disponibilizam senhas de app; nesse caso, escolher SMTP compatível ou planejar OAuth2. O transporte SMTP exige TLS com validação de certificado. O remetente deve estar autorizado pela conta; preferir o mesmo e-mail no primeiro teste.

Depois de preencher apenas a `.env`, reiniciar o servidor completamente e executar:

```sh
npm run signature:mail:check
```

Esse comando verifica conexão/autenticação SMTP e **não envia e-mail nem lê a caixa postal**. O teste real de entrega deve ser feito pela jornada, com os e-mails de teste definidos pelo usuário. Gmail tem limites e políticas próprios; não presumir envio ilimitado.

## Variáveis na Vercel

Copiar por canal privado as variáveis de assinatura acima, incluindo **as mesmas chaves geradas localmente**, para o ambiente em que será feita a homologação. Segredos nunca recebem prefixo `VITE_` e nunca devem ser colados em chat, documentação ou commits. A senha e o JSON completo devem ser cadastrados como valores, sem aspas externas de dotenv.

As variáveis Asaas e Supabase já existentes devem ser preservadas. Manter a ativação desligada. Se quiser testar a etapa de fatura sandbox após assinar, configurar `CONTRACT_PAYMENT_PROVIDER=asaas` e manter `ASAAS_ENVIRONMENT=sandbox`. Isso permite criar cobranças fictícias após os dois aceites; não habilita produção nem acesso real.

Após alterar variáveis na Vercel, realizar novo deployment. Sem SMTP/chaves completos, o sistema mostra a assinatura indisponível e não envia códigos. Não habilitar `OWN_SIGNATURE_PRODUCTION_ENABLED` para ultrapassar a etapa de homologação.

## Roteiro do teste real quando o Gmail estiver configurado

1. Criar uma empresa/minuta de teste e usar o e-mail da conta Master como representante TiNutri. Escolher outro e-mail controlado pelo usuário para o representante cliente.
2. Preparar uma contratação **nova** no método próprio e ambiente sandbox. Para uma antiga contratação Clicksign sem cobrança, revogar e publicar outra; não alterar o método de uma oferta existente.
3. Abrir o link público, conferir o texto e baixar o PDF original. Solicitar código e conferir a chegada no destinatário correto. Confirmar o aceite do cliente; pagamento permanece indisponível enquanto falta TiNutri.
4. No Master, conferir o PDF original, solicitar o segundo código e assinar com a conta correspondente ao representante TiNutri.
5. Conferir o avanço para pagamento, baixar o contrato com comprovante e verificar nomes, horários, hashes, ambiente de teste e texto de aceite.
6. Se checkout sandbox estiver habilitado, preparar a fatura e pagar em sandbox; conferir o retorno Asaas. Confirmar ausência de convite/ativação real.
7. Testar código errado, expirado, reutilizado, reenvio e link revogado. Falha de armazenamento após os aceites deve ser retomada pelo Master em **Finalizar documento**, sem repetir assinaturas.

## Conferência posterior de integridade

```sh
npm run signature:evidence:verify -- UUID_DA_CONTRATACAO
```

Somente leitura, usando credencial de servidor local: confere método, manifesto HMAC, os dois aceites e hashes do PDF original/final. Não exporta nomes, e-mails ou segredos. A conferência requer as versões de chaves usadas na emissão do comprovante.

## Operação e limites atuais

Não há cron autônomo de envio/finalização nesta primeira versão. A solicitação aciona o envio; o Master retoma falhas elegíveis e a finalização pendente. A outbox permite recuperação sem descartar o pedido. A RPC `expire_own_signature_codes()` remove ciphertexts expirados/consumidos/invalidados e é chamada na retomada de envio pelo Master. Para expurgo periódico sem intervenção, configurar execução agendada dessa rotina no servidor; não abrir uma RPC pública para isso.

A origem para limitação usa `x-vercel-forwarded-for` somente quando `VERCEL=1`, valida o IP e armazena HMAC, não o IP bruto. Fora da Vercel, usa um único grupo conservador de limitação; outra hospedagem exige definir proxy confiável antes de adaptar a identificação. Não usar cabeçalho arbitrário do cliente como prova de identidade.

Não são coletados biometria, fotos de documentos ou IP bruto na versão atual. Backups separados, retenção imutável ou ancoragem externa, política de retenção e revisão jurídica do contrato/evidências continuam etapas de preparação para uso real. Um administrador com controle integral de banco e chaves não é um terceiro independente de confiança.

## Continuidade

Comandos: `npm run test:contracting`, `npm run test:contracting:browser`, `npx tsc --noEmit`, `npm run build`, `npm run sql:contracting`. Os testes de SMTP usam servidor TCP de loopback; os de navegador usam componentes reais e serviços simulados. Eles não certificam entrega Gmail, instalação remota ou assinatura de cliente real.

Arquivos centrais: `own-domain.ts`, `own-crypto.server.ts`, `own-flow.server.ts`, `own-mail.server.ts`, `own.server.ts`, `OwnSignatureForm.tsx`, funções de servidor e SQL 26. Manter a regra de dois aceites e arquivo preservado antes do pagamento.

Referências oficiais: [senhas de app Google](https://support.google.com/accounts/answer/185833?hl=pt-BR), [SMTP Nodemailer](https://nodemailer.com/smtp), [cabeçalhos Vercel](https://vercel.com/docs/headers/request-headers). Contexto jurídico e proposta original no documento 28.
