# Saldar Nube: crear el servicio en Cloudflare (gratis, ~5 minutos)

1. Entra a https://dash.cloudflare.com y crea una cuenta gratuita (o inicia sesión).
2. Menú **Storage & Databases > KV** > **Create** (crear un espacio). Nómbralo `saldar-datos`.
3. Menú **Compute (Workers) > Workers & Pages > Create > Create Worker**. Nómbralo `saldar-nube` y toca **Deploy**.
4. Toca **Edit code**, borra todo lo que haya, pega el contenido de `nube/worker.js` y toca **Deploy**.
5. En el Worker: **Settings > Bindings > Add > KV namespace**. Variable name: `SALDAR` (en mayúsculas, exacto). Namespace: `saldar-datos`. Guarda.
6. Copia la dirección del Worker (algo como `https://saldar-nube.tu-usuario.workers.dev`). Al abrirla debe mostrar `{"ok":true,"servicio":"saldar-nube"}`.
7. En Saldar: **Ajustes > Nube > Conectar la nube**. Pega la dirección y escribe una contraseña larga (mínimo 12 caracteres, distinta del PIN).
8. En el computador: abre Saldar, crea un perfil, ve a **Ajustes > Nube > Conectar** con la MISMA dirección y contraseña. Se descargan tus datos.

Notas
- El servidor solo guarda datos cifrados. Sin tu contraseña larga nadie puede leerlos, tampoco Cloudflare ni yo.
- Si olvidas la contraseña larga, la copia de la nube no se recupera. Tu teléfono y los respaldos con PIN siguen funcionando.
- El plan gratuito alcanza de sobra (miles de lecturas y cientos de escrituras al día).
