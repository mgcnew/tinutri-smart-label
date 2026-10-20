# Assinaturas e contratos na Área Master

Preparação do SaaS, sem integração de pagamentos ou assinatura eletrônica.

## Condições comerciais

Um único produto, com três períodos. Os preços informados são tratados como equivalentes mensais, com pagamento integral por ciclo:

| Período    | Equivalente mensal | Total por ciclo |
| ---------- | ------------------ | --------------- |
| Mensal     | R$ 59,90           | R$ 59,90        |
| Trimestral | R$ 54,90           | R$ 164,70       |
| Anual      | R$ 49,90           | R$ 598,80       |

Valores definidos em centavos em `src/lib/billing.ts`. Confirmar essa interpretação antes de implementar o checkout. O SQL preserva os mesmos preços na criação de minutas; mudanças de preço futuras devem atualizar ambos os locais e preservar contratos existentes.

Essencial, Profissional e Premium permanecem nos registros antigos, identificados como legados. Não existe migração automática para outro preço ou período. Novas empresas usam Mensal. A revisão comercial acontece no cadastro da empresa.

## Interface

- **Empresas → Cadastro e acessos:** cadastro/edição com período, data de adesão e situação da assinatura. Adesão desconhecida fica vazia e nunca é deduzida da data de cadastro. Assinatura ativa exige data de adesão.
- **Empresas → Assinaturas:** pesquisa por empresa/CNPJ, filtro por situação comercial, paginação e edição comercial em modal próprio. A consulta aos preços mensais e totais fica recolhida em “Consultar planos e valores”. Busca e filtros são preservados ao alternar entre as duas abas.
- **Ficha da empresa:** resumo comercial e atalho para contratos filtrados.
- **Contratos:** seleção de empresa cadastrada, geração de minuta editável, listagem com filtros e paginação, revisão, arquivamento e download TXT. O corpo inicial usa identificação, contatos, plano e adesão. Os campos da prestadora e as demais condições devem ser completados.

Situação da assinatura (aguardando adesão, ativa sob controle manual, cancelada) é independente da situação de acesso (ativa, inativa, suspensa). Não há marcação de pagamentos, cálculo automático de vencimento, bloqueio por inadimplência ou cobrança real nesta etapa.

Minutas não são contratos assinados. Os estados disponíveis são Rascunho, Em revisão e Arquivada. Não há ação que registre aceite ou assinatura. O conteúdo inicial é um roteiro para completar e revisar, sem cláusulas legais finais.

## Ativação

Executar manualmente [SQL 19](sql/19-assinaturas-contratos.sql) no editor administrativo do ambiente Supabase/Lovable e atualizar a aplicação. Depende da Área Master (SQL 15), especialmente de `private.tinutri_master`. Nenhum SQL foi aplicado ao banco remoto nesta entrega.

O script é reaplicável, adiciona os campos de adesão/situação sem mudar planos ou datas existentes e cria `service_contracts` com RLS exclusiva do Master. A assinatura inicial fica pendente para revisão, sem representar uma conclusão sobre pagamentos anteriores. Até a ativação, as áreas dependentes informam indisponibilidade; salvar os novos campos exige o SQL.

O banco preenche autoria, datas e cópias dos dados da empresa/plano na criação da minuta. Essas cópias são imutáveis mesmo quando o cadastro comercial muda. Alterar a empresa de uma minuta exige criar outra. Edições concorrentes são verificadas por `updated_at`. Não há exclusão pela interface ou permissão de exclusão para usuários autenticados.

## Próxima etapa: Asaas e adesão pelo cliente

Implementar checkout autenticado por empresa, escolha do período pelo próprio cliente e confirmação das condições, persistência dos identificadores do provedor em estrutura protegida, criação de cobranças no servidor e conciliação por webhooks autenticados/idempotentes. Definir previamente renovação, cancelamento, forma de pagamento, política de acesso e fluxo de assinatura do contrato. A situação manual não serve como confirmação de pagamento do provedor.

## Verificação

TypeScript, build de produção, lint dos arquivos alterados e testes de valores em centavos, preservação de planos antigos e datas, além dos testes existentes de listas e dashboard. SQL executado duas vezes em PGlite isolado, com confirmação dos totais, exigência de adesão para ativar assinatura, cópias imutáveis e isolamento do Master. Nenhum dado fictício foi enviado a serviços reais.

Navegador com APIs simuladas: navegação de Assinaturas para Contratos, preenchimento da minuta a partir da empresa e valor anual, salvamento, reabertura e ausência de transbordamento horizontal em 320, 375, 768 e 1440 px. O ensaio não valida cobrança, assinatura eletrônica ou o ambiente remoto.

## Refinamento de UX

Empresas e Assinaturas compartilham uma entrada no menu Master. As duas abas distinguem cadastro/acesso de gestão comercial, com carregamento da assinatura na primeira visita e preservação dos filtros entre as abas. As abas admitem setas, Home e End pelo teclado. Atalhos da visão geral abrem o cadastro com seu filtro correspondente.

O modal de assinatura altera apenas período, situação comercial e adesão; exige data para assinatura ativa e detecta atualização concorrente por `clients.updated_at`. Uma falha preserva o formulário. O sucesso registra a ação no histórico e atualiza as duas visões. Não modifica o acesso da empresa.

No Master, os QR Codes ficam na ficha da empresa. A lista oferece abertura da ficha e edição do cadastro; inativação continua disponível no campo de situação do formulário. A ficha mantém a suspensão/reativação. Contratos conserva uma entrada própria, com filtros alinhados e sem repetir o bloco explicativo ou o botão de criação no estado vazio. A lista identifica a empresa pelos dados preservados na minuta.

Esses ajustes não exigem SQL adicional ao script 19 já aplicado.

Validação do refinamento: TypeScript, lint e build aprovados; navegador com APIs simuladas verificou menu unificado, retenção de busca entre abas, setas do teclado, edição comercial com falha preservando os dados, salvamento e conflito concorrente. Assinaturas, modal e contratos foram conferidos em 320, 375, 768 e 1440 px, sem transbordamento horizontal. Não foi consultado ou alterado o banco remoto para esses ensaios.

## Evolução do gerador

O roteiro inicial de texto foi substituído pelo [gerador de contratos](20-gerador-contratos.md), com condições, dados opcionais da TiNutri, prévia integral e impressão/PDF pelo navegador. Registros anteriores são preservados. Continua sem exigir SQL além do script 19.

## Contratação por link (20/10/2026)

A próxima etapa foi preparada em [Contratação por link](22-contratacao-por-link.md), com página pública, cópias imutáveis, adaptador de assinatura e SQL 22. Assinatura real depende da conta/homologação; pagamento e ativação automática aguardam o Asaas. O comportamento manual descrito acima continua existente.
