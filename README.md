# Helion

Simulador de gravedad orbital. Arrastra mundos, traza órbitas y cumple contratos.

## Publicar en Cloudflare Pages

El código ya está preparado: cuando Cloudflare construye el proyecto usa el preset de Pages automáticamente.

1. Entra en [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Autoriza GitHub y elige el repositorio **helion**.
3. Ajustes de build:
   - **Framework preset:** ninguno / Nitro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** `22`
4. **Save and Deploy**.

La URL quedará en `https://helion.<tu-cuenta>.pages.dev`. Luego puedes colgar un dominio propio en **Custom domains**.

Cada push a `main` vuelve a publicar el sitio.

## Local

```bash
npm install
npm run dev
```
