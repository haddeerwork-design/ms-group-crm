// MS El-brancy Group — service worker.
// It only makes the app installable and shows a friendly page when there is no
// internet. It does NOT cache the app, so every update on the site is seen at once.
const OFFLINE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>No internet</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#1f2937;text-align:center;padding:24px}
button{margin-top:16px;padding:10px 18px;border-radius:10px;border:0;background:#1f5135;color:#fff;font-size:15px}</style></head>
<body><div><h1 style="font-size:20px">No internet connection</h1><p>Check the connection and try again.</p>
<p dir="rtl">مفيش إنترنت دلوقتي. اتأكدي من الاتصال وجربي تاني.</p><button onclick="location.reload()">Try again · جرّبي تاني</button></div></body></html>`

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return // everything else goes straight to the network
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
})
