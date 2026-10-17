import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  History,
  Package,
  Printer,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import tinutriLogo from "@/assets/tinutri-logo-ui.webp";
import { AuthLogin } from "@/components/AuthLogin";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import "@/landing.css";

const CONTACT =
  "https://wa.me/5511976050662?text=" +
  encodeURIComponent("Olá! Quero conhecer o TiNutri Smart Label para a minha operação.");
const EXAMPLES = [
  {
    id: "tomate",
    name: "Molho de tomate",
    storage: "Refrigerado",
    prepared: "16/10/2026 · 09:15",
    expires: "19/10/2026 · 09:15",
    lot: "DEMO-001",
  },
  {
    id: "frango",
    name: "Frango desfiado",
    storage: "Refrigerado",
    prepared: "16/10/2026 · 10:20",
    expires: "20/10/2026 · 10:20",
    lot: "DEMO-002",
  },
  {
    id: "salada",
    name: "Salada de grãos",
    storage: "Refrigerado",
    prepared: "16/10/2026 · 08:40",
    expires: "23/10/2026 · 08:40",
    lot: "DEMO-003",
  },
];
const KINDS = ["Manipulado", "Aberto", "Fracionado", "Recebido"];
type Stage = "emissao" | "validades" | "historico";

function ProductTour() {
  const [stage, setStage] = useState<Stage>("emissao");
  const [productId, setProductId] = useState("tomate");
  const [kind, setKind] = useState("Manipulado");
  const [used, setUsed] = useState(false);
  const product = EXAMPLES.find((item) => item.id === productId) ?? EXAMPLES[0];
  return (
    <section id="plataforma" className="sl-tour" aria-label="Demonstração do sistema">
      <Tabs value={stage} onValueChange={(value) => setStage(value as Stage)}>
        <div className="sl-tour-top">
          <div className="sl-tour-title">
            <span className="sl-product-mark">
              <Package aria-hidden="true" />
            </span>
            <div>
              <strong>Sua rotina, por dentro</strong>
              <span>Exemplo interativo · dados fictícios</span>
            </div>
          </div>
          <TabsList className="sl-stage-list" aria-label="Etapas do sistema">
            <TabsTrigger value="emissao">
              <Printer aria-hidden="true" />
              Emissão
            </TabsTrigger>
            <TabsTrigger value="validades">
              <Clock3 aria-hidden="true" />
              Validades
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History aria-hidden="true" />
              Histórico
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="emissao" className="sl-stage-panel">
          <div className="sl-emission">
            <div className="sl-tour-form">
              <h2>
                Informação certa.
                <br />
                Etiqueta bem feita.
              </h2>
              <p>Escolha um produto para ver como as informações ficam organizadas na etiqueta.</p>
              <label htmlFor="sl-product">
                Produto
                <select
                  id="sl-product"
                  aria-label="Produto"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  {EXAMPLES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="sl-kind">
                Tipo de etiqueta
                <select
                  id="sl-kind"
                  aria-label="Tipo de etiqueta"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  {KINDS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <div className="sl-field-note">
                <CheckCircle2 aria-hidden="true" />
                <span>Produto, conservação, lote e responsável no mesmo lugar.</span>
              </div>
            </div>
            <div className="sl-label-space">
              <div className="sl-label-paper" aria-label="Prévia ilustrativa da etiqueta">
                <div className="sl-label-brand">
                  TiNutri <span>Smart Label®</span>
                </div>
                <span className="sl-label-kind">{kind}</span>
                <h3>{product.name}</h3>
                <dl>
                  <div>
                    <dt>Preparação</dt>
                    <dd>{product.prepared}</dd>
                  </div>
                  <div className="sl-label-expiry">
                    <dt>Validade</dt>
                    <dd>{product.expires}</dd>
                  </div>
                  <div>
                    <dt>Conservação</dt>
                    <dd>{product.storage}</dd>
                  </div>
                </dl>
                <div className="sl-label-bottom">
                  <p>
                    Lote {product.lot}
                    <br />
                    Responsável: equipe exemplo
                  </p>
                  <QrCode aria-hidden="true" />
                </div>
              </div>
              <p className="sl-preview-note">Prévia visual. Datas e prazos são apenas exemplos.</p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="validades" className="sl-stage-panel">
          <div className="sl-monitor">
            <div className="sl-panel-heading">
              <div>
                <h2>
                  O próximo vencimento
                  <br />
                  merece sua atenção.
                </h2>
                <p>
                  Uma visão organizada para acompanhar os alimentos e registrar a saída de cada um.
                  Neste exemplo, considere a data de 19/10/2026.
                </p>
              </div>
              <span className="sl-count">
                <strong>{used ? 2 : 3}</strong> etiquetas ativas no exemplo
              </span>
            </div>
            <div className="sl-validity-list">
              {EXAMPLES.map((item, index) => (
                <div key={item.id} className="sl-validity-row">
                  <span className="sl-food-icon">
                    <Package aria-hidden="true" />
                  </span>
                  <div className="sl-validity-name">
                    <strong>{item.name}</strong>
                    <span>
                      {item.storage} · {item.lot}
                    </span>
                  </div>
                  <span
                    className={`sl-status ${index === 0 && !used ? "sl-status-attention" : ""}`}
                  >
                    {index === 0
                      ? used
                        ? "Utilizada"
                        : "Vence hoje"
                      : index === 1
                        ? "Próxima do vencimento"
                        : "Dentro do prazo"}
                  </span>
                  {index === 0 && (
                    <button
                      className="sl-small-button"
                      disabled={used}
                      onClick={() => setUsed(true)}
                    >
                      {used ? (
                        <>
                          <Check aria-hidden="true" />
                          Baixa simulada
                        </>
                      ) : (
                        "Simular baixa"
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="sl-monitor-result" role="status">
              {used ? (
                <>
                  <CheckCircle2 aria-hidden="true" />
                  <span>Uso registrado no exemplo. Veja a atualização na etapa Histórico.</span>
                  <button onClick={() => setUsed(false)}>
                    <RotateCcw aria-hidden="true" />
                    Desfazer
                  </button>
                </>
              ) : (
                <>
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    Experimente simular a baixa do primeiro produto. Nenhum dado real será alterado.
                  </span>
                </>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="historico" className="sl-stage-panel">
          <div className="sl-history">
            <div className="sl-panel-heading">
              <div>
                <h2>
                  Cada etapa
                  <br />
                  deixa seu registro.
                </h2>
                <p>
                  Emissões, impressões e baixas ajudam a acompanhar o que aconteceu na operação.
                </p>
              </div>
              <span className="sl-history-product">
                <Package aria-hidden="true" />
                Molho de tomate · DEMO-001
              </span>
            </div>
            <ol className="sl-timeline">
              <li>
                <span className="sl-timeline-icon">
                  <FileCheck2 aria-hidden="true" />
                </span>
                <div>
                  <strong>Etiqueta criada</strong>
                  <p>Produto, lote e responsável identificados.</p>
                </div>
                <span>09:15</span>
              </li>
              <li>
                <span className="sl-timeline-icon">
                  <Printer aria-hidden="true" />
                </span>
                <div>
                  <strong>Impressão confirmada</strong>
                  <p>Registro de impressão da etiqueta.</p>
                </div>
                <span>09:16</span>
              </li>
              <li className={used ? "sl-event-complete" : "sl-event-waiting"}>
                <span className="sl-timeline-icon">
                  {used ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                </span>
                <div>
                  <strong>{used ? "Baixa como utilizada" : "Acompanhamento da validade"}</strong>
                  <p>
                    {used
                      ? "Uso simulado na etapa Validades."
                      : "A etiqueta permanece ativa até o registro da baixa."}
                  </p>
                </div>
                <span>{used ? "Agora" : "Em aberto"}</span>
              </li>
            </ol>
            <p className="sl-history-note">
              <QrCode aria-hidden="true" />
              No sistema, cada etiqueta tem um QR Code para consulta individual.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      <div className="sl-tour-caption">
        <span>Uma amostra da experiência do TiNutri.</span>
        <span>Esta demonstração não emite etiquetas nem grava dados.</span>
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    q: "Como funciona a impressão?",
    a: "No momento, a impressão é feita com a Elgin L42, instalada e configurada no computador, pelo navegador.",
  },
  {
    q: "Posso usar pelo celular?",
    a: "Sim. O TiNutri funciona no navegador do celular, tablet ou computador. Também pode ser adicionado à tela inicial como aplicativo.",
  },
  {
    q: "Consigo acompanhar mais de uma empresa?",
    a: "Nutricionistas e consultorias podem acompanhar uma carteira de empresas. Os acessos são organizados por perfil e vínculo com cada empresa.",
  },
];

export function SystemLanding({ openLogin = false }: { openLogin?: boolean }) {
  const [loginOpen, setLoginOpen] = useState(openLogin);
  return (
    <div className="sl-page">
      <a className="sl-skip" href="#sl-main">
        Ir para o conteúdo
      </a>
      <header className="sl-header">
        <div className="sl-container sl-header-inner">
          <a href="/" className="sl-brand" aria-label="TiNutri Smart Label, página inicial">
            <img src={tinutriLogo} width={32} height={36} alt="" />
            <span>
              TiNutri{" "}
              <strong>
                Smart Label<sup>®</sup>
              </strong>
            </span>
          </a>
          <nav aria-label="Seções da página">
            <a href="#plataforma">A plataforma</a>
            <a href="#rotina">Na sua rotina</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <button className="sl-login" onClick={() => setLoginOpen(true)}>
            Entrar <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>
      <main id="sl-main">
        <section className="sl-intro sl-container" aria-labelledby="sl-title">
          <div>
            <h1 id="sl-title">
              Etiquetas prontas.
              <br />
              <span>Validades sob controle.</span>
            </h1>
            <p>
              Identifique alimentos, acompanhe os prazos e registre as baixas. Um sistema para
              organizar o que acontece na sua cozinha.
            </p>
          </div>
          <div className="sl-intro-action">
            <a className="sl-primary" href={CONTACT} target="_blank" rel="noreferrer">
              Quero conhecer o sistema <ArrowRight aria-hidden="true" />
            </a>
            <span>Fale com a equipe TiNutri.</span>
          </div>
        </section>
        <div className="sl-container">
          <ProductTour />
        </div>
        <section id="rotina" className="sl-routine sl-container" aria-labelledby="sl-routine-title">
          <div className="sl-section-intro">
            <h2 id="sl-routine-title">
              Menos informação espalhada.
              <br />
              <span>Uma rotina mais organizada.</span>
            </h2>
            <p>
              Do preparo à consulta do histórico, a equipe trabalha com os registros no mesmo lugar.
            </p>
          </div>
          <div className="sl-routine-content">
            <div className="sl-routine-line">
              <Printer aria-hidden="true" />
              <div>
                <h3>Prepare e identifique</h3>
                <p>
                  Produtos, tipos de etiqueta, conservação e responsáveis definidos para a emissão.
                </p>
              </div>
            </div>
            <div className="sl-routine-line">
              <Clock3 aria-hidden="true" />
              <div>
                <h3>Enxergue o que precisa de atenção</h3>
                <p>Validades organizadas por prioridade para acompanhar o que vence primeiro.</p>
              </div>
            </div>
            <div className="sl-routine-line">
              <History aria-hidden="true" />
              <div>
                <h3>Encontre o que foi registrado</h3>
                <p>Consulte emissões, reimpressões e baixas sem depender de anotações dispersas.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="sl-people" aria-labelledby="sl-people-title">
          <div className="sl-container sl-people-inner">
            <div>
              <Users aria-hidden="true" />
              <h2 id="sl-people-title">
                Cada pessoa com
                <br />o acesso que precisa.
              </h2>
            </div>
            <dl>
              <div>
                <dt>Equipe da cozinha</dt>
                <dd>Emissão e acompanhamento na rotina do preparo.</dd>
              </div>
              <div>
                <dt>Gestores</dt>
                <dd>Produtos, colaboradores e registros da empresa.</dd>
              </div>
              <div>
                <dt>Nutricionistas</dt>
                <dd>Acompanhamento das empresas da sua carteira.</dd>
              </div>
            </dl>
          </div>
        </section>
        <section id="duvidas" className="sl-faq sl-container" aria-labelledby="sl-faq-title">
          <div>
            <h2 id="sl-faq-title">Antes de começar.</h2>
            <p>Algumas respostas para entender como o sistema se encaixa na sua operação.</p>
          </div>
          <div className="sl-faq-list">
            {QUESTIONS.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <ChevronDown aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="sl-contact sl-container">
          <div>
            <h2>Vamos olhar para a sua cozinha?</h2>
            <p>Conheça o TiNutri com uma demonstração para a sua operação.</p>
          </div>
          <a className="sl-primary" href={CONTACT} target="_blank" rel="noreferrer">
            Conversar com a TiNutri <ArrowRight aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer className="sl-footer">
        <div className="sl-container">
          <span>TiNutri Smart Label®</span>
          <a href="mailto:contato@tinutri.com.br">contato@tinutri.com.br</a>
          <a href="https://instagram.com/tinutri.nutricao" target="_blank" rel="noreferrer">
            Instagram
          </a>
          <span>Validade simples. Segurança sempre.</span>
        </div>
      </footer>
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="auth-dialog" aria-describedby={undefined}>
          <AuthLogin modal />
        </DialogContent>
      </Dialog>
    </div>
  );
}
