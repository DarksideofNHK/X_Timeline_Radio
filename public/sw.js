// このService Workerは自分自身を解除し、キャッシュをクリアします
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // 全キャッシュを削除
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      }),
      // 自分自身を解除
      self.registration.unregister(),
    ]).then(() => {
      // ページをリロードして新しいバージョンを読み込む
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
    })
  );
});
