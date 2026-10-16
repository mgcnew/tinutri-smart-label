import { billingPlan, displayDate, money } from "./billing.ts";

export const CONTRACT_TEMPLATE_VERSION = "TiNutri SaaS · modelo 1.0 · 16/10/2026";
export type ContractCompany = {
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  address: string | null;
  city: string;
  state: string;
  responsible_name: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  subscription_started_on?: string | null;
};
export type ContractProvider = {
  legalName: string;
  cnpj: string;
  address: string;
  representative: string;
  email: string;
  phone: string;
};
export type ContractTerms = {
  startsOn: string;
  firstDueOn: string;
  payment: "a_definir" | "pix" | "boleto" | "cartao";
  renewal: "manual" | "automatica";
  supportChannel: string;
  supportHours: string;
  exportDays: string;
};
export const EMPTY_PROVIDER: ContractProvider = {
  legalName: "",
  cnpj: "",
  address: "",
  representative: "",
  email: "",
  phone: "",
};
export const EMPTY_TERMS: ContractTerms = {
  startsOn: "",
  firstDueOn: "",
  payment: "a_definir",
  renewal: "manual",
  supportChannel: "",
  supportHours: "",
  exportDays: "",
};
const fill = (value: string | null | undefined, label: string) =>
  value?.trim() || `[PENDENTE: ${label}]`;
