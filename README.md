# Pokédex (DE) – Web App

## Schnellstart (lokal)
1. Node.js 18+ installieren
2. Im Ordner:
   ```bash
   npm install
   npm run dev
   ```
3. Browser öffnen: http://localhost:5173

> Styling läuft über **Tailwind Play CDN** (in `index.html`), daher keine extra Config nötig.

## Deploy-Option 1: **Vercel** (empfohlen)
1. Dieses Projekt in ein **Git-Repo** pushen (GitHub/GitLab/Bitbucket).
2. Auf https://vercel.com einloggen → **Add New Project** → Repo auswählen.
3. Framework Preset: **Vite** (wird automatisch erkannt)  
   - Build Command: `npm run build`  
   - Output Directory: `dist`
4. Deploy klicken. Fertig.

## Deploy-Option 2: **GitHub Pages**
**Variante A: User/Org Page (ohne Unterpfad)**
1. Repo `username.github.io` anlegen, Code pushen.
2. GitHub → Settings → Pages → Deploy from branch → `gh-pages` branch (wir erstellen ihn per Action).
3. Workflow hinzufügen (optional) **oder** lokal bauen und das `dist/` in den gh-pages Branch schieben.

**Variante B: Projekt-Page (unterpfad z.B. /pokedex/)**
1. In `vite.config.js` `base: '/pokedex/'` setzen.
2. `npm run build` → Inhalt aus `dist/` in `gh-pages` Branch deployen.
3. GitHub Pages auf `gh-pages` Branch konfigurieren.

### Minimaler `vite.config.js` (nur falls Unterpfad nötig)
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], base: '/pokedex/' })
```

## Hinweise
- Beim ersten Laden: **Schnell** oder **Ultra** klicken für sofortige Anzeige (EN) + schnelles Nachladen (DE).
- Besitzstatus & Namen werden im Browser gespeichert (`localStorage`).

