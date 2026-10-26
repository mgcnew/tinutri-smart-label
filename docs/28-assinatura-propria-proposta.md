# Proposta de assinatura eletrônica própria — 21/10/2026

**Estado em 24/10/2026: proposta implementada localmente; instalação e homologação conforme `docs/29-assinatura-propria-implementacao.md`.** O usuário mudou a decisão de Autentique para assinatura própria antes de qualquer envio externo. As alterações locais incompletas do adaptador Autentique foram retiradas; não houve publicação, envio de documento ou inclusão de credenciais dessa integração. O código publicado continua com o adaptador Clicksign desativado. A fila Asaas do documento 27 é independente e permanece preservada.

## Experiência recomendada

1. Master revisa o contrato, o plano, os dois representantes e seus e-mails, e publica a versão congelada. O método de assinatura deve ficar registrado e imutável por contratação.
2. Cliente abre o link existente `/contratar#segredo`, lê o contrato e confirma a intenção de assinar. O código é enviado exclusivamente ao e-mail previamente definido; o formulário público não permite trocar o destinatário.
3. Cliente informa um código de seis dígitos com validade proposta de dez minutos e confirma um texto explícito de assinatura daquela versão. O código verifica controle do e-mail; não prova sozinho identidade civil ou poderes de representação.
4. Representante TiNutri assina em ação própria na Área Master, autenticado e confirmando por código no seu próprio e-mail. Uma ação do Master não pode declarar a assinatura do cliente.
5. Somente depois dos dois aceites e da preservação do arquivo final o sistema conclui a assinatura. Cliente pode baixar o documento e continuar para o pagamento do plano congelado.
6. Acesso só é provisionado após a confirmação financeira verificada no servidor. Sandbox não cria acesso real.

Não usar imagem desenhada como prova principal. Ela pode ser acrescentada depois como aparência. Não introduzir iframe ou redirecionamento para plataforma de assinatura externa.

## Evidências e arquivo

Preservar o PDF exato apresentado antes de emitir o primeiro código, além do texto e condições já congelados. Cada aceite vincula oferta, representante, hash SHA-256 desse PDF original, versão do texto de aceite e data/hora UTC do servidor. O hash identifica conteúdo; não comprova autoria por si só.

Gerar um comprovante com identificador, representantes, horários, método de confirmação e hash original, anexado ao PDF ou como artefato separado. O arquivo final tem seu próprio hash, pois anexar comprovantes altera os bytes. Conservar ambos, sem sobrescrever o PDF original. Preservar evidências estruturadas além do relatório visual, com verificação de integridade pelo servidor.

Uma chave do servidor pode proteger o manifesto de evidências contra alterações detectáveis, com identificação da versão da chave e procedimento de rotação. Isso não é assinatura ICP-Brasil das partes nem selo independente. Não prometer inviolabilidade contra administradores que controlam banco e chaves; backups separados e, futuramente, armazenamento com retenção imutável ou ancoragem externa fortalecem a prova.

Se IP e informações do navegador forem necessários ao modelo probatório aprovado, obter apenas de origem confiável, limitar campos/tamanho, proteger o acesso e definir retenção. Não coletar biometria ou cópia de documento na primeira versão por padrão. Nunca guardar o código em claro ou no comprovante.

## Códigos e envio

- Códigos aleatórios gerados no servidor e exclusivos para oferta, pessoa, finalidade e hash do PDF.
- Armazenar HMAC do código com segredo de servidor, separado do banco e versionado; um hash simples de seis dígitos é vulnerável a enumeração offline.
- Proposta inicial: dez minutos de validade, cinco erros por desafio, intervalo de sessenta segundos para reenvio e limites persistentes por representante/oferta e origem. Ajustar os limites antes de produção com base nos testes de entrega e abuso.
- Novo código invalida o anterior. Consumo e gravação do aceite devem ser atômicos. Dois cliques ou requisições concorrentes não podem gerar dois aceites nem concluir outra versão.
- O desafio é vinculado ao contexto de assinatura do destinatário. Não permitir uso cruzado entre representante da TiNutri e cliente, entre contratos ou após revogação/expiração.
- Enviar através de serviço transacional ou SMTP, com remetente verificado e domínio com SPF/DKIM. Credenciais somente no servidor. As cotas gratuitas de qualquer serviço de e-mail ainda precisam ser escolhidas e verificadas.
- Implementar outbox persistente, estados de entrega, recuperação de falhas e limites; reenvio não significa nova assinatura. Não expor existência de e-mails/contratos nem erros internos no endpoint público.
- Separar os códigos de assinatura do Supabase Auth: não criar ou convidar usuários só para assinar. O provisionamento continua posterior ao pagamento.
- Testes locais usam caixa de e-mail isolada; nunca disponibilizar um modo de revelar códigos no navegador publicado.

## Mudanças previstas

Nova migração manual após os SQLs anteriores, com método de assinatura congelado, representantes, desafios, aceites e outbox. RLS deve impedir leitura/gravação pública desses dados; apenas funções de servidor com escopo definido podem confirmar e finalizar. Manter compatibilidade com contratos do método anterior, sem converter comprovantes Clicksign em comprovantes próprios.

Adaptar `beginSignature` e a página pública para leitura → envio do código → confirmação → acompanhamento. Adicionar a assinatura do representante TiNutri ao Master. As transições precisam validar elegibilidade, expiração, revogação e versão no banco, e não apenas em componentes React.

Reaproveitar o link secreto com hash no banco, o PDF privado, os snapshots comerciais, o histórico, o pagamento Asaas e as guardas de ativação existentes. Ajustar a conclusão da assinatura para evidências do método próprio; não inserir recibos fictícios do adaptador Clicksign para satisfazer o SQL atual.

## Sequência de implementação e validação

1. Banco local isolado e SQL manual reaplicável: códigos/aceites concorrentes, permissões e imutabilidade.
2. Fluxo cliente e assinatura TiNutri com caixa de e-mail de testes: código expirado, incorreto, reutilizado, troca de destinatário/contrato, reenvio, link revogado e alteração de documento.
3. Finalização recuperável: duas assinaturas, uma única conclusão e documento íntegro, inclusive após falha de storage ou interrupção do processo. Um aceite já registrado permanece válido durante a recuperação; não pedir ao usuário que assine outra vez para corrigir falha de geração do comprovante.
4. Jornada completa com pagamento Asaas sandbox, entrega de e-mail homologada e nenhuma ativação real.
5. Revisão jurídica das cláusulas, identificação/representação, evidências, retenção e força probatória; homologação antes de habilitar produção. A produção financeira continua como etapa separada da conta do cliente.

## Limites jurídicos e de custo

A MP 2.200-2, art. 10, § 2º admite outros meios de comprovação de autoria e integridade quando admitidos pelas partes ou aceitos por quem recebe o documento. Isso não garante a validade de qualquer clique ou dispensa a análise do contrato e das evidências. Não classificar automaticamente o mecanismo como assinatura qualificada, ICP-Brasil ou equivalente a uma plataforma independente.

A solução elimina a tarifa de uma plataforma de assinatura, mas mantém desenvolvimento, manutenção, e-mail, armazenamento e operação. Controlar acesso e retenção das evidências pessoais conforme a LGPD.

Fontes oficiais consultadas: [MP 2.200-2](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm), especialmente art. 10, § 2º; [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), especialmente princípios, bases de tratamento e segurança.
