/* Service worker do TiNutri: recebe os avisos de validade (push) e abre o app ao tocar neles.
   Não guarda páginas em cache: o app continua sempre online e atualizado. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "TiNutri · Validades";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Há etiquetas que precisam de atenção.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Mesma tag: o aviso novo substitui o anterior em vez de empilhar, e renotify faz tocar de novo.
      tag: data.tag || "tinutri-alertas",
      renotify: true,
      requireInteraction: data.urgent === true,
      data: { url: data.url || "/?painel=validades" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then(() => ("navigate" in client ? client.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
