import React, { useEffect, useMemo, useRef, useState } from "react";

// ------------------------------------------------------------
// Pokédex (DE) – Single-file React App (Ultra-Schnell-Version)
// - Sofortiges Listing mit EN-Namen (Bulk-Fetch) + progressive DE-Überschreibung
// - Optional: Ultra-Loader via Web Worker + hoher Parallelismus
// - Cacht alles lokal, Karten-Drawer bleibt erhalten (TCG API)
// ------------------------------------------------------------

// LocalStorage Keys
const LS_KEY_DE_NAMES = "pokedex_de_names_v3"; // Struktur: { id: {de,en} }
const LS_KEY_OWNERSHIP = "pokedex_ownership_v1";
const MAX_ID = 1025; // Gen 1–9
const TCG_ENDPOINT = "https://api.pokemontcg.io/v2/cards";

// Helpers ------------------------------------------------------
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchNames(id, signal) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const deName = data.names?.find((n) => n.language?.name === "de");
  const de = deName?.name || data.name;
  const en = data.name;
  return { de, en };
}

async function fetchEnglishSpeciesList() {
  // Holt 1x alle Species (englische Namen) – extrem schnell
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species?limit=${MAX_ID}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // results sind in Dex-Reihenfolge; id = index+1
  const map = {};
  (data.results || []).forEach((r, i) => {
    const id = i + 1;
    if (id <= MAX_ID) map[id] = { de: `#${String(id).padStart(4, "0")}`, en: r.name };
  });
  return map;
}

function loadCachedNames() {
  try {
    const raw = localStorage.getItem(LS_KEY_DE_NAMES);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Object.keys(parsed).length < 50) return null;
    return parsed; // { id: { de, en } }
  } catch (e) {
    return null;
  }
}

function saveCachedNames(map) {
  localStorage.setItem(LS_KEY_DE_NAMES, JSON.stringify(map));
}