const date = (value: string, label: string) => (value ? displayDate(value) : fill("", label));
export function contractPending(body: string) {
  return [...new Set([...body.matchAll(/\[PENDENTE: ([^\]]+)\]/g)].map((match) => match[1]))];
}
export function contractDraft(
  company: ContractCompany,
  terms: ContractTerms = { ...EMPTY_TERMS, startsOn: company.subscription_started_on ?? "" },
  provider: ContractProvider = EMPTY_PROVIDER,
) {
  const plan = billingPlan(company.plan);
  if (!plan)
    throw new Error(
      "Atualize o plano da empresa para mensal, trimestral ou anual antes de gerar o contrato.",
    );
  if (
    terms.exportDays &&
    (!/^\d+$/.test(terms.exportDays) ||
      Number(terms.exportDays) < 1 ||
      Number(terms.exportDays) > 365)
  )
    throw new Error("Informe um prazo de exportação entre 1 e 365 dias, ou deixe pendente.");
  const payment = {
    a_definir: fill("", "forma de pagamento"),
    pix: "Pix",
    boleto: "boleto bancário",
    cartao: "cartão de crédito",
  }[terms.payment];
  return `MINUTA PARA REVISÃO — NÃO ASSINADA
CONTRATO DE LICENÇA DE USO DE SOFTWARE E PRESTAÇÃO DE SERVIÇOS
TiNutri Smart Label®
${CONTRACT_TEMPLATE_VERSION}

QUADRO RESUMO
Contratante: ${fill(company.legal_name, "razão social da contratante")}.
Nome fantasia: ${company.name}.
CNPJ: ${fill(company.cnpj, "CNPJ da contratante")}.
Endereço: ${fill(company.address, "endereço da contratante")}, ${company.city}/${company.state}.
Representante: ${fill(company.responsible_name, "representante da contratante e confirmação dos poderes de representação")}.
Contato: ${fill(company.email, "e-mail da contratante")} · ${fill(company.phone, "telefone da contratante")}.

Contratada (prestadora do TiNutri): ${fill(provider.legalName, "razão social da TiNutri")}.
CNPJ: ${fill(provider.cnpj, "CNPJ da TiNutri")}.
Endereço: ${fill(provider.address, "endereço da TiNutri")}.
Representante: ${fill(provider.representative, "representante da TiNutri")}.
Contato: ${fill(provider.email, "e-mail da TiNutri")} · ${fill(provider.phone, "telefone da TiNutri")}.

Plano: ${plan.name}. Período contratado: ${plan.months} ${plan.months === 1 ? "mês" : "meses"}.
Preço mensal equivalente: ${money(plan.monthlyCents)}. Valor total por ciclo: ${money(plan.monthlyCents * plan.months)}.
O valor mensal equivalente é uma referência de comparação; a cobrança prevista é pelo total de cada ciclo, sem parcelamento presumido.
Início da vigência: ${date(terms.startsOn, "data de início da vigência")}.
Primeiro vencimento: ${date(terms.firstDueOn, "primeiro vencimento")}. Forma de pagamento: ${payment}.
Renovação: ${terms.renewal === "manual" ? "mediante nova confirmação das partes, sem renovação automática" : "automática por períodos iguais, mediante informação prévia das condições da próxima renovação e possibilidade de cancelamento antes do novo ciclo"}.
Suporte: ${fill(terms.supportChannel, "canal de suporte")}.
Atendimento: ${fill(terms.supportHours, "dias e horários de suporte")}.
Prazo para solicitar exportação após o encerramento: ${terms.exportDays ? `${terms.exportDays} dias corridos` : fill("", "prazo de exportação após encerramento")}.

1. OBJETO E LICENÇA DE USO
1.1. A contratada disponibilizará acesso remoto ao TiNutri Smart Label, mediante licença de uso temporária, não exclusiva e sem transferência de titularidade do software, vinculada à empresa contratante identificada neste instrumento.
1.2. O serviço compreende as funcionalidades habilitadas no sistema para cadastro de produtos e responsáveis, preparação e registro de etiquetas, acompanhamento de validades, histórico da operação e gestão de usuários conforme as permissões concedidas. Funcionalidades futuras dependem de efetiva disponibilização e das condições então acordadas.
1.3. O contrato não inclui fornecimento de impressoras, insumos, conexão à internet, manutenção de equipamentos, desenvolvimento sob encomenda ou consultoria técnica presencial. Serviços profissionais de nutrição ou consultoria de alimentos, se contratados, dependerão de instrumento ou proposta própria.

2. ATIVAÇÃO, ACESSOS E EQUIPAMENTOS
2.1. A ativação observará a confirmação da contratação, as condições comerciais do quadro resumo e a configuração dos acessos. O simples cadastro da empresa não comprova contratação, pagamento ou aceite.
2.2. A contratante indicará pessoas autorizadas, manterá os contatos atualizados e administrará suas permissões. Credenciais são individuais e devem ser protegidas; suspeitas de uso indevido devem ser comunicadas sem demora.
2.3. A impressão depende de equipamento, configuração e conexão compatíveis. Antes do uso operacional, a contratante deverá conferir a configuração, a legibilidade e os dados das etiquetas e realizar testes com os equipamentos utilizados.

3. PREÇO E PAGAMENTO
3.1. O período, os valores, a forma de pagamento e o primeiro vencimento constam do quadro resumo. Os vencimentos seguintes deverão ser informados ao cliente, respeitado o ciclo contratado. Parcelamento e encargos somente poderão ser exigidos se previamente informados e expressamente acordados.
3.2. Não haverá alteração unilateral do preço dentro do ciclo já contratado. Eventual novo preço para ciclo posterior deverá ser comunicado antes da renovação, com possibilidade de não renovação pela contratante.
3.3. Em caso de atraso, a contratada notificará a contratante e indicará prazo razoável para regularização antes de eventual suspensão do acesso. A suspensão não autoriza eliminação imediata de dados nem afasta os direitos legalmente aplicáveis.
3.4. O meio de cobrança poderá ser disponibilizado por prestador de pagamentos identificado no momento da cobrança. A geração deste documento não emite cobrança nem confirma pagamento.

4. PRAZO, RENOVAÇÃO E CANCELAMENTO
4.1. A vigência terá início na data do quadro resumo e duração correspondente ao período contratado. A modalidade de renovação será a expressamente escolhida no mesmo quadro, sem presumir autorização de débito ou cobrança recorrente.
4.2. O pedido de cancelamento ou de não renovação poderá ser feito pelo contato da contratada ou pelo canal de suporte. A contratada confirmará o recebimento e informará a data do encerramento, a situação das cobranças e os procedimentos de exportação.
4.3. Os efeitos financeiros de eventual encerramento antecipado deverão observar os serviços efetivamente prestados, a legislação aplicável e as condições expressamente aprovadas pelas partes. Este modelo não estabelece multa automática ou perda integral de valores antecipados.
4.4. Ficam preservados os direitos obrigatórios aplicáveis à relação concreta, inclusive eventual direito de arrependimento nas hipóteses em que a legislação de defesa do consumidor o assegure. Nenhuma disposição deste instrumento pretende afastá-los.

5. SUPORTE, MANUTENÇÃO E DISPONIBILIDADE
5.1. O suporte será prestado nos canais e horários do quadro resumo, para dúvidas de uso e comunicação de falhas. A contratante deverá fornecer informações suficientes para identificação do problema, sem compartilhar senhas ou dados pessoais desnecessários.
5.2. A contratada poderá realizar manutenção e atualização do sistema e, sempre que possível, comunicará interrupções programadas e alterações relevantes. Ocorrências que afetem o serviço deverão ser apuradas e informadas pelos canais de atendimento.
5.3. Não se presume atendimento ininterrupto, prazo específico de solução ou percentual de disponibilidade. Garantias adicionais de nível de serviço, se acordadas, deverão constar de anexo próprio antes da contratação.

6. RESPONSABILIDADES NA OPERAÇÃO DE ALIMENTOS
6.1. A contratante responde pela veracidade dos cadastros, critérios técnicos de validade, condições de conservação, identificação dos produtos e conferência das informações utilizadas na operação.
6.2. O sistema auxilia a organização e o registro das rotinas. Seu uso não substitui inspeção dos alimentos, orientação do responsável técnico, boas práticas ou cumprimento das normas sanitárias aplicáveis ao estabelecimento.
6.3. A contratada responde pela prestação do serviço assumido e pelas falhas que lhe sejam imputáveis, nos limites da legislação aplicável. As obrigações da contratante não afastam responsabilidades legais da prestadora.

7. DADOS PESSOAIS E CONFIDENCIALIDADE
7.1. Cada parte deverá tratar apenas os dados necessários às finalidades do serviço, proteger as informações às quais tiver acesso e cumprir a legislação de proteção de dados aplicável.
7.2. Para os dados pessoais inseridos pela contratante na operação do estabelecimento, as funções de controladora e operadora deverão corresponder às atividades efetivamente realizadas. Quando tratar esses dados por conta da contratante, a contratada observará as instruções lícitas documentadas. Nos tratamentos que realizar para finalidades próprias, inclusive gestão da contratação, cada parte responderá pelas decisões que tomar.
7.3. As partes adotarão medidas adequadas à proteção dos dados e cooperarão em solicitações de titulares e apuração de incidentes. Eventuais comunicações às autoridades e titulares observarão os requisitos legais aplicáveis, sem presumir prazo ou procedimento diferente do exigido.
7.4. Informações de acesso, registros operacionais e dados comerciais não públicos serão mantidos em sigilo e somente compartilhados quando necessário à execução do serviço, por autorização ou obrigação legal. A utilização de fornecedores tecnológicos deverá respeitar a finalidade e os deveres de proteção e transparência.

8. ENCERRAMENTO, EXPORTAÇÃO E RETENÇÃO
8.1. No encerramento, a contratante poderá solicitar seus registros pelos canais de contato dentro do prazo indicado no quadro resumo. Formato, abrangência e prazo de entrega deverão ser confirmados por escrito, conforme os dados e recursos disponíveis, sem promessa de exportação automática de todos os módulos.
8.2. A eliminação, devolução ou retenção de informações deverá considerar a solicitação da contratante, as obrigações legais e o exercício regular de direitos. As partes deverão informar o procedimento e os prazos aplicáveis antes da eliminação de dados, observando também os direitos dos titulares.

9. PROPRIEDADE INTELECTUAL E USO PERMITIDO
9.1. A licença não transfere código-fonte, marcas ou direitos sobre o software. Os dados e conteúdos da contratante permanecem sujeitos aos respectivos direitos e não poderão ser utilizados para finalidade alheia ao serviço sem fundamento adequado.
9.2. É vedado compartilhar o acesso com terceiros não autorizados, tentar acessar dados de outras empresas, explorar vulnerabilidades ou utilizar o sistema para finalidade ilícita. Restrições contratuais deverão respeitar as permissões asseguradas por lei.

10. DISPOSIÇÕES FINAIS E FORMALIZAÇÃO
10.1. Alterações das condições contratuais dependerão de comunicação e concordância adequada à natureza da alteração, preservados os direitos obrigatórios aplicáveis. As partes buscarão solucionar divergências pelos canais de contato, sem impedir acesso aos órgãos competentes ou ao Poder Judiciário.
10.2. A assinatura poderá ocorrer em meio físico ou por solução eletrônica que permita comprovar a autoria e a integridade do documento, conforme o meio efetivamente adotado pelas partes. Salvar, baixar ou imprimir esta minuta não registra aceite nem assinatura.
10.3. Este texto é um modelo inicial para revisão jurídica e comercial. Campos pendentes e condições do quadro resumo devem ser completados e aprovados antes do uso como instrumento definitivo.

LOCAL, DATA E ASSINATURAS
Local: ${company.city}/${company.state}. Data: [PENDENTE: data da formalização].

Pela contratante: ${fill(company.responsible_name, "representante da contratante")}
Assinatura: _______________________________________________

Pela contratada: ${fill(provider.representative, "representante da TiNutri")}
Assinatura: _______________________________________________`;
}

export function escapeContractHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
export function contractPrintHtml(title: string, body: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeContractHtml(title)}</title><style>@page{size:A4;margin:20mm}body{max-width:180mm;margin:24px auto;color:#182b25;background:#fff;font-family:Georgia,serif;font-size:11pt;line-height:1.6}header{border-bottom:2px solid #007a46;padding-bottom:16px;margin-bottom:24px}h1{font-family:Arial,sans-serif;font-size:17pt}p{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}h2{font-family:Arial,sans-serif;font-size:12pt;break-after:avoid}.notice{font-family:Arial,sans-serif;font-size:10pt;color:#47564e}@media screen{body{padding:24px}}@media print{body{margin:0;max-width:none}}</style></head><body><header><h1>${escapeContractHtml(title)}</h1><div class="notice">Minuta para revisão · não assinada</div></header>${body
    .split(/\n\n+/)
    .map((part) => `<p>${escapeContractHtml(part)}</p>`)
    .join("")}</body></html>`;
}
