# Revisão da estação de etiquetagem

As configurações de impressão abrem em modal com rolagem interna, retorno de foco e indicação de salvamento automático neste navegador. A página principal mantém somente um resumo de impressora, tamanho e modo, com o botão Configurações. IP aparece no modo Wi-Fi; orientações Elgin ficam recolhidas. O teste continua disponível, com feedback no modal e download para NiiMbot quando aplicável.

O preenchimento está agrupado em Dados da etiqueta, Validade e conservação e Quantidade e impressão. Cliente, produto e responsável ficam próximos. Catálogos com mais de seis produtos oferecem busca por nome ou categoria no seletor. A empresa, o responsável e as condições preenchidas permanecem disponíveis na sequência de emissão; lote e edição específica são limpos ao adicionar à fila.

A prévia acompanha os campos atuais, mesmo depois de uma impressão anterior. No desktop ela e a fila acompanham a rolagem, com a última etiqueta enviada identificada separadamente. A fila mostra itens, cópias e total do lote. Quantidades rápidas de 1, 5 e 10 etiquetas evitam redigitação.

As ações indicam preparação em andamento e ficam desabilitadas quando faltam dados ou outra operação está em curso. Novos envios e impressão da fila aguardam a confirmação física da impressão anterior. Cada cópia mantém token e QR Code próprios. Uma falha ao confirmar ou rejeitar preserva a confirmação para nova tentativa.

A validade de zero dias é respeitada. Datas temporariamente vazias não derrubam a prévia e impedem o envio; dias e quantidades inválidos também bloqueiam a emissão. Mensagens distinguem resultado e erro. A confirmação física continua obrigatória para entrada no PVPS.

Esta revisão não adiciona transporte direto para Wi-Fi/Bluetooth, integração física com novas impressoras ou persistência remota da fila. A impressão pelo navegador e exportação NiiMbot seguem os mecanismos existentes.

Arquivos: integração e fluxo em `src/routes/index.tsx`, busca em `src/components/EmissionProductPicker.tsx` e estilos `.emit-*` em `src/styles.css`.

Validação com APIs simuladas: larguras de 320, 375, 768 e 1440 px, modal e configurações locais, busca, lote obrigatório, quantidades rápidas, validade de zero dias, datas vazias, guarda de envio, falha de confirmação, atualização da prévia e fila com QR Codes individuais. Não houve envio ao banco remoto nem ensaio em impressora física.
