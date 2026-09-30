# Fresh Label

Crie um aplicativo web responsivo chamado TiNutri Smart Label®, destinado à emissão de etiquetas térmicas para identificação e validade de alimentos após abertura, conforme RDC 216, CVS-5 e demais legislações aplicáveis.

O objetivo do sistema é substituir as etiquetas preenchidas manualmente, reduzindo falhas operacionais, economizando tempo e padronizando as informações.

O sistema deve ser extremamente simples, intuitivo e pensado para restaurantes, padarias, supermercados, açougues, cozinhas industriais e serviços de alimentação.

Não criar dashboards complexos, gráficos, controle de perdas ou relatórios financeiros nesta primeira versão.

PERFIS DE USUÁRIOS

Administrador TiNutri

O administrador deverá ter acesso para:

Cadastrar clientes;

Editar clientes;

Cadastrar produtos individualmente para cada cliente;

Cadastrar colaboradores por cliente;

Alterar informações dos produtos;

Excluir produtos;

Visualizar histórico de etiquetas emitidas;

Configurar o layout da etiqueta.

Operador / Colaborador

O operador deverá ter acesso apenas à emissão das etiquetas.

Ele não poderá editar produtos, clientes ou configurações.

BASE PERSONALIZADA POR CLIENTE

Cada cliente deve possuir sua própria base de produtos e colaboradores.

Exemplo:

Cliente: Padaria X

Produtos:

Presunto

Mussarela

Catupiry

Azeitona

Molho inglês

Colaboradores:

João

Maria

Carlos

Os produtos e colaboradores não devem ser compartilhados entre clientes.

CADASTRO DE PRODUTOS

Cada produto deverá possuir:

Nome do produto;

Categoria;

Quantidade de dias de validade após abertura;

Necessita lote? (Sim ou Não);

Necessita SIF/SISP/SIM? (Sim ou Não);

Número do SIF/SISP/SIM, quando aplicável;

Observações opcionais.

Exemplo:

Produto: Presunto

Validade após aberto: 3 dias

Necessita lote: Sim

Necessita SIF: Sim

Número do SIF: 1234

TELA PRINCIPAL DO COLABORADOR

A tela deverá ser extremamente simples e otimizada para celular e tablet.

Campos:

Cliente;

Produto;

Data de abertura;

Número do lote (apenas quando obrigatório);

Responsável (lista de colaboradores cadastrados).

Botão:

Emitir Etiqueta

REGRAS AUTOMÁTICAS

Ao selecionar o produto, o sistema deverá buscar automaticamente as informações cadastradas.

Exemplo:

Produto: Presunto

Validade após aberto: 3 dias

Data de abertura: 13/06/2026

O sistema deverá calcular automaticamente:

Validade: 16/06/2026

Caso o produto exija lote e o campo esteja vazio, bloquear a impressão e apresentar a mensagem:

“Este produto exige número de lote.”

Caso o produto exija SIF/SISP/SIM, inserir automaticamente o número cadastrado.

MODELO DE ETIQUETA

A etiqueta deverá ter tamanho de impressão de 60 mm x 40 mm.

O layout deverá conter o logo da TiNutri no topo, em tamanho pequeno.

Modelo:



TiNutri Smart Label®

PRODUTO: PRESUNTO

ABERTO EM: 13/06/2026

VALIDADE: 16/06/2026

LOTE: 4587

SIF/SISP/SIM: 1234

RESPONSÁVEL: JOÃO

EMITIDO EM: 13/06/2026

HORÁRIO: 13:45



A etiqueta deve ser legível e adequada para impressão em impressoras térmicas.

DESIGN DO SISTEMA

O sistema deve possuir:

Interface moderna;

Design limpo;

Botões grandes;

Poucos cliques;

Fácil utilização por manipuladores de alimentos;

Compatibilidade com celular, tablet e computador;

Navegação simples.

BANCO DE DADOS

Utilizar Supabase.

Criar as seguintes tabelas:

Clientes

ID

Nome do cliente

Produtos

ID

Cliente

Nome do produto

Categoria

Validade após aberto

Exige lote

Exige SIF/SISP/SIM

Número SIF/SISP/SIM

Observações

Colaboradores

ID

Cliente

Nome do colaborador

Etiquetas Emitidas

Data

Horário

Cliente

Produto

Responsável

Lote

Data de abertura

Data de validade

IMPRESSÃO

Criar botão:

Emitir Etiqueta

Ao clicar, gerar automaticamente uma etiqueta pronta para impressão térmica em 60 mm x 40 mm.

Preparar o sistema para futura integração com impressoras Zebra, Tomate e outras impressoras térmicas Bluetooth.

EXPANSÕES FUTURAS

Preparar a estrutura para permitir no futuro:

Leitura de código de barras;

Reconhecimento por voz;

Inteligência artificial;

QR Code;

Rastreabilidade;

Integração com FoodChecker;

Histórico avançado.

Essas funções não devem ser implementadas nesta primeira versão.

MODELO DE NEGÓCIO

O TiNutri Smart Label® será um produto complementar da consultoria TiNutri.

Mensalidade inicial:

R$ 59,90 por cliente.

O foco da primeira versão é:

Cliente → Produto cadastrado → Colaborador seleciona → Sistema calcula a validade automaticamente → Impressão da etiqueta.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tinutri-smart-label.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6483cf9d-74fc-4044-ac60-a25e29ceb5a5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
