self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

const ch = new BroadcastChannel("finance-events");
ch.onmessage = async (e) => {
  const { title, body, data } = e.data || {};
  if (!title) return;
  await self.registration.showNotification(title, { body: body || "", data: data || {} });
};

self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data.json(); } catch {}
  const title = p.title || "Обновление";
  const body  = p.body  || "";
  e.waitUntil(self.registration.showNotification(title, { body, data: p.data || {} }));
});