function loadOwnership() {
  try {
    const raw = localStorage.getItem(LS_KEY_OWNERSHIP);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

function saveOwnership(map) {
  localStorage.setItem(LS_KEY_OWNERSHIP, JSON.stringify(map));
}

function dexImageUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

// --- Pokémon TCG API Helpers -------------------------------------------------
async function fetchCardsByPokemonName(enName) {
  const q = encodeURIComponent(`name:\"${enName}\"`);
  const url = `${TCG_ENDPOINT}?q=${q}&orderBy=set.releaseDate,number&select=name,rarity,subtypes,images,tcgplayer,number,set,artist,foreignData`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TCG HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

function cardHasHoloInfo(card) {
  const prices = card?.tcgplayer?.prices || {};
  return Boolean(prices.holofoil || prices.reverseHolofoil || prices.normal || prices.firstEditionHolofoil);
}

function detectTags(card) {
  const out = new Set();
  const r = (card.rarity || "").toLowerCase();
  const st = (card.subtypes || []).map((s) => s.toLowerCase());
  if (r.includes("holo")) out.add("Holo");
  if (r.includes("reverse")) out.add("Reverse Holo");
  if (st.includes("v")) out.add("V");
  if (st.includes("vmax")) out.add("VMAX");
  if (st.includes("ex")) out.add("ex");
  if (st.includes("gx")) out.add("GX");
  if (r.includes("full art")) out.add("Full Art");
  if (r.includes("illustration")) out.add("Illustration Rare");
  if (r.includes("secret")) out.add("Secret Rare");
  if (cardHasHoloInfo(card) && !out.size) out.add("Variante");
  return Array.from(out);
}

// UI Components --------------------------------------------------------------
function TopBar({ hasCache, isLoading, progress, onLoadAll, onLoadAllFast, onUltraLoad, onClearCache, onResetFilters }) {
  return (
    <div className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-neutral-900/70 border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <span className="text-xl font-semibold">Pokédex (DE)</span>
        <div className="ml-auto flex items-center gap-2">
          {!hasCache && !isLoading && (
            <div className="flex items-center gap-2">
              <button onClick={onLoadAll} className="px-3 py-1.5 rounded-2xl bg-neutral-900 text-white text-sm shadow">Langsam</button>
              <button onClick={onLoadAllFast} className="px-3 py-1.5 rounded-2xl bg-neutral-700 text-white text-sm shadow">Schnell</button>
              <button onClick={onUltraLoad} className="px-3 py-1.5 rounded-2xl bg-neutral-600 text-white text-sm shadow" title="Web‑Worker, hohe Parallelität">Ultra</button>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-40 h-2 rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full bg-neutral-900 dark:bg-white transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
          )}
          <button onClick={onResetFilters} className="px-3 py-1.5 rounded-2xl border text-sm" title="Suche & Filter zurücksetzen">Zurücksetzen</button>
          <button onClick={onClearCache} className="px-3 py-1.5 rounded-2xl border text-sm" title="Gespeicherte Namen und Besitzstatus löschen">Cache leeren</button>
        </div>
      </div>
    </div>
  );
}

function SearchBar({ query, setQuery, onlyOwned, setOnlyOwned }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row gap-3 md:items-center">
      <input placeholder="Suche nach Nummer (#25) oder Namen (Pikachu)…" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 px-4 py-3 rounded-2xl border shadow-sm focus:outline-none" />
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} />
        Nur besessene anzeigen
      </label>
    </div>
  );
}

function PokeCard({ id, name, owned, onToggleOwned, onOpenCards }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="group bg-white dark:bg-neutral-900 rounded-2xl border hover:shadow-md transition overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <button onClick={() => onOpenCards?.(id)} className="w-20 h-20 shrink-0 rounded-xl bg-neutral-50 dark:bg-neutral-800 grid place-items-center overflow-hidden focus:outline-none">
          {imgOk ? (
            <img src={dexImageUrl(id)} alt={name.de} className="w-full h-full object-contain" onError={() => setImgOk(false)} loading="lazy" />
          ) : (
            <div className="text-xs text-neutral-500">kein Bild</div>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate">
              <div className="text-xs text-neutral-500">#{id.toString().padStart(4, "0")}</div>
              <div className="font-semibold truncate">{name.de} <span className="text-neutral-400 text-xs">({name.en})</span></div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onOpenCards?.(id)} className="px-3 py-1.5 rounded-2xl text-sm border">Karten</button>
              <button onClick={() => onToggleOwned(id)} className={`px-3 py-1.5 rounded-2xl text-sm border shrink-0 ${owned ? "bg-emerald-600 text-white border-emerald-600" : ""}`}>{owned ? "Besitze ich" : "Nicht im Besitz"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardsDrawer({ id, name, loading, cards, filter, setFilter, onClose }) {
  const filters = ["Alle", "Holo", "Reverse Holo", "Full Art", "V", "VMAX", "ex", "GX", "Illustration Rare", "Secret Rare", "Variante"];
  const filtered = React.useMemo(() => {
    if (filter === "Alle") return cards;
    return cards.filter((c) => detectTags(c).includes(filter));
  }, [cards, filter]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[720px] bg-white dark:bg-neutral-950 shadow-xl flex flex-col">
        <div className="p-4 border-b flex items-center gap-3">
          <button onClick={onClose} className="px-3 py-1.5 rounded-2xl border text-sm">Schließen</button>
          <div className="ml-2 font-semibold truncate">#{id?.toString().padStart(4, "0")} – {name?.de} <span className="text-neutral-400 text-xs">({name?.en})</span></div>
          <div className="ml-auto text-sm text-neutral-500">{loading ? "lädt…" : `${cards.length} Karten`}</div>
        </div>

        <div className="p-4 border-b flex flex-wrap gap-2">
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-2xl border text-sm ${filter===f?"bg-neutral-900 text-white dark:bg-white dark:text-neutral-900":""}`}>{f}</button>
          ))}
        </div>

        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto">
          {loading && (
            <div className="col-span-full text-sm text-neutral-500">Karten werden geladen…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full text-sm text-neutral-500">Keine Karten zu diesem Filter gefunden.</div>
          )}
          {filtered.map((c) => (
            <a key={`${c.set?.id}-${c.number}-${c.name}`} href={c.images?.large || c.images?.small} target="_blank" rel="noreferrer" className="group block border rounded-xl overflow-hidden hover:shadow">
              <div className="aspect-[3/4] bg-neutral-100 dark:bg-neutral-900 grid place-items-center overflow-hidden">
                <img src={c.images?.small} alt={c.name} loading="lazy" className="w-full h-full object-contain" />
              </div>
              <div className="p-2">
                <div className="text-xs text-neutral-500 truncate">{c.set?.name} · #{c.number}</div>
                <div className="text-sm font-medium truncate">{(c.foreignData?.find?.((fd)=>fd.language==="German")?.name) || c.name}</div>
                <div className="text-xs text-neutral-500 truncate">{[c.rarity, ...(detectTags(c))].filter(Boolean).join(" · ")}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// Haupt-Component ------------------------------------------------------------
export default function App() {
  const [names, setNames] = useState(() => loadCachedNames()); // { id: { de, en } }
  const [ownership, setOwnership] = useState(() => loadOwnership()); // { id: true }
  const [query, setQuery] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef({ aborted: false });

  // Karten-Drawer
  const [cardsOpenFor, setCardsOpenFor] = useState(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cards, setCards] = useState([]);
  const [cardFilter, setCardFilter] = useState("Alle");

  useEffect(() => () => { abortRef.current.aborted = true; }, []);

  const hasCache = !!names;

  // Sofortiges Listing: EN-Bulk + progressive DE
  async function fastPrimeEnglishThenGerman() {
    if (loading) return;
    setLoading(true);
    setProgress(0);
    try {
      // 1) Sofort EN-Liste holen (ein Request)
      const enMap = await fetchEnglishSpeciesList();
      setNames((prev) => {
        const base = prev ? { ...enMap, ...prev } : enMap; // vorhandene DE überschreiben EN
        saveCachedNames(base);
        return { ...base };
      });
      setProgress(0.1);

      // 2) Parallel DE-Namen nachziehen (concurrency angepasst an CPU)
      const CONC = Math.min(48, (navigator.hardwareConcurrency || 8) * 2);
      const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1).filter((id) => !names?.[id] || names[id].de.startsWith("#"));
      let done = 0;
      let mapRef = { ...(names || {}), ...enMap };

      const worker = async (queue) => {
        while (queue.length && !abortRef.current.aborted) {
          const id = queue.pop();
          try {
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), 10000);
            const nm = await fetchNames(id, controller.signal);
            clearTimeout(to);
            mapRef[id] = nm;
          } catch {
            // weglassen – EN bleibt als Platzhalter
          } finally {
            done++;
            if (done % 20 === 0) {
              setProgress((p) => Math.min(0.1 + (done / ids.length) * 0.9, 1));
            }
          }
        }
      };

      const queue = ids.slice();
      const tasks = Array.from({ length: CONC }, () => worker(queue));
      await Promise.all(tasks);
      saveCachedNames(mapRef);
      setNames({ ...mapRef });
      setProgress(1);
    } finally {
      setLoading(false);
    }
  }

  // Klassischer Loader (seriell)
  async function loadAllGermanNames() {
    if (loading) return;
    setLoading(true);
    setProgress(0);
    abortRef.current.aborted = false;
    const map = names ? { ...names } : {};
    try {
      for (let id = 1; id <= MAX_ID; id++) {
        if (!map[id]) {
          try { map[id] = await fetchNames(id); } catch { map[id] = { de: `Pokemon ${id}`, en: `pokemon-${id}` }; }
        }
        if (id % 25 === 0) setProgress(id / MAX_ID);
      }
      saveCachedNames(map);
      setNames({ ...map });
      setProgress(1);
    } finally { setLoading(false); }
  }

  // Ultra-Loader via Web Worker (max Performance + UI butterweich)
  async function ultraWorkerLoad() {
    if (loading) return;
    setLoading(true);
    setProgress(0);
    const WORKER_SRC = `self.onmessage = async (e) => {
      const MAX_ID = ${MAX_ID};
      const conc = Math.min(64, (e.data && e.data.conc) || 32);
      const ids = Array.from({length: MAX_ID}, (_,i)=>i+1);
      let completed = 0;
      async function fetchNames(id, signal){
        const res = await fetch('https://pokeapi.co/api/v2/pokemon-species/'+id+'/', {signal});
        if(!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        const deObj = (data.names||[]).find(n=>n.language?.name==='de');
        const de = (deObj && deObj.name) || data.name;
        const en = data.name;
        return {de,en};
      }
      const queue = ids.slice();
      const out = {};
      async function worker(){
        while(queue.length){
          const id = queue.pop();
          try{
            const c = new AbortController();
            const t = setTimeout(()=>c.abort(),10000);
            const nm = await fetchNames(id, c.signal);
            clearTimeout(t);
            out[id]=nm;
          }catch{}
          completed++;
          if(completed % 16 === 0){ postMessage({type:'progress', completed}); }
        }
      }
      await Promise.all(Array.from({length: conc}, worker));
      postMessage({type:'done', out});
    }`;

    const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    const conc = Math.min(64, (navigator.hardwareConcurrency || 8) * 2);

    const map = names ? { ...names } : {};
    w.onmessage = (ev) => {
      if (ev.data?.type === 'progress') {
        setProgress(ev.data.completed / MAX_ID);
      } else if (ev.data?.type === 'done') {
        Object.assign(map, ev.data.out);
        saveCachedNames(map);
        setNames({ ...map });
        setProgress(1);
        setLoading(false);
        w.terminate();
        URL.revokeObjectURL(url);
      }
    };
    w.postMessage({ conc });
  }

  // Karten-Handling
  async function openCardsFor(id) {
    if (!names?.[id]?.en) return;
    setCardsOpenFor(id);
    setCardsLoading(true);
    try {
      const data = await fetchCardsByPokemonName(names[id].en);
      setCards(data);
    } catch {
      setCards([]);
    } finally {
      setCardsLoading(false);
    }
  }

  const list = useMemo(() => {
    const out = [];
    for (let id = 1; id <= MAX_ID; id++) {
      const nm = names?.[id] || { de: `#${id}`, en: `pokemon-${id}` };
      out.push({ id, name: nm, owned: !!ownership[id] });
    }
    return out;
  }, [names, ownership]);

  const filtered = useMemo(() => {
    let q = query.trim().toLowerCase();
    let arr = list;
    if (q) {
      if (q.startsWith("#")) q = q.slice(1);
      const num = Number(q);
      if (!Number.isNaN(num)) arr = arr.filter((p) => p.id === num);
      else arr = arr.filter((p) => p.name.de.toLowerCase().includes(q) || p.name.en.toLowerCase().includes(q));
    }
    if (onlyOwned) arr = arr.filter((p) => p.owned);
    return arr;
  }, [list, query, onlyOwned]);

  const ownedCount = useMemo(() => Object.values(ownership).filter(Boolean).length, [ownership]);

  function clearCache() {
    if (!confirm("Gespeicherte Namen UND Besitzstatus wirklich löschen?")) return;
    localStorage.removeItem(LS_KEY_DE_NAMES);
    localStorage.removeItem(LS_KEY_OWNERSHIP);
    setNames(null);
    setOwnership({});
    setQuery("");
    setOnlyOwned(false);
    setProgress(0);
  }

  function toggleOwned(id) {
    const next = { ...ownership, [id]: !ownership[id] };
    setOwnership(next);
    saveOwnership(next);
  }

  function resetFilters() {
    setQuery("");
    setOnlyOwned(false);
    setCardFilter("Alle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
      <TopBar
        hasCache={!!names}
        isLoading={loading}
        progress={progress}
        onLoadAll={loadAllGermanNames}
        onLoadAllFast={fastPrimeEnglishThenGerman}
        onUltraLoad={ultraWorkerLoad}
        onClearCache={clearCache}
        onResetFilters={resetFilters}
      />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">Dein Pokédex</div>
            <div className="text-sm text-neutral-500">
              {names
                ? "EN sofort, DE lädt im Hintergrund (Schnell/Ultra). Tippe auf ein Pokémon, um alle Karten zu sehen."
                : "Klicke oben auf Schnell/Ultra für den Turbo-Start (EN sofort, DE folgt)."}
            </div>
          </div>
          <div className="text-sm">Besitz: {ownedCount} / {MAX_ID}</div>
        </div>

        <SearchBar query={query} setQuery={setQuery} onlyOwned={onlyOwned} setOnlyOwned={setOnlyOwned} />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <PokeCard key={p.id} id={p.id} name={p.name} owned={p.owned} onToggleOwned={toggleOwned} onOpenCards={(id) => openCardsFor(id)} />
          ))}
        </div>

        <footer className="py-12 text-center text-xs text-neutral-500">
          <div>Quellen: PokéAPI (Namen, Artworks) · Pokémon TCG API (Karten). Wird im Browser gecacht.</div>
          <div className="mt-1">Hinweis: „Ultra“ nutzt einen Web‑Worker und max. Parallelität.</div>
        </footer>

        {cardsOpenFor && (
          <CardsDrawer id={cardsOpenFor} name={names?.[cardsOpenFor]} loading={cardsLoading} cards={cards} filter={cardFilter} setFilter={setCardFilter} onClose={() => setCardsOpenFor(null)} />
        )}
      </div>
    </div>
  );
}
