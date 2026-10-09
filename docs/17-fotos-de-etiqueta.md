# Fotos de etiqueta

Foto opcional do produto na emissão, como evidência para auditoria (estado do produto, embalagem, lote).

## Como funciona

1. Na emissão, o campo **Foto do produto** abre a câmera traseira no celular. A imagem é reduzida no aparelho (até 1280 px, WebP ou JPEG, ~100–200 KB).
2. Ao adicionar à fila ou imprimir, a foto sobe para o bucket privado `label-photos`, em `{id-da-empresa}/{uuid}.webp`. Se o envio falhar, nada é emitido.
3. As etiquetas do item guardam o caminho em `issued_labels.photo_path`. Todas as cópias do mesmo item compartilham o arquivo.
4. Os detalhes da etiqueta mostram a foto por link temporário de 5 minutos. Nada é público.

## Acesso

- Quem enxerga a empresa (`private.user_can_access_client`) vê e envia as fotos dela. Envio exige empresa operacional.
- Usuários não alteram nem apagam fotos: é evidência.
- Limite de 2 MB por arquivo, só JPEG e WebP.

## Retenção

- A Edge Function `purge-label-photos` apaga do Storage as fotos com **mais de 90 dias**, referenciadas ou não (isso também limpa fotos de emissões abandonadas).
- Roda todo dia às 06:00 UTC (03:00 de Brasília) pelo job `tinutri-limpeza-fotos`, protegida por `CRON_SECRET` (o mesmo da função de alertas).
- A etiqueta mantém o caminho; a tela avisa que a foto não está mais disponível.
- Para mudar o prazo: `RETENTION_DAYS` em `supabase/functions/purge-label-photos/index.ts` (mínimo de 30 dias na função `label_photos_to_purge`) e republicar a função.
- Para pausar: `select cron.unschedule('tinutri-limpeza-fotos');`
- Apagar por SQL em `storage.objects` **não** remove o arquivo de verdade: use sempre a função ou a API do Storage.
