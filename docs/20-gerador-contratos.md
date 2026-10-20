# Gerador de contratos TiNutri

Modelo inicial de licença de uso de software e prestação de serviços para o TiNutri Smart Label. Preparado em 16/10/2026, versão 1.0. Deve ser revisado juridicamente e aprovado comercialmente antes de ser utilizado como instrumento definitivo. A pesquisa fornece referências, não uma validação jurídica do texto.

## Fluxo

Na Área Master, abrir **Contratos → Gerar contrato**. Selecionar a empresa, conferir o período e valor vindos da assinatura e preencher as condições disponíveis. O documento é gerado em uma prévia completa, com quadro resumo, dez grupos de cláusulas e espaço para assinaturas. É possível editar o texto, salvar a minuta, baixar TXT ou abrir **Imprimir / PDF** e selecionar “Salvar como PDF” no navegador.

O gerador contempla:

1. Objeto e licença temporária de uso.
2. Ativação, acessos e equipamentos.
3. Preço e pagamento, distinguindo o equivalente mensal do total por ciclo.
4. Vigência, renovação e cancelamento.
5. Suporte, manutenção e disponibilidade.
6. Responsabilidades nas rotinas com alimentos.
7. Dados pessoais e confidencialidade.
8. Encerramento, exportação e retenção.
9. Propriedade intelectual e uso permitido.
10. Formalização e disposições finais.

A data de adesão serve como sugestão inicial de vigência e pode ser alterada no gerador sem modificar a assinatura da empresa. O primeiro vencimento não é inferido da adesão. Renovação depende de nova confirmação por padrão; a alternativa automática é uma escolha expressa no formulário. Escolher Pix, boleto ou cartão apenas descreve a condição proposta; não cria uma cobrança.

Dados desconhecidos recebem marcadores `[PENDENTE: ...]`. A prévia lista essas pendências e permite salvar o rascunho. Não são criados CNPJ, razão social, contatos, SLA, encargos financeiros ou dados de representação fictícios. O prazo de solicitação de exportação e os contatos/horários de suporte também ficam pendentes até serem definidos pela prestadora.

Os dados da TiNutri podem ser preenchidos opcionalmente antes de gerar. Eles são incorporados ao corpo desta minuta, sem criar um cadastro global da prestadora. Quando as informações oficiais chegarem, podem ser incluídas no gerador para novos documentos ou pelo editor de texto em documentos salvos. A geração novamente substitui o texto editado apenas quando a ação explícita é acionada.

O contato responsável cadastrado na empresa é utilizado como representante indicado; seus poderes de representação precisam ser conferidos antes da assinatura. O escopo descreve o software e separa equipamentos e serviços profissionais presenciais, sem assumir contratação de consultoria de alimentos ou de nutrição.

## Referências da pesquisa

Texto autoral adaptado ao produto, sem reprodução de modelos comerciais de terceiros. Referências oficiais consultadas:

- [Lei nº 9.609/1998, especialmente arts. 8º e 9º](https://www.planalto.gov.br/ccivil_03/leis/l9609.htm): licença de software e referência ao suporte técnico.
- [Código Civil, especialmente arts. 421, 422 e 425](https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm): regras gerais dos contratos e boa-fé.
- [LGPD, especialmente arts. 5º, 39 e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm): funções no tratamento de dados, instruções e segurança. O modelo evita atribuir uma única função para todas as atividades.
- [CDC, especialmente arts. 46, 49 e 51](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm): informação contratual e direitos obrigatórios, quando aplicáveis à relação concreta. Não é presumida a incidência ou exclusão do CDC em toda contratação empresarial.
- [MP nº 2.200-2/2001, art. 10](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm): referência à comprovação de autoria e integridade em documentos eletrônicos.

Não foi inserida eleição automática de foro, multa, garantia de disponibilidade, promessa de backup, não reembolso absoluto ou aceite presumido. As condições de suporte e exportação precisam refletir o serviço efetivamente oferecido antes da aprovação do contrato.

## Persistência e compatibilidade

Continua utilizando `service_contracts` e o SQL 19 já aplicado. Não exige SQL adicional. O documento final é persistido em `body`; condições e dados da prestadora estão contidos nesse texto, sem colunas adicionais. Registros antigos abrem na prévia do conteúdo original, sem serem regenerados ou substituídos pelo novo modelo. A edição livre permite completar dados pendentes.

Os dados de origem da empresa e plano continuam preservados pelos gatilhos existentes. Salvar, gerar, imprimir ou baixar não registra assinatura, aceite ou pagamento. A integração com Asaas e a assinatura eletrônica seguem fora desta entrega.

A impressão abre uma janela própria com o conteúdo escapado, sem carregar dados externos ou interpretar HTML do usuário. O PDF é obtido pelo diálogo de impressão do navegador, não por geração automática no servidor.

## Validação

Testes de geração com dados empresariais e condições, pendências sem dados inventados, preservação dos valores por ciclo, limite do corpo, rejeição de planos legados e escape de HTML na impressão. TypeScript, lint e build de produção. Ensaios de navegador usam somente APIs simuladas; não criam contratos nem cobranças no banco remoto.

No navegador, foram conferidos formulário e prévia em 320, 375, 768 e 1440 px, preenchimento empresarial, dez grupos de cláusulas, marcadores da prestadora, edição e retorno à prévia, conteúdo da janela de impressão, salvamento com falha sem perda e reabertura da minuta salva. A identificação do documento fica recolhida para priorizar a leitura do contrato. As condições comerciais não são reconstruídas a partir do texto ao reabrir um documento; a revisão de minutas salvas utiliza o editor livre.

## Evolução para contratação por link (20/10/2026)

O modelo 1.1 permite início na ativação, após assinatura e pagamento, e registra condições estruturadas na minuta. A publicação por link exige esses dados e ausência de marcadores pendentes. Requer o SQL 22, além do SQL 19. Veja [Contratação por link](22-contratacao-por-link.md) e [Passagem de contexto](23-continuar-no-claude-code.md).
