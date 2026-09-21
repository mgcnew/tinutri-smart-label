# Controle de validades por PVPS — TiNutri Smart Label®

## 1. Como o sistema funciona hoje

- **Master**: painel próprio com empresas, usuários, papéis (Master, Nutricionista, Admin cliente, Gerente, Operador) e estatísticas.
- **Clientes / Produtos / Colaboradores**: cadastros já existentes, sempre vinculados a uma empresa; cada produto tem prazo de validade em dias, exigência de lote e de inspeção.
- **Emitir etiqueta**: escolhe cliente, produto, responsável, tipo, conservação, setor, lote, quantidade; dá para revisar antes e montar uma fila com várias etiquetas.
- **Impressão**: cada cópia vira uma etiqueta física com QR Code próprio; sai pela janela de impressão do computador (60 × 40 mm, sem margens) ou como imagem no modo NiiMbot.
- **Histórico**: lista as emissões com busca, reimprimir e duplicar.
- **Consulta pública**: o QR Code abre uma página com produto, validade e situação da etiqueta.

## 2. O que precisa mudar

1. **A baixa acontece cedo demais.** Hoje a etiqueta é gravada assim que a impressão é disparada — mesmo se o papel travar ou a pessoa cancelar. Falta o passo "a impressão saiu certa?".
2. **Não existe painel de validades.** O histórico é por data de emissão, não por vencimento; não há separação vencidos / vencem hoje / próximos.
3. **Reimpressão não é distinguida.** Reimprimir hoje não gera nenhum registro; também não pode gerar uma segunda baixa.
4. **Antecedência de aviso não é configurável.**
5. **Elgin L42 Pro Full**: falta um teste claro de uma etiqueta só e as orientações de térmica direta / sem ribbon.
6. **iPhone**: falta explicar que preparar no celular funciona, imprimir direto na Elgin não.

## 3. O que será implementado

### Painel "Validades" (PVPS)
Nova aba, ordenada do vencimento mais próximo para o mais distante, em três blocos: **Vencidos**, **Vencem hoje**, **Próximos de vencer**. Filtros por cliente e por produto, busca por lote. Só entram etiquetas com impressão confirmada e ainda ativas. Cada linha permite dar baixa (utilizada, consumida, descartada) com registro de quem fez.

A antecedência de "próximos de vencer" vira uma configuração por empresa (padrão 3 dias), editável em Configurações.

### Confirmação de impressão
Ao mandar imprimir, as etiquetas ficam **preparadas** e aparece uma confirmação: "A impressão saiu correta?" → **Sim** confirma a saída e ela entra no painel de validades; **Não / cancelar** marca como falha e nada é dado baixa. Fechar a tela sem responder mantém como preparada (não conta). Nenhuma etiqueta preparada ou com falha aparece no painel.

### Reimpressão sem baixa duplicada
Reimprimir usa a etiqueta já existente, mantém o mesmo QR Code e **não cria nova saída** — apenas grava o evento de reimpressão no histórico, com data, usuário e quantidade.

### Histórico de eventos
Cada etiqueta passa a ter uma linha do tempo: emissão → confirmação ou falha → reimpressões → baixa. Visível no histórico e filtrada pela empresa do usuário.

### Impressão Elgin L42 Pro Full
- Botão **"Imprimir 1 etiqueta de teste"** que envia exatamente uma etiqueta no tamanho escolhido.
- Impressão sem margens e sem redimensionamento, no tamanho exato (prioridade 60 × 40 mm); a janela de impressão do Windows permite escolher a Elgin.
- Bloco de orientações: no driver/utilitário da Elgin definir **Térmica direta / sem ribbon**, tamanho 60 × 40 mm, escala 100% e margens zero — deixando claro que essa configuração é feita no computador, não pelo site.

### Celular
Criação e consulta continuam no iPhone. Aviso explícito de que imprimir direto na Elgin pelo iPhone exige integração compatível (não disponível hoje): prepare no celular, imprima pelo computador ligado à impressora.

### Segurança
Tudo separado por empresa nas regras do banco; Master vê todas, demais só a própria. Nenhuma senha em tela ou no código.

## 4. Detalhes técnicos

- Migração: `issued_labels` ganha `print_status` (preparada | confirmada | falha | cancelada), `confirmed_at`, `confirmed_by`, `reprint_count`, `source_label_id`; nova tabela `label_events` (etiqueta, tipo do evento, usuário, quantidade, metadados) com GRANTs e RLS por `user_can_access_client`; `label_settings` ganha `expiry_alert_days` (padrão 3).
- Registros existentes recebem `print_status = 'confirmada'` no backfill, para não sumirem do painel.
- Painel lê `issued_labels` com `print_status='confirmada'` e `label_status='ativa'`, ordenado por `expires_at`.
- Reimpressão grava em `label_events` e incrementa `reprint_count`; nunca insere linha nova.

## 5. Testes que farei aqui

Avanço de uma etiqueta, teste de impressão de uma etiqueta, confirmação de saída, falha sem baixa, reimpressão sem baixa duplicada e atualização do painel. O comportamento físico da Elgin (qualidade, alinhamento, térmica direta) só pode ser conferido com a impressora ligada.
