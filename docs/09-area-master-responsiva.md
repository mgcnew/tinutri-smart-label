# Responsividade da Área Master

As quatro seções — Empresas, Usuários, Carteira e Atividades — usam navegação em duas colunas no celular e quatro a partir de 640 px, com indicação acessível da seção selecionada e botões de pelo menos 44 px.

Os indicadores usam duas colunas em telas menores e quatro no desktop. Formulários passam de uma para duas e três colunas conforme o espaço disponível; campos e selects têm largura limitada ao contêiner. No celular, os campos usam fonte de 16 px e as ações principais ocupam a largura disponível.

Tabelas de empresas, usuários e atividades se apresentam como cards abaixo de 1024 px. Cada campo mantém sua identificação, sem esconder informações ou depender de rolagem horizontal. Nomes, e-mails e eventos extensos podem quebrar linha. Cabeçalhos e legendas das tabelas permanecem na estrutura acessível.

Na Carteira, os seletores e a ação de vínculo se reorganizam conforme a largura. Nomes de empresas quebram linha e a ação de remover permanece acessível. O QR Code continua disponível nos registros de empresas.

Arquivos: `src/routes/admin.tsx` e estilos locais `.master-*` em `src/styles.css`. A alteração mantém as funções existentes de cadastro, status, usuários, vínculos e auditoria.

Validação: TypeScript, lint do arquivo e compilação. As quatro abas foram exercitadas no navegador em 320, 375, 768, 1024 e 1440 px, com textos extensos, edição de empresa, abertura de QR Code, mudança de perfil de usuário e seleção de vínculos, sem rolagem horizontal. Os ensaios usam dados simulados; não alteram cadastros no banco remoto.
