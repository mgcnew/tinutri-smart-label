import {
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronDown,
  History,
  MessageCircle,
  Moon,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import tinutriLogo from "@/assets/tinutri-logo-ui.webp";
import { AuthLogin } from "@/components/AuthLogin";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import "@/landing.css";

const WHATSAPP_NUMBER = "5511976050662";
const whatsappLink = (text: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
const DEMO_LINK = whatsappLink(
  "Olá! Vim pela página do TiNutri Smart Label e quero uma demonstração para a minha cozinha.",
);

/* Exemplos para a etiqueta interativa. São dados ilustrativos, rotulados como tal na página. */
const SAMPLES = [
  { id: "bechamel", product: "Molho bechamel", days: 3, kind: "MANIPULADO", storage: "Refrigerado ≤ 5 °C", inspection: "", lot: "L2410" },
  { id: "frango", product: "Frango desfiado", days: 2, kind: "MANIPULADO", storage: "Refrigerado ≤ 5 °C", inspection: "SIF 4321", lot: "L2411" },
  { id: "massa", product: "Massa de pão de queijo", days: 90, kind: "MANIPULADO", storage: "Congelado ≤ −18 °C", inspection: "", lot: "L2398" },
  { id: "sopa", product: "Sopa de legumes", days: 1, kind: "ABERTO", storage: "Quente ≥ 60 °C", inspection: "", lot: "L2412" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function ThermalLabel({ sampleId, now, qr }: { sampleId: string; now: Date | null; qr: string }) {
  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];
  const expiry = now ? new Date(now.getTime() + sample.days * 86_400_000) : null;
  return (
    <div className="lp-label" role="img" aria-label={`Etiqueta de exemplo: ${sample.product}, validade em ${sample.days} dia${sample.days === 1 ? "" : "s"}`}>
      <div className="lp-label__brand">TiNutri Smart Label®</div>
      <div className="lp-label__kind">{sample.kind}</div>
      <div className="lp-label__product">{sample.product}</div>
      <div className="lp-label__body">
        <div className="lp-label__info">
          <span className="lp-label__k">MANIPULAÇÃO</span>
          <span className="lp-label__v">{now ? `${fmtDate(now)} ${fmtTime(now)}` : "—"}</span>
          <div className="lp-label__val">
            <span className="lp-label__k">VALIDADE</span>
            <strong>{expiry ? `${fmtDate(expiry)}` : "—"}</strong>
          </div>
          <div className="lp-label__meta">
            <div>CONSERVAÇÃO: {sample.storage}</div>
            <div>LOTE: {sample.lot}</div>
            {sample.inspection && <div>{sample.inspection}</div>}
            <div>RESP.: EQUIPE COZINHA</div>
          </div>
        </div>
        <div className="lp-label__qr">
          {qr ? <img src={qr} alt="" width={96} height={96} /> : <span className="lp-label__qr-ph" />}
          <span>RASTREIO</span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const [sampleId, setSampleId] = useState<string>(SAMPLES[0].id);
  const [now, setNow] = useState<Date | null>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    setNow(new Date());
    let alive = true;
    import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL("https://tinutri.com.br", { margin: 0, width: 192, errorCorrectionLevel: "M" }),
      )
      .then((url) => alive && setQr(url))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-wrap lp-hero__grid">
        <div className="lp-hero__copy">
          <h1 id="lp-hero-title">Nada vence sem você ver.</h1>
          <p className="lp-lead">
            Etiquetas térmicas com QR Code e controle de validade PVPS para cozinhas profissionais.
            Emita em segundos, dê baixa pelo celular e mostre tudo na fiscalização.
          </p>
          <div className="lp-actions">
            <a className="lp-btn lp-btn--light" href={DEMO_LINK} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden="true" /> Solicitar demonstração
            </a>
            <a className="lp-btn lp-btn--line" href="#como-funciona">
              Ver como funciona <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <p className="lp-hero__note">
            Feito pela TiNutri, consultoria de alimentos com nutricionistas especialistas em
            vigilância sanitária.
          </p>
        </div>

        <div className="lp-printer" aria-label="Simulação de impressão de etiqueta">
          <fieldset className="lp-picker">
            <legend>Experimente: escolha um produto</legend>
            <div className="lp-picker__row">
              {SAMPLES.map((s) => (
                <label key={s.id} className="lp-chip" data-on={s.id === sampleId}>
                  <input
                    type="radio"
                    name="lp-sample"
                    value={s.id}
                    checked={s.id === sampleId}
                    onChange={() => setSampleId(s.id)}
                  />
                  {s.product}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="lp-slot" aria-hidden="true" />
          <div className="lp-paper">
            <div key={sampleId} className="lp-paper__feed">
              <ThermalLabel sampleId={sampleId} now={now} qr={qr} />
            </div>
          </div>
          <p className="lp-caption" role="status">
            Validade calculada na hora: {sample.days} dia{sample.days === 1 ? "" : "s"} a partir da
            manipulação. Etiqueta de exemplo, com dados ilustrativos.
          </p>
        </div>
      </div>
    </section>
  );
}

const FLOW = [
  { title: "Emitir", text: "Escolha o produto, o responsável e o tipo (manipulado, aberto, fracionado ou recebido). A validade padrão já vem preenchida." },
  { title: "Etiquetar", text: "Imprima uma ou 200 cópias. Cada etiqueta sai com lote, inspeção, conservação e um QR Code só dela." },
  { title: "Controlar", text: "O PVPS ordena tudo pelo que vence primeiro e separa vencidas, vencem hoje, próximas e dentro do prazo." },
  { title: "Dar baixa", text: "Marque como utilizada, consumida ou descartada. O histórico guarda cada passo para a fiscalização." },
];

function Flow() {
  return (
    <section id="como-funciona" className="lp-section" aria-labelledby="lp-flow-title">
      <div className="lp-wrap">
        <h2 id="lp-flow-title" className="lp-h2">Do balcão à fiscalização, em quatro movimentos</h2>
        <ol className="lp-flow">
          {FLOW.map((step, i) => (
            <li key={step.title}>
              <span className="lp-flow__n" aria-hidden="true">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const PVPS = [
  { tone: "expired", label: "Vencidas", time: "Venceu ontem", items: ["Creme de leite fresco", "Peito de frango marinado"] },
  { tone: "today", label: "Vencem hoje", time: "Hoje, 18:00", items: ["Molho bechamel", "Salada de grãos"] },
  { tone: "soon", label: "Próximas", time: "Em 2 dias", items: ["Frango desfiado", "Molho de tomate"] },
  { tone: "later", label: "Dentro do prazo", time: "Em 18 dias", items: ["Massa de pão de queijo", "Calda de caramelo"] },
] as const;

function Pvps() {
  return (
    <section className="lp-section lp-section--tint" aria-labelledby="lp-pvps-title">
      <div className="lp-wrap lp-split">
        <div className="lp-split__lead">
          <h2 id="lp-pvps-title" className="lp-h2">O que vence primeiro, aparece primeiro</h2>
          <p className="lp-copy">
            PVPS é primeiro que vence, primeiro que sai. A tela de validades lê as etiquetas
            confirmadas e organiza a cozinha por urgência, com cor, ícone e texto. Nunca só cor.
          </p>
          <ul className="lp-ticks">
            <li><CheckCircle2 aria-hidden="true" /> Antecedência de alerta de 1 a 90 dias</li>
            <li><CheckCircle2 aria-hidden="true" /> Filtros por empresa, produto e lote</li>
            <li><CheckCircle2 aria-hidden="true" /> Baixa registrada com data e responsável</li>
          </ul>
        </div>
        <div className="lp-pvps" role="img" aria-label="Exemplo da tela de validades PVPS com quatro grupos de urgência">
          <p className="lp-pvps__tag">Tela de validades · exemplo</p>
          {PVPS.map((group) => (
            <div key={group.tone} className={`lp-pvps__group lp-tone-${group.tone}`}>
              <div className="lp-pvps__head">
                <strong>{group.label}</strong>
                <span className="lp-pvps__count">{group.items.length}</span>
              </div>
              {group.items.map((item) => (
                <div key={item} className="lp-pvps__row">
                  <span>{item}</span>
                  <span className="lp-time">{group.time}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Printer, title: "Etiqueta que a vigilância entende", text: "Quatro tipos de etiqueta, cinco presets de conservação (de congelado ≤ −18 °C a quente ≥ 60 °C), lote, alérgenos e inspeção SIF, SISP ou SIM." },
  { icon: QrCode, title: "QR Code em cada etiqueta", text: "Cada unidade tem rastreio próprio. Quem escaneia vê produto, lote, responsável, abertura e validade, sem precisar de login." },
  { icon: History, title: "Histórico, reimpressão e duplicação", text: "Encontre qualquer emissão por produto, responsável, empresa ou data. Reimprima ou duplique para a próxima produção." },
  { icon: BellRing, title: "Alertas de validade no celular", text: "Instale como aplicativo e receba notificações de validade. Funciona no navegador, sem loja de aplicativos." },
  { icon: Camera, title: "Foto do produto", text: "Registre a foto no momento da etiqueta. Elas ficam guardadas em área privada da empresa por 90 dias." },
  { icon: Users, title: "Perfis e permissões", text: "Master, nutricionista, administrador da empresa, gerente e operador. Cada pessoa vê só o que precisa e só da própria empresa." },
  { icon: Smartphone, title: "Feito para a mão na cozinha", text: "Botões grandes, poucos toques e emissão em fila para imprimir lotes. Do celular ao tablet, no balcão ou no estoque." },
  { icon: Moon, title: "Modo noturno", text: "Tela escura para câmaras frias, estoques e turnos da noite." },
];

function Features() {
  return (
    <section id="funcionalidades" className="lp-section" aria-labelledby="lp-feat-title">
      <div className="lp-wrap lp-split lp-split--feat">
        <div className="lp-split__lead lp-sticky">
          <h2 id="lp-feat-title" className="lp-h2">Tudo o que a etiqueta precisa dizer, e o que vem depois dela</h2>
          <p className="lp-copy">Funcionalidades que já estão no sistema hoje.</p>
        </div>
        <ul className="lp-rows">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <f.icon aria-hidden="true" />
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ROLES = [
  { who: "Operador", what: "Emite etiquetas, consulta validades e dá baixa. Só o que a rotina da cozinha pede." },
  { who: "Gerente", what: "Cadastra produtos e equipe, acompanha o painel e o histórico da empresa." },
  { who: "Administrador da empresa", what: "Cuida de toda a operação da própria empresa, com produtos, equipe e configurações." },
  { who: "Nutricionista", what: "Acompanha a carteira de empresas clientes e apoia cada uma com os registros em dia." },
];

function Roles() {
  return (
    <section className="lp-section lp-section--tint" aria-labelledby="lp-roles-title">
      <div className="lp-wrap">
        <h2 id="lp-roles-title" className="lp-h2">Cada pessoa da equipe, com a tela certa</h2>
        <dl className="lp-roles">
          {ROLES.map((r) => (
            <div key={r.who}>
              <dt>{r.who}</dt>
              <dd>{r.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Printers() {
  return (
    <section className="lp-section" aria-labelledby="lp-print-title">
      <div className="lp-wrap lp-split">
        <div className="lp-split__lead">
          <h2 id="lp-print-title" className="lp-h2">Funciona com a impressora térmica que você já tem</h2>
          <p className="lp-copy">
            Etiquetas de 60 × 40 mm ou 50 × 30 mm, impressas pelo navegador. Compatível com
            impressoras NiiMbot, Elgin, Bematech, Zebra, Tomate e Argox. Para NiiMbot, o sistema
            também gera a imagem da etiqueta para enviar pelo aplicativo da impressora.
          </p>
        </div>
        <div className="lp-sizes" aria-label="Tamanhos de etiqueta">
          <div className="lp-size lp-size--a"><span>60 × 40 mm</span></div>
          <div className="lp-size lp-size--b"><span>50 × 30 mm</span></div>
        </div>
      </div>
    </section>
  );
}

function Consultancy() {
  return (
    <section className="lp-consult" aria-labelledby="lp-consult-title">
      <div className="lp-wrap lp-split">
        <div className="lp-split__lead">
          <h2 id="lp-consult-title" className="lp-h2 lp-h2--inv">Criado por quem faz consultoria sanitária todos os dias</h2>
          <p className="lp-copy lp-copy--inv">
            O TiNutri Smart Label nasce da TiNutri, consultoria de alimentos fundada pela
            nutricionista Priscila Santana, com especializações em vigilância sanitária, rotulagem
            nutricional e auditoria de alimentos. A regra da boa prática já está no fluxo, não
            num manual esquecido na gaveta.
          </p>
        </div>
        <ul className="lp-services">
          <li>Ficha técnica e cálculo de custo real</li>
          <li>Manual de Boas Práticas</li>
          <li>POPs e planilhas de controle</li>
          <li>Rotulagem nutricional e informativa</li>
          <li>Layout funcional de cozinhas</li>
          <li>
            <a href="https://tinutri.com.br/" target="_blank" rel="noreferrer">
              Conheça a consultoria <ArrowRight aria-hidden="true" />
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

const FAQ = [
  { q: "Preciso instalar algum programa?", a: "Não. O sistema funciona no navegador do celular, do tablet ou do computador. Se quiser, instale como aplicativo na tela inicial." },
  { q: "Imprime direto por Bluetooth ou Wi-Fi?", a: "Hoje a impressão sai pelo navegador, para qualquer impressora térmica instalada. Para NiiMbot, o sistema gera a imagem da etiqueta para enviar pelo aplicativo da impressora." },
  { q: "O que a fiscalização consegue ver?", a: "Cada etiqueta tem QR Code com a consulta pública e o histórico guarda emissões, reimpressões e baixas. Você mostra o registro em vez de procurar planilhas." },
  { q: "Serve para mais de uma empresa?", a: "Sim. Nutricionistas e consultorias acompanham uma carteira de empresas, e cada empresa vê apenas os próprios dados." },
  { q: "Quanto custa?", a: "Fale com a TiNutri pelo WhatsApp para uma demonstração e uma proposta para o tamanho da sua operação." },
];

function Faq() {
  return (
    <section id="duvidas" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-split lp-split--feat">
        <div className="lp-split__lead">
          <h2 id="lp-faq-title" className="lp-h2">Dúvidas comuns</h2>
        </div>
        <div className="lp-faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <ChevronDown aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SystemLanding({ openLogin = false }: { openLogin?: boolean }) {
  const [loginOpen, setLoginOpen] = useState(openLogin);
  return (
    <div className="lp">
      <a className="lp-skip" href="#conteudo">Ir para o conteúdo</a>
      <header className="lp-top">
        <div className="lp-wrap lp-top__bar">
          <a href="/" className="lp-brand" aria-label="TiNutri Smart Label, página inicial">
            <img src={tinutriLogo} alt="" width={40} height={45} />
            <span>Smart Label<sup aria-hidden="true">®</sup></span>
          </a>
          <nav aria-label="Seções da página" className="lp-nav">
            <a href="#como-funciona">Como funciona</a>
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <div className="lp-top__cta">
            <button type="button" className="lp-link" onClick={() => setLoginOpen(true)}>Entrar</button>
            <a className="lp-btn lp-btn--solid" href={DEMO_LINK} target="_blank" rel="noreferrer">
              Solicitar demonstração
            </a>
          </div>
        </div>
      </header>
      <main id="conteudo">
        <Hero />
        <Flow />
        <Pvps />
        <Features />
        <Roles />
        <Printers />
        <Consultancy />
        <Faq />
        <section className="lp-close" aria-labelledby="lp-close-title">
          <div className="lp-wrap lp-close__inner">
            <ShieldCheck aria-hidden="true" />
            <h2 id="lp-close-title">Leve a validade da sua cozinha para o controle.</h2>
            <p>Peça uma demonstração e veja o sistema funcionando com os produtos da sua operação.</p>
            <a className="lp-btn lp-btn--light" href={DEMO_LINK} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden="true" /> Falar com a TiNutri no WhatsApp
            </a>
          </div>
        </section>
      </main>
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="auth-dialog" aria-describedby={undefined}>
          <AuthLogin modal />
        </DialogContent>
      </Dialog>
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__inner">
          <p>TiNutri · Soluções em consultoria de alimentos</p>
          <p>
            <a href="mailto:contato@tinutri.com.br">contato@tinutri.com.br</a> ·{" "}
            <a href={whatsappLink("Olá!")} target="_blank" rel="noreferrer">(11) 97605-0662</a> ·{" "}
            <a href="https://instagram.com/tinutri.nutricao" target="_blank" rel="noreferrer">@tinutri.nutricao</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
