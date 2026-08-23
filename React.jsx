import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { exportExcel, exportWord, exportPowerPoint } from "./exporters.js";
import { isLocalModel } from "./src/settings/localProof.js";
import { DEFAULT_PREFS, loadPrefs, directionColor, directionGlyph, notifyEnabled, coerceRefreshMs } from "./src/settings/preferences.js";
import { detectCatalogIntent, firstSearchHit, summarizeEntity, summarizeLineage, contextForLLM, isCloseMatch, missingDimension, namedAbsentColumn } from "./src/datahub/catalog.js";
import { buildPnF, pnfTargets, visibleWindow, INTRADAY_BOX_PCT } from "./src/pnf/pnf.js";
import { detectPattern } from "./src/pnf/patterns.js";
import { CHESS_GLYPH, chessInit, legalMoves, chessApply, gameStatus, inCheck, chessAIMove } from "./src/chess/chess.js";
import { C, GRAD, MONO, SANS, DISPLAY, TYPE, R, SP, SHADOW, Z, MOTION, button, panel, field as fieldRecipe, chip } from "./src/ui/theme.js";
import { passwordCheck, PW_MIN } from "./src/auth/password.js";
import Sparkline from "./src/ui/Sparkline.jsx";
import RichText from "./src/ui/RichText.jsx";
import Toggle, { ToggleGlyph } from "./src/ui/Toggle.jsx";
import { api, ApiError, tokenStore } from "./src/api/client.js";
import { AuthProvider, useAuth } from "./src/api/auth-context.jsx";
import AppShell from "./src/ui/AppShell.jsx";
import ChatAssistant from "./src/ui/ChatAssistant.jsx";
import NewsDesk, { sourceColor, toneOf } from "./src/ui/NewsDesk.jsx";
import VantageMark from "./src/ui/VantageMark.jsx";

/* ============================================================
   VANTAGE — a browser market dashboard fronted by an animated AI "broadcast desk".
   ------------------------------------------------------------
   WHAT IT IS
     A single-page React app: a live/simulated market dashboard where an animated news
     anchor charts stocks, answers questions out loud, reads the news, plays trailers,
     hosts games, tracks a portfolio, and rings the opening bell on a real trading-day clock.

   DATA MODES
     • Demo (default, zero setup) — a seeded random-walk market engine drives prices.
     • Live — real quotes via Finnhub using the user's own free key (settings → DATA).

   OPTIONAL KEYS (each unlocks one extra; the app is fully usable with none):
     • AI desk answers — OpenRouter (primary) / Claude / OpenAI / Gemini / Ollama / LM Studio / Proton
     • Finnhub  → live quotes + earnings calendar    • TMDB    → streaming catalog + trailers
     • YouTube  → real embeddable video results       • ElevenLabs → studio-grade anchor voice
   All keys live in the browser's localStorage only (never sent anywhere but their own API).

   FILE LAYOUT
     • React.jsx    — this file: the whole UI (one big component + a few module components below)
     • exporters.js — lazy-loaded Excel/Word/PowerPoint generators (xlsx / docx / pptxgenjs)
     • server/index.js — tiny dependency-free backend for Zoom/Google Meet OAuth + calendar events

   MODULE-LEVEL COMPONENTS (defined below, before the main component so their hooks stay stable):
     • DeskAnchor   — the canvas anchor. A requestAnimationFrame loop reads props via a REF
                      (propsRef) so market ticks never restart the animation. Talking, idle
                      actions (sip/papers), scheduled cues (bell/eat/break via onCue), busy
                      poses (work/present), lip-sync, blinks, per-character headgear & env art.
     • VideoFrame / ArchiveFrame — in-desk players (YouTube embed / Internet Archive embed).
     • BlackjackGame / ChessGame / AlgoWarsGame — self-contained games (own state & loops).
     • AppCalendar  — native month calendar; events persist in localStorage; merges read-only
                      market events (earnings) passed via the `extra` prop.

   THE MAIN COMPONENT (MarketDashboard) — grouped by feature, top to bottom:
     • market data       — demo engine + live polling (pollLive, getRow, selectedRow)
     • voice + anchor     — speak()/streamUtter (browser TTS) or ElevenLabs; onWordBoundary drives
                            lip-sync; a watchdog clears a stuck "talking" state; TTS is primed on
                            first user gesture so timer-fired alerts (breaking news) can speak.
     • AI desk (askDesk)  — a COMMAND PIPELINE: the typed/spoken text is matched against intents
                            in order (export → games → cue → chart/video → market-events → portfolio
                            → price-alert → calendar → streaming catalog/stream launch → navigator),
                            and only falls through to the model fan-out if nothing matched. Models are
                            tried top-to-bottom; the first success wins, errors cascade to the next.
     • navigator/embeds   — openEmbed opens embeddable sites in-panel; brokers & streaming services
                            block iframes (X-Frame-Options) so they open in a new tab instead.
     • right-rail panels  — watchlist, movers, news, portfolio, price alerts, calendar (toggle in settings)
     • breaking news + price alerts — a banner + a synced sting + the anchor announcing on air
     • settings modal     — START (one key + status board) · DATA · AI · VOICE · MEET
     • onboarding         — a hub launching a spotlight tour / auto-demo / interactive missions,
                            plus a setup guide explaining which keys matter and why.

   KEY PATTERNS TO KNOW
     • Animation reads props through a ref, never state, so the rAF loop is never torn down.
     • setResp("nav"/"desk", …) writes into the single `aiResponses` box; deskCalendar/deskPortfolio
       render richer widgets inline in that same box.
     • Watch out for TDZ: a const/state referenced in a hook dep array before its declaration line
       white-screens at runtime while `npm run build` still passes (build only checks syntax).
   ============================================================ */

// ---------- palette ----------
// Moved to src/ui/theme.js — see the import at the top of this file. `C`, MONO and
// SANS keep exactly the names and keys they had, so every inline style below is
// untouched; the values now come from the design system instead of being hard-coded
// here. Change a colour there and the whole app follows.

// The origin this page is served from, which is exactly what a local model server has to be told
// to allow. Verified against a deployed HTTPS build reaching http://localhost:11434: the browser
// DOES send the request (Private Network Access is not enforced here) and the only thing standing
// in the way is the CORS header, so naming this origin is advice that actually works.
const PAGE_ORIGIN = (typeof window !== "undefined" && window.location?.origin) || "*";

// ============================================================
// i18n — UI translation + AI-answer language. English is the base; target
// dictionaries are pre-baked JSON (keyed by the English source string) so
// switching works with zero setup (no AI key needed). Anything not in a
// dictionary falls back to English. AI answers use LANG_AI (the English name
// of the language) appended to the prose prompts. LTR languages only for now.
// ============================================================
const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
];
const LANG_AI = { en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian" }; // used in AI prompts
const TTS_LANG = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT", it: "it-IT" };             // browser TTS BCP-47 codes
const I18N = {
  es: {
    "DataHub has no dataset matching \"{term}\".": "DataHub no tiene ningún conjunto de datos que coincida con \"{term}\".",
    "DataHub had no exact match. Closest dataset: {name}.": "DataHub no encontró una coincidencia exacta. Conjunto de datos más cercano: {name}.",
    "DataHub match: {name}.": "Coincidencia en DataHub: {name}.",
    "DataHub match: {name} on {platform}.": "Coincidencia en DataHub: {name} en {platform}.",
    "DataHub has no schema recorded for {name}.": "DataHub no tiene ningún esquema registrado para {name}.",
    "DataHub has no owner recorded for {name}.": "DataHub no tiene ningún propietario registrado para {name}.",
    "DataHub records no downstream datasets for {name}.": "DataHub no registra conjuntos de datos posteriores para {name}.",
    "DataHub records no upstream datasets for {name}.": "DataHub no registra conjuntos de datos anteriores para {name}.",
    "DataHub's schema for {name} has no column named \"{col}\".": "El esquema de {name} en DataHub no tiene ninguna columna llamada \"{col}\".",
    "DataHub lookup failed: {reason}": "La consulta a DataHub falló: {reason}",
    "ALLOCATION BY VALUE": "ASIGNACIÓN POR VALOR",
    "DAY RANGE": "RANGO DEL DÍA",
    "MARKET CLOSED": "MERCADO CERRADO",
    "ON THE DESK": "EN LA MESA",
    "last": "último",
    "last trade": "última operación",
    "prev close": "cierre ant.",
    "Export": "Exportar", "More": "Más", "Settings": "Ajustes", "sign in": "iniciar sesión",
    "Games": "Juegos", "learn how stocks work": "aprende cómo funcionan las acciones",
    "Ambient sound": "Sonido ambiente", "waves, jungle, space hum…": "olas, jungla, zumbido espacial…",
    "Music": "Música", "background score": "música de fondo",
    "Type a symbol and press Enter  ·  HELP for commands": "Escribe un símbolo y pulsa Enter  ·  HELP para comandos",
    "OPEN": "ABIERTO", "CLOSED": "CERRADO",
    "standing by": "en espera",
    "voice & anchor settings": "ajustes de voz y presentador", "SET": "SET", "stop reading": "detener lectura", "free": "gratis",
    "ASK ALL": "PREGUNTAR A TODOS",
 "Summarize {sym} today": "Resume {sym} hoy", "What's moving today?": "¿Qué se mueve hoy?", "Take me to Robinhood": "Llévame a Robinhood", "What's on Netflix?": "¿Qué hay en Netflix?", "Write a report → PPT": "Escribe un informe → PPT",
    "WATCHLIST": "LISTA DE SEGUIMIENTO", "TOP MOVERS": "MAYORES MOVIMIENTOS", "full chart": "gráfico completo",
    "LINE": "LÍNEA", "not enough movement for a P&F column yet": "aún no hay suficiente movimiento para una columna P&F", "3-box reversal · this session": "reversión de 3 casillas · esta sesión",
    "tracking {price} · box {box} · session range {lo}–{hi}": "siguiendo {price} · casilla {box} · rango de la sesión {lo}–{hi}", "first column at ≥ {up} or < {down}": "primera columna con ≥ {up} o < {down}", "column 2 needs a reversal < {down}": "la columna 2 necesita una reversión < {down}", "column 2 needs a reversal ≥ {up}": "la columna 2 necesita una reversión ≥ {up}",
    "Language": "Idioma",
    "Desk": "Mesa", "Markets": "Mercados", "News": "Noticias", "Portfolio": "Cartera",
    "Price alerts": "Alertas de precio", "Getting started": "Primeros pasos",
    "Live quotes are provided by this server — no key needed on this device.": "Las cotizaciones en vivo las proporciona este servidor — no se necesita clave en este dispositivo.",
    "Live quotes are not configured on this server.": "Las cotizaciones en vivo no están configuradas en este servidor.",
    "VIDEO SEARCH": "BÚSQUEDA DE VÍDEO",
    "Real, embeddable video results are provided by this server — no key needed on this device.": "Los resultados de vídeo reales e insertables los proporciona este servidor — no se necesita clave en este dispositivo.",
    "Not configured on this server — \"show videos of …\" asks the AI to guess instead.": "No configurado en este servidor — \"muéstrame vídeos de …\" pide a la IA que adivine.",
    "STREAMING CATALOG": "CATÁLOGO DE STREAMING",
    "Netflix / Disney+ / Hulu libraries and trailers are provided by this server — no key needed on this device.": "Los catálogos de Netflix / Disney+ / Hulu y los tráileres los proporciona este servidor — no se necesita clave en este dispositivo.",
    "Not configured on this server — public-domain films via \"free movies …\" still play in-desk.": "No configurado en este servidor — las películas de dominio público con \"free movies …\" siguen reproduciéndose en el desk.",
    "Studio voice is provided by this server — no key needed on this device.": "La voz de estudio la proporciona este servidor — no se necesita clave en este dispositivo.",
    "Studio voice is not configured on this server.": "La voz de estudio no está configurada en este servidor.",
    "This server has a studio-voice key set, but the last call to it failed.": "Este servidor tiene configurada una clave de voz de estudio, pero la última llamada falló.",
    "Loading voices…": "Cargando voces…",
 "Pick a studio voice in settings": "Elige una voz de estudio en los ajustes",
    "Video search is not configured on this server, and no key is set in this browser.": "La búsqueda de vídeos no está configurada en este servidor y no hay clave en este navegador.",
    "The AI desk is part of": "La mesa de IA forma parte de",
    "not configured": "sin configurar", "Demo mode needs no keys — everything below works right now.": "El modo demo no necesita claves — todo lo de abajo ya funciona.",
    "AI DESK IS OFF": "LA MESA DE IA ESTÁ APAGADA", "Answers run on this server's model key. Nothing to set up.": "Las respuestas usan la clave de modelo de este servidor. Nada que configurar.", "Answers run on your local model. Nothing leaves this device.": "Las respuestas usan tu modelo local. Nada sale de este dispositivo.", "This server has no model key configured yet, so the desk can't answer. Everything else works.": "Este servidor aún no tiene una clave de modelo, así que la mesa no puede responder. Todo lo demás funciona.",
    "This server holds the model key, so the desk can already answer.": "Este servidor guarda la clave del modelo, así que la mesa ya puede responder.",
    "Read on air": "Leer en directo",
    "Search": "Buscar",
    "The AI broadcast desk for the markets.": "La mesa de retransmisión con IA para los mercados.",
    "Create account": "Crear cuenta", "Log in": "Iniciar sesión",
    "ranked by |Δ%| across your watchlist": "ordenado por |Δ%| en tu lista de seguimiento",
    'Ask about {sym} — or tap a suggestion below': 'Pregunta sobre {sym} — o toca una sugerencia',
    // settings tabs + guided tour
    "ACCOUNT": "CUENTA", "START": "INICIO", "DATA": "DATOS", "VOICE": "VOZ", "MEET": "REUNIÓN",
    "exit": "salir", "skip tour": "saltar recorrido", "Back": "Atrás", "Next": "Siguiente", "Done": "Listo",
    "Command bar": "Barra de comandos",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Escribe cualquier símbolo aquí y pulsa Enter para graficarlo. “ADD TSLA” y “DEL TSLA” gestionan tu lista de seguimiento. Los nombres de empresa también funcionan.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Esta es tu barra de comandos. Escribe un símbolo como Apple o Nvidia y pulsa Enter para graficarlo.",
    "Your anchor — that's me": "Tu presentador — ese soy yo",
    "I read every answer on air. Pick from 22 anchors and 18 sets right here, each with its own voice and soundscape.": "Leo cada respuesta en directo. Elige entre 22 presentadores y 18 escenarios aquí mismo, cada uno con su propia voz y ambiente sonoro.",
    "That's me, your anchor. Twenty-two anchors and eighteen sets to choose from, right here.": "Ese soy yo, tu presentador. Veintidós presentadores y dieciocho escenarios para elegir, aquí mismo.",
    "Switches the interface and my spoken answers between six languages. Your choice is remembered.": "Cambia la interfaz y mis respuestas habladas entre seis idiomas. Tu elección se recuerda.",
    "Export the session as Word, PowerPoint or Excel. A review step lets you edit everything before it saves.": "Exporta la sesión como Word, PowerPoint o Excel. Un paso de revisión te deja editarlo todo antes de guardar.",
    "Export your session as Word, PowerPoint or Excel. You can edit everything before it saves.": "Exporta tu sesión como Word, PowerPoint o Excel. Puedes editarlo todo antes de guardar.",
    "Your watchlist scrolls across the top. Flip DEMO to LIVE in settings for real Finnhub quotes.": "Tu lista de seguimiento se desplaza por la parte superior. Cambia DEMO a LIVE en ajustes para cotizaciones reales de Finnhub.",
    "Add your events and I announce them on air when they're due. Market events merge in automatically.": "Añade tus eventos y los anuncio en directo cuando llegue su hora. Los eventos de mercado se añaden automáticamente.",
    "Add events to your calendar and I'll announce them on air when they're due.": "Añade eventos a tu calendario y los anunciaré en directo cuando llegue su hora.",
    "The AI desk": "La mesa de IA",
    "Ask anything here. I also take commands: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Pregunta lo que quieras aquí. También acepto comandos: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Pregúntame lo que quieras aquí. También entiendo comandos sencillos, como, take me to Robinhood, o, what's on Netflix.",
    "Answers, news & Watch": "Respuestas, noticias y Ver",
    "Answers, news, and the streaming catalog land here. Trailers play right inside.": "Las respuestas, las noticias y el catálogo de streaming aparecen aquí. Los tráileres se reproducen dentro.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Las respuestas, las noticias y el catálogo de streaming aparecen aquí, en un solo lugar.",
    "Ticker tape": "Cinta de cotizaciones",
    "Why setup? (mostly optional)": "¿Por qué configurar? (casi todo opcional)",
    "Demo mode needs no setup. AI answers come from external models billed to your account, so they need your key. Open Settings from this menu and paste it under START.": "El modo demo no necesita configuración. Las respuestas de IA vienen de modelos externos facturados a tu cuenta, así que necesitan tu clave. Abre Ajustes desde este menú y pégala en START.",
    "One last thing. My answers come from external models billed to your account, so they need your key. Everything else is optional. That's the tour!": "Una última cosa. Mis respuestas vienen de modelos externos facturados a tu cuenta, así que necesitan tu clave. Todo lo demás es opcional. ¡Fin del recorrido!",
    // settings footer + MEET tab
    "Close": "Cerrar", "Apply": "Aplicar",
    "Go Live — no setup": "En directo — sin configuración",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Inicia al instante una nueva reunión en una pestaña del navegador (usa la sesión que ya tengas iniciada) y comparte la pantalla de Vantage. Sin claves, sin OAuth.",
    "New Google Meet": "Nueva Google Meet", "New Zoom meeting": "Nueva reunión de Zoom",
    "Join": "Unirse", "copy link": "copiar enlace", "end": "finalizar",
    "paste your meeting link to pin it as LIVE…": "pega el enlace de tu reunión para fijarla como EN DIRECTO…",
    "Pin": "Fijar",
    "connected": "conectado", "disconnect": "desconectar",
    // START tab
    "AI desk": "Mesa de IA", "ready": "listo", "Voice": "Voz", "browser": "navegador",
    "Live quotes": "Cotizaciones en directo", "live": "en directo", "demo": "demo", "Real videos": "Vídeos reales",
    "on": "activado", "optional": "opcional", "Streaming": "Streaming", "Calendar": "Calendario", "built-in": "integrado", "Meetings": "Reuniones",
    "You're already set up.": "Ya está todo listo.",
    "AI DESK IS ON": "LA MESA DE IA ESTÁ ACTIVA",
    "WHAT'S SET UP": "QUÉ ESTÁ CONFIGURADO", "tap to configure": "toca para configurar",
    "tour · demo · missions": "recorrido · demo · misiones", "pick your anchor": "elige tu presentador",
    "skip — I'll explore on my own": "omitir — exploraré por mi cuenta",
    // DATA tab
    "PANELS": "PANELES", "ticker tape": "cinta de cotizaciones", "watchlist": "lista de seguimiento", "top movers": "mayores movimientos", "news & video": "noticias y vídeo", "calendar": "calendario", "portfolio": "cartera",
    "in-app alerts": "alertas en la aplicación", "price triggers": "activadores de precio", "breaking news": "última hora",
    "P&F SIGNALS": "SEÑALES P&F", "P&F signals": "señales P&F", "P&F pattern alerts": "alertas de patrones P&F",
    "color-blind mode (blue/orange + ▲▼)": "modo para daltónicos (azul/naranja + ▲▼)",
    "privacy mode — blur balances": "modo privacidad — difuminar saldos",
    "hidden": "oculto",
    "CLOCK TIMEZONE": "ZONA HORARIA DEL RELOJ",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Ajusta el reloj de la cabecera. La insignia de mercado ABIERTO/CERRADO siempre sigue el horario del NYSE (hora del Este).",
    "refresh interval": "intervalo de actualización", "Manual": "Manual", "refresh now": "actualizar ahora",
    "replay tutorial": "repetir tutorial", "DEMO": "DEMO", "LIVE": "EN DIRECTO",
    "Demo mode is a seeded random-walk session: reproducible, no key or network needed.": "El modo demo es una sesión de paseo aleatorio con semilla: reproducible, sin clave ni red.",
 "needs": "requiere",
    "at": "a las", "off": "desactivar",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "Las respuestas de la mesa de IA requieren {plan}. Los modelos de abajo están desactivados hasta que mejores tu plan (o actives el modo desarrollador en CUENTA).",
 "use only this": "usar solo este", "BASE URL": "BASE URL", "MODEL": "MODELO",
    "The desk remembers this conversation locally (this device only) so follow-up questions work.": "La mesa recuerda esta conversación localmente (solo en este dispositivo) para que funcionen las preguntas de seguimiento.", "forget conversation": "olvidar conversación", "Desk memory cleared — the conversation is forgotten.": "Memoria de la mesa borrada — la conversación queda olvidada.", "MEMORY": "MEMORIA", "{n} turns remembered on this device": "{n} turnos recordados en este dispositivo", "Memory": "Memoria", "empty": "vacío",
    "format:": "formato:", "e.g.": "p. ej.",
    "API KEY": "CLAVE API",
 "or": "o",
    "ANCHOR": "PRESENTADOR", "ENVIRONMENT": "ENTORNO", "BACKGROUND CREW": "EQUIPO DE FONDO",
    "Auto — whoever isn't anchoring": "Auto — quien no esté presentando", "Off — solo broadcast": "Desactivado — transmisión en solitario",
    "VOICE ENGINE": "MOTOR DE VOZ", "BROWSER · free": "NAVEGADOR · gratis",
    "ELEVENLABS VOICE": "VOZ DE ELEVENLABS",
    "READING SPEED": "VELOCIDAD DE LECTURA", "auto-read the first answer that finishes": "leer automáticamente la primera respuesta que termine",
    "UI click sounds — terminal blips on every button": "sonidos de clic de la interfaz — pitidos de terminal en cada botón", "SOUND VOLUME": "VOLUMEN DEL SONIDO",
    "ambient music": "música ambiental", "your Spotify playlist, docked bottom-right": "tu lista de Spotify, anclada abajo a la derecha",
    "generative synth, ducks under the anchor's voice": "sintetizador generativo, baja bajo la voz del presentador", "MUSIC SOURCE": "FUENTE DE MÚSICA",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Sin necesidad de iniciar sesión — activa ♪ y el reproductor se ancla abajo a la derecha. (El reproductor incrustado de Spotify reproduce vistas previas de 30 segundos sin cuenta; las canciones completas suenan automáticamente si ya has iniciado sesión en Spotify en este navegador.)",
    "OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS": "OPCIONAL · CONECTA UNA CUENTA PREMIUM PARA CANCIONES COMPLETAS", "FULL PLAYBACK · SPOTIFY PREMIUM": "REPRODUCCIÓN COMPLETA · SPOTIFY PREMIUM",
    "create an app ↗": "crear una app ↗", "● connected — full tracks enabled": "● conectado — canciones completas activadas",
    "Spotify app Client ID": "Client ID de la app de Spotify", "In your Spotify app settings, add this exact Redirect URI:": "En la configuración de tu app de Spotify, añade esta Redirect URI exacta:",
    "Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.": "Spotify requiere https o 127.0.0.1 — abre esta app en http://127.0.0.1:5173 (no localhost) y registra esa dirección.",
    "Connect Spotify": "Conectar Spotify", "connecting…": "conectando…", "MUSIC VOLUME": "VOLUMEN DE MÚSICA", "preview voice": "escuchar voz",
    "You're exploring as a guest": "Estás explorando como invitado",
    "Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.": "Crea una cuenta gratuita para guardar tu plan entre visitas. Tu lista de seguimiento, cartera y ajustes ya se conservan en este dispositivo de todos modos.",
    "Sign in / create account": "Iniciar sesión / crear cuenta", "secured on server": "protegido en el servidor", "stored on this device": "guardado en este dispositivo",
    "YOUR PLAN": "TU PLAN", "CURRENT": "ACTUAL", "Upgrade": "Mejorar", "Switch": "Cambiar",
    "Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.": "Las mejoras de pago abren el pago seguro de Stripe (modo prueba). Los datos de la tarjeta se introducen en Stripe, nunca aquí.",
    "No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.": "No hay ningún procesador de pagos conectado, así que los planes de pago se desbloquean como simulación — no se pide ninguna tarjeta y no se cobra nada.",
    "Sign out": "Cerrar sesión", "Terms & Privacy accepted": "Términos y Privacidad aceptados", "This account UI is a prototype; see the security note in the code.": "Esta interfaz de cuenta es un prototipo; consulta la nota de seguridad en el código.",
  },
  fr: {
    "DataHub has no dataset matching \"{term}\".": "DataHub n'a aucun jeu de données correspondant à \"{term}\".",
    "DataHub had no exact match. Closest dataset: {name}.": "DataHub n'a trouvé aucune correspondance exacte. Jeu de données le plus proche : {name}.",
    "DataHub match: {name}.": "Correspondance DataHub : {name}.",
    "DataHub match: {name} on {platform}.": "Correspondance DataHub : {name} sur {platform}.",
    "DataHub has no schema recorded for {name}.": "DataHub n'a aucun schéma enregistré pour {name}.",
    "DataHub has no owner recorded for {name}.": "DataHub n'a aucun propriétaire enregistré pour {name}.",
    "DataHub records no downstream datasets for {name}.": "DataHub n'enregistre aucun jeu de données en aval pour {name}.",
    "DataHub records no upstream datasets for {name}.": "DataHub n'enregistre aucun jeu de données en amont pour {name}.",
    "DataHub's schema for {name} has no column named \"{col}\".": "Le schéma de {name} dans DataHub ne contient aucune colonne nommée \"{col}\".",
    "DataHub lookup failed: {reason}": "Échec de la requête DataHub : {reason}",
    "ALLOCATION BY VALUE": "RÉPARTITION PAR VALEUR",
    "DAY RANGE": "AMPLITUDE DU JOUR",
    "MARKET CLOSED": "MARCHÉ FERMÉ",
    "ON THE DESK": "SUR LE PLATEAU",
    "last": "dernier",
    "last trade": "dernière transaction",
    "prev close": "clôture préc.",
    "Export": "Exporter", "More": "Plus", "Settings": "Réglages", "sign in": "se connecter",
    "Games": "Jeux", "learn how stocks work": "apprenez le fonctionnement des actions",
    "Ambient sound": "Son d'ambiance", "waves, jungle, space hum…": "vagues, jungle, bourdonnement spatial…",
    "Music": "Musique", "background score": "musique de fond",
    "Type a symbol and press Enter  ·  HELP for commands": "Saisissez un symbole et appuyez sur Entrée  ·  HELP pour les commandes",
    "OPEN": "OUVERT", "CLOSED": "FERMÉ",
    "standing by": "en attente",
    "voice & anchor settings": "réglages voix et présentateur", "SET": "DÉCOR", "stop reading": "arrêter la lecture", "free": "gratuites",
    "ASK ALL": "TOUT DEMANDER",
 "Summarize {sym} today": "Résumez {sym} aujourd'hui", "What's moving today?": "Qu'est-ce qui bouge aujourd'hui ?", "Take me to Robinhood": "Emmène-moi sur Robinhood", "What's on Netflix?": "Qu'y a-t-il sur Netflix ?", "Write a report → PPT": "Rédiger un rapport → PPT",
    "WATCHLIST": "LISTE DE SUIVI", "TOP MOVERS": "PLUS FORTES VARIATIONS", "full chart": "graphique complet",
    "LINE": "LIGNE", "not enough movement for a P&F column yet": "pas encore assez de mouvement pour une colonne P&F", "3-box reversal · this session": "retournement de 3 cases · cette séance",
    "tracking {price} · box {box} · session range {lo}–{hi}": "suivi {price} · case {box} · amplitude de la séance {lo}–{hi}", "first column at ≥ {up} or < {down}": "première colonne à ≥ {up} ou < {down}", "column 2 needs a reversal < {down}": "la colonne 2 exige un retournement < {down}", "column 2 needs a reversal ≥ {up}": "la colonne 2 exige un retournement ≥ {up}",
    "Language": "Langue",
    "Desk": "Plateau", "Markets": "Marchés", "News": "Actualités", "Portfolio": "Portefeuille",
    "Price alerts": "Alertes de prix", "Getting started": "Premiers pas",
    "Live quotes are provided by this server — no key needed on this device.": "Les cotations en direct sont fournies par ce serveur — aucune clé requise sur cet appareil.",
    "Live quotes are not configured on this server.": "Les cotations en direct ne sont pas configurées sur ce serveur.",
    "VIDEO SEARCH": "RECHERCHE VIDÉO",
    "Real, embeddable video results are provided by this server — no key needed on this device.": "Les résultats vidéo réels et intégrables sont fournis par ce serveur — aucune clé requise sur cet appareil.",
    "Not configured on this server — \"show videos of …\" asks the AI to guess instead.": "Non configuré sur ce serveur — « montre des vidéos de … » demande à l'IA de deviner.",
    "STREAMING CATALOG": "CATALOGUE STREAMING",
    "Netflix / Disney+ / Hulu libraries and trailers are provided by this server — no key needed on this device.": "Les catalogues Netflix / Disney+ / Hulu et les bandes-annonces sont fournis par ce serveur — aucune clé requise sur cet appareil.",
    "Not configured on this server — public-domain films via \"free movies …\" still play in-desk.": "Non configuré sur ce serveur — les films du domaine public via « free movies … » se lisent toujours dans le desk.",
    "Studio voice is provided by this server — no key needed on this device.": "La voix studio est fournie par ce serveur — aucune clé requise sur cet appareil.",
    "Studio voice is not configured on this server.": "La voix studio n'est pas configurée sur ce serveur.",
    "This server has a studio-voice key set, but the last call to it failed.": "Ce serveur a une clé de voix studio configurée, mais le dernier appel a échoué.",
    "Loading voices…": "Chargement des voix…",
 "Pick a studio voice in settings": "Choisissez une voix studio dans les réglages",
    "Video search is not configured on this server, and no key is set in this browser.": "La recherche vidéo n'est pas configurée sur ce serveur et aucune clé n'est définie dans ce navigateur.",
    "The AI desk is part of": "Le plateau IA fait partie de",
    "not configured": "non configuré", "Demo mode needs no keys — everything below works right now.": "Le mode démo ne demande aucune clé — tout ci-dessous fonctionne déjà.",
    "AI DESK IS OFF": "LE PLATEAU IA EST ÉTEINT", "Answers run on this server's model key. Nothing to set up.": "Les réponses utilisent la clé de modèle de ce serveur. Rien à configurer.", "Answers run on your local model. Nothing leaves this device.": "Les réponses utilisent votre modèle local. Rien ne quitte cet appareil.", "This server has no model key configured yet, so the desk can't answer. Everything else works.": "Ce serveur n'a pas encore de clé de modèle, le plateau ne peut donc pas répondre. Tout le reste fonctionne.",
    "This server holds the model key, so the desk can already answer.": "Ce serveur détient la clé du modèle, le plateau peut donc déjà répondre.",
    "Read on air": "Lire à l'antenne",
    "Search": "Rechercher",
    "The AI broadcast desk for the markets.": "Le plateau de diffusion IA pour les marchés.",
    "Create account": "Créer un compte", "Log in": "Se connecter",
    "ranked by |Δ%| across your watchlist": "classé par |Δ%| dans votre liste de suivi",
    'Ask about {sym} — or tap a suggestion below': 'Posez une question sur {sym} — ou touchez une suggestion',
    // settings tabs + guided tour
    "ACCOUNT": "COMPTE", "START": "DÉMARRER", "DATA": "DONNÉES", "VOICE": "VOIX", "MEET": "RÉUNION",
    "exit": "quitter", "skip tour": "passer la visite", "Back": "Retour", "Next": "Suivant", "Done": "Terminé",
    "Command bar": "Barre de commande",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Saisissez ici n'importe quel symbole et appuyez sur Entrée pour l'afficher. « ADD TSLA » et « DEL TSLA » gèrent votre liste de suivi. Les noms d'entreprise fonctionnent aussi.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Voici votre barre de commande. Saisissez un symbole comme Apple ou Nvidia et appuyez sur Entrée pour l'afficher.",
    "Your anchor — that's me": "Votre présentateur — c'est moi",
    "I read every answer on air. Pick from 22 anchors and 18 sets right here, each with its own voice and soundscape.": "Je lis chaque réponse à l'antenne. Choisissez parmi 22 présentateurs et 18 décors ici même, chacun avec sa voix et son ambiance sonore.",
    "That's me, your anchor. Twenty-two anchors and eighteen sets to choose from, right here.": "C'est moi, votre présentateur. Vingt-deux présentateurs et dix-huit décors au choix, ici même.",
    "Switches the interface and my spoken answers between six languages. Your choice is remembered.": "Change l'interface et mes réponses parlées entre six langues. Votre choix est mémorisé.",
    "Export the session as Word, PowerPoint or Excel. A review step lets you edit everything before it saves.": "Exportez la session en Word, PowerPoint ou Excel. Une étape de révision permet de tout modifier avant l'enregistrement.",
    "Export your session as Word, PowerPoint or Excel. You can edit everything before it saves.": "Exportez votre session en Word, PowerPoint ou Excel. Vous pouvez tout modifier avant l'enregistrement.",
    "Your watchlist scrolls across the top. Flip DEMO to LIVE in settings for real Finnhub quotes.": "Votre liste de suivi défile en haut. Passez de DEMO à LIVE dans les réglages pour de vraies cotations Finnhub.",
    "Add your events and I announce them on air when they're due. Market events merge in automatically.": "Ajoutez vos événements et je les annonce à l'antenne le moment venu. Les événements de marché s'ajoutent automatiquement.",
    "Add events to your calendar and I'll announce them on air when they're due.": "Ajoutez des événements à votre calendrier et je les annoncerai à l'antenne le moment venu.",
    "The AI desk": "Le plateau IA",
    "Ask anything here. I also take commands: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Posez vos questions ici. J'accepte aussi des commandes : « take me to Robinhood », « what's on netflix », « write a report and export ppt ».",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Demandez-moi ce que vous voulez ici. Je comprends aussi les commandes simples, comme, take me to Robinhood, ou, what's on Netflix.",
    "Answers, news & Watch": "Réponses, actualités et Visionnage",
    "Answers, news, and the streaming catalog land here. Trailers play right inside.": "Les réponses, les actualités et le catalogue de streaming arrivent ici. Les bandes-annonces se lisent directement.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Les réponses, les actualités et le catalogue de streaming apparaissent tous ici, au même endroit.",
    "Ticker tape": "Bandeau de cotation",
    "Why setup? (mostly optional)": "Pourquoi la configuration ? (presque tout est optionnel)",
    "Demo mode needs no setup. AI answers come from external models billed to your account, so they need your key. Open Settings from this menu and paste it under START.": "Le mode démo ne demande aucune configuration. Les réponses IA viennent de modèles externes facturés sur votre compte, il leur faut donc votre clé. Ouvrez Réglages depuis ce menu et collez-la sous START.",
    "One last thing. My answers come from external models billed to your account, so they need your key. Everything else is optional. That's the tour!": "Une dernière chose. Mes réponses viennent de modèles externes facturés sur votre compte, il leur faut donc votre clé. Tout le reste est optionnel. Fin de la visite !",
    // settings footer + MEET tab
    "Close": "Fermer", "Apply": "Appliquer",
    "Go Live — no setup": "En direct — sans configuration",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Démarrez instantanément une nouvelle réunion dans un onglet du navigateur (utilise la session déjà ouverte), puis partagez l'écran de Vantage. Aucune clé, aucun OAuth.",
    "New Google Meet": "Nouveau Google Meet", "New Zoom meeting": "Nouvelle réunion Zoom",
    "Join": "Rejoindre", "copy link": "copier le lien", "end": "terminer",
    "paste your meeting link to pin it as LIVE…": "collez le lien de votre réunion pour l'épingler comme EN DIRECT…",
    "Pin": "Épingler",
    "connected": "connecté", "disconnect": "déconnecter",
    // START tab
    "AI desk": "Plateau IA", "ready": "prêt", "Voice": "Voix", "browser": "navigateur",
    "Live quotes": "Cotations en direct", "live": "en direct", "demo": "démo", "Real videos": "Vraies vidéos",
    "on": "activé", "optional": "optionnel", "Streaming": "Streaming", "Calendar": "Calendrier", "built-in": "intégré", "Meetings": "Réunions",
    "You're already set up.": "Tout est déjà prêt.",
    "AI DESK IS ON": "LE PLATEAU IA EST ACTIF",
    "WHAT'S SET UP": "CE QUI EST CONFIGURÉ", "tap to configure": "touchez pour configurer",
    "tour · demo · missions": "visite · démo · missions", "pick your anchor": "choisissez votre présentateur",
    "skip — I'll explore on my own": "passer — je vais explorer par moi-même",
    // DATA tab
    "PANELS": "PANNEAUX", "ticker tape": "bandeau de cotation", "watchlist": "liste de suivi", "top movers": "plus fortes variations", "news & video": "actualités et vidéo", "calendar": "calendrier", "portfolio": "portefeuille",
    "in-app alerts": "alertes dans l'application", "price triggers": "seuils de prix", "breaking news": "dernière minute",
    "P&F SIGNALS": "SIGNAUX P&F", "P&F signals": "signaux P&F", "P&F pattern alerts": "alertes de figures P&F",
    "color-blind mode (blue/orange + ▲▼)": "mode daltonien (bleu/orange + ▲▼)",
    "privacy mode — blur balances": "mode privé — flouter les soldes",
    "hidden": "masqué",
    "CLOCK TIMEZONE": "FUSEAU HORAIRE DE L'HORLOGE",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Règle l'horloge de l'en-tête. Le badge de marché OUVERT/FERMÉ suit toujours les heures du NYSE (heure de l'Est).",
    "refresh interval": "intervalle d'actualisation", "Manual": "Manuel", "refresh now": "actualiser maintenant",
    "replay tutorial": "revoir le tutoriel", "DEMO": "DÉMO", "LIVE": "EN DIRECT",
    "Demo mode is a seeded random-walk session: reproducible, no key or network needed.": "Le mode démo est une session à marche aléatoire avec graine : reproductible, sans clé ni réseau.",
 "needs": "nécessite",
    "at": "à", "off": "désactiver",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "Les réponses du plateau IA nécessitent {plan}. Les modèles ci-dessous sont désactivés jusqu'à ce que vous passiez à l'offre supérieure (ou activiez le mode développeur dans COMPTE).",
 "use only this": "utiliser seulement celui-ci", "BASE URL": "BASE URL", "MODEL": "MODÈLE",
    "The desk remembers this conversation locally (this device only) so follow-up questions work.": "Le plateau mémorise cette conversation localement (uniquement sur cet appareil) pour que les questions de suivi fonctionnent.", "forget conversation": "oublier la conversation", "Desk memory cleared — the conversation is forgotten.": "Mémoire du plateau effacée — la conversation est oubliée.", "MEMORY": "MÉMOIRE", "{n} turns remembered on this device": "{n} tours mémorisés sur cet appareil", "Memory": "Mémoire", "empty": "vide",
    "format:": "format :", "e.g.": "par ex.",
    "API KEY": "CLÉ API",
 "or": "ou",
    "ANCHOR": "PRÉSENTATEUR", "ENVIRONMENT": "ENVIRONNEMENT", "BACKGROUND CREW": "ÉQUIPE EN FOND",
    "Auto — whoever isn't anchoring": "Auto — celui qui ne présente pas", "Off — solo broadcast": "Désactivé — diffusion en solo",
    "VOICE ENGINE": "MOTEUR VOCAL", "BROWSER · free": "NAVIGATEUR · gratuit",
    "ELEVENLABS VOICE": "VOIX ELEVENLABS",
    "READING SPEED": "VITESSE DE LECTURE", "auto-read the first answer that finishes": "lire automatiquement la première réponse terminée",
    "UI click sounds — terminal blips on every button": "sons de clic de l'interface — bips de terminal sur chaque bouton", "SOUND VOLUME": "VOLUME DU SON",
    "ambient music": "musique d'ambiance", "your Spotify playlist, docked bottom-right": "votre playlist Spotify, ancrée en bas à droite",
    "generative synth, ducks under the anchor's voice": "synthé génératif, s'atténue sous la voix du présentateur", "MUSIC SOURCE": "SOURCE MUSICALE",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Aucune connexion requise — activez ♪ et le lecteur s'ancre en bas à droite. (Le lecteur intégré de Spotify diffuse des extraits de 30 secondes sans compte ; les titres complets se lisent automatiquement si vous êtes déjà connecté à Spotify dans ce navigateur.)",
    "OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS": "FACULTATIF · CONNECTEZ UN COMPTE PREMIUM POUR LES TITRES COMPLETS", "FULL PLAYBACK · SPOTIFY PREMIUM": "LECTURE COMPLÈTE · SPOTIFY PREMIUM",
    "create an app ↗": "créer une app ↗", "● connected — full tracks enabled": "● connecté — titres complets activés",
    "Spotify app Client ID": "Client ID de l'app Spotify", "In your Spotify app settings, add this exact Redirect URI:": "Dans les paramètres de votre app Spotify, ajoutez cette Redirect URI exacte :",
    "Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.": "Spotify exige https ou 127.0.0.1 — ouvrez cette app sur http://127.0.0.1:5173 (pas localhost) et enregistrez cette adresse.",
    "Connect Spotify": "Connecter Spotify", "connecting…": "connexion…", "MUSIC VOLUME": "VOLUME MUSIQUE", "preview voice": "écouter la voix",
    "You're exploring as a guest": "Vous explorez en tant qu'invité",
    "Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.": "Créez un compte gratuit pour conserver votre offre d'une visite à l'autre. Votre liste de suivi, votre portefeuille et vos réglages persistent déjà sur cet appareil de toute façon.",
    "Sign in / create account": "Se connecter / créer un compte", "secured on server": "sécurisé sur le serveur", "stored on this device": "stocké sur cet appareil",
    "YOUR PLAN": "VOTRE OFFRE", "CURRENT": "ACTUELLE", "Upgrade": "Passer à supérieur", "Switch": "Changer",
    "Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.": "Les mises à niveau payantes ouvrent le paiement sécurisé de Stripe (mode test). Les informations de carte sont saisies sur Stripe, jamais ici.",
    "No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.": "Aucun processeur de paiement n'est connecté, donc les offres payantes sont débloquées en simulation — aucune carte n'est demandée et rien n'est facturé.",
    "Sign out": "Se déconnecter", "Terms & Privacy accepted": "Conditions et confidentialité acceptées", "This account UI is a prototype; see the security note in the code.": "Cette interface de compte est un prototype ; voir la note de sécurité dans le code.",
  },
  de: {
    "DataHub has no dataset matching \"{term}\".": "DataHub hat keinen Datensatz, der zu \"{term}\" passt.",
    "DataHub had no exact match. Closest dataset: {name}.": "DataHub fand keine exakte Übereinstimmung. Nächstgelegener Datensatz: {name}.",
    "DataHub match: {name}.": "DataHub-Treffer: {name}.",
    "DataHub match: {name} on {platform}.": "DataHub-Treffer: {name} auf {platform}.",
    "DataHub has no schema recorded for {name}.": "DataHub hat für {name} kein Schema hinterlegt.",
    "DataHub has no owner recorded for {name}.": "DataHub hat für {name} keinen Eigentümer hinterlegt.",
    "DataHub records no downstream datasets for {name}.": "DataHub verzeichnet für {name} keine nachgelagerten Datensätze.",
    "DataHub records no upstream datasets for {name}.": "DataHub verzeichnet für {name} keine vorgelagerten Datensätze.",
    "DataHub's schema for {name} has no column named \"{col}\".": "Das Schema von {name} in DataHub hat keine Spalte namens \"{col}\".",
    "DataHub lookup failed: {reason}": "DataHub-Abfrage fehlgeschlagen: {reason}",
    "ALLOCATION BY VALUE": "AUFTEILUNG NACH WERT",
    "DAY RANGE": "TAGESSPANNE",
    "MARKET CLOSED": "MARKT GESCHLOSSEN",
    "ON THE DESK": "AM PULT",
    "last": "letzter",
    "last trade": "letzter Handel",
    "prev close": "Vortagesschluss",
    "Export": "Exportieren", "More": "Mehr", "Settings": "Einstellungen", "sign in": "anmelden",
    "Games": "Spiele", "learn how stocks work": "lerne, wie Aktien funktionieren",
    "Ambient sound": "Umgebungston", "waves, jungle, space hum…": "Wellen, Dschungel, Weltraumbrummen…",
    "Music": "Musik", "background score": "Hintergrundmusik",
    "Type a symbol and press Enter  ·  HELP for commands": "Symbol eingeben und Enter drücken  ·  HELP für Befehle",
    "OPEN": "OFFEN", "CLOSED": "GESCHLOSSEN",
    "standing by": "bereit",
    "voice & anchor settings": "Stimme & Moderator-Einstellungen", "SET": "KULISSE", "stop reading": "Vorlesen stoppen", "free": "kostenlos",
    "ASK ALL": "ALLE FRAGEN",
 "Summarize {sym} today": "Fasse {sym} heute zusammen", "What's moving today?": "Was bewegt sich heute?", "Take me to Robinhood": "Bring mich zu Robinhood", "What's on Netflix?": "Was läuft auf Netflix?", "Write a report → PPT": "Bericht schreiben → PPT",
    "WATCHLIST": "BEOBACHTUNGSLISTE", "TOP MOVERS": "GRÖSSTE BEWEGUNGEN", "full chart": "vollständiges Diagramm",
    "LINE": "LINIE", "not enough movement for a P&F column yet": "noch nicht genug Bewegung für eine P&F-Spalte", "3-box reversal · this session": "3-Box-Umkehr · diese Sitzung",
    "tracking {price} · box {box} · session range {lo}–{hi}": "verfolge {price} · Box {box} · Sitzungsspanne {lo}–{hi}", "first column at ≥ {up} or < {down}": "erste Spalte ab ≥ {up} oder < {down}", "column 2 needs a reversal < {down}": "Spalte 2 braucht eine Umkehr < {down}", "column 2 needs a reversal ≥ {up}": "Spalte 2 braucht eine Umkehr ≥ {up}",
    "Language": "Sprache",
    "Desk": "Pult", "Markets": "Märkte", "News": "Nachrichten", "Portfolio": "Portfolio",
    "Price alerts": "Preisalarme", "Getting started": "Erste Schritte",
    "Live quotes are provided by this server — no key needed on this device.": "Live-Kurse liefert dieser Server — kein Schlüssel auf diesem Gerät nötig.",
    "Live quotes are not configured on this server.": "Live-Kurse sind auf diesem Server nicht eingerichtet.",
    "VIDEO SEARCH": "VIDEOSUCHE",
    "Real, embeddable video results are provided by this server — no key needed on this device.": "Echte, einbettbare Videoergebnisse liefert dieser Server — kein Schlüssel auf diesem Gerät nötig.",
    "Not configured on this server — \"show videos of …\" asks the AI to guess instead.": "Auf diesem Server nicht eingerichtet — „zeig Videos von …“ lässt stattdessen die KI raten.",
    "STREAMING CATALOG": "STREAMING-KATALOG",
    "Netflix / Disney+ / Hulu libraries and trailers are provided by this server — no key needed on this device.": "Netflix- / Disney+- / Hulu-Kataloge und Trailer liefert dieser Server — kein Schlüssel auf diesem Gerät nötig.",
    "Not configured on this server — public-domain films via \"free movies …\" still play in-desk.": "Auf diesem Server nicht eingerichtet — gemeinfreie Filme über „free movies …“ laufen weiter im Desk.",
    "Studio voice is provided by this server — no key needed on this device.": "Die Studio-Stimme liefert dieser Server — kein Schlüssel auf diesem Gerät nötig.",
    "Studio voice is not configured on this server.": "Die Studio-Stimme ist auf diesem Server nicht eingerichtet.",
    "This server has a studio-voice key set, but the last call to it failed.": "Auf diesem Server ist ein Studio-Stimmen-Schlüssel hinterlegt, aber der letzte Aufruf ist fehlgeschlagen.",
    "Loading voices…": "Stimmen werden geladen…",
 "Pick a studio voice in settings": "Wähle in den Einstellungen eine Studiostimme",
    "Video search is not configured on this server, and no key is set in this browser.": "Die Videosuche ist auf diesem Server nicht eingerichtet und in diesem Browser ist kein Schlüssel hinterlegt.",
    "The AI desk is part of": "Das KI-Pult gehört zu",
    "not configured": "nicht eingerichtet", "Demo mode needs no keys — everything below works right now.": "Der Demo-Modus braucht keine Schlüssel — alles unten funktioniert schon.",
    "AI DESK IS OFF": "KI-PULT IST AUS", "Answers run on this server's model key. Nothing to set up.": "Antworten laufen über den Modellschlüssel dieses Servers. Nichts einzurichten.", "Answers run on your local model. Nothing leaves this device.": "Antworten laufen über dein lokales Modell. Nichts verlässt dieses Gerät.", "This server has no model key configured yet, so the desk can't answer. Everything else works.": "Auf diesem Server ist noch kein Modellschlüssel hinterlegt, das Pult kann also nicht antworten. Alles andere funktioniert.",
    "This server holds the model key, so the desk can already answer.": "Dieser Server hält den Modellschlüssel, das Pult kann also schon antworten.",
    "Read on air": "Live vorlesen",
    "Search": "Suchen",
    "The AI broadcast desk for the markets.": "Das KI-Broadcast-Pult für die Märkte.",
    "Create account": "Konto erstellen", "Log in": "Anmelden",
    "ranked by |Δ%| across your watchlist": "sortiert nach |Δ%| in Ihrer Beobachtungsliste",
    'Ask about {sym} — or tap a suggestion below': 'Fragen zu {sym} — oder tippe unten auf einen Vorschlag',
    // settings tabs + guided tour
    "ACCOUNT": "KONTO", "START": "START", "DATA": "DATEN", "VOICE": "STIMME", "MEET": "MEETING",
    "exit": "beenden", "skip tour": "Tour überspringen", "Back": "Zurück", "Next": "Weiter", "Done": "Fertig",
    "Command bar": "Befehlsleiste",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Geben Sie hier ein beliebiges Kürzel ein und drücken Sie Enter, um es zu charten. „ADD TSLA“ und „DEL TSLA“ verwalten Ihre Beobachtungsliste. Firmennamen funktionieren auch.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Das ist Ihre Befehlsleiste. Geben Sie ein Kürzel wie Apple oder Nvidia ein und drücken Sie Enter, um es zu charten.",
    "Your anchor — that's me": "Ihr Moderator — das bin ich",
    "I read every answer on air. Pick from 22 anchors and 18 sets right here, each with its own voice and soundscape.": "Ich lese jede Antwort auf Sendung vor. Wähle hier aus 22 Moderatoren und 18 Kulissen, jede mit eigener Stimme und eigenem Klang.",
    "That's me, your anchor. Twenty-two anchors and eighteen sets to choose from, right here.": "Das bin ich, dein Moderator. Zweiundzwanzig Moderatoren und achtzehn Kulissen zur Auswahl, direkt hier.",
    "Switches the interface and my spoken answers between six languages. Your choice is remembered.": "Stellt die Oberfläche und meine gesprochenen Antworten auf sechs Sprachen um. Deine Wahl wird gespeichert.",
    "Export the session as Word, PowerPoint or Excel. A review step lets you edit everything before it saves.": "Exportiere die Sitzung als Word, PowerPoint oder Excel. Ein Prüfschritt lässt dich vorher alles bearbeiten.",
    "Export your session as Word, PowerPoint or Excel. You can edit everything before it saves.": "Exportiere deine Sitzung als Word, PowerPoint oder Excel. Du kannst vorher alles bearbeiten.",
    "Your watchlist scrolls across the top. Flip DEMO to LIVE in settings for real Finnhub quotes.": "Deine Beobachtungsliste läuft oben durch. Stelle in den Einstellungen von DEMO auf LIVE für echte Finnhub-Kurse.",
    "Add your events and I announce them on air when they're due. Market events merge in automatically.": "Füge deine Termine hinzu und ich melde sie auf Sendung, wenn sie fällig sind. Markttermine kommen automatisch dazu.",
    "Add events to your calendar and I'll announce them on air when they're due.": "Trag Termine in deinen Kalender ein und ich melde sie auf Sendung, wenn sie fällig sind.",
    "The AI desk": "Das KI-Pult",
    "Ask anything here. I also take commands: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Frag hier, was du willst. Ich verstehe auch Befehle: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Fragen Sie mich hier alles. Ich verstehe auch einfache Befehle, wie, take me to Robinhood, oder, what's on Netflix.",
    "Answers, news & Watch": "Antworten, Nachrichten & Ansehen",
    "Answers, news, and the streaming catalog land here. Trailers play right inside.": "Antworten, Nachrichten und der Streaming-Katalog landen hier. Trailer laufen direkt hier.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Antworten, Nachrichten und der Streaming-Katalog erscheinen alle hier, an einem Ort.",
    "Ticker tape": "Kursband",
    "Why setup? (mostly optional)": "Warum einrichten? (meist optional)",
    "Demo mode needs no setup. AI answers come from external models billed to your account, so they need your key. Open Settings from this menu and paste it under START.": "Der Demo-Modus braucht keine Einrichtung. KI-Antworten kommen von externen Modellen auf deine Rechnung, sie brauchen also deinen Schlüssel. Öffne die Einstellungen über dieses Menü und füge ihn unter START ein.",
    "One last thing. My answers come from external models billed to your account, so they need your key. Everything else is optional. That's the tour!": "Noch etwas. Meine Antworten kommen von externen Modellen auf deine Rechnung, sie brauchen also deinen Schlüssel. Alles andere ist optional. Das war die Tour!",
    // settings footer + MEET tab
    "Close": "Schließen", "Apply": "Übernehmen",
    "Go Live — no setup": "Live gehen — ohne Einrichtung",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Starten Sie sofort ein neues Meeting in einem Browser-Tab (nutzt Ihre bestehende Anmeldung) und teilen Sie dann den Vantage-Bildschirm. Keine Schlüssel, kein OAuth.",
    "New Google Meet": "Neues Google Meet", "New Zoom meeting": "Neues Zoom-Meeting",
    "Join": "Beitreten", "copy link": "Link kopieren", "end": "beenden",
    "paste your meeting link to pin it as LIVE…": "Meeting-Link einfügen, um ihn als LIVE anzuheften…",
    "Pin": "Anheften",
    "connected": "verbunden", "disconnect": "trennen",
    // START tab
    "AI desk": "KI-Pult", "ready": "bereit", "Voice": "Stimme", "browser": "Browser",
    "Live quotes": "Live-Kurse", "live": "live", "demo": "Demo", "Real videos": "Echte Videos",
    "on": "an", "optional": "optional", "Streaming": "Streaming", "Calendar": "Kalender", "built-in": "integriert", "Meetings": "Meetings",
    "You're already set up.": "Sie sind bereits startklar.",
    "AI DESK IS ON": "DAS KI-PULT IST AN",
    "WHAT'S SET UP": "WAS EINGERICHTET IST", "tap to configure": "zum Konfigurieren tippen",
    "tour · demo · missions": "Tour · Demo · Missionen", "pick your anchor": "Moderator wählen",
    "skip — I'll explore on my own": "überspringen — ich erkunde selbst",
    // DATA tab
    "PANELS": "PANELS", "ticker tape": "Kursband", "watchlist": "Beobachtungsliste", "top movers": "größte Bewegungen", "news & video": "Nachrichten & Video", "calendar": "Kalender", "portfolio": "Portfolio",
    "in-app alerts": "In-App-Benachrichtigungen", "price triggers": "Preisauslöser", "breaking news": "Eilmeldungen",
    "P&F SIGNALS": "P&F-SIGNALE", "P&F signals": "P&F-Signale", "P&F pattern alerts": "P&F-Muster-Benachrichtigungen",
    "color-blind mode (blue/orange + ▲▼)": "Modus für Farbenblindheit (Blau/Orange + ▲▼)",
    "privacy mode — blur balances": "Privatsphärenmodus — Salden verwischen",
    "hidden": "ausgeblendet",
    "CLOCK TIMEZONE": "ZEITZONE DER UHR",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Stellt die Kopfzeilen-Uhr ein. Das OFFEN/GESCHLOSSEN-Abzeichen folgt immer den NYSE-Zeiten (Eastern).",
    "refresh interval": "Aktualisierungsintervall", "Manual": "Manuell", "refresh now": "jetzt aktualisieren",
    "replay tutorial": "Tutorial wiederholen", "DEMO": "DEMO", "LIVE": "LIVE",
    "Demo mode is a seeded random-walk session: reproducible, no key or network needed.": "Der Demo-Modus ist eine geseedete Random-Walk-Sitzung: reproduzierbar, ohne Schlüssel und Netz.",
 "needs": "erfordert",
    "at": "um", "off": "aus",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "KI-Pult-Antworten erfordern {plan}. Die Modelle unten sind deaktiviert, bis Sie upgraden (oder den Entwicklermodus in KONTO aktivieren).",
 "use only this": "nur dieses verwenden", "BASE URL": "BASE URL", "MODEL": "MODELL",
    "The desk remembers this conversation locally (this device only) so follow-up questions work.": "Das Pult merkt sich dieses Gespräch lokal (nur auf diesem Gerät), damit Anschlussfragen funktionieren.", "forget conversation": "Gespräch vergessen", "Desk memory cleared — the conversation is forgotten.": "Pult-Gedächtnis gelöscht — das Gespräch ist vergessen.", "MEMORY": "GEDÄCHTNIS", "{n} turns remembered on this device": "{n} Runden auf diesem Gerät gespeichert", "Memory": "Gedächtnis", "empty": "leer",
    "format:": "Format:", "e.g.": "z. B.",
    "API KEY": "API-SCHLÜSSEL",
 "or": "oder",
    "ANCHOR": "MODERATOR", "ENVIRONMENT": "UMGEBUNG", "BACKGROUND CREW": "HINTERGRUND-TEAM",
    "Auto — whoever isn't anchoring": "Auto — wer gerade nicht moderiert", "Off — solo broadcast": "Aus — Solo-Sendung",
    "VOICE ENGINE": "SPRACH-ENGINE", "BROWSER · free": "BROWSER · kostenlos",
    "ELEVENLABS VOICE": "ELEVENLABS-STIMME",
    "READING SPEED": "LESEGESCHWINDIGKEIT", "auto-read the first answer that finishes": "die erste fertige Antwort automatisch vorlesen",
    "UI click sounds — terminal blips on every button": "UI-Klickgeräusche — Terminal-Pieptöne bei jedem Button", "SOUND VOLUME": "TON-LAUTSTÄRKE",
    "ambient music": "Hintergrundmusik", "your Spotify playlist, docked bottom-right": "deine Spotify-Playlist, angedockt unten rechts",
    "generative synth, ducks under the anchor's voice": "generativer Synth, senkt sich unter die Stimme des Moderators", "MUSIC SOURCE": "MUSIKQUELLE",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Keine Anmeldung nötig — schalte ♪ ein und der Player dockt unten rechts an. (Spotifys Embed spielt 30-Sekunden-Vorschauen ohne Konto; vollständige Titel laufen automatisch, wenn du in diesem Browser bereits bei Spotify angemeldet bist.)",
    "OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS": "OPTIONAL · PREMIUM-KONTO FÜR VOLLSTÄNDIGE TITEL VERBINDEN", "FULL PLAYBACK · SPOTIFY PREMIUM": "VOLLSTÄNDIGE WIEDERGABE · SPOTIFY PREMIUM",
    "create an app ↗": "App erstellen ↗", "● connected — full tracks enabled": "● verbunden — vollständige Titel aktiviert",
    "Spotify app Client ID": "Client-ID der Spotify-App", "In your Spotify app settings, add this exact Redirect URI:": "Füge in den Einstellungen deiner Spotify-App genau diese Redirect-URI hinzu:",
    "Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.": "Spotify verlangt https oder 127.0.0.1 — öffne diese App unter http://127.0.0.1:5173 (nicht localhost) und registriere das.",
    "Connect Spotify": "Spotify verbinden", "connecting…": "verbinde…", "MUSIC VOLUME": "MUSIK-LAUTSTÄRKE", "preview voice": "Stimme anhören",
    "You're exploring as a guest": "Du erkundest als Gast",
    "Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.": "Erstelle ein kostenloses Konto, um deinen Tarif über Besuche hinweg zu speichern. Deine Watchlist, dein Portfolio und deine Einstellungen bleiben ohnehin auf diesem Gerät erhalten.",
    "Sign in / create account": "Anmelden / Konto erstellen", "secured on server": "auf dem Server gesichert", "stored on this device": "auf diesem Gerät gespeichert",
    "YOUR PLAN": "DEIN TARIF", "CURRENT": "AKTUELL", "Upgrade": "Upgrade", "Switch": "Wechseln",
    "Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.": "Kostenpflichtige Upgrades öffnen den sicheren Checkout von Stripe (Testmodus). Kartendaten werden bei Stripe eingegeben, niemals hier.",
    "No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.": "Es ist kein Zahlungsdienstleister verbunden, daher werden kostenpflichtige Tarife als Simulation freigeschaltet — es wird keine Karte verlangt und nichts berechnet.",
    "Sign out": "Abmelden", "Terms & Privacy accepted": "AGB & Datenschutz akzeptiert", "This account UI is a prototype; see the security note in the code.": "Diese Konto-Oberfläche ist ein Prototyp; siehe den Sicherheitshinweis im Code.",
  },
  pt: {
    "DataHub has no dataset matching \"{term}\".": "O DataHub não tem nenhum conjunto de dados correspondente a \"{term}\".",
    "DataHub had no exact match. Closest dataset: {name}.": "O DataHub não encontrou uma correspondência exata. Conjunto de dados mais próximo: {name}.",
    "DataHub match: {name}.": "Correspondência no DataHub: {name}.",
    "DataHub match: {name} on {platform}.": "Correspondência no DataHub: {name} em {platform}.",
    "DataHub has no schema recorded for {name}.": "O DataHub não tem nenhum esquema registado para {name}.",
    "DataHub has no owner recorded for {name}.": "O DataHub não tem nenhum proprietário registado para {name}.",
    "DataHub records no downstream datasets for {name}.": "O DataHub não regista conjuntos de dados a jusante para {name}.",
    "DataHub records no upstream datasets for {name}.": "O DataHub não regista conjuntos de dados a montante para {name}.",
    "DataHub's schema for {name} has no column named \"{col}\".": "O esquema de {name} no DataHub não tem nenhuma coluna chamada \"{col}\".",
    "DataHub lookup failed: {reason}": "A consulta ao DataHub falhou: {reason}",
    "ALLOCATION BY VALUE": "ALOCAÇÃO POR VALOR",
    "DAY RANGE": "INTERVALO DO DIA",
    "MARKET CLOSED": "MERCADO FECHADO",
    "ON THE DESK": "NA MESA",
    "last": "último",
    "last trade": "última negociação",
    "prev close": "fecho ant.",
    "Export": "Exportar", "More": "Mais", "Settings": "Definições", "sign in": "iniciar sessão",
    "Games": "Jogos", "learn how stocks work": "aprenda como as ações funcionam",
    "Ambient sound": "Som ambiente", "waves, jungle, space hum…": "ondas, selva, zumbido espacial…",
    "Music": "Música", "background score": "música de fundo",
    "Type a symbol and press Enter  ·  HELP for commands": "Escreva um símbolo e prima Enter  ·  HELP para comandos",
    "OPEN": "ABERTO", "CLOSED": "FECHADO",
    "standing by": "em espera",
    "voice & anchor settings": "definições de voz e apresentador", "SET": "CENÁRIO", "stop reading": "parar leitura", "free": "grátis",
    "ASK ALL": "PERGUNTAR A TODOS",
 "Summarize {sym} today": "Resumir {sym} hoje", "What's moving today?": "O que está a mover-se hoje?", "Take me to Robinhood": "Leva-me ao Robinhood", "What's on Netflix?": "O que há na Netflix?", "Write a report → PPT": "Escrever um relatório → PPT",
    "WATCHLIST": "LISTA DE ACOMPANHAMENTO", "TOP MOVERS": "MAIORES VARIAÇÕES", "full chart": "gráfico completo",
    "LINE": "LINHA", "not enough movement for a P&F column yet": "ainda não há movimento suficiente para uma coluna P&F", "3-box reversal · this session": "reversão de 3 caixas · esta sessão",
    "tracking {price} · box {box} · session range {lo}–{hi}": "acompanhando {price} · caixa {box} · intervalo da sessão {lo}–{hi}", "first column at ≥ {up} or < {down}": "primeira coluna com ≥ {up} ou < {down}", "column 2 needs a reversal < {down}": "a coluna 2 precisa de uma reversão < {down}", "column 2 needs a reversal ≥ {up}": "a coluna 2 precisa de uma reversão ≥ {up}",
    "Language": "Idioma",
    "Desk": "Mesa", "Markets": "Mercados", "News": "Notícias", "Portfolio": "Carteira",
    "Price alerts": "Alertas de preço", "Getting started": "Primeiros passos",
    "Live quotes are provided by this server — no key needed on this device.": "As cotações em tempo real são fornecidas por este servidor — nenhuma chave é necessária neste dispositivo.",
    "Live quotes are not configured on this server.": "As cotações em tempo real não estão configuradas neste servidor.",
    "VIDEO SEARCH": "PESQUISA DE VÍDEO",
    "Real, embeddable video results are provided by this server — no key needed on this device.": "Resultados de vídeo reais e incorporáveis são fornecidos por este servidor — nenhuma chave é necessária neste dispositivo.",
    "Not configured on this server — \"show videos of …\" asks the AI to guess instead.": "Não configurado neste servidor — \"mostra vídeos de …\" pede à IA para adivinhar.",
    "STREAMING CATALOG": "CATÁLOGO DE STREAMING",
    "Netflix / Disney+ / Hulu libraries and trailers are provided by this server — no key needed on this device.": "Os catálogos Netflix / Disney+ / Hulu e os trailers são fornecidos por este servidor — nenhuma chave é necessária neste dispositivo.",
    "Not configured on this server — public-domain films via \"free movies …\" still play in-desk.": "Não configurado neste servidor — filmes de domínio público via \"free movies …\" continuam a tocar no desk.",
    "Studio voice is provided by this server — no key needed on this device.": "A voz de estúdio é fornecida por este servidor — nenhuma chave é necessária neste dispositivo.",
    "Studio voice is not configured on this server.": "A voz de estúdio não está configurada neste servidor.",
    "This server has a studio-voice key set, but the last call to it failed.": "Este servidor tem uma chave de voz de estúdio configurada, mas a última chamada falhou.",
    "Loading voices…": "A carregar vozes…",
 "Pick a studio voice in settings": "Escolhe uma voz de estúdio nas definições",
    "Video search is not configured on this server, and no key is set in this browser.": "A pesquisa de vídeos não está configurada neste servidor e não há chave neste navegador.",
    "The AI desk is part of": "A mesa de IA faz parte de",
    "not configured": "não configurado", "Demo mode needs no keys — everything below works right now.": "O modo demo não precisa de chaves — tudo abaixo já funciona.",
    "AI DESK IS OFF": "A MESA DE IA ESTÁ DESLIGADA", "Answers run on this server's model key. Nothing to set up.": "As respostas usam a chave de modelo deste servidor. Nada para configurar.", "Answers run on your local model. Nothing leaves this device.": "As respostas usam o teu modelo local. Nada sai deste dispositivo.", "This server has no model key configured yet, so the desk can't answer. Everything else works.": "Este servidor ainda não tem uma chave de modelo, por isso a mesa não consegue responder. Tudo o resto funciona.",
    "This server holds the model key, so the desk can already answer.": "Este servidor guarda a chave do modelo, por isso a mesa já consegue responder.",
    "Read on air": "Ler em direto",
    "Search": "Pesquisar",
    "The AI broadcast desk for the markets.": "A mesa de transmissão com IA para os mercados.",
    "Create account": "Criar conta", "Log in": "Iniciar sessão",
    "ranked by |Δ%| across your watchlist": "ordenado por |Δ%| na sua lista de acompanhamento",
    'Ask about {sym} — or tap a suggestion below': 'Pergunte sobre {sym} — ou toque numa sugestão',
    "ACCOUNT": "CONTA", "START": "INÍCIO", "DATA": "DADOS", "VOICE": "VOZ", "MEET": "REUNIÃO",
    "exit": "sair", "skip tour": "ignorar visita", "Back": "Voltar", "Next": "Seguinte", "Done": "Concluído",
    "Command bar": "Barra de comandos",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Escreva aqui qualquer símbolo e prima Enter para o representar no gráfico. “ADD TSLA” e “DEL TSLA” gerem a sua lista de acompanhamento. Nomes de empresas também funcionam.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Esta é a sua barra de comandos. Escreva um símbolo como Apple ou Nvidia e prima Enter para o representar no gráfico.",
    "Your anchor — that's me": "O seu apresentador — sou eu",
    "I read every answer on air. Pick from 22 anchors and 18 sets right here, each with its own voice and soundscape.": "Leio cada resposta no ar. Escolhe entre 22 apresentadores e 18 cenários aqui mesmo, cada um com a sua voz e ambiente sonoro.",
    "That's me, your anchor. Twenty-two anchors and eighteen sets to choose from, right here.": "Esse sou eu, o teu apresentador. Vinte e dois apresentadores e dezoito cenários à escolha, aqui mesmo.",
    "Switches the interface and my spoken answers between six languages. Your choice is remembered.": "Muda a interface e as minhas respostas faladas entre seis idiomas. A tua escolha fica guardada.",
    "Export the session as Word, PowerPoint or Excel. A review step lets you edit everything before it saves.": "Exporta a sessão como Word, PowerPoint ou Excel. Um passo de revisão deixa-te editar tudo antes de guardar.",
    "Export your session as Word, PowerPoint or Excel. You can edit everything before it saves.": "Exporta a tua sessão como Word, PowerPoint ou Excel. Podes editar tudo antes de guardar.",
    "Your watchlist scrolls across the top. Flip DEMO to LIVE in settings for real Finnhub quotes.": "A tua lista de seguimento desliza no topo. Muda DEMO para LIVE nas definições para cotações reais da Finnhub.",
    "Add your events and I announce them on air when they're due. Market events merge in automatically.": "Adiciona os teus eventos e eu anuncio-os no ar quando chegar a hora. Os eventos de mercado juntam-se automaticamente.",
    "Add events to your calendar and I'll announce them on air when they're due.": "Adiciona eventos ao teu calendário e eu anuncio-os no ar quando chegar a hora.",
    "The AI desk": "A mesa de IA",
    "Ask anything here. I also take commands: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Pergunta o que quiseres aqui. Também aceito comandos: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Pergunte-me o que quiser aqui. Também compreendo comandos simples, como, take me to Robinhood, ou, what's on Netflix.",
    "Answers, news & Watch": "Respostas, notícias e Ver",
    "Answers, news, and the streaming catalog land here. Trailers play right inside.": "As respostas, as notícias e o catálogo de streaming aparecem aqui. Os trailers reproduzem-se aqui dentro.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "As respostas, as notícias e o catálogo de streaming aparecem todos aqui, num só lugar.",
    "Ticker tape": "Fita de cotações",
    "Why setup? (mostly optional)": "Porquê configurar? (quase tudo opcional)",
    "Demo mode needs no setup. AI answers come from external models billed to your account, so they need your key. Open Settings from this menu and paste it under START.": "O modo demo não precisa de configuração. As respostas de IA vêm de modelos externos faturados à tua conta, por isso precisam da tua chave. Abre as Definições neste menu e cola-a em START.",
    "One last thing. My answers come from external models billed to your account, so they need your key. Everything else is optional. That's the tour!": "Uma última coisa. As minhas respostas vêm de modelos externos faturados à tua conta, por isso precisam da tua chave. Tudo o resto é opcional. Fim da visita!",
    // settings footer + MEET tab
    "Close": "Fechar", "Apply": "Aplicar",
    "Go Live — no setup": "Ao vivo — sem configuração",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Inicie instantaneamente uma nova reunião num separador do navegador (usa a sessão que já tem iniciada) e depois partilhe o ecrã do Vantage. Sem chaves, sem OAuth.",
    "New Google Meet": "Novo Google Meet", "New Zoom meeting": "Nova reunião Zoom",
    "Join": "Entrar", "copy link": "copiar ligação", "end": "terminar",
    "paste your meeting link to pin it as LIVE…": "cole a ligação da sua reunião para a fixar como AO VIVO…",
    "Pin": "Fixar",
    "connected": "ligado", "disconnect": "desligar",
    // START tab
    "AI desk": "Mesa de IA", "ready": "pronto", "Voice": "Voz", "browser": "navegador",
    "Live quotes": "Cotações ao vivo", "live": "ao vivo", "demo": "demo", "Real videos": "Vídeos reais",
    "on": "ligado", "optional": "opcional", "Streaming": "Streaming", "Calendar": "Calendário", "built-in": "integrado", "Meetings": "Reuniões",
    "You're already set up.": "Já está tudo pronto.",
    "AI DESK IS ON": "A MESA DE IA ESTÁ ATIVA",
    "WHAT'S SET UP": "O QUE ESTÁ CONFIGURADO", "tap to configure": "toque para configurar",
    "tour · demo · missions": "visita · demo · missões", "pick your anchor": "escolha o seu apresentador",
    "skip — I'll explore on my own": "ignorar — vou explorar sozinho",
    // DATA tab
    "PANELS": "PAINÉIS", "ticker tape": "fita de cotações", "watchlist": "lista de acompanhamento", "top movers": "maiores variações", "news & video": "notícias e vídeo", "calendar": "calendário", "portfolio": "carteira",
    "in-app alerts": "alertas no aplicativo", "price triggers": "gatilhos de preço", "breaking news": "última hora",
    "P&F SIGNALS": "SINAIS P&F", "P&F signals": "sinais P&F", "P&F pattern alerts": "alertas de padrões P&F",
    "color-blind mode (blue/orange + ▲▼)": "modo para daltônicos (azul/laranja + ▲▼)",
    "privacy mode — blur balances": "modo privacidade — desfocar saldos",
    "hidden": "oculto",
    "CLOCK TIMEZONE": "FUSO HORÁRIO DO RELÓGIO",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Define o relógio do cabeçalho. O crachá de mercado ABERTO/FECHADO segue sempre o horário da NYSE (hora do Leste).",
    "refresh interval": "intervalo de atualização", "Manual": "Manual", "refresh now": "atualizar agora",
    "replay tutorial": "repetir tutorial", "DEMO": "DEMO", "LIVE": "AO VIVO",
    "Demo mode is a seeded random-walk session: reproducible, no key or network needed.": "O modo demo é uma sessão de passeio aleatório com semente: reproduzível, sem chave nem rede.",
 "needs": "requer",
    "at": "às", "off": "desativar",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "As respostas da mesa de IA requerem {plan}. Os modelos abaixo estão desativados até fazer o upgrade (ou ativar o modo programador em CONTA).",
 "use only this": "usar apenas este", "BASE URL": "BASE URL", "MODEL": "MODELO",
    "The desk remembers this conversation locally (this device only) so follow-up questions work.": "A mesa lembra esta conversa localmente (apenas neste dispositivo) para que as perguntas de seguimento funcionem.", "forget conversation": "esquecer conversa", "Desk memory cleared — the conversation is forgotten.": "Memória da mesa limpa — a conversa foi esquecida.", "MEMORY": "MEMÓRIA", "{n} turns remembered on this device": "{n} turnos lembrados neste dispositivo", "Memory": "Memória", "empty": "vazio",
    "format:": "formato:", "e.g.": "por ex.",
    "API KEY": "CHAVE API",
 "or": "ou",
    "ANCHOR": "APRESENTADOR", "ENVIRONMENT": "AMBIENTE", "BACKGROUND CREW": "EQUIPA DE FUNDO",
    "Auto — whoever isn't anchoring": "Auto — quem não estiver a apresentar", "Off — solo broadcast": "Desligado — transmissão a solo",
    "VOICE ENGINE": "MOTOR DE VOZ", "BROWSER · free": "NAVEGADOR · grátis",
    "ELEVENLABS VOICE": "VOZ DA ELEVENLABS",
    "READING SPEED": "VELOCIDADE DE LEITURA", "auto-read the first answer that finishes": "ler automaticamente a primeira resposta que terminar",
    "UI click sounds — terminal blips on every button": "sons de clique da interface — bips de terminal em cada botão", "SOUND VOLUME": "VOLUME DO SOM",
    "ambient music": "música ambiente", "your Spotify playlist, docked bottom-right": "a tua playlist do Spotify, ancorada em baixo à direita",
    "generative synth, ducks under the anchor's voice": "sintetizador generativo, baixa sob a voz do apresentador", "MUSIC SOURCE": "FONTE DE MÚSICA",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Sem necessidade de iniciar sessão — ativa ♪ e o leitor ancora em baixo à direita. (O leitor incorporado do Spotify reproduz pré-visualizações de 30 segundos sem conta; as faixas completas tocam automaticamente se já tiveres sessão iniciada no Spotify neste navegador.)",
    "OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS": "OPCIONAL · LIGA UMA CONTA PREMIUM PARA FAIXAS COMPLETAS", "FULL PLAYBACK · SPOTIFY PREMIUM": "REPRODUÇÃO COMPLETA · SPOTIFY PREMIUM",
    "create an app ↗": "criar uma app ↗", "● connected — full tracks enabled": "● ligado — faixas completas ativadas",
    "Spotify app Client ID": "Client ID da app do Spotify", "In your Spotify app settings, add this exact Redirect URI:": "Nas definições da tua app do Spotify, adiciona esta Redirect URI exata:",
    "Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.": "O Spotify exige https ou 127.0.0.1 — abre esta app em http://127.0.0.1:5173 (não localhost) e regista esse endereço.",
    "Connect Spotify": "Ligar o Spotify", "connecting…": "a ligar…", "MUSIC VOLUME": "VOLUME DA MÚSICA", "preview voice": "ouvir a voz",
    "You're exploring as a guest": "Estás a explorar como convidado",
    "Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.": "Cria uma conta gratuita para guardar o teu plano entre visitas. A tua lista de acompanhamento, carteira e definições já persistem neste dispositivo de qualquer forma.",
    "Sign in / create account": "Iniciar sessão / criar conta", "secured on server": "protegido no servidor", "stored on this device": "guardado neste dispositivo",
    "YOUR PLAN": "O TEU PLANO", "CURRENT": "ATUAL", "Upgrade": "Melhorar", "Switch": "Mudar",
    "Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.": "As melhorias pagas abrem o checkout seguro do Stripe (modo de teste). Os dados do cartão são introduzidos no Stripe, nunca aqui.",
    "No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.": "Não há nenhum processador de pagamentos ligado, por isso os planos pagos são desbloqueados como simulação — não é pedido nenhum cartão e nada é cobrado.",
    "Sign out": "Terminar sessão", "Terms & Privacy accepted": "Termos e Privacidade aceites", "This account UI is a prototype; see the security note in the code.": "Esta interface de conta é um protótipo; consulta a nota de segurança no código.",
  },
  it: {
    "DataHub has no dataset matching \"{term}\".": "DataHub non ha alcun set di dati corrispondente a \"{term}\".",
    "DataHub had no exact match. Closest dataset: {name}.": "DataHub non ha trovato una corrispondenza esatta. Set di dati più vicino: {name}.",
    "DataHub match: {name}.": "Corrispondenza DataHub: {name}.",
    "DataHub match: {name} on {platform}.": "Corrispondenza DataHub: {name} su {platform}.",
    "DataHub has no schema recorded for {name}.": "DataHub non ha alcuno schema registrato per {name}.",
    "DataHub has no owner recorded for {name}.": "DataHub non ha alcun proprietario registrato per {name}.",
    "DataHub records no downstream datasets for {name}.": "DataHub non registra set di dati a valle per {name}.",
    "DataHub records no upstream datasets for {name}.": "DataHub non registra set di dati a monte per {name}.",
    "DataHub's schema for {name} has no column named \"{col}\".": "Lo schema di {name} in DataHub non ha alcuna colonna chiamata \"{col}\".",
    "DataHub lookup failed: {reason}": "Ricerca su DataHub non riuscita: {reason}",
    "ALLOCATION BY VALUE": "RIPARTIZIONE PER VALORE",
    "DAY RANGE": "RANGE DEL GIORNO",
    "MARKET CLOSED": "MERCATO CHIUSO",
    "ON THE DESK": "IN POSTAZIONE",
    "last": "ultimo",
    "last trade": "ultima operazione",
    "prev close": "chius. prec.",
    "Export": "Esporta", "More": "Altro", "Settings": "Impostazioni", "sign in": "accedi",
    "Games": "Giochi", "learn how stocks work": "scopri come funzionano le azioni",
    "Ambient sound": "Suono ambientale", "waves, jungle, space hum…": "onde, giungla, ronzio spaziale…",
    "Music": "Musica", "background score": "musica di sottofondo",
    "Type a symbol and press Enter  ·  HELP for commands": "Digita un simbolo e premi Invio  ·  HELP per i comandi",
    "OPEN": "APERTO", "CLOSED": "CHIUSO",
    "standing by": "in attesa",
    "voice & anchor settings": "impostazioni voce e conduttore", "SET": "SET", "stop reading": "ferma lettura", "free": "gratis",
    "ASK ALL": "CHIEDI A TUTTI",
 "Summarize {sym} today": "Riassumi {sym} oggi", "What's moving today?": "Cosa si muove oggi?", "Take me to Robinhood": "Portami su Robinhood", "What's on Netflix?": "Cosa c'è su Netflix?", "Write a report → PPT": "Scrivi un report → PPT",
    "WATCHLIST": "LISTA DI OSSERVAZIONE", "TOP MOVERS": "MAGGIORI VARIAZIONI", "full chart": "grafico completo",
    "LINE": "LINEA", "not enough movement for a P&F column yet": "movimento ancora insufficiente per una colonna P&F", "3-box reversal · this session": "inversione a 3 caselle · questa sessione",
    "tracking {price} · box {box} · session range {lo}–{hi}": "seguendo {price} · casella {box} · intervallo della sessione {lo}–{hi}", "first column at ≥ {up} or < {down}": "prima colonna a ≥ {up} o < {down}", "column 2 needs a reversal < {down}": "la colonna 2 richiede un'inversione < {down}", "column 2 needs a reversal ≥ {up}": "la colonna 2 richiede un'inversione ≥ {up}",
    "Language": "Lingua",
    "Desk": "Postazione", "Markets": "Mercati", "News": "Notizie", "Portfolio": "Portafoglio",
    "Price alerts": "Avvisi di prezzo", "Getting started": "Primi passi",
    "Live quotes are provided by this server — no key needed on this device.": "Le quotazioni live sono fornite da questo server — nessuna chiave necessaria su questo dispositivo.",
    "Live quotes are not configured on this server.": "Le quotazioni live non sono configurate su questo server.",
    "VIDEO SEARCH": "RICERCA VIDEO",
    "Real, embeddable video results are provided by this server — no key needed on this device.": "I risultati video reali e incorporabili sono forniti da questo server — nessuna chiave necessaria su questo dispositivo.",
    "Not configured on this server — \"show videos of …\" asks the AI to guess instead.": "Non configurato su questo server — \"mostrami video di …\" chiede all'IA di indovinare.",
    "STREAMING CATALOG": "CATALOGO STREAMING",
    "Netflix / Disney+ / Hulu libraries and trailers are provided by this server — no key needed on this device.": "I cataloghi Netflix / Disney+ / Hulu e i trailer sono forniti da questo server — nessuna chiave necessaria su questo dispositivo.",
    "Not configured on this server — public-domain films via \"free movies …\" still play in-desk.": "Non configurato su questo server — i film di pubblico dominio via \"free movies …\" continuano a riprodursi nel desk.",
    "Studio voice is provided by this server — no key needed on this device.": "La voce da studio è fornita da questo server — nessuna chiave necessaria su questo dispositivo.",
    "Studio voice is not configured on this server.": "La voce da studio non è configurata su questo server.",
    "This server has a studio-voice key set, but the last call to it failed.": "Questo server ha una chiave per la voce da studio configurata, ma l'ultima chiamata è fallita.",
    "Loading voices…": "Caricamento voci…",
 "Pick a studio voice in settings": "Scegli una voce studio nelle impostazioni",
    "Video search is not configured on this server, and no key is set in this browser.": "La ricerca video non è configurata su questo server e non c'è alcuna chiave in questo browser.",
    "The AI desk is part of": "La postazione IA fa parte di",
    "not configured": "non configurato", "Demo mode needs no keys — everything below works right now.": "La modalità demo non richiede chiavi — tutto qui sotto funziona già.",
    "AI DESK IS OFF": "LA POSTAZIONE IA È SPENTA", "Answers run on this server's model key. Nothing to set up.": "Le risposte usano la chiave del modello di questo server. Niente da configurare.", "Answers run on your local model. Nothing leaves this device.": "Le risposte usano il tuo modello locale. Nulla lascia questo dispositivo.", "This server has no model key configured yet, so the desk can't answer. Everything else works.": "Questo server non ha ancora una chiave del modello, quindi la postazione non può rispondere. Tutto il resto funziona.",
    "This server holds the model key, so the desk can already answer.": "Questo server conserva la chiave del modello, quindi la postazione può già rispondere.",
    "Read on air": "Leggi in onda",
    "Search": "Cerca",
    "The AI broadcast desk for the markets.": "La postazione di trasmissione IA per i mercati.",
    "Create account": "Crea account", "Log in": "Accedi",
    "ranked by |Δ%| across your watchlist": "ordinato per |Δ%| nella tua lista di osservazione",
    'Ask about {sym} — or tap a suggestion below': 'Chiedi di {sym} — o tocca un suggerimento',
    "ACCOUNT": "ACCOUNT", "START": "INIZIO", "DATA": "DATI", "VOICE": "VOCE", "MEET": "RIUNIONE",
    "exit": "esci", "skip tour": "salta il tour", "Back": "Indietro", "Next": "Avanti", "Done": "Fatto",
    "Command bar": "Barra dei comandi",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Digita qui un simbolo qualsiasi e premi Invio per rappresentarlo nel grafico. “ADD TSLA” e “DEL TSLA” gestiscono la tua lista di osservazione. Funzionano anche i nomi delle aziende.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Questa è la tua barra dei comandi. Digita un simbolo come Apple o Nvidia e premi Invio per rappresentarlo nel grafico.",
    "Your anchor — that's me": "Il tuo conduttore — sono io",
    "I read every answer on air. Pick from 22 anchors and 18 sets right here, each with its own voice and soundscape.": "Leggo ogni risposta in onda. Scegli tra 22 conduttori e 18 scenografie proprio qui, ognuna con voce e suono propri.",
    "That's me, your anchor. Twenty-two anchors and eighteen sets to choose from, right here.": "Sono io, il tuo conduttore. Ventidue conduttori e diciotto scenografie tra cui scegliere, proprio qui.",
    "Switches the interface and my spoken answers between six languages. Your choice is remembered.": "Cambia l'interfaccia e le mie risposte vocali tra sei lingue. La scelta viene ricordata.",
    "Export the session as Word, PowerPoint or Excel. A review step lets you edit everything before it saves.": "Esporta la sessione in Word, PowerPoint o Excel. Un passaggio di revisione permette di modificare tutto prima del salvataggio.",
    "Export your session as Word, PowerPoint or Excel. You can edit everything before it saves.": "Esporta la tua sessione in Word, PowerPoint o Excel. Puoi modificare tutto prima del salvataggio.",
    "Your watchlist scrolls across the top. Flip DEMO to LIVE in settings for real Finnhub quotes.": "La tua lista di titoli scorre in alto. Passa da DEMO a LIVE nelle impostazioni per quotazioni reali Finnhub.",
    "Add your events and I announce them on air when they're due. Market events merge in automatically.": "Aggiungi i tuoi eventi e li annuncio in onda quando è il momento. Gli eventi di mercato si aggiungono automaticamente.",
    "Add events to your calendar and I'll announce them on air when they're due.": "Aggiungi eventi al tuo calendario e li annuncerò in onda quando sarà il momento.",
    "The AI desk": "La postazione IA",
    "Ask anything here. I also take commands: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Chiedimi qualsiasi cosa qui. Accetto anche comandi: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Chiedimi qualsiasi cosa qui. Capisco anche comandi semplici, come, take me to Robinhood, oppure, what's on Netflix.",
    "Answers, news & Watch": "Risposte, notizie e Guarda",
    "Answers, news, and the streaming catalog land here. Trailers play right inside.": "Risposte, notizie e il catalogo streaming arrivano qui. I trailer si riproducono all'interno.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Le risposte, le notizie e il catalogo di streaming appaiono tutti qui, in un unico posto.",
    "Ticker tape": "Nastro delle quotazioni",
    "Why setup? (mostly optional)": "Perché configurare? (quasi tutto opzionale)",
    "Demo mode needs no setup. AI answers come from external models billed to your account, so they need your key. Open Settings from this menu and paste it under START.": "La modalità demo non richiede configurazione. Le risposte IA vengono da modelli esterni fatturati sul tuo conto, quindi serve la tua chiave. Apri le Impostazioni da questo menu e incollala sotto START.",
    "One last thing. My answers come from external models billed to your account, so they need your key. Everything else is optional. That's the tour!": "Un'ultima cosa. Le mie risposte vengono da modelli esterni fatturati sul tuo conto, quindi serve la tua chiave. Tutto il resto è facoltativo. Fine del tour!",
    // settings footer + MEET tab
    "Close": "Chiudi", "Apply": "Applica",
    "Go Live — no setup": "Vai in diretta — nessuna configurazione",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Avvia all'istante una nuova riunione in una scheda del browser (usa la sessione con cui hai già effettuato l'accesso), poi condividi lo schermo di Vantage. Nessuna chiave, nessun OAuth.",
    "New Google Meet": "Nuovo Google Meet", "New Zoom meeting": "Nuova riunione Zoom",
    "Join": "Partecipa", "copy link": "copia link", "end": "termina",
    "paste your meeting link to pin it as LIVE…": "incolla il link della tua riunione per fissarlo come IN DIRETTA…",
    "Pin": "Fissa",
    "connected": "connesso", "disconnect": "disconnetti",
    // START tab
    "AI desk": "Postazione IA", "ready": "pronto", "Voice": "Voce", "browser": "browser",
    "Live quotes": "Quotazioni in diretta", "live": "in diretta", "demo": "demo", "Real videos": "Video reali",
    "on": "attivo", "optional": "opzionale", "Streaming": "Streaming", "Calendar": "Calendario", "built-in": "integrato", "Meetings": "Riunioni",
    "You're already set up.": "Sei già pronto.",
    "AI DESK IS ON": "LA POSTAZIONE IA È ATTIVA",
    "WHAT'S SET UP": "COSA È CONFIGURATO", "tap to configure": "tocca per configurare",
    "tour · demo · missions": "tour · demo · missioni", "pick your anchor": "scegli il tuo conduttore",
    "skip — I'll explore on my own": "salta — esplorerò da solo",
    // DATA tab
    "PANELS": "PANNELLI", "ticker tape": "nastro delle quotazioni", "watchlist": "lista di osservazione", "top movers": "maggiori variazioni", "news & video": "notizie e video", "calendar": "calendario", "portfolio": "portafoglio",
    "in-app alerts": "avvisi nell'app", "price triggers": "soglie di prezzo", "breaking news": "ultima ora",
    "P&F SIGNALS": "SEGNALI P&F", "P&F signals": "segnali P&F", "P&F pattern alerts": "avvisi di pattern P&F",
    "color-blind mode (blue/orange + ▲▼)": "modalità per daltonici (blu/arancione + ▲▼)",
    "privacy mode — blur balances": "modalità privacy — sfoca i saldi",
    "hidden": "nascosto",
    "CLOCK TIMEZONE": "FUSO ORARIO DELL'OROLOGIO",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Imposta l'orologio dell'intestazione. Il badge di mercato APERTO/CHIUSO segue sempre gli orari del NYSE (ora orientale).",
    "refresh interval": "intervallo di aggiornamento", "Manual": "Manuale", "refresh now": "aggiorna ora",
    "replay tutorial": "rivedi il tutorial", "DEMO": "DEMO", "LIVE": "IN DIRETTA",
    "Demo mode is a seeded random-walk session: reproducible, no key or network needed.": "La modalità demo è una sessione random-walk con seed: riproducibile, senza chiave né rete.",
 "needs": "richiede",
    "at": "alle", "off": "disattiva",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "Le risposte della postazione IA richiedono {plan}. I modelli qui sotto sono disattivati finché non esegui l'upgrade (o attivi la modalità sviluppatore in ACCOUNT).",
 "use only this": "usa solo questo", "BASE URL": "BASE URL", "MODEL": "MODELLO",
    "The desk remembers this conversation locally (this device only) so follow-up questions work.": "La postazione ricorda questa conversazione localmente (solo su questo dispositivo) così le domande di seguito funzionano.", "forget conversation": "dimentica conversazione", "Desk memory cleared — the conversation is forgotten.": "Memoria della postazione cancellata — la conversazione è dimenticata.", "MEMORY": "MEMORIA", "{n} turns remembered on this device": "{n} turni memorizzati su questo dispositivo", "Memory": "Memoria", "empty": "vuoto",
    "format:": "formato:", "e.g.": "es.",
    "API KEY": "CHIAVE API",
 "or": "o",
    "ANCHOR": "CONDUTTORE", "ENVIRONMENT": "AMBIENTE", "BACKGROUND CREW": "TROUPE DI SOTTOFONDO",
    "Auto — whoever isn't anchoring": "Auto — chi non sta conducendo", "Off — solo broadcast": "Off — trasmissione in solitaria",
    "VOICE ENGINE": "MOTORE VOCALE", "BROWSER · free": "BROWSER · gratis",
    "ELEVENLABS VOICE": "VOCE ELEVENLABS",
    "READING SPEED": "VELOCITÀ DI LETTURA", "auto-read the first answer that finishes": "leggi automaticamente la prima risposta completata",
    "UI click sounds — terminal blips on every button": "suoni di clic dell'interfaccia — bip da terminale su ogni pulsante", "SOUND VOLUME": "VOLUME AUDIO",
    "ambient music": "musica d'ambiente", "your Spotify playlist, docked bottom-right": "la tua playlist Spotify, ancorata in basso a destra",
    "generative synth, ducks under the anchor's voice": "synth generativo, si abbassa sotto la voce del conduttore", "MUSIC SOURCE": "SORGENTE MUSICALE",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Nessun accesso necessario — attiva ♪ e il player si ancora in basso a destra. (L'embed di Spotify riproduce anteprime di 30 secondi senza account; i brani completi partono automaticamente se hai già effettuato l'accesso a Spotify in questo browser.)",
    "OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS": "OPZIONALE · COLLEGA UN ACCOUNT PREMIUM PER I BRANI COMPLETI", "FULL PLAYBACK · SPOTIFY PREMIUM": "RIPRODUZIONE COMPLETA · SPOTIFY PREMIUM",
    "create an app ↗": "crea un'app ↗", "● connected — full tracks enabled": "● collegato — brani completi attivati",
    "Spotify app Client ID": "Client ID dell'app Spotify", "In your Spotify app settings, add this exact Redirect URI:": "Nelle impostazioni della tua app Spotify, aggiungi esattamente questa Redirect URI:",
    "Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.": "Spotify richiede https o 127.0.0.1 — apri questa app su http://127.0.0.1:5173 (non localhost) e registra quell'indirizzo.",
    "Connect Spotify": "Collega Spotify", "connecting…": "connessione…", "MUSIC VOLUME": "VOLUME MUSICA", "preview voice": "ascolta la voce",
    "You're exploring as a guest": "Stai esplorando come ospite",
    "Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.": "Crea un account gratuito per conservare il tuo piano tra una visita e l'altra. La tua watchlist, il portafoglio e le impostazioni restano comunque su questo dispositivo.",
    "Sign in / create account": "Accedi / crea un account", "secured on server": "protetto sul server", "stored on this device": "salvato su questo dispositivo",
    "YOUR PLAN": "IL TUO PIANO", "CURRENT": "ATTUALE", "Upgrade": "Passa a superiore", "Switch": "Cambia",
    "Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.": "Gli upgrade a pagamento aprono il checkout sicuro di Stripe (modalità test). I dati della carta si inseriscono su Stripe, mai qui.",
    "No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.": "Nessun elaboratore di pagamenti è collegato, quindi i piani a pagamento vengono sbloccati come simulazione — non viene chiesta alcuna carta e non viene addebitato nulla.",
    "Sign out": "Esci", "Terms & Privacy accepted": "Termini e Privacy accettati", "This account UI is a prototype; see the security note in the code.": "Questa interfaccia dell'account è un prototipo; vedi la nota di sicurezza nel codice.",
  },
};
const loadLang = () => { try { const l = localStorage.getItem("vantage-lang"); return LANGS.some(x => x.code === l) ? l : "en"; } catch { return "en"; } };
const makeT = (lang) => (s) => (lang === "en" ? s : (I18N[lang]?.[s] ?? s));
const I18nContext = createContext({ lang: "en", setLang: () => {}, t: (s) => s });
const useI18n = () => useContext(I18nContext);

// ambient-music playback level (was 0.08 — too quiet to hear); shared by start + speech-duck
const MUSIC_LEVEL = 0.16;

// parse a Spotify link or URI (playlist/album/track/…) into its embeddable player URL
// TradingView's embeddable advanced-chart widget — designed to be iframed, so it works IN-FRAME
// (unlike brokers, which block embedding). Interactive: timeframes, indicators, symbol search.
function tvEmbedUrl(sym) {
  const params = new URLSearchParams({
    symbol: String(sym || "SPY").toUpperCase(), interval: "D", theme: "dark", style: "1",
    timezone: "America/New_York", withdateranges: "1", hide_side_toolbar: "0",
    allow_symbol_change: "1", details: "1", locale: "en",
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}

// a short, readable label for a meeting URL (no long query strings)
function meetingLabel(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("meet.google")) return `Google Meet · ${u.pathname.replace(/\//g, "") || "meeting"}`;
    if (u.hostname.includes("zoom")) { const m = u.pathname.match(/\/j\/(\d+)/); return `Zoom · ${m ? m[1] : "meeting"}`; }
    if (u.hostname.includes("teams")) return "Microsoft Teams · meeting";
    return u.hostname.replace(/^www\./, "");
  } catch { return String(url); }
}

// normalize a Spotify URL / URI / bare ID into an embeddable player URL (or null if unrecognized)
function spotifyEmbedUrl(input) {
  const s = String(input || "").trim();
  const m = s.match(/(?:spotify[:/]+)(playlist|album|track|artist|show|episode)[:/]+([A-Za-z0-9]+)/i)
        || s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/i);
  return m ? `https://open.spotify.com/embed/${m[1].toLowerCase()}/${m[2]}?utm_source=generator&theme=0` : null;
}

// convert a Spotify link/URI into a Web-Playback-SDK context {type, uri}
function spotifyContextUri(input) {
  const m = String(input || "").match(/(?:spotify[:/]+|open\.spotify\.com\/(?:intl-[a-z]+\/)?)(playlist|album|track|artist)[:/]+([A-Za-z0-9]+)/i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  return { type, uri: `spotify:${type}:${m[2]}` };
}
// base64url of bytes, for PKCE code_verifier / code_challenge
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The logo, drawn on a canvas. Geometry is copied from src/ui/VantageMark.jsx
// because canvas cannot render React — if one changes, change both.
function drawVantageMark(ctx, x, y, size, tile = "#161718", ink = "#ffffff", dot = "#e4f222", edge = "#383b3f") {
  const s = size / 32;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0.75, 0.75, 30.5, 30.5, 7.25); else ctx.rect(0.75, 0.75, 30.5, 30.5);
  ctx.fillStyle = tile; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = 3.1; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(16, 23); ctx.lineTo(24, 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(24, 10, 2.8, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill();
  ctx.restore();
}

// VANTAGE wordmark badge (PNG data URL) for branding exported documents — built once, cached
let _logoCache = null;
function makeLogoDataUrl() {
  if (_logoCache) return _logoCache;
  if (typeof document === "undefined") return null;
  const W = 360, H = 96, cvs = document.createElement("canvas");
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext("2d");
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  ctx.fillStyle = C.panel; rr(2, 2, W - 4, H - 4, 16); ctx.fill();
  ctx.strokeStyle = C.edgeStrong; ctx.lineWidth = 2; rr(2, 2, W - 4, H - 4, 16); ctx.stroke();
  drawVantageMark(ctx, 24, 24, 48);
  ctx.fillStyle = C.textStrong; ctx.font = "510 34px Inter, Arial, sans-serif"; ctx.fillText("VANTAGE", 88, 54);
  ctx.fillStyle = C.muted; ctx.font = "12px monospace"; ctx.fillText("MARKET INTELLIGENCE", 90, 77);
  _logoCache = cvs.toDataURL("image/png");
  return _logoCache;
}

// ---------- demo market engine ----------
const UNIVERSE = [
  { sym: "AAPL", name: "Apple Inc.", base: 228.4, vol: 0.012 },
  { sym: "MSFT", name: "Microsoft Corp.", base: 452.1, vol: 0.010 },
  { sym: "NVDA", name: "NVIDIA Corp.", base: 131.8, vol: 0.024 },
  { sym: "AMD", name: "Advanced Micro Devices", base: 162.5, vol: 0.022 },
  { sym: "AMZN", name: "Amazon.com Inc.", base: 197.6, vol: 0.015 },
  { sym: "GOOGL", name: "Alphabet Inc.", base: 182.3, vol: 0.013 },
  { sym: "META", name: "Meta Platforms", base: 574.9, vol: 0.017 },
  { sym: "TSLA", name: "Tesla Inc.", base: 246.2, vol: 0.030 },
  { sym: "JPM", name: "JPMorgan Chase", base: 224.7, vol: 0.009 },
  { sym: "BAC", name: "Bank of America", base: 44.1, vol: 0.011 },
  { sym: "XOM", name: "Exxon Mobil", base: 117.5, vol: 0.010 },
  { sym: "DIS", name: "Walt Disney Co.", base: 96.8, vol: 0.014 },
  { sym: "NFLX", name: "Netflix Inc.", base: 702.3, vol: 0.019 },
];

// deterministic PRNG so every demo session opens the same "day"
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// build one symbol's synthetic intraday price path — a seeded random walk so demo mode is reproducible
function genIntraday(sym, base, vol) {
  // 390 one-minute bars: a full 9:30 → 16:00 session
  let seed = 0;
  for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) | 0;
  const rnd = mulberry32(seed + 20260712);
  const drift = (rnd() - 0.48) * vol * 0.15;
  const prevClose = base * (1 + (rnd() - 0.5) * vol * 2);
  let price = prevClose * (1 + (rnd() - 0.5) * vol * 0.8);
  const open = price;
  const bars = [];
  for (let m = 0; m < 390; m++) {
    const shock = (rnd() + rnd() - 1) * vol * price * 0.11;
    price = Math.max(0.5, price + shock + drift * price * 0.01);
    const h = Math.floor(m / 60) + 9, min = (m + 30) % 60;
    const hh = min < 30 && m >= 30 ? h + 1 : h;
    bars.push({
      t: `${((hh - 1) % 12) + 1}:${String((m + 30) % 60).padStart(2, "0")}`,
      i: m,
      price: +price.toFixed(2),
    });
  }
  return { bars, open: +open.toFixed(2), prevClose: +prevClose.toFixed(2) };
}

// seed the whole demo universe at once: a deterministic intraday series + quote for every symbol
function buildDemoMarket() {
  const m = {};
  for (const u of UNIVERSE) {
    const { bars, open, prevClose } = genIntraday(u.sym, u.base, u.vol);
    const prices = bars.map(b => b.price);
    m[u.sym] = {
      ...u,
      bars,
      open,
      prevClose,
      price: prices[prices.length - 1],
      high: Math.max(...prices),
      low: Math.min(...prices),
      cursor: 250, // "session in progress" — ticks advance from here
    };
  }
  return m;
}

// ---------- helpers ----------
const fmt = (n, d = 2) =>
  n == null || isNaN(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (n == null || isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

// Turn a raw transport error ("HTTP 429", "Ollama HTTP 404 — model not found") into plain
// language before it ever reaches the screen. Keeps any human detail after the em dash and
// strips the bare status code, so users never see "HTTP 500" etc.
// Our backend answers every failure with { error: "<a written reason>" }. Code
// that throws the bare status instead discards that, and humanizeError is then
// left guessing from a number: a REJECTED API KEY comes out as "the service is
// temporarily unavailable", which is wrong in the one way that matters — it
// tells you to wait when the thing actually needs fixing.
async function serverError(r, label) {
  let detail = "";
  try { detail = (await r.clone().json())?.error || ""; } catch { /* not JSON — fall back to the code */ }
  return new Error(detail || `${label} HTTP ${r.status}`);
}

const humanizeError = (input) => {
  let s = String(input?.message ?? input ?? "").trim();
  if (!s) return "something went wrong — try again";
  const m = s.match(/HTTP\s+(\d{3})/i);
  if (!m) return s; // already human (e.g. "model not found — run: ollama pull …")
  const code = Number(m[1]);
  const detail = s.split("—").slice(1).join("—").trim(); // text after the first em dash, if any
  if (detail && !/^\d{3}$/.test(detail)) return detail; // a written reason beats the code
  return code === 429 ? "the service is busy right now — give it a moment"
    : code === 401 || code === 403 ? "access was refused — check the key in settings"
    : code === 404 ? "not found"
    : code >= 500 ? "the service is temporarily unavailable"
    : "the request didn't go through — try again";
};

// ---------- Finnhub (live mode) ----------
// Without a key of its own the browser asks our backend, which holds one. The
// direct call put the key in a URL query string — visible in devtools and
// recorded by every proxy and access log the request crossed.
async function fetchQuote(sym) {
  const r = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
  if (!r.ok) {
    const e = new Error(
      r.status === 429 ? "HTTP 429 — quote rate limit reached, try again shortly"
      : r.status === 503 ? "HTTP 503 — live quotes are not configured on this server"
      : `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  const q = await r.json();
  // The proxy answers { quotes: { SYM: {...} } }; Finnhub answers the quote flat.
  const flat = q?.quotes ? q.quotes[sym.toUpperCase()] : q;
  if (flat?.error) throw new Error(flat.error === "unknown" ? "Unknown symbol" : `Quote failed (${flat.error})`);
  if (!flat || (flat.c === 0 && flat.pc === 0)) throw new Error("Unknown symbol");
  return flat; // {c,d,dp,h,l,o,pc,t}
}
// Resolve a typed company NAME to its ticker via Finnhub's symbol search (e.g. "coca cola" → "KO").
// Prefers a clean US common-stock symbol (skips foreign ".XX" listings). Returns null on miss.
async function finnhubSearch(query) {
  try {
    const r = await fetch(`/api/symbol-search?q=${encodeURIComponent(query)}`);
    if (!r.ok) return null;
    const d = await r.json();
    const clean = (d.result || []).filter(x => x.symbol && !x.symbol.includes(".") && /^[A-Z][A-Z0-9]{0,5}$/.test(x.symbol));
    const best = clean.find(x => x.type === "Common Stock") || clean[0];
    return best?.symbol || null;
  } catch { return null; }
}

// ---------- desk anchors: parameterized procedural characters ----------
const CHARACTERS = [
  { id: "sterling", name: "Sterling", skin: "#D9A57E", hairColor: "#2A2118", hair: "short", suit: "#1B2231", shirt: "#E8EBF2", tieBase: true, accessory: "headset" },
  { id: "vega", name: "Vega", skin: "#C68863", hairColor: "#3B2417", hair: "long", suit: "#2A2133", shirt: "#F2E8EC", tieBase: false, accessory: "earpiece", earrings: true },
  { id: "kwan", name: "Kwan", skin: "#E8C39E", hairColor: "#151515", hair: "short", suit: "#232A24", shirt: "#E8EBF2", tieBase: true, accessory: "headset", glasses: true },
  { id: "moss", name: "Moss", skin: "#B97F5C", hairColor: "#9A9A9A", hair: "bald", beard: true, suit: "#2E2A20", shirt: "#EFEAD9", tieBase: true, accessory: "earpiece" },
  { id: "tick3r", name: "TICK-3R", robot: true, suit: "#20262F" },
  { id: "pax", name: "Pax", skin: "#D9A57E", hairColor: "#241A12", hair: "short", suit: "#241C33", shirt: "#141821", tieBase: false, accessory: "headset", hat: "podcast" },
  { id: "sir-gaine", name: "Sir Gaine", skin: "#D9A57E", hairColor: "#2A2118", hair: "short", suit: "#3A414D", shirt: "#C9D2E4", tieBase: false, hat: "knight" },
  { id: "mordo", name: "Mordo", skin: "#C68863", hairColor: "#C9C4B8", hair: "short", beard: true, suit: "#2A1E44", shirt: "#3A2A66", tieBase: false, hat: "wizard" },
  { id: "nova", name: "Nova", skin: "#C68863", hairColor: "#1A1A1A", hair: "short", suit: "#E4E7EE", shirt: "#C7CEDB", tieBase: false, hat: "astronaut" },
  { id: "marina", name: "Marina", skin: "#E8C39E", hairColor: "#1FA9A0", hair: "long", suit: "#186A72", shirt: "#2FD3C6", tieBase: false, earrings: true, hat: "mermaid" },
  { id: "aurora", name: "Aurora", skin: "#E8C6A8", hairColor: "#6B3B1F", hair: "long", suit: "#7A2E5A", shirt: "#E9A8C8", tieBase: false, earrings: true, hat: "crown" },
  { id: "diana", name: "Diana", skin: "#C68863", hairColor: "#1A1512", hair: "long", suit: "#2E5A3A", shirt: "#C9A24B", tieBase: false, earrings: true, hat: "amazon" },
  // genre anchors — each genre has a male + female option so the roster stays gender-balanced
  { id: "blaze", name: "Blaze", skin: "#C68863", hairColor: "#1A1A1A", hair: "short", suit: "#3B4A2F", shirt: "#5A6B3F", tieBase: false, hat: "action" },
  { id: "zara", name: "Zara", skin: "#C68863", hairColor: "#1A1A1A", hair: "long", suit: "#3B4A2F", shirt: "#5A6B3F", tieBase: false, earrings: true, hat: "action" },
  { id: "kit", name: "Kit", skin: "#D9A57E", hairColor: "#4A3421", hair: "short", suit: "#6B5334", shirt: "#8A6F45", tieBase: false, hat: "explorer" },
  { id: "sienna", name: "Sienna", skin: "#D9A57E", hairColor: "#4A3421", hair: "long", suit: "#6B5334", shirt: "#8A6F45", tieBase: false, earrings: true, hat: "explorer" },
  { id: "vesper", name: "Vesper", skin: "#CFC9CE", hairColor: "#0A0A0A", hair: "short", suit: "#14121A", shirt: "#3A0E14", tieBase: false, hat: "horror" },
  { id: "lilith", name: "Lilith", skin: "#CFC9CE", hairColor: "#0A0A0A", hair: "long", suit: "#14121A", shirt: "#3A0E14", tieBase: false, earrings: true, hat: "horror" },
  { id: "colt", name: "Colt", skin: "#C68863", hairColor: "#3B2417", hair: "short", beard: true, suit: "#5A3A24", shirt: "#8A5A34", tieBase: false, hat: "cowboy" },
  { id: "dakota", name: "Dakota", skin: "#D9A57E", hairColor: "#5A3A1E", hair: "long", suit: "#5A3A24", shirt: "#8A5A34", tieBase: false, earrings: true, hat: "cowboy" },
  { id: "marlowe", name: "Marlowe", skin: "#B9A9A0", hairColor: "#20201F", hair: "short", suit: "#2E2E30", shirt: "#D8D8D8", tieBase: true, hat: "noir" },
  { id: "vivienne", name: "Vivienne", skin: "#CDB8AE", hairColor: "#20201F", hair: "long", suit: "#2E2E30", shirt: "#D8D8D8", tieBase: false, earrings: true, hat: "noir" },
];

// What Vantage is, in the product's own words. One constant, because two places
// need the identical answer: the desk-handled intent and the system prompt. A
// model left to describe the app on its own invents a different product every
// time it is asked, which is the one thing an app's account of itself must not do.
const VANTAGE_ABOUT =
  "The application currently in use appears to be a simulated trading platform that displays live market data, " +
  "allowing users to analyze stock performance, price changes, and percentage changes in real time. It provides a " +
  "snapshot of various stocks, including their opening, high, low, and previous close prices, enabling traders and " +
  "analysts to assess market trends and make informed observations.";

// "How's your day?" answered from the session the anchor is actually presenting —
// whether the bell has rung, which way the tape is leaning, what it is watching.
// A model asked this invents a mood and a workday it never had; the desk knows both.
function anchorDayLine({ name, open, sym, chgPct }) {
  const who = name || "the desk";
  const dir = chgPct == null ? null : chgPct > 0.4 ? "up" : chgPct < -0.4 ? "down" : "flat";
  // Two phrasings per direction: mid-session the tape is happening TO the anchor,
  // after the close it is something the anchor is looking back at. Reusing one
  // clause for both is what produces "one of those sessions on the last print".
  const live =
    dir === "up" ? `${sym} is green, so the mood in here is decent` :
    dir === "down" ? `${sym} is red, so it's one of those sessions` :
    dir === "flat" ? `${sym} is barely moving, which makes for a quiet one` :
    "the tape is still waking up";
  const closed =
    dir === "up" ? `${sym} finished green, which is a pleasant way to end it` :
    dir === "down" ? `${sym} closed red — one of those days` :
    dir === "flat" ? `${sym} went nowhere all session` :
    "the tape has nothing to say yet";
  const cap = (t) => `${t[0].toUpperCase()}${t.slice(1)}`;
  return open
    ? `Good, thanks — ${who} here, mid-session with the bell already rung. ${cap(live)}. What can I look at for you?`
    : `Quiet one — ${who} here, and the market is closed, so I'm on the overnight desk. ${cap(closed)}. Ask me anything while it's calm.`;
}

// A greeting gets a greeting back, plus the one thing the person needs next:
// what is on the desk and how to change it. Answering "hi" with a market
// analysis is the fastest way to make an assistant feel like a search box.
function anchorGreeting({ name, open, hour, sym, said }) {
  const who = name || "the desk";
  // If they said which part of the day it is, say it back. The clock here is the
  // browser's, not theirs — answering "good morning" with "Evening" is the desk
  // correcting someone about where they are standing.
  const timeOfDay = said
    ? said[0].toUpperCase() + said.slice(1).toLowerCase()
    : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const state = open ? "we're mid-session" : "the market's closed, so it's quiet up here";
  return `${timeOfDay} — ${who} here, and ${state}. ${sym} is up front: ask me anything about it, or type another symbol in the bar above to switch.`;
}

// all-caps words that look like tickers but aren't, for intent parsing
const CAPS_STOP = new Set(["I", "A", "GO", "TO", "ON", "OF", "THE", "AND", "OR", "ADD", "DEL", "HELP", "TD", "AI", "ETF", "USD", "US", "CEO", "IPO", "PE", "EPS", "YTD", "NEWS"]);

// common company names / variants people type instead of the real Finnhub ticker
const SYMBOL_ALIASES = {
  GOOGLE: "GOOGL", ALPHABET: "GOOGL",
  FACEBOOK: "META", FB: "META", INSTAGRAM: "META", META: "META",
  APPLE: "AAPL",
  MICROSOFT: "MSFT",
  AMAZON: "AMZN",
  TESLA: "TSLA",
  NVIDIA: "NVDA",
  NETFLIX: "NFLX",
  DISNEY: "DIS",
  EXXON: "XOM", EXXONMOBIL: "XOM",
  JPMORGAN: "JPM", CHASE: "JPM",
  BOFA: "BAC", BANKOFAMERICA: "BAC",
  // more common names for instant offline resolution (the live search covers everything else)
  WALMART: "WMT", COSTCO: "COST", TARGET: "TGT", HOMEDEPOT: "HD",
  COCACOLA: "KO", COKE: "KO", PEPSI: "PEP", PEPSICO: "PEP", STARBUCKS: "SBUX",
  MCDONALDS: "MCD", NIKE: "NKE", BOEING: "BA", INTEL: "INTC", AMD: "AMD",
  ORACLE: "ORCL", SALESFORCE: "CRM", ADOBE: "ADBE", CISCO: "CSCO", IBM: "IBM",
  UBER: "UBER", LYFT: "LYFT", AIRBNB: "ABNB", PAYPAL: "PYPL", VISA: "V", MASTERCARD: "MA",
  SHOPIFY: "SHOP", PALANTIR: "PLTR", SNOWFLAKE: "SNOW", ROKU: "ROKU", SPOTIFY: "SPOT",
  FORD: "F", GM: "GM", GENERALMOTORS: "GM", PFIZER: "PFE", MODERNA: "MRNA", JOHNSONANDJOHNSON: "JNJ",
  WALTDISNEY: "DIS", BERKSHIRE: "BRK.B", COINBASE: "COIN", ROBINHOOD: "HOOD", BROADCOM: "AVGO",
  QUALCOMM: "QCOM", MICRON: "MU", ARM: "ARM", SUPERMICRO: "SMCI", DELL: "DELL", HP: "HPQ",
  WELLSFARGO: "WFC", GOLDMAN: "GS", GOLDMANSACHS: "GS", MORGANSTANLEY: "MS", CITIGROUP: "C", CITI: "C",
  CHEVRON: "CVX", DELTA: "DAL", AMERICANAIRLINES: "AAL", SOUTHWEST: "LUV",
};

// normalize a single token (e.g. "google" → "GOOGL"); returns the uppercased token unchanged if no alias
const resolveSym = (raw) => {
  const k = String(raw || "").trim().toUpperCase();
  return SYMBOL_ALIASES[k] || k;
};

// scan free text for a company name / alias and return its ticker, else null
const aliasFromText = (text) => {
  const up = ` ${String(text || "").toUpperCase().replace(/[^A-Z ]+/g, " ")} `;
  for (const word of Object.keys(SYMBOL_ALIASES)) {
    if (up.includes(` ${word} `)) return SYMBOL_ALIASES[word];
  }
  return null;
};

// suggest a real ticker for an unrecognized symbol: alias first, then a prefix match against the demo universe
const suggestSym = (bad) => {
  const b = String(bad || "").toUpperCase();
  if (SYMBOL_ALIASES[b]) return SYMBOL_ALIASES[b];
  const hit = UNIVERSE.map(u => u.sym).find(s => (b.startsWith(s) || s.startsWith(b)) && s !== b);
  return hit || null;
};

const ENVIRONMENTS = [
  { id: "studio", name: "Studio" },
  { id: "newsroom", name: "Newsroom" },
  { id: "floor", name: "Trading Floor" },
  { id: "skyline", name: "Skyline" },
  { id: "server", name: "Server Room" },
  { id: "space", name: "Space Station" },
  { id: "castle", name: "Castle Hall" },
  { id: "tower", name: "Wizard Tower" },
  { id: "podcast", name: "Podcast Studio" },
  { id: "reef", name: "Coral Reef" },
  { id: "palace", name: "Royal Palace" },
  { id: "jungle", name: "Jungle" },
  { id: "action", name: "Action Set" },
  { id: "temple", name: "Lost Temple" },
  { id: "horror", name: "Haunted Manor" },
  { id: "western", name: "Wild West" },
  { id: "noir", name: "Film Noir" },
  { id: "cyber", name: "Cyber Core" },
];

// Clock timezones the user can pick in settings. The header clock shows the chosen zone; the
// market OPEN/CLOSED pill always stays on New York time (the NYSE runs on ET regardless of viewer).
const TIMEZONES = [
  { group: "Americas", id: "America/New_York", label: "New York · Eastern" },
  { group: "Americas", id: "America/Chicago", label: "Chicago · Central" },
  { group: "Americas", id: "America/Denver", label: "Denver · Mountain" },
  { group: "Americas", id: "America/Phoenix", label: "Phoenix · Arizona (no DST)" },
  { group: "Americas", id: "America/Los_Angeles", label: "Los Angeles · Pacific" },
  { group: "Americas", id: "America/Anchorage", label: "Anchorage · Alaska" },
  { group: "Americas", id: "Pacific/Honolulu", label: "Honolulu · Hawaii" },
  { group: "Americas", id: "America/Toronto", label: "Toronto" },
  { group: "Americas", id: "America/Mexico_City", label: "Mexico City" },
  { group: "Americas", id: "America/Sao_Paulo", label: "São Paulo" },
  { group: "Europe", id: "Europe/London", label: "London · GMT/BST" },
  { group: "Europe", id: "Europe/Dublin", label: "Dublin" },
  { group: "Europe", id: "Europe/Lisbon", label: "Lisbon" },
  { group: "Europe", id: "Europe/Paris", label: "Paris · CET" },
  { group: "Europe", id: "Europe/Madrid", label: "Madrid" },
  { group: "Europe", id: "Europe/Berlin", label: "Berlin" },
  { group: "Europe", id: "Europe/Rome", label: "Rome" },
  { group: "Europe", id: "Europe/Amsterdam", label: "Amsterdam" },
  { group: "Europe", id: "Europe/Zurich", label: "Zurich" },
  { group: "Europe", id: "Europe/Stockholm", label: "Stockholm" },
  { group: "Europe", id: "Europe/Athens", label: "Athens · EET" },
  { group: "Europe", id: "Europe/Helsinki", label: "Helsinki" },
  { group: "Europe", id: "Europe/Moscow", label: "Moscow" },
];
// short zone label (e.g. "EST", "CET") for the chosen timezone at the given moment
const tzAbbrev = (tz, when) => {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(when);
    return p.find(x => x.type === "timeZoneName")?.value || "";
  } catch { return ""; }
};

// Spotlight coach-marks: each step highlights a REAL element (by id) and the anchor narrates `say`.
// Flash a value's background the moment it changes — green uptick, red downtick.
// The key remount is what restarts the CSS animation; the render-time memo keeps
// each direction attached to the value that caused it, however often the parent
// re-renders in between ticks.
function TickFlash({ value, children }) {
  const last = useRef({ value, dir: null });
  if (last.current.value !== value && value != null) {
    last.current = { value, dir: last.current.value == null || value > last.current.value ? "up" : "down" };
  }
  const dir = last.current.dir;
  return <span key={String(value)} className={dir ? `v-tick-${dir}` : undefined}>{children}</span>;
}

const TOUR_STEPS = [
  { target: "tour-symbol", title: "Command bar", body: "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.", say: "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it." },
  { target: "tour-anchor", title: "Your anchor — that's me", body: "I read every answer on air. Pick from 22 anchors and 18 sets right here, each with its own voice and soundscape.", say: "That's me, your anchor. Twenty-two anchors and eighteen sets to choose from, right here." },
  { target: "tour-lang", title: "Speak your language", body: "Switches the interface and my spoken answers between six languages. Your choice is remembered.", say: "Switch the whole app, and my answers, into any of six languages right here." },
  { target: "tour-ask", title: "The AI desk", body: "Ask anything here. I also take commands: “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.", say: "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix." },
  { target: "tour-response", title: "Answers, news & Watch", body: "Answers, news, and the streaming catalog land here. Trailers play right inside.", say: "Answers, news, and the streaming catalog all appear here, in one place." },
  { target: "tour-export", title: "Export & edit anything", body: "Export the session as Word, PowerPoint or Excel. A review step lets you edit everything before it saves.", say: "Export your session as Word, PowerPoint or Excel. You can edit everything before it saves." },
  { target: "tour-ticker", title: "Ticker tape", body: "Your watchlist scrolls across the top. Flip DEMO to LIVE in settings for real Finnhub quotes.", say: "Your watchlist scrolls across the ticker tape. Switch to live Finnhub quotes in settings and it stays live." },
  { target: "app-calendar-panel", title: "Market calendar", body: "Add your events and I announce them on air when they're due. Market events merge in automatically.", say: "Add events to your calendar and I'll announce them on air when they're due." },
  { target: "tour-settings", title: "Why setup? (mostly optional)", body: "Demo mode needs no setup. AI answers come from external models billed to your account, so they need your key. Open Settings from this menu and paste it under START.", say: "One last thing. My answers come from external models billed to your account, so they need your key. Everything else is optional. That's the tour!" },
];

// Interactive missions: auto-check as the user performs each real action.
const MISSIONS = [
  { id: "chart", label: "Chart a stock", hint: "type a ticker up top" },
  { id: "ask", label: "Ask the desk a question", hint: "use the ? box" },
  { id: "watch", label: "Play a trailer or film in-desk", hint: "“what's on netflix” or “free movies”" },
  { id: "nav", label: "Open a broker or in-app chart", hint: "“take me to Robinhood”" },
  { id: "bell", label: "Ring the opening bell", hint: "“ring the bell”" },
  { id: "export", label: "Export a report", hint: "“download excel”" },
];

// Setup guide shown in onboarding. Every provider key lives on the server, so
// this is a tour of what the desk can do — there is nothing to paste.
const SETUP_STEPS = [
  { icon: "🤖", name: "AI desk answers", need: "server-provided", req: true, what: "Answers stream from the model desk this server hosts — no key, no account with a model vendor.", how: "Nothing to set up. The status board in Settings → START shows it live." },
  { icon: "📈", name: "Live market prices", need: "server-provided", what: "Swaps the demo random-walk market for real-time quotes.", how: "Settings → DATA → switch to LIVE." },
  { icon: "🎬", name: "Streaming catalog", need: "server-provided", what: "Real Netflix / Disney+ / Hulu libraries and in-desk trailers.", how: "Ask \"what's on netflix\" — on whenever the server provides it." },
  { icon: "📰", name: "Real video results", need: "server-provided", what: "Real, playable YouTube results instead of AI guesses.", how: "Ask \"show videos of …\" — on whenever the server provides it." },
  { icon: "🎙️", name: "Studio voice", need: "optional", what: "The browser voice works instantly; the studio voice sounds broadcast-grade.", how: "Settings → VOICE → ELEVENLABS." },
];

// friendly label for a calendar event's start time
function fmtEventTime(ev) {
  if (!ev?.start) return "";
  try {
    const d = new Date(ev.start);
    if (ev.allDay) return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + " · all day";
    return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return String(ev.start); }
}

/*
  Animation architecture:
  - props flow in via a ref so the rAF loop never restarts on market ticks
  - IDLE state schedules random one-shot actions: sip coffee, check papers, adjust (glasses/tie)
  - TALKING adds head sway + nod + a gesturing hand; actions are suppressed
  - REACT fires when |move %| crosses the surprise threshold: brows up, mouth "O",
    sweat drop on red shocks / sparkle on green ones
  - character switches play a rise+fade entrance
*/
const ACTIONS = { sip: 2700, papers: 2600, adjust: 1500, react: 1300, stretch: 1900, write: 2800, bell: 3400, eat: 4600, break: 5200, cheer: 1700 };

// Current time on the exchange's clock (US/Eastern, auto-DST via Intl). The anchor's trading day runs
// on NY time so the opening bell and meals stay coherent no matter where the viewer sits.
// Returns { day: 0=Sun…6=Sat, mins: minutes since ET midnight, stamp: "YYYY-M-D" in ET }.
function etNow() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date());
    const g = (tp) => parts.find((p) => p.type === tp)?.value;
    let h = parseInt(g("hour"), 10); if (h === 24) h = 0; // some engines format midnight as 24
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: dayMap[g("weekday")] ?? new Date().getDay(), mins: h * 60 + parseInt(g("minute"), 10), stamp: `${g("year")}-${g("month")}-${g("day")}` };
  } catch {
    const d = new Date();
    return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes(), stamp: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` };
  }
}

// ---- Stock School: a beginner tutorial the anchor teaches, no API/credits needed (all local) ----
// Each lesson: the anchor explains it, then a one-question check. Right answers earn a cheer.
const STOCK_LESSONS = [
  {
    title: "What is a stock?",
    teach: "A stock is a tiny slice of ownership in a company. Buy one share of a company and you literally own a small piece of it — if the business grows more valuable, so can your slice.",
    q: "Owning a share of a company means…",
    choices: ["You own a small piece of that company", "You lent the company money for fixed interest", "You are an employee of the company"],
    answer: 0,
    explain: "Correct — a share is part-ownership. (Lending a company money for interest is a bond, not a stock.)",
  },
  {
    title: "Ticker symbols",
    teach: "Every public company has a short ticker symbol so it's quick to look up — Apple is AAPL, Nvidia is NVDA, Tesla is TSLA. It's just a nickname for the stock on the exchange.",
    q: "What is a ticker symbol?",
    choices: ["The company's phone number", "A short code that identifies a stock", "The price of one share"],
    answer: 1,
    explain: "Right — it's a short code (like NVDA) that names the stock. The price is a separate, constantly-changing number.",
  },
  {
    title: "Why prices move",
    teach: "A stock's price is set by supply and demand — how many people want to buy versus sell right now. Good news (strong earnings, new products) pulls buyers in and lifts the price; bad news does the opposite.",
    q: "A stock's price mostly moves because of…",
    choices: ["A government-fixed daily rate", "Buyers and sellers reacting to news and demand", "The alphabetical order of its ticker"],
    answer: 1,
    explain: "Exactly — price is a live tug-of-war between buyers and sellers reacting to information.",
  },
  {
    title: "Gains and losses (%)",
    teach: "Change is shown as a percentage from the previous close. Green and a plus sign means it's up; red and a minus means it's down. A stock at $100 that rises to $105 is +5%.",
    q: "A stock closed yesterday at $50 and is now $55. That's…",
    choices: ["-10%", "+10%", "+5%"],
    answer: 1,
    explain: "Correct — a $5 gain on $50 is +10%. Percentages let you compare moves across stocks of very different prices.",
  },
  {
    title: "Bid, ask & the spread",
    teach: "At any moment there's a bid (the highest price buyers will pay) and an ask (the lowest price sellers will accept). The small gap between them is the spread — the cost of trading instantly.",
    q: "The 'ask' price is…",
    choices: ["The lowest price a seller will accept", "A question you send the company", "Last year's average price"],
    answer: 0,
    explain: "Right — ask = sellers' lowest price, bid = buyers' highest. You usually buy at the ask and sell at the bid.",
  },
  {
    title: "Bull vs bear markets",
    teach: "A bull market is a stretch of rising prices and optimism; a bear market is a prolonged fall of about 20% or more, with caution and fear. Remember: bulls charge up, bears swipe down.",
    q: "A 'bear market' means prices are broadly…",
    choices: ["Rising strongly", "Falling for a sustained period", "Completely frozen"],
    answer: 1,
    explain: "Correct — bear = sustained decline. These cycles are normal; markets have historically recovered over time.",
  },
  {
    title: "Don't put all your eggs in one basket",
    teach: "Diversification means spreading money across many stocks (or funds) instead of betting everything on one. If one company stumbles, the others cushion the blow. It's the closest thing investing has to a free lunch.",
    q: "Diversification mainly helps by…",
    choices: ["Guaranteeing you never lose money", "Spreading risk so one bad pick hurts less", "Doubling your returns automatically"],
    answer: 1,
    explain: "Right — it reduces risk. Nothing guarantees against losses, but spreading out softens any single blow.",
  },
  {
    title: "Time in the market",
    teach: "Prices bounce around daily, but historically the broad market has trended upward over years. Investing regularly and staying patient tends to beat trying to jump in and out at the perfect moment.",
    q: "For most beginners, a sensible mindset is…",
    choices: ["Panic-sell the moment a stock dips", "Invest steadily and think long-term", "Only buy the single hottest stock"],
    answer: 1,
    explain: "Correct — steady, long-term, diversified investing beats panic. You've graduated Stock School! 🎓",
  },
];

// Bull or Bear: read a headline, predict which way the stock likely moves. Teaches cause → effect.
const BULLBEAR_ROUNDS = [
  { headline: "The company reports quarterly earnings that beat analysts' expectations.", bullish: true, why: "Beating expectations usually pulls buyers in and lifts the stock." },
  { headline: "A flagship product is recalled over a serious safety defect.", bullish: false, why: "Recalls hurt sales and trust, which tends to push the price down." },
  { headline: "The board announces a surprise increase to the dividend.", bullish: true, why: "A bigger dividend signals confidence and rewards shareholders." },
  { headline: "A key executive abruptly resigns amid an accounting investigation.", bullish: false, why: "Leadership turmoil plus accounting worries scares investors off." },
  { headline: "The firm wins a multi-billion-dollar government contract.", bullish: true, why: "A big new revenue stream is a strong tailwind for the stock." },
  { headline: "The company slashes its full-year sales forecast.", bullish: false, why: "Lower guidance implies weaker future profits, so shares often fall." },
  { headline: "The company launches a large share buyback program.", bullish: true, why: "Buybacks shrink the share count and often support the price." },
  { headline: "A rival ships a cheaper product that undercuts the company's prices.", bullish: false, why: "More competition can steal customers and squeeze profit margins." },
];

// Ticker Match: pick the real stock symbol for a well-known company. Teaches how to look stocks up.
const TICKER_ROUNDS = [
  { company: "Apple", options: ["APL", "AAPL", "APPL"], answer: 1 },
  { company: "Nvidia", options: ["NVDA", "NVID", "NDA"], answer: 0 },
  { company: "Tesla", options: ["TSL", "TLA", "TSLA"], answer: 2 },
  { company: "Amazon", options: ["AMZN", "AMZ", "AZN"], answer: 0 },
  { company: "Microsoft", options: ["MCST", "MSF", "MSFT"], answer: 2 },
  { company: "Meta (Facebook)", options: ["META", "FB", "MTA"], answer: 0 },
  { company: "Alphabet (Google)", options: ["GGL", "GOOGL", "ALPH"], answer: 1 },
  { company: "Netflix", options: ["NFX", "NFLX", "NTFL"], answer: 1 },
];

// ---- Blackjack helpers ----
const BJ_SUITS = ["♠", "♥", "♦", "♣"], BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function bjDeck() {
  const d = [];
  for (const s of BJ_SUITS) for (const r of BJ_RANKS) d.push({ r, s });
  return d.sort(() => Math.random() - 0.5);
}
function bjValue(cards) {
  let sum = 0, aces = 0;
  for (const c of cards) { sum += c.r === "A" ? 11 : ["J", "Q", "K"].includes(c.r) ? 10 : +c.r; if (c.r === "A") aces++; }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; } // an ace can count as 1 instead of 11
  return sum;
}

// ---- Chess game component: pass-and-play, vs AI or 2-player ----
// Rules live in src/chess/chess.js — full legality (check, checkmate, stalemate), casual scope
// otherwise (no castling/en-passant, pawns auto-queen).
function ChessGame({ onCheer, onWin, sfx }) {
  const [vsAI, setVsAI] = useState(true);        // default: play the computer (Bears) — good for a lone player
  const [board, setBoard] = useState(chessInit);
  const [turn, setTurn] = useState("w");         // 'w' = Bulls (green, the human) move first
  const [sel, setSel] = useState(null);
  const [targets, setTargets] = useState([]);
  const [winner, setWinner] = useState(null);
  const [captured, setCaptured] = useState({ w: [], b: [] });
  // flying-piece overlay: the board state applies instantly, but the moved glyph slides
  // from→to on top of the grid (~180ms) before the destination square shows its piece
  const [anim, setAnim] = useState(null);        // { from, to, glyph, color, go }
  const animTimer = useRef(null);
  const reducedMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  useLayoutEffect(() => {
    if (!anim || anim.go) return;
    const id = requestAnimationFrame(() => setAnim(a => (a && !a.go ? { ...a, go: true } : a)));
    return () => cancelAnimationFrame(id);
  }, [anim]);
  useEffect(() => () => clearTimeout(animTimer.current), []);

  const reset = (ai = vsAI) => { setVsAI(ai); setBoard(chessInit()); setTurn("w"); setSel(null); setTargets([]); setWinner(null); setCaptured({ w: [], b: [] }); clearTimeout(animTimer.current); setAnim(null); };

  // commit a move (from either the human or the AI), then end the game or pass the turn.
  // Endings are real chess: checkmate wins, stalemate draws. King capture stays only as a
  // backstop — legal-move filtering should make it impossible.
  const commit = (next, taken, side, from, to) => {
    const opp = side === "w" ? "b" : "w";
    const outcome = taken?.t === "k" ? "checkmate" : gameStatus(next, opp);
    setBoard(next);
    // sounds land WITH the flying piece; checkmate adds the win/lose sting a beat later
    const landed = () => {
      setAnim(null);
      sfx?.(taken ? "capture" : "move");
      if (outcome === "checkmate") setTimeout(() => sfx?.(vsAI ? (side === "w" ? "win" : "lose") : "win"), 170);
    };
    clearTimeout(animTimer.current);
    if (reducedMotion || !from || !to) landed();
    else {
      const moved = next[to.r][to.c];
      setAnim({ from, to, glyph: CHESS_GLYPH[moved.t], color: moved.s === "w" ? "#3FE08A" : "#FF6B7A", go: false });
      animTimer.current = setTimeout(landed, 200);
    }
    if (taken) {
      setCaptured(cap => ({ ...cap, [side]: [...cap[side], taken.t] }));
      if (!(vsAI && side === "b")) onCheer?.();            // cheer for the player's captures, not the computer's
    }
    if (outcome === "checkmate") { setWinner(side); onWin?.(side); return; }
    if (outcome === "stalemate") { setWinner("draw"); return; }
    setTurn(opp);
  };

  // the computer's turn (plays Bears/black) — fires shortly after the human moves
  useEffect(() => {
    if (!vsAI || winner || turn !== "b") return;
    const id = setTimeout(() => {
      const mv = chessAIMove(board, "b");
      if (!mv) {                                            // backstop — commit ends mated/stalemated games before the turn passes
        if (inCheck(board, "b")) { setWinner("w"); onWin?.("w"); } else setWinner("draw");
        return;
      }
      const { next, taken } = chessApply(board, mv.from, mv.to);
      commit(next, taken, "b", mv.from, mv.to);
    }, 900 + Math.random() * 800);                          // humanlike pause — instant replies felt like a vending machine
    return () => clearTimeout(id);
  }, [turn, vsAI, winner, board]); // eslint-disable-line react-hooks/exhaustive-deps

  // click a square: if it's a legal target, move the selected piece; otherwise select/deselect
  const clickSquare = (r, c) => {
    if (winner || (vsAI && turn === "b")) return;          // ignore clicks while the computer is thinking
    const piece = board[r][c];
    if (sel && targets.some(t => t.r === r && t.c === c)) {
      const { next, taken } = chessApply(board, sel, { r, c });
      setSel(null); setTargets([]);
      commit(next, taken, turn, sel, { r, c });
      return;
    }
    if (piece && piece.s === turn) { setSel({ r, c }); setTargets(legalMoves(board, r, c)); }
    else { setSel(null); setTargets([]); }
  };


  // ---- Render the chessboard, controls, and status ----
  const checkNow = !winner && inCheck(board, turn);        // side to move is in check → say so and mark the king
  const checkedKing = useMemo(() => {
    if (!checkNow) return null;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (p && p.t === "k" && p.s === turn) return { r, c }; }
    return null;
  }, [checkNow, board, turn]);
  const status = winner
    ? (winner === "draw" ? "🤝 Stalemate — draw"
      : vsAI ? (winner === "w" ? "🎉 Checkmate — you win!" : "💀 Checkmate — you lose")
      : (winner === "w" ? "🐂 Bulls win by checkmate!" : "🐻 Bears win by checkmate!"))
    : (vsAI && turn === "b" ? "🐻 Computer thinking…" : `${turn === "w" ? "🐂 Bulls" : "🐻 Bears"} to move${checkNow ? " — ⚠️ CHECK" : ""}`);
  const capLabel = (arr) => arr.map(t => CHESS_GLYPH[t]).join(" ");
  const modeBtn = (ai, label) => (
    <button onClick={() => reset(ai)}
      style={{ background: vsAI === ai ? "rgba(255,255,255,0.09)" : "transparent", border: `1px solid ${vsAI === ai ? C.accent : C.panelEdge}`, color: vsAI === ai ? C.accentText : C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "4px 9px", cursor: "pointer" }}>{label}</button>
  );
  return (
    <div style={{ padding: 12, fontFamily: SANS, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "flex", gap: 5 }}>{modeBtn(true, "vs Computer")}{modeBtn(false, "2 Player")}</span>
        <button onClick={() => reset()} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "5px 12px", cursor: "pointer" }}>new game ↻</button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 510, textAlign: "center", color: winner ? (winner === "draw" ? C.warn : winner === "w" ? C.up : C.down) : turn === "w" ? C.up : C.down }}>{status}</div>
      <div style={{ position: "relative", width: "100%", maxWidth: 320, aspectRatio: "1 / 1", display: "grid", gridTemplateColumns: "repeat(8, 1fr)", border: `1px solid ${C.panelEdge}`, alignSelf: "center", opacity: (vsAI && turn === "b" && !winner) ? 0.75 : 1 }}>
        {board.map((row, r) => row.map((p, c) => {
          const light = (r + c) % 2 === 0;
          const isSel = sel && sel.r === r && sel.c === c;
          const isTarget = targets.some(t => t.r === r && t.c === c);
          const inFlight = anim && anim.to.r === r && anim.to.c === c;   // real piece hides until the overlay lands
          const inDanger = checkedKing && checkedKing.r === r && checkedKing.c === c; // this king is in check
          return (
            <button key={`${r}-${c}`} onClick={() => clickSquare(r, c)}
              style={{
                position: "relative", border: "none", cursor: winner ? "default" : "pointer", padding: 0,
                background: light ? "#23252a" : "#161718",
                boxShadow: isSel ? "inset 0 0 0 2px #e4f222" : inDanger ? "inset 0 0 0 2px #eb5757" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
              }}>
              {p && <span style={{ fontSize: 22, color: p.s === "w" ? C.up : C.down, textShadow: "0 1px 2px rgba(0,0,0,0.6)", opacity: inFlight ? 0 : 1 }}>{CHESS_GLYPH[p.t]}</span>}
              {isTarget && <span style={{ position: "absolute", width: p ? "82%" : 10, height: p ? "82%" : 10, borderRadius: p ? 6 : "50%", boxSizing: "border-box", border: p ? `2px solid ${C.accent}` : "none", background: p ? "transparent" : C.accent }} />}
            </button>
          );
        }))}
        {anim && (
          <span aria-hidden="true" style={{
            position: "absolute", width: "12.5%", height: "12.5%", pointerEvents: "none", zIndex: 2,
            left: `${(anim.go ? anim.to.c : anim.from.c) * 12.5}%`,
            top: `${(anim.go ? anim.to.r : anim.from.r) * 12.5}%`,
            transition: "left 0.18s ease, top 0.18s ease",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, lineHeight: 1, color: anim.color, textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}>{anim.glyph}</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
        {vsAI ? "You are 🐂 Bulls (green). Checkmate the Bears' king to win — get checkmated and it's over." : "Two players, one screen: 🐂 Bulls vs 🐻 Bears. Checkmate the enemy king to win."} Pawns auto-promote to queens. (Casual rules — no castling or en-passant.)
        {(captured.w.length > 0 || captured.b.length > 0) && <div style={{ marginTop: 4 }}>🐂 took: {capLabel(captured.w) || "—"} · 🐻 took: {capLabel(captured.b) || "—"}</div>}
      </div>
    </div>
  );
}

// ---- DeskAnchor: the animated anchor character, procedural and reactive to props ----
function DeskAnchor({ talking, mood, speakerLabel, character, analyserRef, speechRef, crew, env, cue, busy, onAction, onCue }) {
  const { t } = useI18n();
  const cvsRef = useRef(null);
  const propsRef = useRef({ talking, mood, crew, env, cue, busy, onAction, onCue });
  propsRef.current = { talking, mood, crew, env, cue, busy, onAction, onCue };
  const ch = character || CHARACTERS[0];

  useEffect(() => {
    const cvs = cvsRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    const DPR = window.devicePixelRatio || 1;
    const W = 190, H = 230;
    cvs.width = W * DPR; cvs.height = H * DPR;
    ctx.scale(DPR, DPR);
    let raf, dead = false;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const s = {
      amp: 0, ampTarget: 0, blink: 0, nextBlink: 1800, lastT: 0,
      gazeX: 0, gazeY: 0, gazeTX: 0, gazeTY: 0, tilt: 0, tiltTarget: 0, browTarget: 0,
      action: null, actionStart: 0, nextActionIn: 4000 + Math.random() * 5000,
      prevMood: propsRef.current.mood || 0, enter: 0, bornAt: null, browPulse: 0,
      crewLook: 0, crewNextLook: 3500 + Math.random() * 4000,
      lastCueId: propsRef.current.cue?.id ?? null, cueMeal: null, cueLabel: null,
      busyAmt: 0, // eases 0→1 while a sustained work/present pose is active (its own driver, not the action envelope)
    };

    const startAction = (type, t) => { s.action = type; s.actionStart = t; };
    const actionPhase = (t) => {
      if (!s.action) return 0;
      const p = (t - s.actionStart) / ACTIONS[s.action];
      if (p >= 1) { s.action = null; s.nextActionIn = 6000 + Math.random() * 9000; return 0; }
      return p;
    };
    // smooth 0→1→0 envelope for one-shot actions
    const env = (p) => Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);

    // ---- procedural environments (furthest layer, unaffected by entrance fade) ----
    const drawEnv = (env, t, moodCol, m) => {
      if (!env || env === "studio") return;
      ctx.save();
      if (env === "newsroom") {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#0E1420"); g.addColorStop(1, "#0B0E14");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // accent bands across the set wall
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(0, 40, W, 3); ctx.fillRect(0, 46, W, 1);
        // wall screen, upper right, live mood chart
        ctx.fillStyle = "#080C13"; ctx.fillRect(128, 10, 54, 36);
        ctx.strokeStyle = "#1D2433"; ctx.lineWidth = 1; ctx.strokeRect(128, 10, 54, 36);
        ctx.strokeStyle = moodCol; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const px = 132 + i * 4.6;
          const py = 34 - Math.sin(i * 1.1 + t / 900) * 5 - m * 3 * (i / 10);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        // station logo panel, upper left — size the pill to the measured text so it never overflows
        ctx.font = "700 9px monospace";
        const logoW = ctx.measureText("VANTAGE").width;
        ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(10, 13, logoW + 26, 17);
        drawVantageMark(ctx, 13, 15, 13);
        ctx.fillStyle = C.textStrong; ctx.textBaseline = "middle"; ctx.fillText("VANTAGE", 30, 22); ctx.textBaseline = "alphabetic";
        // rim lights
        ctx.fillStyle = "rgba(232,235,242,0.03)";
        ctx.fillRect(0, 0, 6, H); ctx.fillRect(W - 6, 0, 6, H);
      } else if (env === "floor") {
        ctx.fillStyle = "#0B0F17"; ctx.fillRect(0, 0, W, H);
        // overhead ticker board with crawling dashes
        ctx.fillStyle = "#080B12"; ctx.fillRect(0, 8, W, 14);
        ctx.fillStyle = C.amber; ctx.globalAlpha = 0.45;
        const off = reduced ? 0 : (t / 30) % 24;
        for (let x = -24; x < W + 24; x += 24) ctx.fillRect(x - off, 12, 12, 5);
        ctx.globalAlpha = 1;
        // receding rows of workstations, screens flipping green/red
        for (let row = 0; row < 2; row++) {
          const y = 52 + row * 32, sc = 1 - row * 0.25;
          for (let i = 0; i < 6; i++) {
            const x = 6 + i * 30 * sc + row * 12;
            ctx.fillStyle = "#101623"; ctx.fillRect(x, y, 22 * sc, 14 * sc);
            const lit = Math.sin(i * 3.7 + row * 2.1 + t / 1400) > 0;
            ctx.fillStyle = lit ? "rgba(39,166,68,0.30)" : "rgba(235,87,87,0.30)";
            ctx.fillRect(x + 3 * sc, y + 2 * sc, 16 * sc, 7 * sc);
          }
        }
      } else if (env === "skyline") {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#0A1020"); g.addColorStop(0.7, "#0C1322"); g.addColorStop(1, "#0B0E14");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // twinkling stars
        for (let i = 0; i < 24; i++) {
          const sx = (i * 53) % W, sy = (i * 29) % 70;
          const tw = !reduced && Math.sin(t / 600 + i * 2.3) > 0.6 ? 0.5 : 0.18;
          ctx.fillStyle = `rgba(232,235,242,${tw})`;
          ctx.fillRect(sx, sy, 1.4, 1.4);
        }
        // buildings with slowly shifting lit windows
        for (let i = 0; i < 9; i++) {
          const bw = 14 + ((i * 37) % 16), bh = 40 + ((i * 61) % 70), bx2 = i * 22 - 6;
          ctx.fillStyle = "#0F1524"; ctx.fillRect(bx2, 150 - bh, bw, bh + 60);
          for (let wy = 0; wy < Math.floor(bh / 10); wy++) {
            for (let wx = 0; wx < Math.floor(bw / 7); wx++) {
              const on = Math.sin(i * 7 + wx * 3.1 + wy * 5.7 + Math.floor(t / 2500)) > 0.2;
              if (on) { ctx.fillStyle = "rgba(255,196,64,0.28)"; ctx.fillRect(bx2 + 3 + wx * 7, 154 - bh + wy * 10, 3, 4); }
            }
          }
        }
        // rooftop beacon
        ctx.fillStyle = (reduced || Math.sin(t / 500) > 0) ? "rgba(235,87,87,0.8)" : "rgba(235,87,87,0.15)";
        ctx.fillRect(52, 96, 2, 2);
      } else if (env === "server") {
        ctx.fillStyle = "#0A0D13"; ctx.fillRect(0, 0, W, H);
        for (let rack = 0; rack < 4; rack++) {
          const rx = 10 + rack * 46;
          ctx.fillStyle = "#0F141E"; ctx.fillRect(rx, 12, 36, 150);
          ctx.strokeStyle = "#1A2130"; ctx.lineWidth = 1; ctx.strokeRect(rx, 12, 36, 150);
          for (let u = 0; u < 12; u++) {
            const uy = 18 + u * 12;
            ctx.fillStyle = "#121826"; ctx.fillRect(rx + 3, uy, 30, 8);
            const led = reduced ? 0.5 : Math.sin(rack * 5.1 + u * 3.3 + t / (300 + u * 40));
            ctx.fillStyle = led > 0.3 ? "rgba(39,166,68,0.8)" : led < -0.5 ? "rgba(235,87,87,0.7)" : "rgba(74,82,102,0.5)";
            ctx.fillRect(rx + 27, uy + 2.5, 3, 3);
          }
        }
      } else if (env === "space") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#05060D"); g.addColorStop(1, "#0A0E1A");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) { const sx = (i * 47) % W, sy = (i * 71) % H; const tw = !reduced && Math.sin(t / 500 + i * 1.7) > 0.6 ? 0.9 : 0.3; ctx.fillStyle = `rgba(232,235,242,${tw})`; ctx.fillRect(sx, sy, 1.3, 1.3); }
        const pg = ctx.createRadialGradient(150, 34, 4, 150, 34, 26); pg.addColorStop(0, "#C77B4A"); pg.addColorStop(1, "#5A2E1A");
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(150, 34, 22, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,196,120,0.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(150, 34, 30, 8, -0.4, 0, Math.PI * 2); ctx.stroke();
        const eg = ctx.createLinearGradient(0, 180, 0, H); eg.addColorStop(0, "#1E6FB0"); eg.addColorStop(1, "#0B2A4A");
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(W / 2, 300, 150, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "rgba(120,140,170,0.15)"; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
      } else if (env === "castle") {
        ctx.fillStyle = "#1A1712"; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(90,80,64,0.4)"; ctx.lineWidth = 1;
        for (let ry = 0; ry < H; ry += 20) for (let rx = ((ry / 20) % 2 ? 0 : -15); rx < W; rx += 30) ctx.strokeRect(rx, ry, 30, 20);
        ctx.fillStyle = "#0C0A07"; for (let bx = 0; bx < W; bx += 24) ctx.fillRect(bx, 0, 14, 12);
        ctx.fillStyle = "#7A1F2B"; ctx.beginPath(); ctx.moveTo(20, 14); ctx.lineTo(48, 14); ctx.lineTo(48, 54); ctx.lineTo(34, 46); ctx.lineTo(20, 54); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.amber; ctx.font = "bold 13px serif"; ctx.fillText("$", 29, 34);
        for (const tx of [10, W - 14]) {
          ctx.strokeStyle = "#3A2A18"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, 60); ctx.lineTo(tx, 84); ctx.stroke();
          const fl = reduced ? 1 : 0.6 + Math.abs(Math.sin(t / 120 + tx)) * 0.4;
          ctx.fillStyle = `rgba(255,150,40,${fl})`; ctx.beginPath(); ctx.ellipse(tx, 56, 5, 9 * fl, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255,220,120,${fl})`; ctx.beginPath(); ctx.ellipse(tx, 58, 2.5, 5 * fl, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else if (env === "tower") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#160E24"); g.addColorStop(1, "#0B0814");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#0A0716"; ctx.beginPath(); ctx.moveTo(130, 60); ctx.lineTo(130, 30); ctx.arc(150, 30, 20, Math.PI, 0); ctx.lineTo(170, 60); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 10; i++) { ctx.fillStyle = `rgba(200,180,255,${Math.sin(t / 400 + i) > 0.5 ? 0.8 : 0.3})`; ctx.fillRect(135 + (i * 7) % 32, 34 + (i * 5) % 22, 1.4, 1.4); }
        const oy = 92 + Math.sin(t / 700) * 6;
        const og = ctx.createRadialGradient(28, oy, 1, 28, oy, 14); og.addColorStop(0, "#B48CFF"); og.addColorStop(1, "rgba(120,80,200,0)");
        ctx.fillStyle = og; ctx.beginPath(); ctx.arc(28, oy, 14, 0, Math.PI * 2); ctx.fill();
        if (!reduced) for (let i = 0; i < 6; i++) { const a = t / 900 + i; const sx = W / 2 + Math.cos(a) * 62, sy = 74 + Math.sin(a * 1.3) * 30; ctx.fillStyle = `rgba(180,150,255,${0.3 + 0.4 * Math.abs(Math.sin(a * 2))})`; ctx.fillRect(sx, sy, 2, 2); }
      } else if (env === "podcast") {
        ctx.fillStyle = "#14100E"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#1C1714";
        for (let ry = 0; ry < H; ry += 20) for (let rx = 0; rx < W; rx += 20) { ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + 10, ry + 10); ctx.lineTo(rx, ry + 20); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(rx + 20, ry); ctx.lineTo(rx + 10, ry + 10); ctx.lineTo(rx + 20, ry + 20); ctx.closePath(); ctx.fill(); }
        const on = reduced || Math.sin(t / 700) > -0.3;
        ctx.fillStyle = on ? "#D0121F" : "rgba(208,18,31,0.28)"; ctx.fillRect(58, 10, 74, 16);
        ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.4)"; ctx.font = "bold 9px monospace"; ctx.fillText("ON AIR", 74, 22);
      } else if (env === "reef") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0A3A55"); g.addColorStop(1, "#062435");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(150,220,255,0.05)"; // god rays
        for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(30 + i * 46, 0); ctx.rotate(0.2); ctx.fillRect(-8, 0, 16, H); ctx.restore(); }
        if (!reduced) for (let i = 0; i < 14; i++) { const bx = (i * 37) % W, by = H - ((t / 18 + i * 40) % H); ctx.fillStyle = `rgba(200,240,255,${0.14 + 0.14 * Math.sin(i)})`; ctx.beginPath(); ctx.arc(bx, by, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = "#1E7A5A"; ctx.lineWidth = 4; ctx.lineCap = "round"; // seaweed
        for (const sx of [16, 50, W - 20]) { ctx.beginPath(); ctx.moveTo(sx, H); for (let y = H; y > H - 60; y -= 12) ctx.lineTo(sx + Math.sin(y / 15 + t / 500) * 6, y); ctx.stroke(); }
        const fx = (t / 40) % (W + 40) - 20; // a drifting fish
        ctx.fillStyle = "#F5A742"; ctx.beginPath(); ctx.ellipse(fx, 58, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx - 7, 58); ctx.lineTo(fx - 13, 54); ctx.lineTo(fx - 13, 62); ctx.closePath(); ctx.fill();
      } else if (env === "palace") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3A2440"); g.addColorStop(1, "#1E1428");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(240,220,255,0.10)"; // marble columns
        for (const cxp of [22, W - 22]) { ctx.fillRect(cxp - 8, 20, 16, H - 20); ctx.fillRect(cxp - 12, 14, 24, 8); }
        ctx.fillStyle = "rgba(255,210,150,0.12)"; ctx.beginPath(); ctx.moveTo(72, 72); ctx.lineTo(72, 42); ctx.arc(95, 42, 23, Math.PI, 0); ctx.lineTo(118, 72); ctx.closePath(); ctx.fill(); // warm window
        const chx = W / 2; ctx.strokeStyle = "#F5C542"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(chx, 0); ctx.lineTo(chx, 22); ctx.stroke(); // chandelier
        ctx.fillStyle = `rgba(255,220,120,${0.55 + (reduced ? 0 : Math.sin(t / 500) * 0.2)})`;
        for (const dx of [-12, 0, 12]) { ctx.beginPath(); ctx.arc(chx + dx, 26, 2.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "rgba(245,197,66,0.16)"; ctx.fillRect(0, 44, W, 3); // gold frieze
      } else if (env === "jungle") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0E2A16"); g.addColorStop(1, "#081C10");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 10; i++) { ctx.fillStyle = "rgba(180,220,120,0.05)"; ctx.beginPath(); ctx.arc((i * 53) % W, (i * 31) % 90, 10 + (i % 3) * 6, 0, Math.PI * 2); ctx.fill(); } // dappled light
        ctx.fillStyle = "#1E5A2E";
        const leaf = (lx, ly, rot, sc) => { ctx.save(); ctx.translate(lx, ly); ctx.rotate(rot); ctx.scale(sc, sc); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, -8, 40, 0); ctx.quadraticCurveTo(20, 8, 0, 0); ctx.fill(); ctx.restore(); };
        leaf(-6, 20, 0.5, 1.2); leaf(W + 6, 30, Math.PI - 0.5, 1.2); leaf(10, H - 8, -0.4, 1); leaf(W - 10, H - 12, Math.PI + 0.4, 1);
        ctx.strokeStyle = "#245E33"; ctx.lineWidth = 2; // hanging vines
        for (const vx of [40, 100, 150]) { ctx.beginPath(); ctx.moveTo(vx, 0); for (let y = 0; y < 70; y += 10) ctx.lineTo(vx + Math.sin(y / 12 + vx) * 4, y); ctx.stroke(); }
      } else if (env === "action") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#160B08"); g.addColorStop(1, "#2A1206"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // pulsing explosion glow, lower right
        const pulse = reduced ? 0.6 : 0.5 + Math.abs(Math.sin(t / 260)) * 0.5;
        const eg = ctx.createRadialGradient(W - 40, H - 30, 4, W - 40, H - 30, 90);
        eg.addColorStop(0, `rgba(255,180,60,${0.55 * pulse})`); eg.addColorStop(0.5, `rgba(240,90,30,${0.3 * pulse})`); eg.addColorStop(1, "rgba(240,90,30,0)");
        ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
        // helicopter drifting across
        const hx = (t / 40) % (W + 60) - 30, hy2 = 30 + Math.sin(t / 500) * 4;
        ctx.fillStyle = "#0A0A0C"; ctx.fillRect(hx - 8, hy2, 16, 6); ctx.beginPath(); ctx.arc(hx + 8, hy2 + 3, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(hx - 18, hy2 + 2, 12, 2);
        ctx.strokeStyle = "rgba(200,200,210,0.5)"; ctx.lineWidth = 1.4;
        const rot = reduced ? 10 : Math.sin(t / 40) * 14;
        ctx.beginPath(); ctx.moveTo(hx - rot, hy2 - 3); ctx.lineTo(hx + rot, hy2 - 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hx, hy2 - 4); ctx.lineTo(hx, hy2); ctx.stroke();
        // rising embers
        if (!reduced) for (let i = 0; i < 12; i++) { const ex = (i * 53 + t / 10) % W; const ey = H - ((t / 12 + i * 30) % (H + 20)); ctx.fillStyle = `rgba(255,${140 + (i % 3) * 40},50,${0.5 + 0.3 * Math.sin(i + t / 300)})`; ctx.fillRect(ex, ey, 2, 2); }
      } else if (env === "temple") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1E1710"); g.addColorStop(1, "#0F0B07"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(120,100,70,0.25)"; ctx.lineWidth = 1; // stone block wall
        for (let ry = 8; ry < H; ry += 22) for (let rx = ((ry / 22) % 2 ? 0 : -18); rx < W; rx += 36) ctx.strokeRect(rx, ry, 36, 22);
        for (const px of [18, W - 30]) { ctx.fillStyle = "#2A2114"; ctx.fillRect(px, 20, 18, H - 20); ctx.fillStyle = "#33281A"; ctx.fillRect(px - 3, 16, 24, 8); } // pillars
        // glowing golden idol, center
        const ig = 0.6 + (reduced ? 0 : Math.sin(t / 600) * 0.3);
        const rg = ctx.createRadialGradient(W / 2, 40, 2, W / 2, 40, 24); rg.addColorStop(0, `rgba(245,200,90,${0.5 * (ig + 0.4)})`); rg.addColorStop(1, "rgba(245,200,90,0)");
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(W / 2, 40, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#C9A24B"; ctx.beginPath(); ctx.arc(W / 2, 40, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8A6A2A"; ctx.beginPath(); ctx.arc(W / 2, 40, 7, Math.PI * 0.2, Math.PI * 0.8); ctx.fill();
        for (const tx of [27, W - 21]) { // pillar torches
          const fl = reduced ? 1 : 0.6 + Math.abs(Math.sin(t / 120 + tx)) * 0.4;
          ctx.fillStyle = `rgba(255,150,40,${fl})`; ctx.beginPath(); ctx.ellipse(tx, 60, 4, 8 * fl, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255,220,120,${fl})`; ctx.beginPath(); ctx.ellipse(tx, 62, 2, 4 * fl, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (!reduced) for (let i = 0; i < 10; i++) { const dx = (i * 41 + t / 30) % W; const dy = (i * 53 + t / 60) % H; ctx.fillStyle = `rgba(220,200,150,${0.05 + 0.05 * Math.sin(i + t / 400)})`; ctx.fillRect(dx, dy, 1.4, 1.4); } // dust motes
      } else if (env === "horror") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0C0A16"); g.addColorStop(1, "#08060E"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const mg = ctx.createRadialGradient(146, 32, 6, 146, 32, 20); mg.addColorStop(0, "#D8D8E0"); mg.addColorStop(1, "#3A3A4A"); // full moon
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(146, 32, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(120,120,140,0.4)"; for (const [mx, my, mr] of [[142, 28, 3], [150, 36, 2], [148, 26, 1.5]]) { ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = "#050409"; ctx.lineWidth = 3; ctx.lineCap = "round"; // bare tree
        ctx.beginPath(); ctx.moveTo(12, H); ctx.lineTo(16, 60); ctx.moveTo(16, 74); ctx.lineTo(4, 58); ctx.moveTo(16, 66); ctx.lineTo(30, 50); ctx.moveTo(16, 60); ctx.lineTo(10, 44); ctx.stroke();
        if (!reduced) for (let i = 0; i < 3; i++) { const bx = (t / 24 + i * 60) % (W + 20) - 10, by = 40 + Math.sin(t / 300 + i * 2) * 16, w = 4 + Math.abs(Math.sin(t / 90 + i)) * 3; ctx.strokeStyle = "#060510"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx - w, by); ctx.quadraticCurveTo(bx - 2, by - 3, bx, by); ctx.quadraticCurveTo(bx + 2, by - 3, bx + w, by); ctx.stroke(); } // bats
        ctx.fillStyle = `rgba(120,130,150,${0.06 + (reduced ? 0 : Math.sin(t / 800) * 0.03)})`; ctx.fillRect(0, H - 30, W, 30); // ground fog
        const cf = reduced ? 0.6 : 0.4 + Math.abs(Math.sin(t / 90)) * 0.5; // flickering candle
        const cg = ctx.createRadialGradient(W - 26, H - 24, 1, W - 26, H - 24, 20); cg.addColorStop(0, `rgba(255,170,70,${0.5 * cf})`); cg.addColorStop(1, "rgba(255,170,70,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(W - 26, H - 24, 20, 0, Math.PI * 2); ctx.fill();
      } else if (env === "western") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3A2A4A"); g.addColorStop(0.45, "#8A4A2E"); g.addColorStop(0.75, "#C87A3A"); g.addColorStop(1, "#5A2E1E"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,210,120,0.9)"; ctx.beginPath(); ctx.arc(W / 2, 88, 22, 0, Math.PI * 2); ctx.fill(); // sun
        ctx.fillStyle = "rgba(255,180,90,0.25)"; ctx.beginPath(); ctx.arc(W / 2, 88, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3A1E14"; // mesas
        ctx.beginPath(); ctx.moveTo(0, 96); ctx.lineTo(0, 78); ctx.lineTo(30, 78); ctx.lineTo(34, 84); ctx.lineTo(60, 84); ctx.lineTo(64, 96); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W, 98); ctx.lineTo(W, 72); ctx.lineTo(W - 40, 72); ctx.lineTo(W - 44, 80); ctx.lineTo(W - 70, 80); ctx.lineTo(W - 74, 98); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#2A160E"; ctx.fillRect(0, 96, W, H - 96); // ground
        ctx.strokeStyle = "#14100A"; ctx.lineWidth = 6; ctx.lineCap = "round"; // saguaro
        ctx.beginPath(); ctx.moveTo(30, H); ctx.lineTo(30, 108); ctx.moveTo(30, 120); ctx.lineTo(22, 120); ctx.lineTo(22, 112); ctx.moveTo(30, 116); ctx.lineTo(38, 116); ctx.lineTo(38, 106); ctx.stroke();
        const tw = (t / 30) % (W + 30) - 15; // tumbleweed
        ctx.strokeStyle = "rgba(150,120,70,0.7)"; ctx.lineWidth = 1.4; ctx.save(); ctx.translate(tw, H - 14); ctx.rotate(t / 200);
        for (let a = 0; a < 5; a++) { ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.rotate(Math.PI / 5); } ctx.restore();
      } else if (env === "noir") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#16161A"); g.addColorStop(1, "#0A0A0C"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(0, -20); ctx.rotate(0.18); // venetian-blind bars
        for (let y = -10; y < H + 60; y += 16) { ctx.fillStyle = "rgba(220,225,235,0.07)"; ctx.fillRect(-20, y, W + 60, 7); }
        ctx.restore();
        if (!reduced) for (let i = 0; i < 24; i++) { const rx = (i * 37 + t / 3) % W, ry = ((i * 53 + t / 2) % (H + 20)) - 10; ctx.strokeStyle = "rgba(180,190,205,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 8); ctx.stroke(); } // rain
        const lg = ctx.createRadialGradient(24, H - 10, 2, 24, H - 10, 60); lg.addColorStop(0, "rgba(230,220,190,0.14)"); lg.addColorStop(1, "rgba(230,220,190,0)"); // desk-lamp cone
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(24, H - 10, 60, 0, Math.PI * 2); ctx.fill();
      } else if (env === "cyber") {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#05070F"); g.addColorStop(1, "#0A0616"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const horizon = H * 0.6;
        ctx.strokeStyle = "rgba(80,220,255,0.22)"; ctx.lineWidth = 1; // perspective neon grid floor
        for (let i = 1; i <= 8; i++) { const y = horizon + (H - horizon) * (i / 8) * (i / 8); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 6, horizon); ctx.lineTo(W / 2 + i * 40, H); ctx.stroke(); }
        if (!reduced) for (let i = 0; i < 16; i++) { const dx = (i * 13) % W, dy = (t / 6 + i * 37) % (horizon + 20); ctx.fillStyle = `rgba(120,255,180,${0.1 + ((i + Math.floor(t / 100)) % 3 === 0 ? 0.16 : 0)})`; ctx.fillRect(dx, dy, 2, 6); } // data rain
        const pulse = reduced ? 0.6 : 0.5 + Math.abs(Math.sin(t / 400)) * 0.5; // holographic core
        const cg = ctx.createRadialGradient(W / 2, horizon - 20, 2, W / 2, horizon - 20, 26); cg.addColorStop(0, `rgba(120,220,255,${0.5 * pulse})`); cg.addColorStop(1, "rgba(120,220,255,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(W / 2, horizon - 20, 26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(150,230,255,${0.5 * pulse})`; ctx.lineWidth = 1.5;
        for (const rr of [8, 13]) { ctx.beginPath(); ctx.ellipse(W / 2, horizon - 20, rr, rr * 0.5, t / 600, 0, Math.PI * 2); ctx.stroke(); }
        ctx.strokeStyle = "rgba(255,80,200,0.35)"; ctx.lineWidth = 1; // edge circuit traces
        ctx.beginPath(); ctx.moveTo(6, 20); ctx.lineTo(6, 50); ctx.lineTo(22, 50); ctx.moveTo(W - 6, 30); ctx.lineTo(W - 6, 64); ctx.lineTo(W - 22, 64); ctx.stroke();
        ctx.fillStyle = "rgba(255,80,200,0.6)"; ctx.beginPath(); ctx.arc(22, 50, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W - 22, 64, 2, 0, Math.PI * 2); ctx.fill();
      }
      // dim the whole set so the anchor stays the subject
      ctx.fillStyle = "rgba(11,14,20,0.38)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    };

    const draw = (t) => {
      if (dead) return;
      const { talking: TK, mood: MD } = propsRef.current;
      const dt = s.lastT ? Math.min(64, t - s.lastT) : 16;
      s.lastT = t;
      if (s.bornAt == null) s.bornAt = t;
      const age = t - s.bornAt;
      s.enter = Math.min(1, s.enter + dt / 400);

      // --- surprise trigger: big swing since last frame's remembered mood ---
      const md = MD || 0;
      if (!s.action && Math.abs(md) >= 1.5 && Math.abs(s.prevMood) < 1.5) { startAction("react", t); propsRef.current.onAction?.("react"); }
      s.prevMood = md;

      // --- scheduled cues from the trading day: ring bell / eat a meal / take a break ---
      // The parent bumps cue.id to fire one. We wait for a quiet moment (not on air) so the
      // anchor never mimes eating mid-sentence; an unconsumed cue simply fires the frame TK clears.
      const cueNow = propsRef.current.cue;
      if (cueNow && cueNow.id !== s.lastCueId && !TK) {
        s.lastCueId = cueNow.id;
        s.cueMeal = cueNow.meal || null;
        s.cueLabel = cueNow.label || null;
        startAction(cueNow.type, t); // bell | eat | break — overrides any idle prop in hand
        propsRef.current.onCue?.(cueNow.type, cueNow.meal); // play the cue sound NOW, synced to the animation start
      }

      // --- sustained work/present pose (export or stock analysis in flight) ---
      // Its own eased driver, because the action envelope `e` is 0 when there's no timed s.action.
      const busy = (!TK && !s.action) ? (propsRef.current.busy || null) : null; // "work" | "present" | null
      s.busyAmt += ((busy ? 1 : 0) - s.busyAmt) * Math.min(1, dt / 220);

      // --- idle action scheduler (only while quiet AND not heads-down on a task) ---
      if (!TK && !s.action && !busy && !reduced) {
        s.nextActionIn -= dt;
        if (s.nextActionIn <= 0) {
          const pool = ["sip", "papers", "adjust", "stretch", "write"];
          const chosen = pool[Math.floor(Math.random() * pool.length)];
          startAction(chosen, t);
          propsRef.current.onAction?.(chosen); // foley: sip / papers / write / stretch…
        }
      }
      if (TK && s.action && s.action !== "react") s.action = null; // drop props to speak
      const p = actionPhase(t);
      const e = env(p);
      const act = s.action;
      // sip sub-phases: reach → drink at lips → lower
      const lift = act === "sip" ? Math.min(1, p / 0.35) * (p > 0.78 ? Math.max(0, 1 - (p - 0.78) / 0.22) : 1) : 0;
      const drinkAmt = act === "sip" && p > 0.4 && p < 0.78 ? Math.sin(((p - 0.4) / 0.38) * Math.PI) : 0;
      // bell: fast shake ramps in and out over the action; each swing rings a little
      const bellShake = act === "bell" ? Math.sin(t / 42) * e : 0;
      // eat: fork makes ~3 trips to the mouth; forkLift rises at the lips, chew opens the jaw between bites
      const forkTrip = act === "eat" ? (p * 3) % 1 : 0;          // 0→1 within each of 3 bites
      const forkLift = act === "eat" ? Math.sin(Math.min(1, forkTrip / 0.5) * Math.PI) * e : 0;
      const chew = act === "eat" && forkTrip > 0.5 ? Math.abs(Math.sin((forkTrip - 0.5) / 0.5 * Math.PI * 2)) : 0;

      // --- mouth amplitude: real audio RMS if an analyser is live, else noise fake ---
      const an = analyserRef?.current;
      if (TK && an?.node) {
        an.node.getByteTimeDomainData(an.buf);
        let sum = 0;
        for (let i = 0; i < an.buf.length; i++) { const d = (an.buf[i] - 128) / 128; sum += d * d; }
        const rms = Math.sqrt(sum / an.buf.length);
        s.ampTarget = Math.min(1, rms * 5.5);
      } else if (TK) {
        const sm = propsRef.current.speechRef?.current; // set on each real spoken word (browser TTS boundary)
        if (sm) {
          // SYNCED to speech: mouth opens as each word begins and tapers as it ends, with a syllable ripple
          const since = t - sm.t0;                          // ms since this word started (shared clock)
          const wordDur = Math.max(150, sm.chars * 70);
          const prog = since / wordDur;
          const env = prog < 1 ? Math.sin(prog * Math.PI) : Math.max(0, 1 - (prog - 1) * 6); // 0→1→0 over the word
          const ripple = 0.72 + 0.28 * Math.abs(Math.sin(since / 52));
          s.ampTarget = 0.06 + Math.max(0, env) * 0.78 * ripple;
        } else {
          // boundary events not firing (some network voices) — gentle idle flap
          s.ampTarget = 0.06 + Math.pow(Math.abs(Math.sin(t / 108)), 0.6) * 0.28;
        }
      } else s.ampTarget = 0;
      s.amp += (s.ampTarget - s.amp) * Math.min(1, dt / (an?.node ? 45 : 55));

      // --- blinks ---
      s.nextBlink -= dt;
      if (s.nextBlink <= 0) { s.blink = 130; s.nextBlink = Math.random() < 0.22 ? 240 : 2400 + Math.random() * 3200; } // occasional double blink
      if (s.blink > 0) s.blink -= dt;
      let eyeOpen = reduced ? 1 : (s.blink > 0 ? Math.abs(s.blink - 65) / 65 : 1);
      if (act === "sip") eyeOpen *= 1 - drinkAmt * 0.9;        // eyes close while drinking
      if (act === "stretch") eyeOpen *= 1 - e * 0.7;           // squint on the stretch
      if (act === "eat") eyeOpen *= 1 - chew * 0.35;           // eyes narrow a touch on each bite
      if (act === "break") eyeOpen *= 1 - e * 0.92;            // eyes close, contented, on a break
      if (busy === "work") eyeOpen *= 1 - s.busyAmt * 0.28;    // narrowed, focused on the numbers
      // brow emphasis beats while speaking — occasional, and EASED so brows glide (no twitching)
      if (TK && !reduced && Math.random() < 0.005) s.browTarget = 1;
      s.browTarget = Math.max(0, s.browTarget - dt / 550);
      s.browPulse += (s.browTarget - s.browPulse) * Math.min(1, dt / 140);

      // --- gaze: occasional saccade to a new target, then ease the eyes there (no instant snapping) ---
      if (Math.random() < 0.004) { s.gazeTX = (Math.random() - 0.6) * 2.2; s.gazeTY = (Math.random() - 0.5) * 1.1; }
      s.gazeX += (s.gazeTX - s.gazeX) * Math.min(1, dt / 85);
      s.gazeY += (s.gazeTY - s.gazeY) * Math.min(1, dt / 85);
      const gazeY = act === "papers" ? 2.5 * e : s.gazeY;
      const gazeX = act === "papers" ? 0 : s.gazeX;

      // --- head dynamics: sway while talking, tip during sip, dip for papers ---
      s.tiltTarget =
        act === "sip" ? 0.055 * drinkAmt - 0.02 * lift :
        act === "adjust" ? 0.06 * e :
        act === "stretch" ? -0.05 * e :
        act === "bell" ? bellShake * 0.03 :               // head bobs a hair with the ringing
        act === "break" ? -0.06 * e :                     // leans back, relaxed
        act === "cheer" ? Math.sin(t / 70) * 0.05 * e :   // excited little shake
        (busy === "present" || busy === "teach") ? Math.sin(t / 700) * 0.03 : // gentle sway toward the screen
        TK && !reduced ? Math.sin(t / 640) * 0.05 : 0;
      s.tilt += (s.tiltTarget - s.tilt) * Math.min(1, dt / 120);
      const nod = TK && !reduced ? Math.sin(t / 250) * 1.6 : 0;
      const headDip =
        act === "papers" ? 4 * e :
        act === "sip" ? -2.5 * drinkAmt :
        act === "stretch" ? -3 * e :
        act === "eat" ? 3 * forkLift :                    // dips toward the fork on each bite
        act === "break" ? -3 * e :                        // tips back on a break
        busy === "work" ? 5 * s.busyAmt : 0;              // bows over the keyboard, heads-down

      const bob = reduced ? 0 : Math.sin(t / 900) * 2;
      const m = Math.max(-1, Math.min(1, md / 2));
      const moodCol = m > 0.05 ? C.up : m < -0.05 ? C.down : C.amber;
      const surprised = act === "react";

      ctx.clearRect(0, 0, W, H);
      drawEnv(propsRef.current.env, t, moodCol, m);
      ctx.save();
      // entrance: rise + fade
      ctx.globalAlpha = s.enter;
      ctx.translate(0, (1 - s.enter) * 12);

      const cx = W / 2, cy = 84 + bob;

      const glow = ctx.createRadialGradient(cx, cy + 30, 10, cx, cy + 30, 110);
      glow.addColorStop(0, "rgba(255,255,255,0.06)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

      // ---- background crew member (drawn first = furthest away) ----
      const crew = propsRef.current.crew;
      if (crew) {
        s.crewNextLook -= dt;
        if (s.crewNextLook <= 0) { s.crewLook = 1100; s.crewNextLook = 5000 + Math.random() * 7000; }
        if (s.crewLook > 0) s.crewLook -= dt;
        const looking = s.crewLook > 0 || surprised; // glances up on schedule and on market shocks
        const bx = 34, by = 90 + (reduced ? 0 : Math.sin(t / 1100) * 1.2);
        const dim = 0.55 * s.enter;
        ctx.save();
        ctx.globalAlpha = dim;

        // far desk + monitor with mood-colored mini chart, gentle flicker
        ctx.fillStyle = "#121826";
        ctx.fillRect(bx - 28, by + 36, 62, 5);
        ctx.fillStyle = "#0A0E16";
        ctx.fillRect(bx + 11, by + 13, 24, 18);
        ctx.strokeStyle = "#232C3D"; ctx.lineWidth = 1;
        ctx.strokeRect(bx + 11, by + 13, 24, 18);
        ctx.globalAlpha = dim * (reduced ? 0.8 : 0.6 + Math.abs(Math.sin(t / 700)) * 0.4);
        ctx.strokeStyle = moodCol; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const px = bx + 14 + i * 2.3;
          const py = by + 25 - Math.sin(i * 1.3 + t / 800) * 2.5 - m * 2 * (i / 8);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = dim;

        // body (small)
        ctx.fillStyle = crew.robot ? "#2E3644" : crew.suit;
        ctx.beginPath();
        ctx.moveTo(bx - 19, by + 38); ctx.quadraticCurveTo(bx - 17, by + 17, bx - 8, by + 15);
        ctx.lineTo(bx + 8, by + 15); ctx.quadraticCurveTo(bx + 17, by + 17, bx + 19, by + 38);
        ctx.closePath(); ctx.fill();

        // head: down at monitor by default, lifts when looking
        const hy2 = by + (looking ? -2 : 2);
        const crewBlink = !reduced && Math.sin(t / 490 + 3.7) > 0.985;
        if (crew.robot) {
          ctx.fillStyle = "#4A5568";
          ctx.fillRect(bx - 9, hy2 - 10, 18, 19);
          ctx.strokeStyle = "#2A3240"; ctx.lineWidth = 1; ctx.strokeRect(bx - 9, hy2 - 10, 18, 19);
          // single LED eye bar, aimed at monitor or camera
          if (!crewBlink) {
            ctx.fillStyle = moodCol;
            ctx.fillRect(bx - 5 + (looking ? 0 : 2), hy2 - 3, 10, 2.5);
          }
          // tiny antenna
          ctx.strokeStyle = "#39424F"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(bx, hy2 - 10); ctx.lineTo(bx, hy2 - 15); ctx.stroke();
        } else {
          ctx.fillStyle = crew.skin;
          ctx.beginPath(); ctx.ellipse(bx, hy2, 10, 11, 0, 0, Math.PI * 2); ctx.fill();
          // hair (simplified by style)
          ctx.fillStyle = crew.hairColor || "#2A2118";
          if (crew.hair === "long") {
            ctx.beginPath(); ctx.ellipse(bx, hy2 - 3, 11, 9, 0, Math.PI, 0); ctx.fill();
            ctx.fillRect(bx - 11, hy2 - 3, 3.5, 13); ctx.fillRect(bx + 7.5, hy2 - 3, 3.5, 13);
          } else if (crew.hair === "bald") {
            ctx.beginPath(); ctx.ellipse(bx - 9, hy2 + 2, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(bx + 9, hy2 + 2, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.beginPath(); ctx.ellipse(bx, hy2 - 4, 10.5, 7.5, 0, Math.PI, 0); ctx.fill();
          }
          if (crew.beard) {
            ctx.fillStyle = crew.hairColor;
            ctx.beginPath(); ctx.ellipse(bx, hy2 + 7, 6.5, 4, 0, 0, Math.PI); ctx.fill();
          }
          // eyes: aimed at monitor (right) or at camera when looking
          if (!crewBlink) {
            ctx.fillStyle = "#1B1B1B";
            const ex = looking ? 0 : 1.4;
            ctx.beginPath(); ctx.arc(bx - 3.5 + ex, hy2, 1.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(bx + 3.5 + ex, hy2, 1.2, 0, Math.PI * 2); ctx.fill();
          }
          if (crew.glasses) {
            ctx.strokeStyle = "#C9D2E4"; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.arc(bx - 3.5, hy2, 3.2, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(bx + 3.5, hy2, 3.2, 0, Math.PI * 2); ctx.stroke();
          }
        }

        // typing hands: alternate bounce, paused while looking up
        if (!looking && !reduced) {
          ctx.fillStyle = crew.robot ? "#4A5568" : crew.skin;
          ctx.beginPath(); ctx.arc(bx + 15, by + 33 + Math.sin(t / 105) * 1.6, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(bx + 22, by + 33 + Math.sin(t / 105 + Math.PI) * 1.6, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // ---- desk surface ----
      const deskY = 196;
      ctx.fillStyle = "#151B27";
      ctx.fillRect(0, deskY, W, H - deskY);
      ctx.strokeStyle = "#232C3D"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, deskY); ctx.lineTo(W, deskY); ctx.stroke();

      // ---- body ----
      ctx.fillStyle = ch.suit;
      ctx.beginPath();
      ctx.moveTo(cx - 52, deskY); ctx.quadraticCurveTo(cx - 50, 128 + bob, cx - 26, 122 + bob);
      ctx.lineTo(cx + 26, 122 + bob); ctx.quadraticCurveTo(cx + 50, 128 + bob, cx + 52, deskY);
      ctx.closePath(); ctx.fill();

      if (ch.robot) {
        ctx.fillStyle = "#141A24";
        ctx.fillRect(cx - 16, 134 + bob, 32, 30);
        ctx.strokeStyle = moodCol; ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 16, 134 + bob, 32, 30);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i === 0 ? moodCol : C.faint;
          ctx.beginPath(); ctx.arc(cx - 8 + i * 8, 158 + bob, 2, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.fillStyle = ch.shirt;
        ctx.beginPath();
        ctx.moveTo(cx - 14, 124 + bob); ctx.lineTo(cx, 142 + bob); ctx.lineTo(cx + 14, 124 + bob);
        ctx.lineTo(cx + 10, deskY); ctx.lineTo(cx - 10, deskY); ctx.closePath(); ctx.fill();
        if (ch.tieBase) {
          ctx.fillStyle = moodCol;
          ctx.beginPath();
          ctx.moveTo(cx - 5, 128 + bob); ctx.lineTo(cx + 5, 128 + bob);
          ctx.lineTo(cx + 4, 168 + bob); ctx.lineTo(cx, 178 + bob); ctx.lineTo(cx - 4, 168 + bob);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.strokeStyle = moodCol; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx - 10, 126 + bob); ctx.quadraticCurveTo(cx, 140 + bob, cx + 10, 126 + bob); ctx.stroke();
          ctx.fillStyle = moodCol;
          ctx.beginPath(); ctx.arc(cx, 140 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 26, 122 + bob); ctx.lineTo(cx - 8, 146 + bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 26, 122 + bob); ctx.lineTo(cx + 8, 146 + bob); ctx.stroke();

      // ---- arms, hands & props ----
      const skinCol = ch.robot ? "#4A5568" : ch.skin;
      const sleeve = ch.suit;
      const hand = (x, y, r = 6) => {
        ctx.fillStyle = skinCol;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      };
      const arm = (x1, y1, x2, y2) => {
        ctx.strokeStyle = sleeve; ctx.lineWidth = 11; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };

      // coffee mug lives on the desk when not in use
      const mugRest = { x: cx + 44, y: deskY };
      const drawMug = (x, y, tiltA = 0) => {
        // (x, y) is the center of the mug's base — sits ON the desk, never floats
        ctx.save(); ctx.translate(x, y); ctx.rotate(tiltA);
        ctx.fillStyle = "#3A4560";
        ctx.beginPath();
        ctx.moveTo(-6, -13); ctx.lineTo(6, -13); ctx.lineTo(5, 0); ctx.lineTo(-5, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#3A4560"; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(7.5, -7, 4, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        // coffee surface
        ctx.fillStyle = "#5C4326";
        ctx.beginPath(); ctx.ellipse(0, -13, 5.4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        // lazy steam wisp while resting (identifies it as coffee at a glance)
        if (tiltA === 0 && !reduced) {
          ctx.strokeStyle = "rgba(232,235,242,0.22)"; ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(0, -16);
          ctx.quadraticCurveTo(2.5 * Math.sin(t / 600), -22, 0, -27);
          ctx.stroke();
        }
        ctx.restore();
      };

      let postHead = null; // anything the head must NOT cover (the raised mug) draws after it
      if (act === "sip") {
        // reach → drink at the lips → lower; mug is deferred so it overlaps the mouth
        const lipX = cx + 9, lipY = cy + 27 + headDip;
        const mx = mugRest.x + (lipX - mugRest.x) * lift;
        const my = mugRest.y + (lipY - mugRest.y) * lift - Math.sin(lift * Math.PI) * 6;
        const mugTilt = -0.15 * lift - 0.55 * drinkAmt; // tips right back while drinking
        arm(cx + 34, deskY - 18, mx + 6, my - 4);
        postHead = () => {
          drawMug(mx, my, mugTilt);
          hand(mx + 6 - drinkAmt * 3, my - 6 + drinkAmt * 1.5);
          if (lift > 0.6 && drinkAmt < 0.4 && !reduced) {
            ctx.strokeStyle = "rgba(232,235,242,0.35)"; ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(mx, my - 17);
            ctx.quadraticCurveTo(mx + 3, my - 23 - Math.sin(t / 200) * 2, mx, my - 29);
            ctx.stroke();
          }
        };
        // left hand rests
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6);
        hand(cx - 26, deskY - 6);
      } else if (act === "bell") {
        // opening-bell moment: right hand hoists a brass handbell and shakes it
        const bx0 = cx + 46, by0 = deskY - 58 - 4 * e;        // raised up and to the right
        const swing = bellShake * 0.5;                        // radians the bell rocks
        arm(cx + 32, deskY - 14, bx0, by0 + 12);
        postHead = () => {
          ctx.save();
          ctx.translate(bx0, by0); ctx.rotate(swing);
          // handle (hand grips this)
          ctx.strokeStyle = "#6B4A1F"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -6); ctx.stroke();
          // brass body
          const bg = ctx.createLinearGradient(-11, -6, 11, 14);
          bg.addColorStop(0, "#FFE79A"); bg.addColorStop(0.5, "#E7B008"); bg.addColorStop(1, "#9A7405");
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.moveTo(-4, -6); ctx.lineTo(4, -6);
          ctx.quadraticCurveTo(13, 8, 15, 15);
          ctx.lineTo(-15, 15);
          ctx.quadraticCurveTo(-13, 8, -4, -6);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#C9960A"; ctx.beginPath(); ctx.ellipse(0, 15, 15, 3.2, 0, 0, Math.PI * 2); ctx.fill();
          // clapper swings opposite the body
          ctx.fillStyle = "#3A2E12";
          ctx.beginPath(); ctx.arc(-swing * 20, 16, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          hand(bx0, by0 - 2, 6);
          // sound sparkles on the hard part of each swing
          if (!reduced && Math.abs(bellShake) > 0.6) {
            ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6; ctx.lineCap = "round";
            for (const [dx, dy] of [[20, -6], [26, 4], [22, 14]]) {
              ctx.beginPath(); ctx.moveTo(bx0 + dx, by0 + dy); ctx.lineTo(bx0 + dx + 4, by0 + dy); ctx.stroke();
            }
          }
        };
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6); hand(cx - 26, deskY - 6);
      } else if (act === "eat") {
        // meal break: a plate sits on the desk, a fork ferries bites up to the mouth
        const meal = s.cueMeal || "lunch";
        const plateX = cx, plateY = deskY - 3;
        // plate
        ctx.fillStyle = "#C7CEDB"; ctx.beginPath(); ctx.ellipse(plateX, plateY, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#9AA3B5"; ctx.beginPath(); ctx.ellipse(plateX, plateY, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
        // food, colored by meal
        if (meal === "breakfast") {                            // fried egg
          ctx.fillStyle = "#F4F1E8"; ctx.beginPath(); ctx.ellipse(plateX - 3, plateY - 1, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#F5B301"; ctx.beginPath(); ctx.arc(plateX - 3, plateY - 1, 3.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#B5651D"; ctx.fillRect(plateX + 7, plateY - 4, 8, 4); // toast strip
        } else if (meal === "dinner") {                        // steak + greens
          ctx.fillStyle = "#6B2F2A"; ctx.beginPath(); ctx.ellipse(plateX - 2, plateY - 1, 10, 5, 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#2FD37A"; ctx.beginPath(); ctx.arc(plateX + 9, plateY - 1, 3, 0, Math.PI * 2); ctx.fill();
        } else {                                               // lunch: sandwich
          ctx.fillStyle = "#E8B860"; ctx.fillRect(plateX - 11, plateY - 6, 22, 6);
          ctx.fillStyle = "#7F9A3A"; ctx.fillRect(plateX - 11, plateY - 2, 22, 2);
          ctx.fillStyle = "#E8B860"; ctx.fillRect(plateX - 11, plateY, 22, 3);
        }
        // steam for the hot meals
        if (meal !== "breakfast" && !reduced) {
          ctx.strokeStyle = "rgba(232,235,242,0.22)"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(plateX, plateY - 8);
          ctx.quadraticCurveTo(plateX + 3 * Math.sin(t / 500), plateY - 15, plateX, plateY - 22); ctx.stroke();
        }
        // fork travels from plate up to the lips and back on each bite
        const lipX = cx + 6, lipY = cy + 27 + headDip;
        const fx = plateX + 4 + (lipX - (plateX + 4)) * forkLift;
        const fy = plateY - 4 + (lipY - (plateY - 4)) * forkLift;
        arm(cx + 34, deskY - 18, fx + 5, fy + 2);
        postHead = () => {
          ctx.strokeStyle = "#C9D2E4"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 9); ctx.stroke();   // fork handle
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fx + i * 2, fy - 9); ctx.lineTo(fx + i * 2, fy - 13); ctx.stroke(); }
          if (forkLift < 0.5) { ctx.fillStyle = meal === "breakfast" ? "#F5B301" : meal === "dinner" ? "#6B2F2A" : "#7F9A3A"; ctx.beginPath(); ctx.arc(fx, fy - 11, 2.4, 0, Math.PI * 2); ctx.fill(); }
          hand(fx + 5, fy + 2, 5.5);
        };
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6); hand(cx - 26, deskY - 6);
      } else if (act === "break") {
        // on break: both hands laced behind the head, leaning back, taking it easy
        arm(cx - 30, deskY - 16, cx - 30, cy + 6 - 8 * e);
        arm(cx + 30, deskY - 16, cx + 30, cy + 6 - 8 * e);
        hand(cx - 30, cy + 4 - 8 * e); hand(cx + 30, cy + 4 - 8 * e);
        drawMug(mugRest.x, mugRest.y);
      } else if (act === "cheer") {
        // correct-answer celebration: both fists thrown up (sparkles are drawn after the head)
        const up = 34 * e + Math.sin(t / 90) * 3 * e;
        arm(cx - 30, deskY - 16, cx - 44, deskY - 44 - up);
        arm(cx + 30, deskY - 16, cx + 44, deskY - 44 - up);
        hand(cx - 44, deskY - 46 - up); hand(cx + 44, deskY - 46 - up);
      } else if (act === "stretch") {
        // both arms up, squint, lean back
        arm(cx - 30, deskY - 16, cx - 48, deskY - 44 - 26 * e);
        arm(cx + 30, deskY - 16, cx + 48, deskY - 44 - 26 * e);
        hand(cx - 48, deskY - 46 - 26 * e); hand(cx + 48, deskY - 46 - 26 * e);
        drawMug(mugRest.x, mugRest.y);
      } else if (act === "write") {
        // jotting notes: pad on desk, pencil hand scribbling little loops
        ctx.save(); ctx.translate(cx + 16, deskY - 8); ctx.rotate(-0.08);
        ctx.fillStyle = "#E8EBF2"; ctx.fillRect(-14, -9, 28, 18);
        ctx.strokeStyle = "#9AA3B5"; ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-10, -3 + i * 6); ctx.lineTo(10, -3 + i * 6); ctx.stroke(); }
        ctx.restore();
        const wx = cx + 16 + Math.sin(t / 90) * 3 + Math.sin(t / 700) * 5;
        const wy = deskY - 11 + Math.cos(t / 90) * 1.2;
        arm(cx + 34, deskY - 18, wx + 2, wy - 3);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(wx - 1, wy - 9); ctx.lineTo(wx + 3, wy - 1); ctx.stroke();
        hand(wx, wy - 6, 5.5);
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6); hand(cx - 26, deskY - 6);
        drawMug(mugRest.x, mugRest.y);
      } else if (act === "adjust") {
        // touching glasses/tie: the LEFT hand rests, the RIGHT arm reaches up to the face
        // (the actual face-touch hand is drawn later with the head — so only one desk hand here, not two)
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6); hand(cx - 26, deskY - 6);
        arm(cx + 32, deskY - 14, cx + 14, cy + 8 + headDip); // forearm up to the face; hand drawn at the head
        drawMug(mugRest.x, mugRest.y);
      } else if (age < 1600 && !TK && !reduced) {
        // entrance: a little wave hello
        const hx = cx + 44, hy0 = deskY - 54;
        arm(cx + 32, deskY - 14, hx - 2, hy0 + 8);
        ctx.save(); ctx.translate(hx, hy0); ctx.rotate(Math.sin(t / 110) * 0.45);
        ctx.fillStyle = skinCol;
        ctx.beginPath(); ctx.arc(0, -4, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6); hand(cx - 26, deskY - 6);
        drawMug(mugRest.x, mugRest.y);
      } else if (act === "papers") {
        // both hands raise a sheet; anchor glances down at it
        const py = deskY - 10 - 26 * e;
        arm(cx - 34, deskY - 16, cx - 20, py + 12);
        arm(cx + 34, deskY - 16, cx + 20, py + 12);
        ctx.save();
        ctx.translate(cx, py); ctx.rotate(Math.sin(t / 500) * 0.03);
        ctx.fillStyle = "#E8EBF2";
        ctx.fillRect(-18, -12, 36, 26);
        ctx.strokeStyle = "#9AA3B5"; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(-13, -6 + i * 7); ctx.lineTo(13, -6 + i * 7); ctx.stroke();
        }
        ctx.restore();
        hand(cx - 20, py + 12); hand(cx + 20, py + 12);
        drawMug(mugRest.x, mugRest.y);
      } else if (busy === "present" || busy === "teach") {
        // presenting a deck (or teaching Stock School): a screen rises, the anchor points and sweeps at it
        const ba = s.busyAmt;
        const bw = 50 * ba, bh = 40 * ba, boardX = 152, boardTop = deskY - 98;
        ctx.save();
        ctx.globalAlpha = ba;
        // stand
        ctx.strokeStyle = "#2A3240"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(boardX, boardTop + bh); ctx.lineTo(boardX, deskY - 6); ctx.stroke();
        // screen
        ctx.fillStyle = "#0A0E16"; ctx.fillRect(boardX - bw / 2, boardTop, bw, bh);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1.4; ctx.strokeRect(boardX - bw / 2, boardTop, bw, bh);
        // little bar chart + rising arrow, slides on screen as it presents
        const step = Math.floor(t / 1400);
        for (let i = 0; i < 5; i++) {
          const bhh = (6 + ((i * 7 + step * 3) % 22)) * ba;
          ctx.fillStyle = i % 2 ? C.up : C.amber;
          ctx.fillRect(boardX - bw / 2 + 5 + i * (bw - 12) / 5, boardTop + bh - 5 - bhh, (bw - 16) / 6, bhh);
        }
        ctx.strokeStyle = C.up; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(boardX - bw / 2 + 5, boardTop + bh - 8); ctx.lineTo(boardX + bw / 2 - 5, boardTop + 8); ctx.stroke();
        ctx.restore();
        // pointing arm sweeps toward the screen
        const px = boardX - bw / 2 - 6 + Math.sin(t / 320) * 3, py2 = boardTop + bh / 2 + Math.cos(t / 320) * 4;
        arm(cx + 30, deskY - 16, px, py2);
        hand(px, py2, 5.5);
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6); hand(cx - 26, deskY - 6);
      } else if (busy === "work") {
        // heads-down on the numbers: typing at a keyboard, both hands bouncing
        const ba = s.busyAmt;
        ctx.save(); ctx.globalAlpha = ba;
        ctx.fillStyle = "#151B27";
        (ctx.roundRect ? ctx.roundRect(cx - 26, deskY - 8, 52, 12, 3) : ctx.rect(cx - 26, deskY - 8, 52, 12)); ctx.fill();
        ctx.strokeStyle = "#2A3240"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#0E141F";
        for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) ctx.fillRect(cx - 23 + i * 6, deskY - 6 + r * 5, 4, 3);
        ctx.restore();
        const typeL = deskY - 10 + Math.sin(t / 150) * 2 * ba, typeR = deskY - 10 + Math.sin(t / 150 + Math.PI) * 2 * ba;
        arm(cx - 30, deskY - 18, cx - 12, typeL); hand(cx - 12, typeL, 5.5);
        arm(cx + 30, deskY - 18, cx + 12, typeR); hand(cx + 12, typeR, 5.5);
      } else if (TK && !reduced) {
        // gesturing right hand while talking
        const gx = cx + 40 + Math.sin(t / 320) * 6;
        const gy = deskY - 34 + Math.cos(t / 410) * 5;
        arm(cx + 32, deskY - 14, gx, gy);
        hand(gx, gy, 6.5);
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6);
        hand(cx - 26, deskY - 6);
        drawMug(mugRest.x - 14, mugRest.y); // mug pushed aside for the gesture
      } else {
        // both hands resting on the desk
        arm(cx - 34, deskY - 18, cx - 26, deskY - 6);
        arm(cx + 34, deskY - 18, cx + 26, deskY - 6);
        hand(cx - 26, deskY - 6); hand(cx + 26, deskY - 6);
        drawMug(mugRest.x, mugRest.y);
      }

      // ---- head group: tilt + nod + dip applied as one transform ----
      ctx.save();
      ctx.translate(cx, cy + nod + headDip);
      ctx.rotate(s.tilt);
      ctx.translate(-cx, -(cy + nod + headDip));
      const hy = cy + nod + headDip; // head center under transform

      if (ch.robot) {
        ctx.fillStyle = "#39424F";
        ctx.beginPath(); ctx.moveTo(cx - 10, hy + 24); ctx.lineTo(cx + 10, hy + 24);
        ctx.lineTo(cx + 8, hy + 38); ctx.lineTo(cx - 8, hy + 38); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#4A5568";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(cx - 34, hy - 38, 68, 76, 10) : ctx.rect(cx - 34, hy - 38, 68, 76);
        ctx.fill();
        ctx.strokeStyle = "#2A3240"; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "#39424F"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, hy - 38); ctx.lineTo(cx, hy - 52); ctx.stroke();
        ctx.fillStyle = (Math.sin(t / 300) > 0 || reduced) ? moodCol : C.faint;
        ctx.beginPath(); ctx.arc(cx, hy - 55, 3.5, 0, Math.PI * 2); ctx.fill();
        for (const side of [-1, 1]) {
          const eh = (surprised ? 11 : 7) * Math.max(0.12, eyeOpen);
          ctx.fillStyle = moodCol;
          ctx.fillRect(cx + side * 14 - 6 + gazeX * 0.6, hy - 8 - eh / 2 + gazeY, 12, eh);
        }
        const bars = 5, bw = 5, gap = 3;
        const total = bars * bw + (bars - 1) * gap;
        for (let i = 0; i < bars; i++) {
          const hgt = surprised ? 10 : TK ? 3 + Math.abs(Math.sin(t / 90 + i * 1.7)) * s.amp * 14 : 3;
          ctx.fillStyle = (TK || surprised) ? C.amber : C.faint;
          ctx.fillRect(cx - total / 2 + i * (bw + gap), hy + 24 - hgt / 2, bw, hgt);
        }
        ctx.strokeStyle = "#2A3240"; ctx.lineWidth = 2;
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + side * 34, hy - 6 + i * 7); ctx.lineTo(cx + side * 26, hy - 6 + i * 7);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = ch.skin;
        ctx.beginPath(); ctx.moveTo(cx - 12, hy + 24); ctx.lineTo(cx + 12, hy + 24);
        ctx.lineTo(cx + 10, hy + 38); ctx.lineTo(cx - 10, hy + 38); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx, hy, 34, 38, 0, 0, Math.PI * 2); ctx.fill();

        // a full helmet (knight/astronaut) or wizard hat covers the hair, so skip drawing it
        // brimmed / hooded hats cover short hair; long hair still falls to the shoulders beneath them
        const brimHat = ch.hat === "knight" || ch.hat === "astronaut" || ch.hat === "wizard" || ch.hat === "explorer" || ch.hat === "cowboy" || ch.hat === "noir" || ch.hat === "horror";
        const hideHair = brimHat && ch.hair !== "long";
        ctx.fillStyle = ch.hairColor || "#2A2118";
        if (hideHair) {
          /* hair hidden under headgear */
        } else if (ch.hair === "long") {
          ctx.beginPath();
          ctx.ellipse(cx, hy - 14, 36, 27, 0, Math.PI, 0);
          ctx.lineTo(cx + 38, hy + 34);
          ctx.quadraticCurveTo(cx + 30, hy + 40, cx + 26, hy + 30);
          ctx.quadraticCurveTo(cx + 30, hy - 4, cx + 18, hy - 20);
          ctx.lineTo(cx - 18, hy - 20);
          ctx.quadraticCurveTo(cx - 30, hy - 4, cx - 26, hy + 30);
          ctx.quadraticCurveTo(cx - 30, hy + 40, cx - 38, hy + 34);
          ctx.closePath(); ctx.fill();
        } else if (ch.hair === "bald") {
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(cx + side * 30, hy + 4, 7, 14, side * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.ellipse(cx, hy - 16, 35, 24, 0, Math.PI, 0);
          ctx.quadraticCurveTo(cx + 36, hy - 6, cx + 30, hy + 2);
          ctx.quadraticCurveTo(cx + 20, hy - 18, cx, hy - 20);
          ctx.quadraticCurveTo(cx - 20, hy - 18, cx - 30, hy + 2);
          ctx.quadraticCurveTo(cx - 36, hy - 6, cx - 35, hy - 8);
          ctx.closePath(); ctx.fill();
        }

        if (ch.beard) {
          ctx.fillStyle = ch.hairColor;
          ctx.beginPath(); ctx.ellipse(cx, hy + 24, 22, 14, 0, 0, Math.PI); ctx.fill();
          ctx.fillStyle = ch.skin;
          ctx.beginPath(); ctx.ellipse(cx, hy + 19, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
        }

        const eyeY = hy - 2, eyeDX = 13;
        // fake 3/4 head turn while talking: facial features drift toward the gesturing hand
        const fs = TK && !reduced ? Math.sin(t / 1100) * 1.8 : 0;
        for (const side of [-1, 1]) {
          ctx.fillStyle = "#FFFFFF";
          const eyH = (surprised ? 7 : 5.5) * Math.max(0.08, eyeOpen);
          ctx.beginPath();
          ctx.ellipse(cx + side * eyeDX + fs * 0.8, eyeY, surprised ? 7.5 : 6.5, eyH, 0, 0, Math.PI * 2);
          ctx.fill();
          if (eyeOpen > 0.25) {
            ctx.fillStyle = "#1B1B1B";
            ctx.beginPath();
            ctx.arc(cx + side * eyeDX + fs + gazeX, eyeY + 0.5 + gazeY, surprised ? 2.1 : 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (ch.glasses) {
          ctx.strokeStyle = "#C9D2E4"; ctx.lineWidth = 1.8;
          const gAdj = act === "adjust" ? -1.5 * e : 0; // pushing glasses up
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.arc(cx + side * eyeDX, eyeY + gAdj, 9.5, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(cx - 4, eyeY - 1 + gAdj); ctx.lineTo(cx + 4, eyeY - 1 + gAdj); ctx.stroke();
        }
        // adjust action: hand comes up to face (glasses or tie region)
        if (act === "adjust") {
          const ax = ch.glasses ? cx + 16 : cx + 4;
          const ay = ch.glasses ? eyeY + 4 : hy + 44;
          hand(ax, ay - 14 * (1 - e) , 5.5);
        }

        ctx.strokeStyle = ch.hairColor; ctx.lineWidth = 2.6; ctx.lineCap = "round";
        const mBrow = Math.max(0, m); // only a green tape lifts the brows; a red one leaves them relaxed, never furrowed
        for (const side of [-1, 1]) {
          const inner = cx + side * 6 + fs * 0.8, outer = cx + side * 19 + fs * 0.8;
          const raise = (surprised ? -4 : 0) - s.browPulse * 3 - (!surprised && !TK ? 2 : 0);
          const innerY = eyeY - 11 - mBrow * 1.5 + raise;
          const outerY = eyeY - 9 - mBrow * 2.5 + raise;
          ctx.beginPath(); ctx.moveTo(inner, innerY); ctx.lineTo(outer, outerY); ctx.stroke();
        }
        ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + fs, eyeY + 4); ctx.quadraticCurveTo(cx + 3 + fs, eyeY + 11, cx - 1 + fs, eyeY + 13); ctx.stroke();

        const mouthY = hy + 20, mcx = cx + fs;
        if (surprised) {
          ctx.fillStyle = "#5B2B2B";
          ctx.beginPath(); ctx.ellipse(mcx, mouthY + 1, 4.5, 6 * e + 2, 0, 0, Math.PI * 2); ctx.fill();
        } else if (s.amp > 0.05) {
          // natural speaking mouth: dark interior, upper teeth + tongue clipped inside, soft lower lip
          const op = Math.min(1, s.amp), w = 7.5 + op * 1.5, oh = 1.2 + op * 7;
          ctx.save();
          ctx.fillStyle = "#40191C";
          ctx.beginPath(); ctx.ellipse(mcx, mouthY, w, oh, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(mcx, mouthY, w, oh, 0, 0, Math.PI * 2); ctx.clip(); // keep teeth/tongue inside
          if (op > 0.14) { ctx.fillStyle = "#F1EDE6"; ctx.beginPath(); ctx.ellipse(mcx, mouthY - oh + 0.3, w - 1, 2.3, 0, 0, Math.PI * 2); ctx.fill(); } // upper teeth
          if (op > 0.4) { ctx.fillStyle = "#C15C67"; ctx.beginPath(); ctx.ellipse(mcx, mouthY + oh * 0.55, w * 0.62, oh * 0.4, 0, 0, Math.PI * 2); ctx.fill(); } // tongue
          ctx.restore();
          ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; // lower lip with upturned corners
          ctx.beginPath(); ctx.moveTo(mcx - w - 1, mouthY - 1); ctx.quadraticCurveTo(mcx, mouthY + oh + 1.5, mcx + w + 1, mouthY - 1); ctx.stroke();
        } else if (act === "eat") {
          // chewing: a small mouth that opens and closes between bites
          ctx.fillStyle = "#5B2B2B";
          ctx.beginPath(); ctx.ellipse(mcx, mouthY, 4 + chew * 1.5, 1.5 + chew * 4, 0, 0, Math.PI * 2); ctx.fill();
        } else if (act === "sip") {
          ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(mcx, mouthY, 2.5 + drinkAmt * 1.5, 0, Math.PI * 2); ctx.stroke();
        } else {
          // resting mouth: ALWAYS a friendly smile — this is a stocks app, not a mood ring.
          // It simply widens when the tape is green; it never frowns, even on a down day.
          ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2.4;
          const lift = 6 + Math.max(0, m) * 4;
          ctx.beginPath();
          ctx.moveTo(mcx - 8, mouthY - 2);
          ctx.quadraticCurveTo(mcx, mouthY + lift, mcx + 8, mouthY - 2);
          ctx.stroke();
        }

        if (ch.earrings) {
          ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6;
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.arc(cx + side * 33, hy + 14, 3.5, 0, Math.PI * 2); ctx.stroke();
          }
        }

        if (ch.accessory === "headset") {
          // over-ear headphones: a band that CONNECTS to an earcup on each side (no floating halo)
          ctx.fillStyle = C.amber;
          for (const side of [-1, 1]) {
            if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx + side * 33 - 5, hy - 4, 10, 18, 4); ctx.fill(); }
            else ctx.fillRect(cx + side * 33 - 5, hy - 4, 10, 18);
          }
          ctx.strokeStyle = C.amber; ctx.lineWidth = 4; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(cx - 32, hy - 3); ctx.quadraticCurveTo(cx, hy - 48, cx + 32, hy - 3); ctx.stroke();
          // built-in call mic — but NOT for the podcaster, which has its own boom mic
          if (ch.hat !== "podcast") {
            ctx.lineWidth = 2.4;
            ctx.beginPath(); ctx.moveTo(cx - 33, hy + 12); ctx.quadraticCurveTo(cx - 30, hy + 24, cx - 16, hy + 26); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx - 14, hy + 26, 2.6, 0, Math.PI * 2); ctx.stroke();
            if (TK) {
              ctx.fillStyle = C.down;
              ctx.beginPath(); ctx.arc(cx - 14, hy + 26, Math.max(0.5, 1.6 + Math.sin(t / 160) * 1.2), 0, Math.PI * 2); ctx.fill();
            }
          }
        } else {
          ctx.fillStyle = C.amber;
          ctx.beginPath(); ctx.ellipse(cx - 33, hy + 4, 3, 5, 0.15, 0, Math.PI * 2); ctx.fill();
          if (TK) {
            ctx.fillStyle = C.down;
            ctx.beginPath(); ctx.arc(cx - 33, hy - 3, Math.max(0.5, 1.4 + Math.sin(t / 160)), 0, Math.PI * 2); ctx.fill();
          }
        }

        // ---- themed headgear: drawn last so it frames the animated face (visors stay translucent) ----
        if (ch.hat === "podcast") {
          // boom mic: hinged on the LEFT EARCUP (cx-33, ends hy+14), curving to the
          // mouth — a boom that starts in mid-air reads as a floating stick
          ctx.strokeStyle = "#3A4150"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(cx - 33, hy + 13); ctx.quadraticCurveTo(cx - 35, hy + 23, cx - 18, hy + 22); ctx.stroke();
          ctx.fillStyle = "#2A303C"; ctx.beginPath(); ctx.ellipse(cx - 15, hy + 21, 6, 7, 0.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.beginPath(); ctx.ellipse(cx - 16, hy + 19, 2, 3, 0.3, 0, Math.PI * 2); ctx.fill();
        } else if (ch.hat === "knight") {
          const steel = "#8A93A6", steelD = "#5A6273";
          ctx.fillStyle = steel; ctx.beginPath(); ctx.ellipse(cx, hy - 10, 35, 34, 0, Math.PI, 0); ctx.fill();  // dome
          ctx.fillRect(cx - 35, hy - 12, 70, 8);                                                                 // brow band
          ctx.strokeStyle = steelD; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, hy - 10, 35, 34, 0, Math.PI, 0); ctx.stroke();
          for (const side of [-1, 1]) { ctx.fillStyle = steel; ctx.beginPath(); ctx.moveTo(cx + side * 35, hy - 4); ctx.lineTo(cx + side * 30, hy + 30); ctx.lineTo(cx + side * 18, hy + 30); ctx.lineTo(cx + side * 22, hy - 4); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = steelD; ctx.fillRect(cx - 2, hy - 12, 4, 20);                                          // nasal bar
          ctx.fillStyle = "#C0392B"; ctx.beginPath(); ctx.ellipse(cx, hy - 46, 5, 13, 0, 0, Math.PI * 2); ctx.fill(); // plume
        } else if (ch.hat === "wizard") {
          ctx.save(); ctx.translate(cx, hy - 30); ctx.rotate(-0.12);
          ctx.fillStyle = "#3A2A66"; ctx.beginPath(); ctx.moveTo(-30, 8); ctx.lineTo(0, -48); ctx.lineTo(30, 8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#2A1E4A"; ctx.beginPath(); ctx.ellipse(0, 8, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = C.amber; for (const [sx, sy] of [[-6, -4], [6, -18], [-2, -32]]) { ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        } else if (ch.hat === "astronaut") {
          ctx.fillStyle = "#E4E7EE"; ctx.beginPath(); ctx.ellipse(cx, hy + 34, 30, 10, 0, 0, Math.PI * 2); ctx.fill(); // collar
          ctx.fillStyle = "rgba(150,190,230,0.14)"; ctx.beginPath(); ctx.arc(cx, hy - 2, 44, 0, Math.PI * 2); ctx.fill(); // glass
          ctx.strokeStyle = "#E4E7EE"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, hy - 2, 44, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, hy - 2, 38, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke(); // glare
          ctx.fillStyle = C.up; ctx.beginPath(); ctx.arc(cx + 31, hy - 32, 3, 0, Math.PI * 2); ctx.fill(); // antenna light
        } else if (ch.hat === "crown") {
          // princess tiara: gold band with three points and a center gem, sitting on the hair
          ctx.fillStyle = "#F5C542";
          ctx.beginPath(); ctx.moveTo(cx - 24, hy - 22); ctx.quadraticCurveTo(cx, hy - 28, cx + 24, hy - 22); ctx.lineTo(cx + 24, hy - 18); ctx.quadraticCurveTo(cx, hy - 24, cx - 24, hy - 18); ctx.closePath(); ctx.fill();
          for (const dx of [-16, 0, 16]) { ctx.beginPath(); ctx.moveTo(cx + dx - 6, hy - 22); ctx.lineTo(cx + dx, hy - 34); ctx.lineTo(cx + dx + 6, hy - 22); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = "#8ED0FF"; for (const dx of [-16, 16]) { ctx.beginPath(); ctx.arc(cx + dx, hy - 27, 1.6, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = "#E24B6B"; ctx.beginPath(); ctx.moveTo(cx, hy - 33); ctx.lineTo(cx + 3, hy - 28); ctx.lineTo(cx, hy - 23); ctx.lineTo(cx - 3, hy - 28); ctx.closePath(); ctx.fill();
        } else if (ch.hat === "mermaid") {
          // scallop-shell crown + pearls (long hair already drawn underneath)
          for (const dx of [-13, 0, 13]) {
            ctx.fillStyle = "#FF9EB5"; ctx.beginPath(); ctx.moveTo(cx + dx - 9, hy - 20); ctx.quadraticCurveTo(cx + dx, hy - 37, cx + dx + 9, hy - 20); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "#E06A8A"; ctx.lineWidth = 1;
            for (const r of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(cx + dx, hy - 20); ctx.lineTo(cx + dx + r, hy - 32); ctx.stroke(); }
          }
          ctx.fillStyle = "#FFF6E6"; for (const dx of [-19, -6, 6, 19]) { ctx.beginPath(); ctx.arc(cx + dx, hy - 19, 1.8, 0, Math.PI * 2); ctx.fill(); }
        } else if (ch.hat === "amazon") {
          // warrior circlet: gold band + red star gem + a side feather
          ctx.strokeStyle = "#F5C542"; ctx.lineWidth = 4; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(cx - 26, hy - 14); ctx.quadraticCurveTo(cx, hy - 28, cx + 26, hy - 14); ctx.stroke();
          ctx.fillStyle = "#E24B6B"; // star gem
          ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 4 / 5); const R = i % 2 ? 0 : 4.2; ctx.lineTo(cx + Math.cos(a) * 4.2, hy - 26 + Math.sin(a) * 4.2); }
          ctx.arc(cx, hy - 26, 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.translate(cx + 23, hy - 18); ctx.rotate(-0.5); ctx.fillStyle = "#C0392B"; ctx.beginPath(); ctx.ellipse(0, 0, 3, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); // feather
        } else if (ch.hat === "action") {
          // red headband with trailing tails + aviator shades (action hero)
          const fw = reduced ? 0 : Math.sin(t / 200) * 4;
          ctx.fillStyle = "#C0392B"; ctx.fillRect(cx - 33, hy - 16, 66, 8);
          ctx.fillStyle = "#8E2A1E"; ctx.fillRect(cx - 33, hy - 10, 66, 2);
          ctx.fillStyle = "#C0392B"; // knotted tails flapping on the left
          ctx.beginPath(); ctx.moveTo(cx - 33, hy - 14); ctx.lineTo(cx - 48, hy - 8 + fw); ctx.lineTo(cx - 45, hy - 2 + fw); ctx.lineTo(cx - 33, hy - 6); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx - 33, hy - 9); ctx.lineTo(cx - 50, hy + 3 + fw * 0.6); ctx.lineTo(cx - 46, hy + 8 + fw * 0.6); ctx.lineTo(cx - 33, hy - 1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#0E0E10"; // aviator shades over the eyes
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * 13, eyeY + 1, 9, 7, 0, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillRect(cx - 5, eyeY - 1, 10, 3); // bridge
          ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.4; // glare
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + side * 13 - 4, eyeY - 2); ctx.lineTo(cx + side * 13 + 1, eyeY + 3); ctx.stroke(); }
        } else if (ch.hat === "explorer") {
          // Adventurer's tan fedora. The head is 38 tall, so a crown topping out
          // at hy-42 left four pixels of hat above the skull and a brim sitting
          // at eyebrow level — a bowl clamped over the ears, not a hat. The brim
          // rides the forehead now and the crown has somewhere to go.
          const tan = "#8A6A3E", tanD = "#5E4626";
          const crown = () => {
            ctx.beginPath();
            ctx.moveTo(cx - 27, hy - 21);
            ctx.quadraticCurveTo(cx - 28, hy - 50, cx - 13, hy - 56);
            ctx.quadraticCurveTo(cx, hy - 58, cx + 13, hy - 56);
            ctx.quadraticCurveTo(cx + 28, hy - 50, cx + 27, hy - 21);
            ctx.closePath();
          };
          ctx.fillStyle = tanD; ctx.beginPath(); ctx.ellipse(cx, hy - 22, 46, 9, 0, 0, Math.PI * 2); ctx.fill(); // brim
          ctx.fillStyle = tan; crown(); ctx.fill();
          // The band is clipped to the crown. Drawn as a bare rect it overhangs
          // the curve and reads as a bar laid across the hat rather than a band
          // wrapped around it — square ends poking into the brim on both sides.
          ctx.save(); crown(); ctx.clip();
          ctx.fillStyle = "#3A2A18"; ctx.fillRect(cx - 30, hy - 33, 60, 8);
          ctx.fillStyle = "#2A1E11"; ctx.fillRect(cx - 30, hy - 26, 60, 2);
          ctx.restore();
          // A fedora is pinched either side of the front of the crown. The old
          // single full-height centre line read as a seam down the hat.
          ctx.strokeStyle = tanD; ctx.lineWidth = 2; ctx.lineCap = "round";
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + side * 9, hy - 55);
            ctx.quadraticCurveTo(cx + side * 8, hy - 48, cx + side * 10, hy - 42);
            ctx.stroke();
          }
        } else if (ch.hat === "horror") {
          // vampire: a tall standing collar behind the head. Short-haired variant gets slicked
          // hair + a widow's peak; the long-haired variant keeps its own flowing hair (drawn earlier).
          if (ch.hair !== "long") {
            ctx.fillStyle = ch.hairColor || "#0A0A0A";
            ctx.beginPath(); ctx.ellipse(cx, hy - 12, 33, 26, 0, Math.PI, 0); ctx.fill(); // slicked dome
            ctx.beginPath(); ctx.moveTo(cx - 16, hy - 18); ctx.lineTo(cx, hy - 4); ctx.lineTo(cx + 16, hy - 18); ctx.quadraticCurveTo(cx, hy - 24, cx - 16, hy - 18); ctx.closePath(); ctx.fill(); // widow's peak
          }
          ctx.fillStyle = "#160910"; // collar wings
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(cx + side * 20, hy + 36);
            ctx.quadraticCurveTo(cx + side * 52, hy + 6, cx + side * 40, hy - 34);
            ctx.lineTo(cx + side * 24, hy - 22);
            ctx.quadraticCurveTo(cx + side * 30, hy + 8, cx + side * 12, hy + 34);
            ctx.closePath(); ctx.fill();
          }
          ctx.strokeStyle = "#6E1420"; ctx.lineWidth = 2; // red inner lining
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + side * 24, hy - 22); ctx.quadraticCurveTo(cx + side * 30, hy + 8, cx + side * 12, hy + 32); ctx.stroke(); }
        } else if (ch.hat === "cowboy") {
          // Wide-brim western hat, cattleman crease, star pin on the band.
          // Same two faults the explorer had: a crown topping out six pixels
          // above a 38-tall head, and a band drawn as a bare rect that overhung
          // the crown's curve. The brim also sat at eyebrow level; a stetson is
          // worn ON the head, and its brim turns UP at the sides — which is what
          // separates it from a fedora at this size.
          const tan = "#9A7B4A", tanD = "#6B5230";
          const crown = () => {
            ctx.beginPath();
            ctx.moveTo(cx - 25, hy - 20);
            ctx.quadraticCurveTo(cx - 26, hy - 50, cx - 12, hy - 55);
            ctx.quadraticCurveTo(cx, hy - 57, cx + 12, hy - 55);
            ctx.quadraticCurveTo(cx + 26, hy - 50, cx + 25, hy - 20);
            ctx.closePath();
          };
          ctx.fillStyle = tanD; ctx.beginPath(); // brim: ends ride higher than the middle, so it reads as upturned
          ctx.moveTo(cx - 52, hy - 26); ctx.quadraticCurveTo(cx, hy - 12, cx + 52, hy - 26);
          ctx.quadraticCurveTo(cx, hy - 32, cx - 52, hy - 26); ctx.closePath(); ctx.fill();
          ctx.fillStyle = tan; crown(); ctx.fill();
          ctx.save(); crown(); ctx.clip();
          ctx.fillStyle = "#3A2A18"; ctx.fillRect(cx - 30, hy - 33, 60, 8); // band, clipped to the crown
          ctx.fillStyle = "#2A1E11"; ctx.fillRect(cx - 30, hy - 26, 60, 2);
          ctx.restore();
          ctx.strokeStyle = tanD; ctx.lineWidth = 2; ctx.lineCap = "round"; // cattleman crease: centre dent + two side pinches
          ctx.beginPath(); ctx.moveTo(cx, hy - 56); ctx.lineTo(cx, hy - 44); ctx.stroke();
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(cx + side * 11, hy - 53);
            ctx.quadraticCurveTo(cx + side * 10, hy - 47, cx + side * 12, hy - 42); ctx.stroke();
          }
          ctx.fillStyle = "#C9A24B"; // star pin on the band
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 1.6 : 3.6; ctx.lineTo(cx + Math.cos(a) * rr, hy - 29 + Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
        } else if (ch.hat === "noir") {
          // Rakishly tilted detective fedora + brim shadow across the eyes.
          // The crown was 34 tall on a 38-tall head and the brim's underside
          // reached the eyes, so the whole hat read as a bowler pulled down to
          // the brows. Raised and given a crown, with the band clipped to it.
          ctx.save(); ctx.translate(cx, hy - 6); ctx.rotate(-0.14);
          const dk = "#26262A", dkD = "#141416";
          const crown = () => {
            ctx.beginPath();
            ctx.moveTo(-25, -17);
            ctx.quadraticCurveTo(-26, -46, -12, -51);
            ctx.quadraticCurveTo(0, -53, 12, -51);
            ctx.quadraticCurveTo(26, -46, 25, -17);
            ctx.closePath();
          };
          ctx.fillStyle = dkD; ctx.beginPath(); ctx.ellipse(0, -18, 45, 9, 0, 0, Math.PI * 2); ctx.fill(); // brim
          ctx.fillStyle = dk; crown(); ctx.fill();
          ctx.save(); crown(); ctx.clip();
          ctx.fillStyle = "#0C0C0E"; ctx.fillRect(-30, -29, 60, 8); // band, clipped to the crown
          ctx.restore();
          ctx.strokeStyle = dkD; ctx.lineWidth = 2; ctx.lineCap = "round"; // teardrop pinch at the front of the crown
          for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 9, -50);
            ctx.quadraticCurveTo(side * 8, -44, side * 10, -38); ctx.stroke();
          }
          ctx.restore();
          ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.beginPath(); ctx.ellipse(cx, eyeY - 4, 22, 7, 0, 0, Math.PI * 2); ctx.fill(); // brim shadow
        }
      }
      ctx.restore(); // end head transform
      if (postHead) postHead(); // raised mug etc. overlaps the face — that's the point

      // ---- react overlays: sweat drop (red shock) / sparkles (green pop, also on a cheer) ----
      if (surprised || act === "cheer") {
        if (surprised && md < 0) {
          ctx.fillStyle = "#6FB7FF";
          const dy = (cy - 28) + e * 6;
          ctx.beginPath();
          ctx.moveTo(cx + 38, dy - 5);
          ctx.quadraticCurveTo(cx + 43, dy + 3, cx + 38, dy + 6);
          ctx.quadraticCurveTo(cx + 33, dy + 3, cx + 38, dy - 5);
          ctx.fill();
        } else {
          // green sparkle burst — a bigger, twinklier spray for a cheer
          ctx.strokeStyle = C.up; ctx.lineWidth = 2; ctx.lineCap = "round";
          const spread = act === "cheer" ? [[-50, -40, 5], [-40, -56, 4], [46, -46, 5], [54, -22, 4], [0, -62, 5], [30, -60, 3]] : [[-46, -34, 4], [44, -40, 5], [50, -18, 3]];
          for (const [dx, dy, r0] of spread) {
            const r = r0 * (act === "cheer" ? (0.6 + 0.4 * Math.abs(Math.sin(t / 120 + dx))) : 1) * (act === "cheer" ? e : 1);
            ctx.beginPath();
            ctx.moveTo(cx + dx - r, cy + dy); ctx.lineTo(cx + dx + r, cy + dy);
            ctx.moveTo(cx + dx, cy + dy - r); ctx.lineTo(cx + dx, cy + dy + r);
            ctx.stroke();
          }
        }
      }

      ctx.restore(); // end entrance transform

      // ---- scene caption for a scheduled moment (bell / meal / break) or a sustained task (work / present) ----
      let cap = null, capA = 0;
      if (act === "bell") { cap = s.cueLabel || "OPENING BELL"; capA = e; }
      else if (act === "eat") { cap = `${(s.cueMeal || "meal").toUpperCase()} BREAK`; capA = e; }
      else if (act === "break") { cap = "ON BREAK"; capA = e; }
      else if (act === "cheer") { cap = s.cueLabel || "NICE! ✓"; capA = e; }
      else if (busy === "work") { cap = "ANALYZING…"; capA = s.busyAmt; }
      else if (busy === "teach") { cap = "TEACHING…"; capA = s.busyAmt; }
      else if (busy === "present") { cap = "PRESENTING…"; capA = s.busyAmt; }
      if (cap) {
        ctx.globalAlpha = capA; // fades with the action envelope, or the eased busy amount
        ctx.font = "700 10px monospace";
        const w = ctx.measureText(cap).width + 18;
        ctx.fillStyle = "rgba(11,14,20,0.85)";
        ctx.beginPath();
        (ctx.roundRect ? ctx.roundRect(cx - w / 2, 6, w, 18, 9) : ctx.rect(cx - w / 2, 6, w, 18));
        ctx.fill();
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.amber; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(cap, cx, 16);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [ch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <canvas ref={cvsRef} style={{ width: 190, height: 230 }} aria-label={`Desk anchor: ${ch.name}`} />
      <div style={{ fontFamily: SANS, fontSize: 10, color: talking ? C.live : C.faint, letterSpacing: "-0.010em", textAlign: "center", minHeight: 14 }}>
        {talking ? `● ON AIR — ${ch.name} reading ${speakerLabel || ""}` : `${ch.name.toUpperCase()} · ${t("standing by")}`}
      </div>
    </div>
  );
}
// ---- YouTube frame: thumbnail + ▶ tries INLINE playback; a corner link opens YouTube in a new tab
//      as the escape hatch (inline embeds render black when a browser/network blocks them) ----
function VideoFrame({ id, title }) {
  const [playing, setPlaying] = useState(false);
  const [thumbBad, setThumbBad] = useState(false);
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const ytLink = (label, pos) => (
    <a href={watch} target="_blank" rel="noopener noreferrer"
      style={{ position: "absolute", ...pos, zIndex: 2, background: "rgba(0,0,0,0.78)", color: "#fff", fontFamily: MONO, fontSize: 12, padding: "3px 8px", borderRadius: R.sm, textDecoration: "none" }}>
      {label}
    </a>
  );
  if (playing) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000" }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&modestbranding=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
        {ytLink("black? open on YouTube ↗", { top: 6, right: 6 })}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000", overflow: "hidden" }}>
      {!thumbBad && (
        <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" onError={() => setThumbBad(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <button onClick={() => setPlaying(true)} aria-label={`Play ${title || "video"} inline`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 62, height: 62, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 24, marginLeft: 4, lineHeight: 1 }}>▶</span>
        </span>
      </button>
      {ytLink("YouTube ↗", { bottom: 8, right: 8 })}
    </div>
  );
}
// Internet Archive player — public-domain films that DO permit iframe embedding, so they play
// fully inside Vantage (unlike Netflix/Disney+/Hulu, which block framing entirely).
function ArchiveFrame({ id, title }) {
  return (
    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000" }}>
      <iframe
        src={`https://archive.org/embed/${id}`}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}
// ---- Market Blackjack: play 21 against the dealer with a chip bankroll ----
// Its OWN component so its hooks are stable (an inline IIFE with useState would break the rules of hooks).
function BlackjackGame({ onCheer, onWin }) {
  const [bankroll, setBankroll] = useState(500);
  const [bet, setBet] = useState(50);
  const [deck, setDeck] = useState([]);
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [phase, setPhase] = useState("bet");   // bet | player | done
  const [result, setResult] = useState(null);   // { kind:'win'|'lose'|'push', text }

  const deal = () => {
    if (bet <= 0 || bet > bankroll) return;
    const d = bjDeck();
    const p = [d.pop(), d.pop()], dl = [d.pop(), d.pop()];
    setDeck(d); setPlayer(p); setDealer(dl); setResult(null);
    if (bjValue(p) === 21) resolve(p, dl, d); // natural blackjack resolves immediately
    else setPhase("player");
  };
  const hit = () => {
    const d = deck.slice(), p = [...player, d.pop()];
    setDeck(d); setPlayer(p);
    if (bjValue(p) > 21) resolve(p, dealer, d); // bust
  };
  const stand = () => resolve(player, dealer, deck);

  // dealer draws to 17, then settle the hand and pay out
  const resolve = (p, dlInit, dk) => {
    const d = dk.slice(), dl = dlInit.slice(), pV = bjValue(p);
    if (pV <= 21) while (bjValue(dl) < 17) dl.push(d.pop()); // dealer only plays if the player didn't bust
    const dV = bjValue(dl), pBJ = p.length === 2 && pV === 21, dBJ = dl.length === 2 && dV === 21;
    let kind, text, delta;
    if (pV > 21) { kind = "lose"; text = `Bust at ${pV} — you lose`; delta = -bet; }
    else if (pBJ && !dBJ) { kind = "win"; text = "Blackjack! 🃏 (pays 3:2)"; delta = Math.round(bet * 1.5); }
    else if (dV > 21) { kind = "win"; text = `Dealer busts at ${dV} — you win`; delta = bet; }
    else if (pV > dV) { kind = "win"; text = `You win, ${pV} vs ${dV}`; delta = bet; }
    else if (pV < dV) { kind = "lose"; text = `You lose, ${pV} vs ${dV}`; delta = -bet; }
    else { kind = "push"; text = `Push at ${pV}`; delta = 0; }
    setDeck(d); setDealer(dl); setPhase("done"); setResult({ kind, text });
    setBankroll(b => b + delta);
    if (kind === "win") { onCheer?.(); if (pBJ) onWin?.(); }
  };
  const newHand = () => { setPhase("bet"); setPlayer([]); setDealer([]); setResult(null); };

  const hideHole = phase === "player";                 // dealer's 2nd card stays down until the player stands
  const card = (c, key, hidden, delay = 0, flip = false) => (
    <div key={key} className={flip ? "v-flip" : "v-deal"} style={{ animationDelay: `${delay}ms`, width: 34, height: 48, borderRadius: R.xs, border: `1px solid ${hidden ? C.edgeStrong : "#C7CEDB"}`, flexShrink: 0,
      background: hidden ? "#161718" : "#EDEFF4", color: hidden ? C.faint : (c.s === "♥" || c.s === "♦" ? "#C0392B" : "#141821"),
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 510 }}>
      {hidden ? <span style={{ fontSize: 18 }}>★</span> : <><span style={{ fontSize: 12 }}>{c.r}</span><span style={{ fontSize: 14 }}>{c.s}</span></>}
    </div>
  );
  const btn = (label, on, kind = "primary") => (
    <button onClick={on} style={kind === "primary"
      ? { background: C.accentPress, color: C.textOnAccent, border: "none", borderRadius: R.sm, fontFamily: SANS, fontWeight: 510, fontSize: 12, padding: "9px 18px", cursor: "pointer" }
      : { background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 12, padding: "9px 14px", cursor: "pointer" }}>{label}</button>
  );
  const resultCol = result ? (result.kind === "win" ? C.up : result.kind === "lose" ? C.down : C.text) : C.muted;
  const broke = bankroll < 10;
  return (
    <div style={{ padding: 14, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
        <span style={{ color: C.text }}>💰 Bankroll: <b style={{ color: broke ? C.down : C.textStrong }}>${bankroll}</b></span>
        <span style={{ color: C.muted }}>bet ${bet}</span>
      </div>

      {/* dealer */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "-0.010em", color: C.faint, marginBottom: 4 }}>DEALER {phase !== "bet" && !hideHole ? `· ${bjValue(dealer)}` : ""}</div>
        <div style={{ display: "flex", gap: 6, minHeight: 48 }}>
          {dealer.map((c, i) => card(c, `d${i}${hideHole && i === 1 ? "-back" : ""}`, hideHole && i === 1, i * 90, i === 1 && !hideHole))}
        </div>
      </div>
      {/* player */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "-0.010em", color: C.faint, marginBottom: 4 }}>YOU {player.length ? `· ${bjValue(player)}` : ""}</div>
        <div style={{ display: "flex", gap: 6, minHeight: 48 }}>
          {player.map((c, i) => card(c, `p${i}`, false, i * 90))}
        </div>
      </div>

      {result && <div className="v-settle" style={{ fontSize: 13, fontWeight: 510, color: resultCol }}>{result.text}</div>}

      {/* controls */}
      {phase === "bet" && (
        broke ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: C.down }}>Out of chips!</span>{btn("Buy in ($500)", () => setBankroll(500))}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {btn("−", () => setBet(b => Math.max(10, b - 10)), "ghost")}
            <span style={{ fontSize: 12, color: C.text, minWidth: 44, textAlign: "center" }}>${bet}</span>
            {btn("＋", () => setBet(b => Math.min(bankroll, b + 10)), "ghost")}
            {btn("Deal", deal)}
          </div>
        )
      )}
      {phase === "player" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{btn("Hit", hit)}{btn("Stand", stand, "ghost")}</div>
      )}
      {phase === "done" && (
        <div style={{ display: "flex", gap: 8 }}>{btn(broke ? "Out of chips" : "New hand ↻", broke ? () => {} : newHand)}</div>
      )}

    </div>
  );
}

// ============================================================
// Algorithm Wars — a real-time trading-floor auto-battler. You don't trade; you deploy & re-script
// automated bots (RTS units) and flip your army's AI logic (stance) live to counter the enemy AI.
// Self-contained (canvas + rAF); sim state lives in a ref so the loop never restarts on render.
const AW_W = 560, AW_H = 300;
const AW_BOTS = {
  day:    { name: "Day-Trader",  cost: 14, hp: 24, dmg: 6,  range: 26, speed: 48, rate: 0.55, r: 7,  color: "#ffffff", blurb: "fast, cheap, fragile — swarm and rush" },
  index:  { name: "Index-Fund",  cost: 28, hp: 92, dmg: 4,  range: 22, speed: 22, rate: 0.9,  r: 11, color: "#02b8cc", blurb: "tanky, slow — soaks damage, holds the line" },
  sniper: { name: "Sniper",      cost: 24, hp: 12, dmg: 22, range: 96, speed: 32, rate: 1.5,  r: 6,  color: "#6366f1", blurb: "long range, high burst — melts tanks, dies fast" },
};
const AW_STANCES = [
  { id: "aggressive", label: "Aggressive", hint: "push the enemy server" },
  { id: "balanced",   label: "Balanced",   hint: "engage nearest, then advance" },
  { id: "defensive",  label: "Defensive",  hint: "hold your line, counter-punch" },
];
// spend capital to spawn one bot of `type` for `side` at its base; returns false if unaffordable
function awDeploy(sim, side, type) {
  const b = AW_BOTS[type], S = sim[side];
  if (!sim || sim.over || S.cap < b.cost) return false;
  S.cap -= b.cost;
  sim.units.push({ side, type, hp: b.hp, maxHp: b.hp, x: S.spawnX, y: AW_H / 2 + (Math.random() * 2 - 1) * (AW_H * 0.34), cd: Math.random() * 0.3 });
  return true;
}
// enemy (CPU) AI: read the board to pick a stance, then periodically deploy a counter-unit
// (tanks to soak your snipers, snipers to melt your tanks, else a weighted-random pick)
function awBrain(sim, dt) {
  const cpu = sim.cpu;
  const us = sim.units;
  const youN = us.filter(u => u.side === "you").length, cpuN = us.filter(u => u.side === "cpu").length;
  const youPushing = us.some(u => u.side === "you" && u.x > AW_W * 0.6);
  cpu.stance = youPushing ? "defensive" : cpuN > youN + 2 ? "aggressive" : "balanced";
  cpu.nextDeploy -= dt;
  if (cpu.nextDeploy > 0) return;
  const youSnipers = us.filter(u => u.side === "you" && u.type === "sniper").length;
  const youTanks = us.filter(u => u.side === "you" && u.type === "index").length;
  let type;
  if (youSnipers >= 2 && cpu.cap >= AW_BOTS.index.cost) type = "index";       // tanks soak snipers
  else if (youTanks >= 2 && cpu.cap >= AW_BOTS.sniper.cost) type = "sniper";   // snipers melt tanks
  else { const r = Math.random(); type = r < 0.5 ? "day" : r < 0.8 ? "index" : "sniper"; }
  if (awDeploy(sim, "cpu", type)) cpu.nextDeploy = 1.0 + Math.random() * 1.4;
  else cpu.nextDeploy = 0.4;
}
// advance the sim one frame: regen both sides' capital, run the CPU brain, then for every unit
// acquire the nearest enemy and either fire (unit/server in range) or move per its stance; finally
// clear dead units & expired tracers and decide a winner when a server's HP hits zero.
function awStep(sim, dt, youStance) {
  if (sim.over) return;
  sim.t += dt;
  sim.you.cap = Math.min(150, sim.you.cap + dt * 5.6);
  sim.cpu.cap = Math.min(150, sim.cpu.cap + dt * 5.2);
  awBrain(sim, dt);
  const aggro = 140;
  for (const u of sim.units) {
    const b = AW_BOTS[u.type];
    const enemy = u.side === "you" ? "cpu" : "you";
    const enemyBaseX = sim[enemy].baseX;
    const stance = u.side === "you" ? youStance : sim.cpu.stance;
    const advDir = u.side === "you" ? 1 : -1;
    let tgt = null, td = Infinity;
    for (const o of sim.units) { if (o.side === enemy) { const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < td) { td = d; tgt = o; } } }
    u.cd -= dt;
    if (tgt && td <= b.range) { // attack enemy unit
      if (u.cd <= 0) { tgt.hp -= b.dmg; u.cd = b.rate; if (b.range > 60) sim.tracers.push({ x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, life: 0.12 }); }
      continue;
    }
    if (Math.abs(u.x - enemyBaseX) <= b.range) { // attack enemy server
      if (u.cd <= 0) { sim[enemy].baseHp -= b.dmg; u.cd = b.rate; if (b.range > 60) sim.tracers.push({ x1: u.x, y1: u.y, x2: enemyBaseX, y2: AW_H / 2, life: 0.12 }); }
      continue;
    }
    let goalX = enemyBaseX, goalY = u.y, chase = false;
    if (stance === "balanced") { if (tgt && td <= aggro) { goalX = tgt.x; goalY = tgt.y; chase = true; } }
    else if (stance === "defensive") {
      const holdX = u.side === "you" ? AW_W * 0.44 : AW_W * 0.56;
      if (tgt && td <= aggro) { goalX = tgt.x; goalY = tgt.y; chase = true; }
      else if ((advDir > 0 && u.x < holdX) || (advDir < 0 && u.x > holdX)) goalX = holdX;
      else goalX = u.x;
    } // aggressive → goalX stays enemyBaseX
    const dx = goalX - u.x, dy = goalY - u.y, dd = Math.hypot(dx, dy) || 1, sp = b.speed * dt;
    u.x += (dx / dd) * sp;
    u.y += chase ? (dy / dd) * sp : Math.sin((sim.t + u.x) * 0.6) * 5 * dt;
    u.y = Math.max(22, Math.min(AW_H - 22, u.y));
  }
  sim.units = sim.units.filter(u => u.hp > 0);
  for (const tr of sim.tracers) tr.life -= dt;
  sim.tracers = sim.tracers.filter(tr => tr.life > 0);
  if (sim.cpu.baseHp <= 0) sim.over = "you";
  else if (sim.you.baseHp <= 0) sim.over = "cpu";
}
// render one frame: grid + dashed center line, both servers (with HP bars), shot tracers, then units
function awDraw(ctx, sim) {
  ctx.fillStyle = "#0f1011"; ctx.fillRect(0, 0, AW_W, AW_H);
  ctx.strokeStyle = "#161718"; ctx.lineWidth = 1;
  for (let x = 0; x <= AW_W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, AW_H); ctx.stroke(); }
  for (let y = 0; y <= AW_H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(AW_W, y); ctx.stroke(); }
  ctx.strokeStyle = "#23252a"; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(AW_W / 2, 0); ctx.lineTo(AW_W / 2, AW_H); ctx.stroke(); ctx.setLineDash([]);
  const base = (x, color, hp) => {
    ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fillRect(x - 10, AW_H / 2 - 42, 20, 84); ctx.globalAlpha = 1;
    ctx.fillStyle = "#0009"; ctx.fillRect(x - 15, AW_H / 2 - 56, 30, 5);
    ctx.fillStyle = color; ctx.fillRect(x - 15, AW_H / 2 - 56, 30 * Math.max(0, hp) / 200, 5);
  };
  base(sim.you.baseX, "#27a644", sim.you.baseHp);
  base(sim.cpu.baseX, "#eb5757", sim.cpu.baseHp);
  for (const tr of sim.tracers) { ctx.strokeStyle = `rgba(208,214,224,${Math.max(0, tr.life / 0.12) * 0.8})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke(); }
  for (const u of sim.units) {
    const b = AW_BOTS[u.type];
    ctx.beginPath(); ctx.arc(u.x, u.y, b.r, 0, Math.PI * 2); ctx.fillStyle = u.side === "you" ? "#27a644" : "#eb5757"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = b.color; ctx.stroke();
    ctx.fillStyle = "rgba(8,9,10,0.7)"; ctx.fillRect(u.x - b.r, u.y - b.r - 5, b.r * 2, 3);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(u.x - b.r, u.y - b.r - 5, b.r * 2 * Math.max(0, u.hp) / u.maxHp, 3);
  }
}
// Algorithm Wars UI: a canvas + rAF render loop over the sim (engine functions above), with deploy
// buttons, a live stance switch, and capital/HP readouts. Sim state lives in a ref so it survives renders.
function AlgoWarsGame({ onWin, onCheer }) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const rafRef = useRef(0);
  const [stance, setStance] = useState("balanced");
  const stanceRef = useRef(stance); stanceRef.current = stance;
  const [over, setOver] = useState(null);
  const [hud, setHud] = useState({ youCap: 34, youBase: 200, cpuBase: 200, youN: 0, cpuN: 0, cpuStance: "balanced" });
  const wonRef = useRef(false);
  const newSim = () => ({
    t: 0, lastHud: 0, over: null, tracers: [],
    you: { cap: 34, baseHp: 200, baseX: 22, spawnX: 40 },
    cpu: { cap: 34, baseHp: 200, baseX: AW_W - 22, spawnX: AW_W - 40, stance: "balanced", nextDeploy: 2.2 },
    units: [],
  });
  useEffect(() => {
    if (!simRef.current) simRef.current = newSim();
    const ctx = canvasRef.current.getContext("2d");
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const sim = simRef.current;
      if (!sim.over) {
        awStep(sim, dt, stanceRef.current);
        if (sim.over && !wonRef.current) { wonRef.current = true; setOver(sim.over); onWin?.(sim.over); if (sim.over === "you") onCheer?.(); }
      }
      awDraw(ctx, sim);
      sim.lastHud += dt;
      if (sim.lastHud > 0.12) {
        sim.lastHud = 0;
        setHud({ youCap: Math.floor(sim.you.cap), youBase: Math.max(0, Math.ceil(sim.you.baseHp)), cpuBase: Math.max(0, Math.ceil(sim.cpu.baseHp)), youN: sim.units.filter(u => u.side === "you").length, cpuN: sim.units.filter(u => u.side === "cpu").length, cpuStance: sim.cpu.stance });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => { wonRef.current = false; simRef.current = newSim(); setOver(null); setStance("balanced"); };
  const deploy = (type) => { awDeploy(simRef.current, "you", type); };
  const cap = hud.youCap;
  const btn = { fontFamily: MONO, fontSize: 12, borderRadius: R.sm, padding: "8px 10px", cursor: "pointer" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* HUD */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 12, flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: C.up }}>▮ YOU · server {hud.youBase}/200 · {hud.youN} bots</span>
        <span style={{ color: C.textStrong }}>⚡ capital {cap}</span>
        <span style={{ color: C.down }}>ENEMY · server {hud.cpuBase}/200 · {hud.cpuN} bots · {hud.cpuStance} ▮</span>
      </div>
      {/* battlefield */}
      <div style={{ position: "relative", width: "100%", maxWidth: AW_W, alignSelf: "center" }}>
        <canvas ref={canvasRef} width={AW_W} height={AW_H} style={{ width: "100%", height: "auto", display: "block", borderRadius: R.md, border: `1px solid ${C.panelEdge}` }} />
        {over && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(8,9,10,0.86)", borderRadius: R.md, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 24, color: over === "you" ? C.up : C.down }}>
              {over === "you" ? "🏆 MARKET DOMINATED" : "💥 ALGORITHMS CRUSHED"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{over === "you" ? "Your bots took the enemy server." : "The enemy overran your server."}</div>
            <button onClick={reset} style={{ ...btn, background: C.accentPress, border: "none", color: C.textOnAccent, fontWeight: 510, padding: "9px 18px" }}>Rematch ↻</button>
          </div>
        )}
      </div>
      {/* deploy bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(AW_BOTS).map(([id, b]) => {
          const afford = cap >= b.cost;
          return (
            <button key={id} onClick={() => deploy(id)} disabled={!afford || !!over} title={b.blurb}
              style={{ ...btn, flex: 1, minWidth: 120, textAlign: "left", background: afford ? "#161718" : "#0f1011", border: `1px solid ${afford ? C.edgeStrong : C.panelEdge}`, color: afford ? C.text : C.faint, opacity: over ? 0.5 : 1 }}>
              <div style={{ fontWeight: 510, color: afford ? b.color : C.faint }}>{b.name} <span style={{ color: afford ? C.muted : C.faint, fontWeight: 400 }}>⚡{b.cost}</span></div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 2, lineHeight: 1.4 }}>{b.blurb}</div>
            </button>
          );
        })}
      </div>
      {/* stance = live AI re-scripting */}
      <div>
        <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint, marginBottom: 5 }}>YOUR ARMY LOGIC — flip it live to counter the enemy</div>
        <div style={{ display: "flex", gap: 6 }}>
          {AW_STANCES.map(s => (
            <button key={s.id} onClick={() => setStance(s.id)} title={s.hint}
              style={{ ...btn, flex: 1, background: stance === s.id ? "rgba(255,255,255,0.09)" : "transparent", border: `1px solid ${stance === s.id ? C.accent : C.panelEdge}`, color: stance === s.id ? C.accentText : C.muted, fontWeight: 510 }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
        Capital regenerates over time — spend it to deploy bots that auto-march and fight. Destroy the enemy server. Counter-play: Snipers melt Index-Funds, Index-Funds soak Day-Traders, Day-Traders swarm Snipers. The enemy adapts its logic — so adapt yours.
      </div>
    </div>
  );
}

// ---- Vantage Calendar: a self-contained month calendar. Events live in localStorage, no account. ----
const CAL_DOW = ["S", "M", "T", "W", "T", "F", "S"];
const CAL_MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const calPad = (n) => String(n).padStart(2, "0");
const calKey = (y, m, d) => `${y}-${calPad(m + 1)}-${calPad(d)}`;
// format a stored 24h "HH:MM" event time as American 12-hour "H:MM AM/PM"
const to12h = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return t || "";
  const h = +m[1], ap = h < 12 ? "AM" : "PM", h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${ap}`;
};
const calPretty = (key) => { const [y, m, d] = String(key).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); };
// month-grid calendar component: user events persist in localStorage; read-only `extra` events
// (e.g. earnings dates from the market feed) are merged in and shown but can't be edited/deleted.
function AppCalendar({ extra = [] }) {
  const load = () => { try { return JSON.parse(window.localStorage.getItem("tape-calendar") || "[]"); } catch { return []; } };
  const [events, setEvents] = useState(load);
  const now = new Date();
  const todayKey = calKey(now.getFullYear(), now.getMonth(), now.getDate());
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState(todayKey);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  useEffect(() => { try { window.localStorage.setItem("tape-calendar", JSON.stringify(events)); } catch { /* private mode */ } }, [events]);

  const startDow = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const userDays = new Set(events.map(e => e.date));
  const mktDays = new Set(extra.map(e => e.date));
  const dayEvents = [
    ...events.filter(e => e.date === sel).map(e => ({ ...e, kind: "user" })),
    ...extra.filter(e => e.date === sel).map(e => ({ ...e, kind: "market" })),
  ].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const shift = (delta) => setYm(({ y, m }) => { const nm = m + delta; return { y: y + Math.floor(nm / 12) - (nm < 0 ? 1 : 0), m: ((nm % 12) + 12) % 12 }; });
  const add = () => { const t = title.trim(); if (!t) return; setEvents(evs => [...evs, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: sel, time, title: t }]); setTitle(""); setTime(""); };
  const del = (id) => setEvents(evs => evs.filter(e => e.id !== id));
  const upcoming = [
    ...events.map(e => ({ ...e, kind: "user" })),
    ...extra.map(e => ({ ...e, kind: "market" })),
  ].filter(e => e.date >= todayKey)
    .sort((a, b) => a.date === b.date ? (a.time || "99").localeCompare(b.time || "99") : a.date.localeCompare(b.date))
    .slice(0, 5);
  const jump = (key) => { const [y, m] = String(key).split("-").map(Number); setYm({ y, m: m - 1 }); setSel(key); };
  const pretty = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }); };
  const navBtn = { background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 12, padding: "2px 9px", cursor: "pointer" };

  return (
    <div style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
      {/* month grid — capped, so a wide panel gets an agenda instead of giant squares */}
      <div style={{ flex: "1 1 300px", maxWidth: 420, minWidth: "min(236px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={() => shift(-1)} aria-label="Previous month" className="v-tap" style={navBtn}>‹</button>
          <button onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSel(todayKey); }} title="Jump to today"
            style={{ background: "transparent", border: "none", color: C.text, fontFamily: SANS, fontSize: 13, fontWeight: 510, cursor: "pointer" }}>{CAL_MON[ym.m]} {ym.y}</button>
          <button onClick={() => shift(1)} aria-label="Next month" className="v-tap" style={navBtn}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {CAL_DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((d, i) => {
            if (d == null) return <div key={i} />;
            const key = calKey(ym.y, ym.m, d);
            const isToday = key === todayKey, isSel = key === sel;
            const hasUser = userDays.has(key), hasMkt = mktDays.has(key);
            return (
              <button key={i} onClick={() => setSel(key)} className="v-calday" style={{
                height: 36, display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                background: isSel ? "rgba(255,255,255,0.10)" : "transparent",
                border: `1px solid ${isToday ? C.accent : "transparent"}`, borderRadius: R.sm, cursor: "pointer",
                fontFamily: SANS, fontSize: 12, color: isSel ? C.accentText : C.text, padding: 0,
              }}>
                {d}
                {(hasUser || hasMkt) && (
                  <span style={{ position: "absolute", bottom: 3, display: "flex", gap: 2 }}>
                    {hasUser && <span style={{ width: 4, height: 4, borderRadius: "50%", background: isSel ? C.accent : C.up }} />}
                    {hasMkt && <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.amber }} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* agenda — the selected day, the add form, and what's coming */}
      <div style={{ flex: "1 1 260px", minWidth: "min(236px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 13, color: C.text }}>{pretty(sel)}</span>
          {sel === todayKey && <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.accentText, border: `1px solid ${C.accent}`, borderRadius: R.pill, padding: "1px 7px" }}>TODAY</span>}
        </div>
        {dayEvents.length === 0 && <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginBottom: 6 }}>No events.</div>}
        {dayEvents.map((e, i) => (
          <div key={e.id || `m${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: e.time ? C.accentText : C.faint, border: `1px solid ${C.panelEdge}`, borderRadius: R.xs, padding: "2px 6px", minWidth: 58, textAlign: "center" }}>{e.time ? to12h(e.time) : (e.kind === "market" ? "market" : "all day")}</span>
            <span style={{ fontFamily: SANS, fontSize: 12, color: e.kind === "market" ? C.amber : C.text, flex: 1, lineHeight: 1.35 }}>{e.title}</span>
            {e.kind === "user" && <button onClick={() => del(e.id)} aria-label="Delete event" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 11 }}>✕</button>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input value={time} onChange={e => setTime(e.target.value)} type="time" aria-label="Event time"
            style={{ width: 96, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 6px" }} />
          <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Add an event…" aria-label="Event title"
            style={{ flex: 1, minWidth: 0, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, padding: "7px 8px" }} />
          <button onClick={add} aria-label="Add event" style={{ background: C.accentPress, border: "none", color: C.textOnAccent, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, letterSpacing: "-0.010em", padding: "0 12px", cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
        </div>
        {upcoming.length > 0 && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.panelEdge}`, paddingTop: 10 }}>
            <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint, marginBottom: 4 }}>UPCOMING</div>
            {upcoming.map((e, i) => (
              <button key={e.id || `u${i}`} onClick={() => jump(e.date)} className="v-row"
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 6px", margin: "0 -6px", background: "transparent", border: "none", borderRadius: R.sm, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, minWidth: 78 }}>{calPretty(e.date)}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: e.time ? C.accentText : C.faint, minWidth: 52 }}>{e.time ? to12h(e.time) : "—"}</span>
                <span style={{ fontFamily: SANS, fontSize: 12, color: e.kind === "market" ? C.amber : C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  ACCOUNTS · SUBSCRIPTION · LEGAL  (see AuthScreen + App at the bottom)
// ------------------------------------------------------------
//  Built in three independent layers so each works on its own:
//    L1 (here + AuthScreen) — a fully client-side prototype: sign up / log in /
//        pick a plan / agree to terms, all persisted in the browser.
//    L2 (server/index.js /api/auth/*) — real backend auth: scrypt-hashed
//        passwords + session tokens in a gitignored users file. Used automatically
//        when the backend is reachable; otherwise L1 runs standalone.
//    L3 (server/index.js /api/billing/*) — real Stripe Checkout, gated on the
//        operator's own Stripe test keys. Card entry only ever happens on Stripe's
//        hosted page — this app never renders a card form. Without keys, paid plans
//        fall back to a clearly-labelled simulated unlock.
//
//  ⚠ SECURITY NOTE: Layer 1's localStorage + crypto.subtle password hashing is a
//  PROTOTYPE convenience, NOT real security — anyone with devtools can read the
//  store. Real protection comes only from Layer 2 (the backend). Never treat the
//  browser-side account as an authorization boundary.
// ============================================================

// The subscription tiers. `price` is display-only; real charges (if ever) happen
// through Stripe in Layer 3. Feature copy is illustrative for the prototype.
const PLANS = [
  { id: "free", label: "Explorer", price: "$0", cadence: "forever", tagline: "Everything you need to watch the tape.",
    perks: ["Demo + live market data", "AI desk answers (bring your own key)", "Watchlist, portfolio & alerts", "Games, calendar & streaming"] },
  { id: "pro", label: "Pro Desk", price: "$12", cadence: "/mo", featured: true, tagline: "For the daily driver.",
    perks: ["Everything in Explorer", "Priority AI model routing", "Breaking-news anchor alerts", "Unlimited saved layouts"] },
  { id: "desk", label: "Trading Floor", price: "$39", cadence: "/mo", tagline: "The full broadcast desk.",
    perks: ["Everything in Pro Desk", "Team seats & shared watchlists", "Studio ElevenLabs anchor voice", "Zoom / Meet briefing rooms"] },
];
const planLabel = (id) => (PLANS.find(p => p.id === id)?.label || "Explorer");

// ---- feature gating (enforced via planAllows() inside MarketDashboard) ----
// Every premium integration requires BOTH a minimum plan AND its own API key. The key is checked
// at each feature; the PLAN is checked here. Explorer (free) unlocks none of these.
//   Pro Desk    → AI models, live Finnhub data, YouTube, TMDB, Spotify
//   Trading Floor → adds the ElevenLabs studio voice (browser TTS stays free for everyone)
const PLAN_RANK = { free: 0, pro: 1, desk: 2 };
const FEATURE_PLAN = { ai: "pro", finnhub: "pro", youtube: "pro", tmdb: "pro", spotify: "pro", elevenlabs: "desk" };

// Plain-language legal copy shown behind the "I agree" gate. Intentionally short and
// honest for a prototype — it names the app's real behaviour (keys stay in the browser).
const LEGAL_VERSION = "2026-07-14";
const LEGAL_TERMS = [
  "Vantage is a market-information and entertainment dashboard. It is NOT financial advice, and nothing shown here is a recommendation to buy or sell any security.",
  "Market data may be delayed, simulated, or inaccurate. Do not rely on it for trading decisions.",
  "Any API keys you enter yourself are stored only in your own browser's localStorage and are sent only to those providers' APIs. When the desk runs on this server's own model key instead, your question is sent to our backend, which forwards it to the model provider.",
  "This build may include a simulated subscription flow. Unless a real Stripe checkout is explicitly presented, no payment is taken and any paid plan is unlocked for demonstration only.",
  "The software is provided “as is”, without warranty of any kind. Use it at your own risk.",
];
const LEGAL_PRIVACY = [
  "Your account (email, display name, chosen plan, and agreement timestamp) is stored locally in your browser. If you run the optional backend, it is also stored there in a gitignored file.",
  "Passwords are never stored in plain text — they are salted and hashed before storage.",
  "We do not sell your data or embed third-party trackers. Market, media and AI requests go to this app's backend, which holds the provider keys, relays each request to the provider, and records AI runs for quota accounting. A model key you add yourself (e.g. Claude, OpenAI) is sent only to that provider.",
];

// ---- password hashing (Layer 1, client-side) ----
// PBKDF2 via WebCrypto with a random per-user salt. Prototype-grade: adequate to avoid
// storing plaintext, but the whole store is readable in devtools — see the security note above.
const _hex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
async function hashPassword(password, saltHex) {
  // caller supplies salt on verify; on signup we generate one when absent
  if (!saltHex) saltHex = _hex(crypto.getRandomValues(new Uint8Array(16)));
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, baseKey, 256);
  return { saltHex, hashHex: _hex(bits) };
}

// ---- local account store (Layer 1) ----
// tape-users : { [emailLower]: { email, name, saltHex, hashHex, plan, agreedAt, legalVersion } }
// tape-account : the currently signed-in account (without the hash) or null
const loadUsers = () => { try { return JSON.parse(localStorage.getItem("tape-users") || "{}"); } catch { return {}; } };
const saveUsers = (u) => { try { localStorage.setItem("tape-users", JSON.stringify(u)); } catch { /* quota */ } };
const loadAccount = () => { try { return JSON.parse(localStorage.getItem("tape-account") || "null"); } catch { return null; } };
const saveAccount = (a) => { try { a ? localStorage.setItem("tape-account", JSON.stringify(a)) : localStorage.removeItem("tape-account"); } catch { /* quota */ } };

// Is the optional backend (server/index.js) reachable? Decides local-vs-backend authority
// at runtime. Kept deliberately simple — one probe, short timeout, no cross-store syncing.
async function backendReachable() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch("/api/status", { signal: ctrl.signal });
    clearTimeout(to);
    return r.ok;
  } catch { return false; }
}


// ============================================================
//  Auth form primitives
//
//  These exist because the gate previously leaned on placeholders alone. A
//  placeholder disappears the moment you type, which is precisely when someone
//  wants to check what they are filling in, and it leaves a screen reader with a
//  field that announces nothing once it has a value. So: real labels, real error
//  slots, and a submit path that goes through a real <form> so password managers
//  recognise the flow and offer to save the credential.
// ============================================================

// A labelled field with a slot for its error or hint.
function AuthField({ id, label, error, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{ ...TYPE.label, color: C.muted }}>{label}</label>
      {children}
      {error
        ? <span role="alert" style={{ ...TYPE.caption, fontSize: 12, color: C.down }}>{error}</span>
        : hint
          ? <span style={{ ...TYPE.caption, fontSize: 12, color: C.faint }}>{hint}</span>
          : null}
    </div>
  );
}

// Password input with a reveal toggle and a Caps Lock warning.
//
// The toggle is not a nicety: a masked field you cannot check is the main reason
// people mistype a password, and on the local path a mistyped password at signup
// is unrecoverable. Caps Lock gets its own warning for the same reason — it is
// the most common cause of "my password suddenly stopped working".
function AuthPasswordField({ id, value, onChange, autoComplete, placeholder, invalid, onBlur }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const readCaps = (e) => { try { setCaps(!!(e.getModifierState && e.getModifierState("CapsLock"))); } catch { /* not every event carries modifier state */ } };
  return (
    <>
      <div style={{ position: "relative", display: "flex" }}>
        <input
          id={id} type={shown ? "text" : "password"} value={value} placeholder={placeholder}
          autoComplete={autoComplete} aria-invalid={invalid ? "true" : undefined}
          onChange={e => onChange(e.target.value)}
          onKeyDown={readCaps} onKeyUp={readCaps}
          onBlur={e => { setCaps(false); if (onBlur) onBlur(e); }}
          style={{ ...fieldRecipe({ invalid }), fontSize: 14, paddingRight: 74 }}
        />
        <button
          type="button" onClick={() => setShown(v => !v)} aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          style={{
            position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
            ...button("quiet", "sm"), padding: "5px 9px", color: C.accentText, fontWeight: 510,
          }}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {caps && (
        <span role="status" style={{ ...TYPE.caption, fontSize: 12, color: C.warn, display: "flex", alignItems: "center", gap: 5 }}>
          <span aria-hidden="true">⇪</span> Caps Lock is on
        </span>
      )}
    </>
  );
}

// Four segments rather than a percentage bar: a continuous bar invites people to
// chase 100%, which is not a thing that exists. Segments read as "you have
// cleared this many", and the line underneath says what to do next.
function PasswordStrength({ result }) {
  const tone = result.score >= 3 ? C.up : result.score === 2 ? C.warn : C.down;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <span key={i} style={{
            flex: 1, height: 3, borderRadius: R.pill,
            background: i < result.score ? tone : C.edgeStrong,
            transition: `background ${MOTION.base} ${MOTION.ease}`,
          }} />
        ))}
      </div>
      <span role="status" style={{ ...TYPE.caption, fontSize: 12, color: result.blocking ? C.down : tone }}>
        {result.blocking || `Password strength: ${result.label}`}
      </span>
    </div>
  );
}

// ============================================================
//  AuthScreen — the sign-in / sign-up / plan / legal gate (Layer 1 client flow,
//  automatically upgraded to the backend when it is reachable). Self-contained: its
//  own hooks keep new state out of the giant MarketDashboard component. Calls
//  onAuthed(account) when the user is in.
// ============================================================
function AuthScreen({ onAuthed }) {
  const { t } = useI18n();
  const [step, setStep] = useState("welcome");     // welcome | login | signup | plan | legal
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Errors stay hidden until a field has been left or the form submitted once —
  // shouting "invalid email" at someone who has typed two characters is noise.
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [plan, setPlan] = useState("free");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [legalTab, setLegalTab] = useState("terms"); // terms | privacy
  const [useBackend, setUseBackend] = useState(false);
  const [socialProviders, setSocialProviders] = useState({}); // { google:bool, yahoo:bool } — which SSO buttons to show

  // Detect the backend once so we can label the flow ("secured by server" vs "on this device").
  useEffect(() => { let ok = true; backendReachable().then(v => ok && setUseBackend(v)); return () => { ok = false; }; }, []);
  // Ask the backend which social providers are configured (needs their OAuth app + the backend running).
  useEffect(() => {
    if (!useBackend) return; let ok = true;
    api.auth.providers().then(j => ok && setSocialProviders(j || {})).catch(() => { /* no backend → no social buttons */ });
    return () => { ok = false; };
  }, [useBackend]);
  // "Continue with …" buttons. Social sign-in is a full-page redirect to the provider and back.
  // Only rendered for configured providers; Proton has no third-party SSO, so it's a plain-email note.
  const socialBlock = (socialProviders.google || socialProviders.yahoo) ? (
    <div style={{ display: "grid", gap: 8 }}>
      {socialProviders.google && (
        <button type="button" style={{ ...primaryBtn(), background: "#fff", color: "#1a1a1a", border: "1px solid #dadce0", boxShadow: SHADOW.sm }}
          onClick={() => { window.location.href = api.auth.oauthUrl("google"); }}>Continue with Google</button>
      )}
      {socialProviders.yahoo && (
        <button type="button" style={{ ...primaryBtn(), background: "#5f01d1", color: "#fff", boxShadow: SHADOW.sm }}
          onClick={() => { window.location.href = api.auth.oauthUrl("yahoo"); }}>Continue with Yahoo</button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
        <div style={{ flex: 1, height: 1, background: C.edge }} /><span style={{ ...TYPE.eyebrowSm, color: C.faint }}>or</span><div style={{ flex: 1, height: 1, background: C.edge }} />
      </div>
    </div>
  ) : null;

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  // Moving between steps is always a fresh start for validation state, so an
  // error left on the login form does not greet you on the signup form.
  const go = (next) => { setErr(""); setSubmitted(false); setTouched({}); setShowRecovery(false); setStep(next); };
  const touch = (k) => setTouched(v => ({ ...v, [k]: true }));
  const revealed = (k) => submitted || !!touched[k];

  const emailErr = revealed("email") && !emailOk
    ? (email.trim() ? "That doesn't look like an email address." : "Enter your email address.")
    : "";
  const loginPwErr = revealed("password") && !password ? "Enter your password." : "";
  // Only signup is held to the policy: accounts created under the old
  // six-character rule must still be able to log in.
  const pw = passwordCheck(password, { email });
  const confirmErr = revealed("confirm") && confirm !== password
    ? (confirm ? "The two passwords don't match." : "Re-enter your password to confirm.")
    : "";
  const signupReady = emailOk && pw.ok && confirm === password;

  // ---- LOG IN ----
  async function doLogin() {
    setSubmitted(true);
    if (!emailOk || !password) return;   // the inline errors now explain why
    setErr(""); setBusy(true);
    try {
      if (useBackend) {
        // Goes through the REST client, which normalises the error, stores the
        // session token and lower-cases the email in one place.
        const j = await api.auth.login({ email, password });
        onAuthed({ email: j.email, name: j.name, plan: j.plan, token: j.token, backend: true });
        return;
      }
      const users = loadUsers();
      const rec = users[email.trim().toLowerCase()];
      if (!rec) throw new Error("No account found for that email — try signing up.");
      const { hashHex } = await hashPassword(password, rec.saltHex);
      if (hashHex !== rec.hashHex) throw new Error("Incorrect password.");
      onAuthed({ email: rec.email, name: rec.name, plan: rec.plan, backend: false });
    } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
  }

  // ---- CREATE ACCOUNT (after plan + legal) ----
  async function doSignup() {
    // The password was typed two steps ago, so re-run the gate at the moment the
    // account is actually created rather than trusting the route taken to get here.
    if (!emailOk) { setErr("Enter a valid email address."); go("signup"); return; }
    if (!pw.ok) { setErr(pw.blocking); go("signup"); return; }
    if (confirm !== password) { setErr("The two passwords don't match."); go("signup"); return; }
    setErr(""); setBusy(true);
    try {
      const em = email.trim().toLowerCase();
      if (useBackend) {
        const j = await api.auth.signup({ email: em, name: name.trim(), password, plan, legalVersion: LEGAL_VERSION });
        onAuthed({ email: j.email, name: j.name, plan: j.plan, token: j.token, backend: true });
        return;
      }
      const users = loadUsers();
      if (users[em]) throw new Error("An account with that email already exists — log in instead.");
      const { saltHex, hashHex } = await hashPassword(password);
      const rec = { email: em, name: name.trim() || em.split("@")[0], saltHex, hashHex, plan, agreedAt: Date.now(), legalVersion: LEGAL_VERSION };
      users[em] = rec; saveUsers(users);
      onAuthed({ email: rec.email, name: rec.name, plan: rec.plan, backend: false });
    } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
  }

  // Shared control styling, taken from the design system so the gate is visibly
  // the same product as the dashboard behind it. (Named `inputStyle` rather than
  // `field` because `field` is the imported recipe this is built from.)
  const inputStyle = { ...fieldRecipe(), fontSize: 14 };
  const formCol = { display: "flex", flexDirection: "column", gap: 14 };
  const primaryBtn = (extra = {}) => ({ ...button("primary", "lg", { full: true }), ...extra });
  const ghostBtn = { ...button("quiet", "sm"), color: C.accentSoft, textDecoration: "underline", padding: 0 };
  const errBox = err ? (
    <div role="alert" style={{ background: C.downSoft, border: "1px solid rgba(235,87,87,0.4)", color: "#f28080", borderRadius: R.md, padding: "10px 12px", ...TYPE.bodySm, fontSize: 13, lineHeight: 1.5 }}>{err}</div>
  ) : null;

  // .v-aurora (global.css) drifts a slow colour field behind the card. The inline
  // GRAD.aurora stays as the static base underneath it, so the surface is never
  // flat black for the frame before the blobs paint — and so reduced-motion users
  // still get the wash rather than nothing at all.
  return (
    <div className="v-aurora" style={{ minHeight: "100vh", background: `${GRAD.aurora}, ${C.base}`, color: C.text, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="v-rise" style={{ width: step === "plan" ? 880 : 428, maxWidth: "96vw", background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.xl, boxShadow: SHADOW.xl, overflow: "hidden" }}>

        {/* header / brand — the gradient mark is the same one the app header uses,
            so the gate reads as the front door of this product rather than a
            generic login screen. */}
        <div style={{ padding: "24px 28px 18px", borderBottom: `1px solid ${C.edge}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <VantageMark size={34} />
            <div>
              <div className="v-grad-text" style={{ fontFamily: DISPLAY, fontWeight: 510, fontSize: 20, letterSpacing: "-0.025em" }}>VANTAGE</div>
              <div style={{ ...TYPE.eyebrowSm, color: C.faint, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: useBackend ? C.up : C.faint }} />
                {useBackend ? "secured by server" : "runs on this device"}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 26px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ---------- WELCOME ---------- */}
          {step === "welcome" && (<>
            <div style={{ ...TYPE.title }}>{t("The AI broadcast desk for the markets.")}</div>
            {/* The old copy promised "works entirely on this device" unconditionally,
                which stops being true the moment the optional backend is running.
                Say which one it actually is. */}
            <div style={{ ...TYPE.body, fontSize: 13, color: C.muted }}>
              Create a free account to save your watchlist, portfolio and plan.
              {useBackend
                ? " Your account is held on the server you are connected to."
                : " It takes a moment and works entirely on this device — nothing leaves your browser."}
            </div>
            {socialBlock}
            <button style={primaryBtn()} onClick={() => go("signup")}>{t("Create account")}</button>
            <button style={{ ...primaryBtn(), background: "transparent", color: C.text, border: `1px solid ${C.edge}` }} onClick={() => go("login")}>{t("Log in")}</button>
          </>)}

          {/* ---------- LOG IN ---------- */}
          {/* A real <form>, not a div of inputs: it is what makes Enter submit from
              any field, what lets a password manager recognise the credential pair
              and offer to save it, and what browsers autofill reliably. The submit
              button is deliberately NOT disabled — a dead button explains nothing,
              so submitting an incomplete form reveals the inline errors instead. */}
          {step === "login" && (
            <form style={formCol} noValidate onSubmit={e => { e.preventDefault(); doLogin(); }}>
              <div style={{ ...TYPE.title, fontSize: 17 }}>Welcome back</div>
              {errBox}
              {socialBlock}

              <AuthField id="login-email" label="Email" error={emailErr}>
                <input id="login-email" style={{ ...inputStyle, ...(emailErr ? { borderColor: C.danger } : null) }}
                  type="email" inputMode="email" placeholder="you@example.com" value={email}
                  autoComplete="username" aria-invalid={emailErr ? "true" : undefined}
                  onChange={e => setEmail(e.target.value)} onBlur={() => touch("email")} />
              </AuthField>

              <AuthField id="login-password" label="Password" error={loginPwErr}>
                <AuthPasswordField id="login-password" value={password} onChange={setPassword}
                  autoComplete="current-password" placeholder="Your password"
                  invalid={!!loginPwErr} onBlur={() => touch("password")} />
              </AuthField>

              <button type="submit" style={primaryBtn({ opacity: busy ? 0.6 : 1 })} disabled={busy}>
                {busy ? "Signing in…" : "Log in"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <button type="button" style={ghostBtn} onClick={() => go("signup")}>Create account</button>
                <button type="button" style={{ ...ghostBtn, color: C.faint }} aria-expanded={showRecovery}
                  onClick={() => setShowRecovery(v => !v)}>Forgot password?</button>
              </div>

              {/* No fake "we sent you a link". There is no mail service in this
                  build, and inventing one would strand people waiting on an email
                  that never arrives. Say what is true and what they can do. */}
              {showRecovery && (
                <div style={{ ...TYPE.bodySm, fontSize: 13, color: C.muted, background: C.surfaceSunken, border: `1px solid ${C.edge}`, borderRadius: R.md, padding: "11px 13px", lineHeight: 1.55 }}>
                  {useBackend
                    ? "This build has no password-reset email. Whoever runs the server can reset it for you directly."
                    : "Your account lives only in this browser — there is no server to send a reset link from, and the password was stored as a salted hash that cannot be read back. If you cannot recall it, create a new account: your watchlist, portfolio and settings are saved separately and will still be here."}
                </div>
              )}
            </form>
          )}

          {/* ---------- SIGN UP (credentials) ---------- */}
          {step === "signup" && (
            <form style={formCol} noValidate onSubmit={e => {
              e.preventDefault();
              setSubmitted(true);
              if (signupReady) { setErr(""); setSubmitted(false); setTouched({}); setStep("plan"); }
            }}>
              <div style={{ ...TYPE.title, fontSize: 17 }}>Create your account</div>
              {errBox}
              {socialBlock}

              <AuthField id="signup-name" label="Display name" hint="Optional — what the anchor calls you on air.">
                <input id="signup-name" style={inputStyle} placeholder="Alex" value={name}
                  autoComplete="name" onChange={e => setName(e.target.value)} />
              </AuthField>

              <AuthField id="signup-email" label="Email" error={emailErr}>
                <input id="signup-email" style={{ ...inputStyle, ...(emailErr ? { borderColor: C.danger } : null) }}
                  type="email" inputMode="email" placeholder="you@example.com" value={email}
                  autoComplete="username" aria-invalid={emailErr ? "true" : undefined}
                  onChange={e => setEmail(e.target.value)} onBlur={() => touch("email")} />
              </AuthField>

              <AuthField id="signup-password" label="Password">
                <AuthPasswordField id="signup-password" value={password} onChange={setPassword}
                  autoComplete="new-password" placeholder={`At least ${PW_MIN} characters`}
                  invalid={revealed("newpw") && !pw.ok} onBlur={() => touch("newpw")} />
                {(password || revealed("newpw")) && <PasswordStrength result={pw} />}
              </AuthField>

              {/* Asked for twice on purpose. Without a reset path, a typo here is
                  not an inconvenience — it is a permanently locked account. */}
              <AuthField id="signup-confirm" label="Confirm password" error={confirmErr}
                hint={!confirmErr && confirm && confirm === password ? "Passwords match." : ""}>
                <AuthPasswordField id="signup-confirm" value={confirm} onChange={setConfirm}
                  autoComplete="new-password" placeholder="Type it again"
                  invalid={!!confirmErr} onBlur={() => touch("confirm")} />
              </AuthField>

              <button type="submit" style={primaryBtn()}>Continue → choose a plan</button>

              {socialProviders.google && (
                <div style={{ ...TYPE.caption, fontSize: 11, color: C.faint, textAlign: "center" }}>
                  Proton has no "sign in with Proton" — just sign up with your Proton email above.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button type="button" style={ghostBtn} onClick={() => go("login")}>I already have an account</button>
              </div>
            </form>
          )}

          {/* ---------- PLAN PICKER ---------- */}
          {step === "plan" && (<>
            <div style={{ ...TYPE.title, textAlign: "center" }}>Choose your plan</div>
            <div style={{ ...TYPE.caption, color: C.faint, textAlign: "center", marginTop: -6 }}>You can change or cancel anytime. Paid plans are simulated in this build unless a real checkout appears.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 4 }}>
              {PLANS.map(p => {
                const on = plan === p.id;
                return (
                  <button key={p.id} onClick={() => setPlan(p.id)} style={{ textAlign: "left", cursor: "pointer", background: on ? "#161718" : "transparent", border: `2px solid ${on ? C.accent : C.panelEdge}`, borderRadius: R.lg, padding: 16, display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
                    {p.featured && <span style={{ position: "absolute", top: -10, right: 12, background: C.textStrong, color: C.bg, ...TYPE.eyebrowSm, fontWeight: 510, padding: "3px 8px", borderRadius: R.pill }}>POPULAR</span>}
                    <div style={{ ...TYPE.subhead, fontSize: 15, fontWeight: 510 }}>{p.label}</div>
                    {/* The price is the one number here, so it keeps the numeric face
                        and the cadence rides alongside it in prose. */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ ...TYPE.numLg, fontSize: 24, fontWeight: 510 }}>{p.price}</span>
                      <span style={{ ...TYPE.caption, color: C.faint }}>{p.cadence}</span>
                    </div>
                    <div style={{ ...TYPE.caption, color: C.muted }}>{p.tagline}</div>
                    <div style={{ height: 1, background: C.edge, margin: "2px 0" }} />
                    {p.perks.map((k, i) => <div key={i} style={{ ...TYPE.caption, color: C.text, display: "flex", gap: 7, lineHeight: 1.5 }}><span style={{ color: C.up, flex: "0 0 auto" }}>✓</span>{k}</div>)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button style={{ ...primaryBtn(), background: "transparent", color: C.text, border: `1px solid ${C.panelEdge}`, width: "auto", flex: "0 0 auto", padding: "12px 18px" }} onClick={() => setStep("signup")}>← Back</button>
              <button style={primaryBtn()} onClick={() => { setErr(""); setStep("legal"); }}>Continue</button>
            </div>
          </>)}

          {/* ---------- LEGAL AGREEMENT ---------- */}
          {step === "legal" && (<>
            <div style={{ ...TYPE.title, fontSize: 17 }}>Before you start</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["terms", "privacy"].map(t => (
                <button key={t} onClick={() => setLegalTab(t)} style={{ flex: 1, padding: "7px 0", background: legalTab === t ? C.panelEdge : "transparent", border: `1px solid ${C.panelEdge}`, borderRadius: 7, color: legalTab === t ? C.text : C.faint, fontFamily: SANS, fontSize: 11, fontWeight: 510, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>{t === "terms" ? "Terms" : "Privacy"}</button>
              ))}
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.md, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {(legalTab === "terms" ? LEGAL_TERMS : LEGAL_PRIVACY).map((line, i) => (
                <div key={i} style={{ ...TYPE.bodySm, fontSize: 13, color: C.muted, display: "flex", gap: 9 }}>
                  <span style={{ ...TYPE.numSm, color: C.faint, flex: "0 0 auto" }}>{i + 1}.</span>{line}
                </div>
              ))}
              <div style={{ ...TYPE.caption, fontSize: 11, color: C.faint, marginTop: 2 }}>Version {LEGAL_VERSION}</div>
            </div>
            {errBox}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", ...TYPE.bodySm, fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: C.accent, flex: "0 0 auto" }} />
              <span>I have read and agree to the Terms of Use and Privacy Policy, and I understand Vantage is not financial advice.</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...primaryBtn(), background: "transparent", color: C.text, border: `1px solid ${C.panelEdge}`, width: "auto", flex: "0 0 auto", padding: "12px 18px" }} onClick={() => setStep("plan")}>← Back</button>
              <button style={primaryBtn({ opacity: !agree || busy ? 0.6 : 1 })} disabled={!agree || busy} onClick={doSignup}>{busy ? "Creating…" : `Agree & create ${planLabel(plan)} account`}</button>
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}

// ---------- Point & Figure chart (SVG) ----------
// Pure presentational: columns/boxSize come from src/pnf/pnf.js. Renders the last
// 48 columns as an X/O box grid with price labels in a right gutter.
function PnFChart({ columns, boxSize, up, down }) {
  const CELL = 14, GUTTER = 56, MAXC = 48, MAXR = 28;
  const cols = columns.slice(-MAXC);
  // Price window clamped to the last MAXR boxes of recent action: a single
  // outlier column (bad tick, halt gap) would otherwise set the scale and
  // squeeze the real chart into sub-pixel noise. Clipped columns just render
  // the part that falls inside the window.
  const { top, bot } = visibleWindow(cols, MAXR);
  const rows = top - bot + 1;
  const w = cols.length * CELL + GUTTER, h = rows * CELL;
  const py = (bi) => (top - bi) * CELL;
  const labelEvery = Math.max(1, Math.ceil(rows / 8));
  const kids = [];
  for (let ci = 0; ci <= cols.length; ci++) {
    kids.push(<line key={`v${ci}`} x1={ci * CELL} y1={0} x2={ci * CELL} y2={h} stroke={C.grid} strokeWidth="0.5" />);
  }
  for (let bi = bot; bi <= top + 1; bi++) {
    const y = (top - bi + 1) * CELL;   // bottom edge of box bi sits at price bi*boxSize
    kids.push(<line key={`h${bi}`} x1={0} y1={y} x2={cols.length * CELL} y2={y} stroke={C.grid} strokeWidth="0.5" />);
    // bi === top + 1 sits at y=0 (the SVG's top edge) — a label there clips above the viewBox,
    // so skip it and keep just the gridline; every other rung has room to render its label.
    if (bi % labelEvery === 0 && bi !== top + 1) {
      kids.push(<text key={`t${bi}`} x={cols.length * CELL + 6} y={y + 3.5} fill={C.faint} fontSize="10" fontFamily={MONO}>{fmt(bi * boxSize)}</text>);
    }
  }
  cols.forEach((col, ci) => {
    const x = ci * CELL;
    for (let bi = Math.max(col.bottom, bot); bi <= Math.min(col.top, top); bi++) {
      const y = py(bi);
      if (col.type === "X") {
        kids.push(<line key={`x${ci}-${bi}a`} x1={x + 3.5} y1={y + 3.5} x2={x + CELL - 3.5} y2={y + CELL - 3.5} stroke={up} strokeWidth="1.6" />);
        kids.push(<line key={`x${ci}-${bi}b`} x1={x + CELL - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y + CELL - 3.5} stroke={up} strokeWidth="1.6" />);
      } else {
        kids.push(<circle key={`o${ci}-${bi}`} cx={x + CELL / 2} cy={y + CELL / 2} r={CELL / 2 - 3.5} fill="none" stroke={down} strokeWidth="1.6" />);
      }
    }
  });
  return (
    // 6px vertical margin on the viewBox: the outermost gridline labels centre on the
    // SVG's edges, so without it the bottom label's baseline (edge + 3.5) clips in half.
    <svg viewBox={`0 -6 ${w} ${h + 12}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      {kids}
    </svg>
  );
}

// ============================================================
function MarketDashboard({ account, onSignOut, onChangePlan } = {}) {
  const { lang, setLang, t } = useI18n();               // UI translation + AI-answer language
  const [billingCfg, setBillingCfg] = useState(null);    // Stripe availability (Layer 3), probed on demand
  const [billingBusy, setBillingBusy] = useState("");    // plan id mid-checkout, for button state
  const [agentPrefs, setAgentPrefs] = useState(null);     // server-stored opt-in scheduled briefing settings
  const [agentBusy, setAgentBusy] = useState(false);

  // ---- developer / testing mode: bypass ALL plan gates so every premium feature is testable now ----
  // Turn on via ?dev=1 in the URL (or ?local=…). Persisted per-browser. There is
  // deliberately no switch for it in settings: a control that unlocks every paid
  // feature is not a preference, and it read as one sitting in the ACCOUNT tab.
  // Clearly a testing aid — it only lifts the PLAN check; real keys are still required to actually work.
  const [devMode, setDevMode] = useState(() => {
    try { return localStorage.getItem("tape-dev-mode") === "1" || new URLSearchParams(window.location.search).has("dev"); } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("tape-dev-mode", devMode ? "1" : "0"); } catch { /* ignore */ } }, [devMode]);

  // ---- feature gating: a premium integration needs BOTH the right plan AND its own key ----
  // planAllows() is the PLAN half (each feature still checks its own key). Dev mode unlocks everything.
  const planRank = PLAN_RANK[account?.plan] ?? 0;
  const planAllows = useCallback((f) => devMode || (PLAN_RANK[account?.plan] ?? 0) >= (PLAN_RANK[FEATURE_PLAN[f]] ?? 99), [account?.plan, devMode]);
  const planFor = (f) => PLANS.find(p => p.id === FEATURE_PLAN[f])?.label || "a paid plan";
  // small "🔒 Pro Desk" chip shown next to a locked control; clicking jumps to the ACCOUNT tab to upgrade.
  // Returns null when the feature is unlocked (by plan or dev mode). Safe to render inline in any tab.
  const lockChip = (feature) => planAllows(feature) ? null : (
    <span onClick={() => setSettingsTab("account")} title={`Unlock with ${planFor(feature)} — click to upgrade`}
      style={{ fontFamily: MONO, textTransform: "none", fontSize: 12, fontWeight: 510, letterSpacing: "-0.013em", color: C.accentText, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.accent}`, borderRadius: R.xs, padding: "1px 6px", cursor: "pointer", whiteSpace: "nowrap" }}>
      🔒 {planFor(feature)}
    </span>
  );

  const [mode, setMode] = useState(() => { try { return window.localStorage.getItem("tape-mode") === "live" ? "live" : "demo"; } catch { return "demo"; } }); // 'demo' | 'live'
  // Every provider key lives on the server now (see server/index.js). The browser
  // holds none; these gates read GET /api/status to learn which desks are lit.
  const [meetStatus, setMeetStatus] = useState(null);   // null until the backend answers
  const quotesReady = !!meetStatus?.quotes?.configured;
  const canSearchVideos = !!meetStatus?.youtube?.configured;
  const canBrowseCatalog = !!meetStatus?.tmdb?.configured;
  const canUseStudioVoice = !!meetStatus?.eleven?.configured;
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("quick");
  const openPaletteRef = useRef(null); // AppShell parks its palette opener here so the command bar can host the trigger
  // ---- persisted prefs (Settings Bundle B): one object at localStorage["tape-prefs"], migrating the
  // legacy localStorage["tape-breaking"] flag on first load. See src/settings/preferences.js. ----
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    return loadPrefs(window.localStorage.getItem("tape-prefs"), window.localStorage.getItem("tape-breaking"));
  });
  const setPref = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));
  useEffect(() => {
    try { window.localStorage.setItem("tape-prefs", JSON.stringify(prefs)); } catch { /* storage full/blocked */ }
  }, [prefs]);

  // flat: C.muted (not C.faint) — matches the zero-case color the old numeric dirColor(n) used,
  // so prefDirColor/dirColorN reproduce the exact default palette in non-colorblind mode.
  const PALETTE = { up: C.up, down: C.down, flat: C.muted };
  // Named prefDirColor/prefDirGlyph (not dirColor/dirGlyph) — a module-scope `dirColor(n)` numeric
  // helper used to exist (formerly line ~942) and was used throughout this component; reusing the
  // name here would have shadowed it. It has since been removed in favor of dirColorN below.
  const prefDirColor = (dir) => directionColor(dir, prefs, PALETTE);
  const prefDirGlyph = (dir) => directionGlyph(dir, prefs);
  // Numeric wrapper so every former `dirColor(n)` call site can become color-blind aware with a
  // pure rename. In default mode this is byte-identical to the old numeric dirColor(n).
  const dirColorN = (n) => prefDirColor(n > 0 ? "up" : n < 0 ? "down" : "flat");
  // Privacy mode: blur (not remove) sensitive money figures so layout never shifts. Wrap portfolio
  // totals, per-position P&L/%, and $ amounts with priv(...) wherever they render.
  const privacyStyle = prefs.privacy ? { filter: "blur(8px)", userSelect: "none" } : null;
  const priv = (node) => <span style={privacyStyle} aria-label={prefs.privacy ? t("hidden") : undefined}>{node}</span>;
  const [watchlist, setWatchlist] = useState(UNIVERSE.slice(0, 8).map(u => u.sym));
  const [selected, setSelected] = useState("AMD");
  const [cmd, setCmd] = useState("");
  const [cmdMsg, setCmdMsg] = useState("");
  const [demoMkt, setDemoMkt] = useState(() => buildDemoMarket());
  const [liveQuotes, setLiveQuotes] = useState({});   // sym -> quote
  const [liveTape, setLiveTape] = useState({});       // sym -> [{t, price}]
  const [liveErr, setLiveErr] = useState("");
  const [liveBad, setLiveBad] = useState({});         // sym -> true when Finnhub doesn't recognize it
  const tickRef = useRef(null);
  // remember the DEMO/LIVE choice so the app reopens where you left it
  useEffect(() => { try { window.localStorage.setItem("tape-mode", mode); } catch { /* storage blocked */ } }, [mode]);

  // any symbol works in demo mode: unknown tickers get a deterministic synthetic session
  const ensureDemoSymbol = useCallback((sym) => {
    setDemoMkt(prev => {
      if (prev[sym]) return prev;
      let seed = 0;
      for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) | 0;
      const rnd = mulberry32(seed ^ 0x9E3779B9);
      const base = +(15 + rnd() * 485).toFixed(2);
      const vol = 0.01 + rnd() * 0.02;
      const { bars, open, prevClose } = genIntraday(sym, base, vol);
      const sofar = bars.slice(0, 251).map(b => b.price);
      return {
        ...prev,
        [sym]: {
          sym, name: `${sym} · synthesized`, base, vol, bars, open, prevClose,
          price: bars[250].price, high: Math.max(...sofar), low: Math.min(...sofar), cursor: 250,
        },
      };
    });
  }, []);

  // ---- AI desk ----
  // OpenRouter is the primary model (first in the cascade + enabled by default); Claude is off by default.
  const AI_MODELS_DEFAULT = [
    // local models lead — they run on your own hardware (incl. an AMD Radeon GPU via ROCm), no key
    { id: "ollama", label: "Ollama (local)", kind: "ollama", baseUrl: "http://localhost:11434", model: "llama3.1", enabled: false },
    { id: "lmstudio", label: "LM Studio (local)", kind: "openai", baseUrl: "http://localhost:1234/v1", model: "local-model", enabled: false },
    // Proton Lumo — privacy-first AI. No official hosted API yet, so this points at a local
    // OpenAI-compatible bridge (proton-cli / pyLumo); localhost baseUrl ⇒ treated as key-less like Ollama.
    { id: "proton", label: "Proton (Lumo, local)", kind: "openai", baseUrl: "http://localhost:8080/v1", model: "lumo", enabled: false },
    // cloud models — OpenRouter stays the default-enabled primary for accounts that use hosted AI
    { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", apiKey: "", needsKey: true, enabled: true },
    { id: "claude", label: "Claude", kind: "claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5", apiKey: "", needsKey: true, enabled: false },
    { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "", needsKey: true, enabled: false },
    { id: "gemini", label: "Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.6-flash", apiKey: "", needsKey: true, enabled: false },
  ];
  const [aiModels, setAiModels] = useState(() => {
    // restore saved per-model config (enabled, apiKey, model, baseUrl) so keys survive refreshes
    try {
      const saved = JSON.parse(window.localStorage.getItem("tape-ai-models") || "null");
      if (Array.isArray(saved)) return AI_MODELS_DEFAULT.map(m => {
        const s = saved.find(x => x.id === m.id);
        return s ? { ...m, enabled: s.enabled ?? m.enabled, apiKey: s.apiKey ?? m.apiKey, model: s.model || m.model, baseUrl: s.baseUrl || m.baseUrl } : m;
      });
    } catch { /* fall through to defaults */ }
    return AI_MODELS_DEFAULT;
  });
  useEffect(() => {
    try { window.localStorage.setItem("tape-ai-models", JSON.stringify(aiModels.map(m => ({ id: m.id, enabled: m.enabled, apiKey: m.apiKey || "", model: m.model, baseUrl: m.baseUrl })))); } catch { /* storage full/blocked */ }
  }, [aiModels]);
  // AMD / ROCm demo shortcut: "?local=1" runs the desk on the local Ollama model only and lifts plan gates,
  // so the whole agent runs on local (AMD Radeon) inference with no cloud keys — one URL, no manual setup.
  // "?local=vllm" does the same via a local vLLM server (the Radeon Cloud paved path; OpenAI-compatible,
  // default http://localhost:8000/v1). Optional overrides: &base=<url> &model=<id>; without &model the
  // served model id is auto-detected from GET /models.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (!q.has("local")) return;
      setDevMode(true);
      if ((q.get("local") || "1").toLowerCase() === "vllm") {
        const base = q.get("base") || "http://localhost:8000/v1";
        const forced = q.get("model");
        setAiModels(ms => ms.map(m => (m.id === "lmstudio"
          ? { ...m, enabled: true, baseUrl: base, label: "vLLM (local)", ...(forced ? { model: forced } : {}) }
          : { ...m, enabled: false })));
        if (!forced) fetch(`${base.replace(/\/$/, "")}/models`).then(r => r.json()).then(j => {
          const id = j?.data?.[0]?.id;
          if (id) setAiModels(ms => ms.map(m => (m.id === "lmstudio" ? { ...m, model: id } : m)));
        }).catch(() => { /* leave the card's model as-is */ });
      } else {
        setAiModels(ms => ms.map(m => ({ ...m, enabled: m.id === "ollama" })));
      }
    } catch { /* ignore */ }
  }, []);
  const [anthropicApiKey, setAnthropicApiKey] = useState(() =>
    (typeof window !== "undefined" && window.localStorage.getItem("tape-anthropic-key")) || "");
  useEffect(() => {
    if (anthropicApiKey) window.localStorage?.setItem?.("tape-anthropic-key", anthropicApiKey);
    else window.localStorage?.removeItem?.("tape-anthropic-key");
  }, [anthropicApiKey]);
  // when a cloud model (Claude) fails — no credits, bad key, offline — automatically retry on a local model

  // ---- local multi-turn memory: the desk remembers the conversation, on this device only ----
  // Stored as [{role:"user"|"assistant", content}] so follow-ups like "what about its risks?"
  // resolve against earlier turns. Never sent anywhere except to the model the user picked.
  const DESK_MEMORY_MAX = 12; // last 6 exchanges
  const CHAT_KEEP = 60;       // transcript turns kept across a reload (~30 exchanges)
  const deskMemoryRef = useRef(null);
  // deskMemoryRef is a ref, so mutating it does not re-render; this state mirrors its length
  // at each assignment site so the settings UI can display a live turn count.
  const [memoryTurns, setMemoryTurns] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tape-desk-memory") || "[]").length; } catch { return 0; }
  });
  // last streamed Ollama chunk with done===true — feeds the settings telemetry strip's tok/s
  const lastEvalRef = useRef(null);
  if (deskMemoryRef.current === null) {
    try { deskMemoryRef.current = JSON.parse(localStorage.getItem("tape-desk-memory") || "[]"); } catch { deskMemoryRef.current = []; }
  }
  const rememberTurn = useCallback((question, answer) => {
    const mem = [...deskMemoryRef.current, { role: "user", content: question }, { role: "assistant", content: answer }].slice(-DESK_MEMORY_MAX);
    deskMemoryRef.current = mem;
    setMemoryTurns(mem.length);
    try { localStorage.setItem("tape-desk-memory", JSON.stringify(mem)); } catch { /* quota */ }
  }, []);
  const forgetConversation = useCallback(() => {
    deskMemoryRef.current = [];
    setMemoryTurns(0);
    try { localStorage.removeItem("tape-desk-memory"); } catch { /* ok */ }
  }, []);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponses, setAiResponses] = useState({}); // id -> {status:'idle'|'running'|'done'|'error', text, ms}
  const [lastAsked, setLastAsked] = useState("");

  // ---- chat thread ----
  // The conversation transcript rendered by <ChatAssistant>. `aiResponses` remains
  // the engine — it holds the live, per-model streaming state — and this is the
  // human-readable history built from it. Keeping the two separate means the
  // existing ask/fallback machinery is untouched; we only mirror it into turns.
  // Restored from the last session. A conversation that evaporates on refresh is
  // not a conversation — and this dashboard reloads often (live-mode switches,
  // key changes). Only the last CHAT_KEEP turns survive: the thread is a
  // transcript, not an archive, and localStorage is a shared budget with the
  // watchlist, portfolio and calendar.
  const [chatThread, setChatThread] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("tape-chat") || "[]");
      if (!Array.isArray(saved)) return [];
      const seen = new Set();
      let rekey = 0;
      return saved.slice(-CHAT_KEEP).map(m => {
        let id = m.id || `x${++rekey}`;
        while (seen.has(id)) id = `x${++rekey}`;
        seen.add(id);
        return id === m.id ? m : { ...m, id };
      });
    } catch { return []; }
  });
  // Both counters are seeded from whatever was restored, NOT from zero.
  //
  // Bubble ids are `${prefix}${turn}` and syncChatBubble() patches a bubble by
  // id — that is how a streaming answer updates in place instead of appending a
  // bubble per token. Restarting the counters after a reload therefore does not
  // merely duplicate React keys: the first new answer finds the restored bubble
  // with the same id and overwrites it, so asking a question silently rewrites
  // an old one. Continuing the sequence past the restored high-water mark is
  // what makes "patch by id" safe across a reload.
  const seedSeq = (thread, prefixes) => thread.reduce((max, m) => {
    const hit = /^([a-z])(\d+)$/.exec(m.id || "");
    return hit && prefixes.includes(hit[1]) ? Math.max(max, +hit[2]) : max;
  }, 0);
  const chatTurnRef = useRef(0);   // monotonic id source for question/answer turns
  const deskSeqRef = useRef(0);    // separate id source for desk-authored receipts
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    chatTurnRef.current = seedSeq(chatThread, ["u", "a", "n"]);
    deskSeqRef.current = seedSeq(chatThread, ["d"]);
  }

  // `widget` holds React elements, which do not survive JSON — and a turn still
  // running would come back frozen mid-answer with a cursor that never resolves.
  // Strip both on the way out.
  useEffect(() => {
    try {
      const keep = chatThread
        .filter(m => m.status !== "running")
        .slice(-CHAT_KEEP)
        .map(({ widget, ...rest }) => rest);
      window.localStorage.setItem("tape-chat", JSON.stringify(keep));
    } catch { /* quota or private mode — the thread simply will not persist */ }
  }, [chatThread]);

  // Every desk-handled intent still has to answer in the thread. Without this the
  // app does the thing — opens the game room, builds the file, pulls up the
  // calendar — while the transcript shows a question nobody replied to, which
  // reads as the assistant ignoring you even though it obeyed. `kind: "action"`
  // renders it as a receipt, so a thing the app did is never mistaken for a
  // thing a model said.
  // A desk-handled intent that answers in prose rather than announcing an
  // action. deskReply's bubble is the "⚙ doing a thing" style; this one is an
  // answer, so it reads — and can be read on air — like any other answer.
  const pushDeskAnswer = useCallback((text) => {
    if (!text) return;
    setChatThread(t => [...t, { id: `a${chatTurnRef.current}`, role: "assistant", text }]);
  }, []);

  const deskReply = useCallback((text) => {
    if (!text) return;
    deskSeqRef.current += 1;
    setChatThread(t => [...t, { id: `d${deskSeqRef.current}`, role: "assistant", kind: "action", text }]);
  }, []);

  // Mirror a live response into the transcript. The bubble's id is derived from the
  // current turn number, so a streaming update patches the same bubble while the
  // next question creates a fresh one. Desk-handled intents (exports, games) never
  // write a response and therefore correctly produce no assistant bubble at all.
  const syncChatBubble = useCallback((prefix, r) => {
    if (!r) return;
    const id = `${prefix}${chatTurnRef.current}`;
    const meta = r.status === "running" ? undefined : [
      r.stopped && "stopped",
      r.via && `${r.via}${r.model ? ` · ${r.model}` : ""}`,
      r.ms != null && `${r.ms} ms`,
      r.tried?.length && `fell back from ${r.tried.join(" · ")}`,
    ].filter(Boolean).join("  ·  ") || undefined;

    setChatThread(t => {
      const msg = {
        id, role: "assistant",
        text: r.text || "",
        status: r.status,
        error: r.status === "error",
        sources: r.links?.length ? r.links.map(l => ({ title: l.label || l.title, url: l.url || l.href })) : undefined,
        meta,
      };
      const i = t.findIndex(m => m.id === id);
      if (i === -1) return [...t, msg];
      const next = t.slice(); next[i] = msg; return next;
    });
  }, []);

  useEffect(() => { syncChatBubble("a", aiResponses.desk); }, [aiResponses.desk, syncChatBubble]);
  useEffect(() => { syncChatBubble("n", aiResponses.nav); }, [aiResponses.nav, syncChatBubble]);

  const live = mode === "live" && quotesReady && planAllows("finnhub"); // plan-gated: live data needs Pro Desk

  // ---- demo ticking: advance the session ----
  useEffect(() => {
    if (live) return;
    tickRef.current = setInterval(() => {
      setDemoMkt(prev => {
        const next = { ...prev };
        for (const s of Object.keys(next)) {
          const st = next[s];
          if (st.cursor < st.bars.length - 1) {
            const cursor = st.cursor + 1;
            const price = st.bars[cursor].price;
            next[s] = {
              ...st, cursor, price,
              high: Math.max(st.high, price),
              low: Math.min(st.low, price),
            };
          } else {
            // wiggle at the close so the tape never dies
            const wig = +(st.price * (1 + (Math.random() - 0.5) * 0.0015)).toFixed(2);
            next[s] = { ...st, price: wig, high: Math.max(st.high, wig), low: Math.min(st.low, wig) };
          }
        }
        return next;
      });
    }, 1800);
    return () => clearInterval(tickRef.current);
  }, [live]);

  // ---- live polling ----
  const liveStaleRef = useRef(false); // true when the market's closed (last trade is old) → poll far less
  const pollLive = useCallback(async () => {
    if (!live) return false;
    const syms = [...new Set([selected, ...watchlist])];
    // ONE batched request per tick — the proxy fans out to Finnhub server-side
    // (/api/quote?symbols=, up to 25). Polling per symbol counted 8 rate-limit
    // hits for one refresh and drained the per-IP quota in minutes.
    let r;
    try { r = await fetch(`/api/quote?symbols=${syms.map(encodeURIComponent).join(",")}`); }
    catch (e) { setLiveErr(humanizeError(e)); return false; }
    if (r.status === 429) { setLiveErr("live feed is busy — easing off automatically."); return true; }
    if (!r.ok) { setLiveErr(r.status === 503 ? "live quotes are not configured on this server" : `HTTP ${r.status}`); return false; }
    let quotes = {};
    try { quotes = (await r.json())?.quotes || {}; } catch { return false; }
    const now = new Date();
    const stamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    let firstErr = "";
    for (const s of syms) {
      const q = quotes[s];
      if (!q) continue;
      if (q.error) {
        if (q.error === "unknown") {
          // Finnhub says it's not a real ticker → drop it from the watchlist and move off it if selected
          setLiveBad(p => (p[s] ? p : { ...p, [s]: true }));
          setWatchlist(w => w.filter(x => x !== s));
          setSelected(sel => (sel === s ? (watchlist.find(x => x !== s) || "SPY") : sel));
          if (!firstErr) firstErr = `${s}: unknown symbol`;
        } else if (!firstErr) firstErr = `${s}: quote failed (${q.error})`;
        continue;
      }
      setLiveQuotes(p => ({ ...p, [s]: q }));
      setLiveTape(p => {
        const arr = [...(p[s] || [])];
        arr.push({ t: stamp, i: arr.length, price: q.c });
        return { ...p, [s]: arr.slice(-500) };
      });
      setLiveBad(p => { if (!p[s]) return p; const n = { ...p }; delete n[s]; return n; });
    }
    setLiveErr(firstErr);
    return false;
  }, [live, watchlist, selected]);

  // Self-scheduling poll: exponential backoff on 429 (the shared demo key is easily rate-limited),
  // plus a much slower cadence when the market is closed — quotes aren't moving, so don't burn the quota.
  useEffect(() => {
    if (!live) return;
    let stopped = false, timer;
    let backoff = 1;
    const run = async () => {
      if (stopped) return;
      const hit429 = await pollLive();
      backoff = hit429 ? Math.min(backoff * 2, 8) : 1;
      const base = liveStaleRef.current ? 60000 : prefs.refreshMs;
      // Manual mode (refreshMs === 0): poll once on entry (handled by run() above) and never reschedule.
      if (prefs.refreshMs !== 0) timer = setTimeout(run, Math.min(base * backoff, 5 * 60 * 1000));
    };
    run();
    return () => { stopped = true; clearTimeout(timer); };
  }, [live, pollLive, prefs.refreshMs]);

  // ---- unified view of a symbol ----
  const getRow = useCallback((sym) => {
    if (live) {
      const q = liveQuotes[sym];
      if (!q) return { sym, price: null, chg: null, chgPct: null, open: null, high: null, low: null, prevClose: null };
      return { sym, price: q.c, chg: q.d, chgPct: q.dp, open: q.o, high: q.h, low: q.l, prevClose: q.pc };
    }
    const st = demoMkt[sym];
    if (!st) return null;
    const chg = st.price - st.prevClose;
    return {
      sym, name: st.name, price: st.price, chg, chgPct: (chg / st.prevClose) * 100,
      open: st.open, high: st.high, low: st.low, prevClose: st.prevClose,
    };
  }, [live, liveQuotes, demoMkt]);

  const selectedRow = getRow(selected);

  // a live feed goes flat when the market is closed: Finnhub keeps returning the last trade,
  // so the tape plots the same price forever. Detect it from the quote's trade timestamp.
  const liveStale = useMemo(() => {
    if (!live) return null;
    const q = liveQuotes[selected];
    if (!q?.t) return null;
    const asOf = q.t * 1000;
    return (Date.now() - asOf) > 5 * 60 * 1000 ? new Date(asOf) : null;
  }, [live, liveQuotes, selected]);
  useEffect(() => { liveStaleRef.current = !!liveStale; }, [liveStale]);

  // ---- panel visibility (persisted — a trimmed layout should survive a reload) ----
  const [panels, setPanels] = useState(() => {
    const defaults = { tape: true, watchlist: true, movers: true, news: true, calendar: true, portfolio: true, pnf: true };
    try {
      const saved = JSON.parse(window.localStorage.getItem("tape-panels") || "null");
      return saved && typeof saved === "object" ? { ...defaults, ...saved } : defaults;
    } catch { return defaults; }
  });
  const togglePanel = (k) => setPanels(p => ({ ...p, [k]: !p[k] }));
  useEffect(() => {
    try { window.localStorage.setItem("tape-panels", JSON.stringify(panels)); } catch { /* storage full/blocked */ }
  }, [panels]);

  // ---- tutorial + onboarding system (hub → spotlight tour / auto-demo / missions) ----
  // First launch only: once dismissed (skip, or picking a path), it stays gone. Replay
  // from Settings → DATA SOURCE, which resets the flag.
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return window.localStorage.getItem("tape-tutorial-seen") !== "1"; } catch { return true; }
  });
  const [tutStep, setTutStep] = useState(0);
  const [tourMode, setTourMode] = useState(null);   // null | "spotlight"
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState(null);   // {x,y,w,h} of the spotlighted element
  const [demoRunning, setDemoRunning] = useState(false);
  const demoAbortRef = useRef(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  // is at least one AI model usable right now? drives the tour/demo when nothing's set up yet
  // The desk is on if THIS server holds a model key, or if the user brought one
  // of their own. A server-held key is the normal path now — the browser never
  // sees it, so there is nothing to paste and nothing to leak.
  const serverAiReady = () => !!meetStatus?.ai?.configured;
  const aiReady = () => planAllows("ai") && (serverAiReady() || aiModels.some(m => m.enabled && ((m.kind === "ollama" || /localhost|127.0.0.1/.test(m.baseUrl || "")) || (m.kind === "claude" ? !!anthropicApiKey.trim() : !!(m.apiKey || "").trim()))));
  const [missionsDone, setMissionsDone] = useState(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem("tape-missions") || "[]")); } catch { return new Set(); }
  });
  const completeMission = useCallback((id) => {
    setMissionsDone(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      try { window.localStorage.setItem("tape-missions", JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const BROKERS = [
    { name: "Fidelity", url: (s) => `https://digital.fidelity.com/prgw/digital/research/quote?symbol=${s}` },
    { name: "Schwab · TD", url: (s) => `https://www.schwab.com/research/stocks/quotes/summary/${s}` },
    { name: "Robinhood", url: (s) => `https://robinhood.com/stocks/${s}` },
    { name: "Webull", url: (s) => `https://www.webull.com/quote/${s.toLowerCase()}` },
  ];

  // Streaming services — like the brokers, these block iframe embedding (X-Frame-Options),
  // so they launch in a new tab. Naming a title deep-links to that service's search.
  const STREAMERS = [
    { key: "netflix", name: "Netflix", color: "#E50914", tmdb: 8, rx: /netflix/, home: "https://www.netflix.com", search: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}` },
    { key: "disney", name: "Disney+", color: "#0063E5", tmdb: 337, rx: /disney\s*\+?|disney\s*plus/, home: "https://www.disneyplus.com", search: (q) => `https://www.disneyplus.com/search?q=${encodeURIComponent(q)}` },
    { key: "hulu", name: "Hulu", color: "#1CE783", tmdb: 15, rx: /hulu/, home: "https://www.hulu.com", search: (q) => `https://www.hulu.com/search?q=${encodeURIComponent(q)}` },
  ];

  // ---- voice: browser speechSynthesis or ElevenLabs ----
  const [voiceEngine, setVoiceEngine] = useState("browser"); // 'browser' | 'elevenlabs'
  // plan-gated: ElevenLabs needs Trading Floor. If the plan drops below it, fall back to free browser TTS.
  useEffect(() => { if (voiceEngine === "elevenlabs" && !planAllows("elevenlabs")) setVoiceEngine("browser"); }, [voiceEngine, planAllows]);
  const [elevenVoices, setElevenVoices] = useState([]);
  const [elevenVoiceId, setElevenVoiceId] = useState("");
  const [elevenErr, setElevenErr] = useState("");
  const [speakingId, setSpeakingId] = useState(null);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.06);
  const [musicVolume, setMusicVolume] = useState(0.8);
  const [soundVolume, setSoundVolume] = useState(0.65);
  const [characterId, setCharacterId] = useState("sterling");
  const [crewId, setCrewId] = useState("off"); // 'auto' | 'off' | character id
  const [envId, setEnvId] = useState("newsroom");
  const utterRef = useRef(null);
  const audioRef = useRef(null);      // ElevenLabs playback element
  const audioCtxRef = useRef(null);   // shared AudioContext
  const analyserRef = useRef(null);   // {node, buf} — read by DeskAnchor for real lip sync
  const speechMouthRef = useRef(null); // {t0, chars} — set on each browser-TTS word boundary, read by DeskAnchor for lip sync
  const streamRef = useRef({ id: null, spokenLen: 0, outstanding: 0, done: false }); // sentence-streamed narration
  // pulse the mouth on each spoken word (SpeechSynthesis fires 'boundary' as it reaches each word)
  const onWordBoundary = (ev) => {
    if (ev.name && ev.name !== "word") return;
    speechMouthRef.current = { t0: performance.now(), chars: ev.charLength || 5 };
  };

  // Prime browser TTS on the first user interaction anywhere on the page. Chrome silences
  // speechSynthesis fired from timers (breaking-news, price alerts) until it's spoken once
  // inside a user gesture — without this the anchor stays mute/mouth-still on auto-alerts.
  const ttsPrimedRef = useRef(false);
  useEffect(() => {
    const prime = () => {
      if (ttsPrimedRef.current || !window.speechSynthesis) return;
      ttsPrimedRef.current = true;
      try { window.speechSynthesis.resume(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
      window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime); window.addEventListener("keydown", prime);
    return () => { window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
  }, []);


  const loadElevenVoices = useCallback(async () => {   // eslint-disable-line -- effect below owns the trigger
    try {
      const r = await fetch("/api/voices");
      if (!r.ok) throw await serverError(r, "Studio voices");
      const data = await r.json();
      const vs = (data.voices || []).map(v => ({ id: v.voice_id, name: v.name }));
      setElevenVoices(vs);
      setElevenVoiceId(prev => prev || vs[0]?.id || "");
      setElevenErr("");
    } catch (e) {
      setElevenErr(humanizeError(e));
      setElevenVoices([]);
    }
  }, []);
  // The list is the server's (its key, its account), so fetch it when the studio
  // engine is selected and the server reports the desk lit — no paste-then-Apply.
  useEffect(() => {
    if (voiceEngine === "elevenlabs" && canUseStudioVoice && elevenVoices.length === 0) loadElevenVoices();
  }, [voiceEngine, canUseStudioVoice, elevenVoices.length, loadElevenVoices]);

  // key tester: distinguishes "bad key" from "this environment blocks external APIs"

  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis?.getVoices?.() || [];
      if (v.length) {
        setVoices(v);
        setVoiceName(prev => prev || (v.find(x => x.lang.startsWith("en") && x.localService) || v.find(x => x.lang.startsWith("en")) || v[0]).name);
      }
    };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  const stopSpeak = useCallback(() => {
    window.speechSynthesis?.cancel?.();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src && URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    if (analyserRef.current) analyserRef.current = null;
    streamRef.current = { id: null, spokenLen: 0, outstanding: 0, done: false };
    setSpeakingId(null);
  }, []);

  const speakEleven = useCallback(async (id, text) => {
    if (!canUseStudioVoice || !elevenVoiceId) { setCmdMsg(t("Pick a studio voice in settings")); return; }
    try {
      setSpeakingId(id);
      const r = await fetch(
        "/api/tts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId: elevenVoiceId }),
        }
      );
      if (!r.ok) throw await serverError(r, "ElevenLabs");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      // real lip sync: route playback through an analyser
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();
        const srcNode = ctx.createMediaElementSource(audio);
        const node = ctx.createAnalyser();
        node.fftSize = 512;
        srcNode.connect(node);
        node.connect(ctx.destination);
        analyserRef.current = { node, buf: new Uint8Array(node.fftSize) };
      } catch { /* analyser optional — audio still plays via element if routing fails */ }

      audio.playbackRate = speechRate;
      audio.onended = () => { URL.revokeObjectURL(url); analyserRef.current = null; setSpeakingId(cur => (cur === id ? null : cur)); };
      audio.onerror = () => { analyserRef.current = null; setSpeakingId(cur => (cur === id ? null : cur)); };
      await audio.play();
    } catch (e) {
      setElevenErr(humanizeError(e));
      setCmdMsg(`Voice error — ${humanizeError(e)}`);
      analyserRef.current = null;
      setSpeakingId(cur => (cur === id ? null : cur));
    }
  }, [elevenVoiceId, speechRate]);

  const speak = useCallback((id, text) => {
    if (!text?.trim()) return;
    stopSpeak();
    if (voiceEngine === "elevenlabs" && planAllows("elevenlabs")) { speakEleven(id, text); return; } // else fall through to free browser TTS
    if (!window.speechSynthesis) { setCmdMsg("This browser doesn't support speech synthesis"); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = TTS_LANG[lang] || "en-US"; // speak in the chosen language
    const v = (lang !== "en" ? voices.find(x => (x.lang || "").toLowerCase().startsWith(lang)) : null) || voices.find(x => x.name === voiceName);
    if (v) u.voice = v; // prefer a voice matching the language, else the chosen/default voice
    u.rate = speechRate; u.pitch = 1.0;
    u.onboundary = onWordBoundary;
    u.onend = () => { speechMouthRef.current = null; setSpeakingId(cur => (cur === id ? null : cur)); };
    u.onerror = (ev) => {
      speechMouthRef.current = null;
      if (ev.error !== "canceled" && ev.error !== "interrupted") setCmdMsg(`Speech error: ${ev.error || "unknown"} — try a different voice in settings`);
      setSpeakingId(cur => (cur === id ? null : cur));
    };
    utterRef.current = u;
    setSpeakingId(id);
    // Chrome quirks: cancel() immediately before speak() can silently swallow the
    // utterance, and the synth can be stuck paused — resume + a short defer fixes both
    window.speechSynthesis.resume();
    setTimeout(() => {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(u);
    }, 60);
  }, [voices, voiceName, speechRate, voiceEngine, speakEleven, stopSpeak]);

  // watchdog: if the anchor is flagged "talking" (browser TTS) but the synth isn't actually
  // speaking or queued, clear it — otherwise a blocked/interrupted utterance leaves the mouth
  // idle-flapping forever (e.g. after clicking around before audio is unlocked).
  useEffect(() => {
    if (speakingId == null || voiceEngine !== "browser") return;
    const iv = setInterval(() => {
      const ss = window.speechSynthesis;
      if (ss && !ss.speaking && !ss.pending) { speechMouthRef.current = null; setSpeakingId(null); }
    }, 800);
    return () => clearInterval(iv);
  }, [speakingId, voiceEngine]);

  // ---- streaming narration (browser TTS): speak each sentence the moment it's written,
  //      so the anchor talks WHILE the answer streams in instead of after it finishes ----
  const streamUtter = useCallback((text) => {
    if (!window.speechSynthesis) return;
    const st = streamRef.current;                 // capture: a newer stream replaces this object
    const u = new SpeechSynthesisUtterance(text);
    u.lang = TTS_LANG[lang] || "en-US"; // speak in the chosen language
    const v = (lang !== "en" ? voices.find(x => (x.lang || "").toLowerCase().startsWith(lang)) : null) || voices.find(x => x.name === voiceName);
    if (v) u.voice = v;
    u.rate = speechRate; u.pitch = 1.0;
    u.onboundary = onWordBoundary;
    st.outstanding += 1;
    const done = () => {
      if (streamRef.current !== st) return;        // stream was restarted/stopped — ignore
      st.outstanding = Math.max(0, st.outstanding - 1);
      if (st.done && st.outstanding === 0) { speechMouthRef.current = null; setSpeakingId(cur => (cur === st.id ? null : cur)); }
    };
    u.onend = done; u.onerror = done;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(u);               // queues behind earlier sentences — continuous speech
  }, [voices, voiceName, speechRate]);

  const beginStreamSpeak = useCallback((id) => {
    stopSpeak();                                    // clears prior speech + resets the stream object
    if (!window.speechSynthesis) return false;
    streamRef.current = { id, spokenLen: 0, outstanding: 0, done: false };
    setSpeakingId(id);
    return true;
  }, [stopSpeak]);

  const feedStreamSpeak = useCallback((full) => {
    const st = streamRef.current;
    if (!st.id) return;
    const pending = full.slice(st.spokenLen);
    const m = pending.match(/^[\s\S]*[.!?…](?=\s|$)/); // everything up to the last completed sentence
    if (!m) return;
    st.spokenLen += m[0].length;
    const chunk = m[0].trim();
    if (chunk) streamUtter(chunk);
  }, [streamUtter]);

  const endStreamSpeak = useCallback((full) => {
    const st = streamRef.current;
    if (!st.id) return;
    const tail = full.slice(st.spokenLen).trim();   // speak whatever sentence tail is left
    st.spokenLen = full.length;
    st.done = true;
    if (tail) streamUtter(tail);
    else if (st.outstanding === 0) setSpeakingId(cur => (cur === st.id ? null : cur));
  }, [streamUtter]);

  // ---- UI click sounds: short terminal blips through the shared AudioContext ----
  const [uiSounds, setUiSounds] = useState(true);
  const uiSoundsRef = useRef(true);
  const soundVolumeRef = useRef(0.65);
  uiSoundsRef.current = uiSounds;
  soundVolumeRef.current = soundVolume;
  const uiClick = useCallback((freq = 880, dur = 0.045, type = "square", gain = 0.08) => {
    if (!uiSoundsRef.current) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      const masterGain = Math.max(0.0001, Math.min(1, soundVolumeRef.current));
      const loudness = Math.min(0.22, gain * 1.3 * masterGain);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(loudness, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008 * masterGain, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* audio unavailable — stay silent */ }
  }, []);
  const chirp = useCallback((notes, gap = 45) => {
    notes.forEach((n, i) => setTimeout(() => uiClick(n[0], n[1] || 0.05, n[2] || "square"), i * gap));
  }, [uiClick]);
  // chess board cues — same kit (and same on/off toggle + volume) as the UI blips
  const chessSfx = useCallback((kind) => {
    if (kind === "move") uiClick(520, 0.06, "triangle", 0.09);
    else if (kind === "capture") chirp([[290, 0.07, "sawtooth"], [175, 0.1, "sawtooth"]], 60);
    else if (kind === "win") chirp([[523.3, 0.09, "triangle"], [659.3, 0.09, "triangle"], [784, 0.09, "triangle"], [1046.5, 0.22, "triangle"]], 70);
    else if (kind === "lose") chirp([[392, 0.1, "triangle"], [311.1, 0.1, "triangle"], [246.9, 0.1, "triangle"], [196, 0.24, "triangle"]], 90);
  }, [uiClick, chirp]);

  // ---- anchor cue sound effects: a real handbell, cutlery, a relaxed break chime ----
  // Uses the same shared AudioContext + master volume + on/off toggle as the UI blips.
  // a short "signature" sting for each anchor, played when you switch to them
  const playSignature = useCallback((id) => {
    if (!uiSoundsRef.current) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const master = Math.max(0.0001, Math.min(1, soundVolumeRef.current));
      const now = ctx.currentTime;
      const tone = (at, freq, peak, dur, wtype = "sine") => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = wtype; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(Math.min(0.28, peak * master), at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0006 * master, at + dur);
        o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + dur + 0.05);
      };
      const seq = (notes, gap, dur, peak, type) => notes.forEach((f, i) => tone(now + i * gap, f, peak, dur, type));
      switch (id) {
        case "marina": seq([523.3, 659.3, 784, 1046.5], 0.07, 0.5, 0.09, "sine"); break;       // mermaid: harp glissando
        case "aurora": seq([784, 987.8, 1174.7], 0.09, 0.6, 0.08, "triangle"); break;            // princess: delicate chime
        case "diana": tone(now, 196, 0.13, 0.5, "sawtooth"); tone(now + 0.12, 261.6, 0.13, 0.6, "sawtooth"); break; // amazon: bold horn
        case "mordo": seq([523.3, 587.3, 659.3, 784, 880, 1046.5], 0.05, 0.32, 0.06, "sine"); break; // wizard: sparkle
        case "nova": [880, 880, 660].forEach((f, i) => tone(now + i * 0.12, f, 0.08, 0.09, "square")); break; // astronaut: radio beeps
        case "sir-gaine": tone(now, 1200, 0.09, 0.7, "sine"); tone(now, 1212, 0.06, 0.7, "sine"); break; // knight: metallic ring
        case "pax": tone(now, 660, 0.06, 0.12, "sine"); tone(now + 0.12, 990, 0.07, 0.4, "sine"); break; // podcaster: mic chime
        case "tick3r": [440, 554, 659, 880].forEach((f, i) => tone(now + i * 0.06, f, 0.06, 0.05, "square")); break; // robot: digital
        case "sterling": seq([392, 587.3, 784], 0.08, 0.45, 0.09, "triangle"); break;                 // lead anchor: confident rising fanfare
        case "vega": seq([1046.5, 784, 1318.5], 0.08, 0.4, 0.08, "sine"); break;                       // co-anchor: bright sparkle
        case "kwan": [659.3, 880].forEach((f, i) => tone(now + i * 0.06, f, 0.06, 0.05, "square")); tone(now + 0.14, 1108.7, 0.08, 0.4, "sine"); break; // analyst: crisp then chime
        case "moss": tone(now, 196, 0.12, 0.5, "sawtooth"); tone(now + 0.14, 293.7, 0.1, 0.55, "triangle"); break; // veteran: warm low horn
        case "blaze": tone(now, 110, 0.13, 0.22, "sawtooth"); tone(now + 0.09, 164.8, 0.12, 0.26, "square"); tone(now + 0.19, 220, 0.11, 0.34, "sawtooth"); break;   // action: tense brass stabs
        case "zara": tone(now, 146.8, 0.12, 0.2, "sawtooth"); tone(now + 0.09, 220, 0.11, 0.24, "square"); tone(now + 0.19, 293.7, 0.1, 0.32, "sawtooth"); break;    // action: brighter stabs
        case "kit": seq([392, 523.3, 659.3, 784], 0.09, 0.5, 0.09, "triangle"); break;                          // adventure: heroic fanfare
        case "sienna": seq([523.3, 659.3, 784, 1046.5], 0.09, 0.48, 0.08, "triangle"); break;                    // adventure: fanfare up an octave
        case "vesper": tone(now, 220, 0.1, 0.6, "sine"); tone(now, 233.1, 0.07, 0.6, "sine"); tone(now + 0.2, 196, 0.09, 0.55, "sine"); break;   // horror: dissonant descent
        case "lilith": tone(now, 277.2, 0.09, 0.6, "sine"); tone(now, 293.7, 0.06, 0.6, "sine"); tone(now + 0.2, 246.9, 0.08, 0.55, "sine"); break; // horror: higher eerie beat
        case "colt": tone(now, 392, 0.11, 0.45, "triangle"); tone(now + 0.15, 587.3, 0.1, 0.5, "triangle"); break;  // western: lonesome fifth twang
        case "dakota": tone(now, 523.3, 0.1, 0.42, "triangle"); tone(now + 0.15, 784, 0.09, 0.48, "triangle"); break; // western: brighter twang
        case "marlowe": tone(now, 220, 0.09, 0.5, "sine"); tone(now + 0.12, 392, 0.08, 0.5, "sine"); tone(now + 0.24, 466.2, 0.1, 0.55, "sine"); break; // noir: smoky jazz phrase
        case "vivienne": tone(now, 277.2, 0.08, 0.5, "sine"); tone(now + 0.12, 466.2, 0.08, 0.5, "sine"); tone(now + 0.24, 554.4, 0.1, 0.55, "sine"); break; // noir: sultry phrase
        default: tone(now, 660, 0.08, 0.09, "triangle"); tone(now + 0.1, 880, 0.09, 0.4, "triangle"); break; // sting
      }
    } catch { /* audio unavailable */ }
  }, []);
  // urgent two-tone "breaking news" alert sting
  const playBreakingSfx = useCallback(() => {
    if (!uiSoundsRef.current) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const master = Math.max(0.0001, Math.min(1, soundVolumeRef.current));
      const now = ctx.currentTime;
      const beep = (at, freq, dur) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.14 * master, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005 * master, at + dur);
        o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + dur + 0.03);
      };
      beep(now, 880, 0.16); beep(now + 0.2, 880, 0.16); beep(now + 0.42, 1174.7, 0.34);
    } catch { /* audio unavailable */ }
  }, []);
  // play the signature when the anchor actually changes (not on first mount)
  const prevCharRef = useRef(characterId);
  useEffect(() => {
    if (prevCharRef.current === characterId) return;
    prevCharRef.current = characterId;
    playSignature(characterId);
  }, [characterId, playSignature]);

  // spotlight tour: measure the highlighted element each step (and on resize/scroll) + narrate it
  useEffect(() => {
    if (tourMode !== "spotlight") { setTourRect(null); return; }
    const step = TOUR_STEPS[tourStep];
    const measure = () => {
      const el = document.getElementById(step.target);
      if (el) { const r = el.getBoundingClientRect(); setTourRect({ x: r.left, y: r.top, w: r.width, h: r.height }); }
      else setTourRect(null);
    };
    measure();
    const el = document.getElementById(step.target);
    if (el) try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* older browsers */ }
    if (step.say) speak("tour", t(step.say));
    const remeasure = setTimeout(measure, 320); // re-measure after any scroll settles
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(remeasure); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [tourMode, tourStep, speak, t]);

  const playCueSfx = useCallback((type, meal) => {
    if (!uiSoundsRef.current) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const master = Math.max(0.0001, Math.min(1, soundVolumeRef.current));
      const now = ctx.currentTime;
      const tone = (at, freq, peak, dur, wtype = "sine") => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = wtype; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(Math.min(0.3, peak * master), at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0006 * master, at + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(at); o.stop(at + dur + 0.05);
      };
      if (type === "bell") {
        // bright brass handbell: inharmonic partials, struck 4× to match the shaking
        const partials = [[1, 1], [2.02, 0.55], [3.0, 0.34], [4.19, 0.2], [5.43, 0.12]];
        const strike = (at, f0, amp) => partials.forEach(([r, g]) => tone(at, f0 * r, amp * g, 1.1 / (1 + r * 0.22)));
        [0, 0.42, 0.84, 1.26].forEach((dt, i) => strike(now + 0.05 + dt, 664 + (i % 2) * 24, 0.17 - i * 0.02));
      } else if (type === "eat") {
        // understated cutlery clink on the bites — a touch brighter for a crunchy breakfast
        [0.25, 1.75, 3.1].forEach((dt) => tone(now + dt, meal === "breakfast" ? 2600 : 2100, 0.05, 0.06, "triangle"));
      } else if (type === "break") {
        // relaxed descending two-note chime — "time to breathe"
        tone(now + 0.02, 523.25, 0.1, 0.5); tone(now + 0.24, 392.0, 0.1, 0.7);
      } else if (type === "cheer") {
        // bright rising major arpeggio — "correct!"
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(now + i * 0.08, f, 0.09, 0.28, "triangle"));
      }
    } catch { /* audio unavailable — stay silent */ }
  }, []);

  // foley for the anchor's idle actions (sip, papers, write, stretch, adjust, react) — DeskAnchor calls onAction
  const playActionSfx = useCallback((type) => {
    if (!uiSoundsRef.current) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const master = Math.max(0.0001, Math.min(1, soundVolumeRef.current));
      const now = ctx.currentTime;
      if (!noiseBufRef.current) { const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseBufRef.current = b; }
      const tone = (at, freq, peak, dur, wtype = "sine", freqEnd) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = wtype; o.frequency.setValueAtTime(freq, at); if (freqEnd) o.frequency.linearRampToValueAtTime(freqEnd, at + dur);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(Math.min(0.2, peak * master), at + 0.01); g.gain.exponentialRampToValueAtTime(0.0005 * master, at + dur);
        o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + dur + 0.05);
      };
      const noiseHit = (at, filtType, freq, q, peak, dur) => { // paper crinkle / scratch
        const s = ctx.createBufferSource(); s.buffer = noiseBufRef.current;
        const f = ctx.createBiquadFilter(); f.type = filtType; f.frequency.value = freq; if (q) f.Q.value = q;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak * master, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0004 * master, at + dur);
        s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(at); s.stop(at + dur + 0.02);
      };
      switch (type) {
        case "sip": tone(now + 0.15, 360, 0.05, 0.12, "sine", 300); tone(now + 0.32, 320, 0.05, 0.16, "sine", 260); break; // gulp gulp
        case "papers": noiseHit(now, "highpass", 3200, 0.7, 0.05, 0.26); break;                                            // crinkle
        case "write": for (let i = 0; i < 6; i++) noiseHit(now + i * 0.09, "bandpass", 2400, 4, 0.035, 0.05); break;        // pencil scratch
        case "adjust": tone(now, 520, 0.03, 0.05, "triangle"); break;                                                       // tiny tap
        case "stretch": tone(now, 170, 0.06, 0.85, "sine", 150); tone(now + 0.05, 172, 0.03, 0.85, "sine", 260); break;     // yawn/groan
        case "react": tone(now, 480, 0.06, 0.05, "sine"); tone(now + 0.06, 760, 0.07, 0.12, "sine"); break;                 // surprised "hm?"
        default: break;
      }
    } catch { /* audio unavailable */ }
  }, []);
  const handleUiClick = useCallback((e) => {
    const el = e.target.closest?.("button, a, select, input[type=checkbox], input[type=range], input[type=number]");
    if (!el) return;
    const label = (el.textContent || "").trim().toUpperCase();
    const tag = el.tagName;
    if (label === "BUY") chirp([[880, 0.05], [1320, 0.09]]);                       // fill up
    else if (label === "SELL") chirp([[700, 0.05], [440, 0.1]]);                    // fill down
    else if (label === "ASK ALL" || label === "GO") chirp([[880], [1180]]);         // send
    else if (label.startsWith("✓") || label === "APPLY") chirp([[660], [880], [1100, 0.08]]); // confirm arpeggio
    else if (label === "✕" || label === "CLOSE" || label.includes("SKIP") || label.includes("STOP")) uiClick(420, 0.07, "sine");
    else if (label === "‹" || label === "›") uiClick(990, 0.035, "triangle");        // character flip
    else if (label.startsWith("▶")) chirp([[740, 0.04, "sine"], [990, 0.06, "sine"]]); // play
    else if (tag === "A") uiClick(820, 0.04, "triangle");                            // external link
    else if (tag === "SELECT" || el.type === "checkbox") uiClick(740, 0.04, "triangle");
    else if (el.type === "range") uiClick(660, 0.03, "sine", 0.03);
    else uiClick(880);                                                               // default tap
  }, [uiClick, chirp]);

  // ---- ambient newsroom music: generative WebAudio, no assets ----
  const [musicOn, setMusicOn] = useState(false);
  // ambient music source: the built-in synth, or a Spotify playlist embed
  const [musicSource, setMusicSource] = useState(() =>
    (typeof window !== "undefined" && window.localStorage.getItem("tape-music-source")) || "synth"); // 'synth' | 'spotify'
  const [spotifyUri, setSpotifyUri] = useState("https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn"); // Lofi Beats — the no-backend fallback
  useEffect(() => { window.localStorage?.setItem?.("tape-music-source", musicSource); }, [musicSource]);
  // Adopt the server's playlist as soon as /api/status answers.
  const servedPlaylist = meetStatus?.music?.playlist;
  useEffect(() => { if (servedPlaylist) setSpotifyUri(servedPlaylist); }, [servedPlaylist]);

  // ---- Spotify OAuth (PKCE) + Web Playback SDK: real full-track playback for Premium accounts ----
  const [spotifyClientId, setSpotifyClientId] = useState(() =>
    (typeof window !== "undefined" && window.localStorage.getItem("tape-spotify-client-id")) || "");
  const [spotifyAuth, setSpotifyAuth] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem("tape-spotify-auth") || "null"); } catch { return null; }
  }); // { access_token, refresh_token, expires_at }
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [spotifyErr, setSpotifyErr] = useState("");
  const spotifyDeviceRef = useRef(null);
  const spotifyPlayerRef = useRef(null);
  const spotifyRedirect = () => window.location.origin + window.location.pathname;

  useEffect(() => { window.localStorage?.setItem?.("tape-spotify-client-id", spotifyClientId); }, [spotifyClientId]);
  useEffect(() => {
    if (spotifyAuth) window.localStorage?.setItem?.("tape-spotify-auth", JSON.stringify(spotifyAuth));
    else window.localStorage?.removeItem?.("tape-spotify-auth");
  }, [spotifyAuth]);

  const connectSpotify = useCallback(async () => {
    if (!planAllows("spotify")) { setSpotifyErr(`Spotify is a ${planFor("spotify")} feature — upgrade in settings → ACCOUNT.`); return; }
    const cid = spotifyClientId.trim();
    if (!cid) { setSpotifyErr("Add your Spotify Client ID first"); return; }
    try {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
      const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      window.localStorage.setItem("tape-spotify-verifier", verifier);
      const scope = "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state";
      window.location.href = `https://accounts.spotify.com/authorize?client_id=${encodeURIComponent(cid)}` +
        `&response_type=code&redirect_uri=${encodeURIComponent(spotifyRedirect())}` +
        `&code_challenge_method=S256&code_challenge=${challenge}&scope=${encodeURIComponent(scope)}`;
    } catch (e) { setSpotifyErr(humanizeError(e)); }
  }, [spotifyClientId, planAllows]);

  const disconnectSpotify = useCallback(() => {
    try { spotifyPlayerRef.current?.disconnect?.(); } catch { /* fine */ }
    spotifyPlayerRef.current = null; spotifyDeviceRef.current = null;
    setSpotifyReady(false); setSpotifyAuth(null); setSpotifyErr("");
  }, []);

  const refreshSpotify = useCallback(async () => {
    const cid = spotifyClientId.trim();
    if (!spotifyAuth?.refresh_token || !cid) return null;
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: spotifyAuth.refresh_token, client_id: cid });
    const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const d = await r.json();
    if (!d.access_token) return null;
    const next = { access_token: d.access_token, refresh_token: d.refresh_token || spotifyAuth.refresh_token, expires_at: Date.now() + d.expires_in * 1000 };
    setSpotifyAuth(next);
    return next.access_token;
  }, [spotifyAuth, spotifyClientId]);

  // exchange the ?code= from the OAuth redirect for tokens, then strip it from the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const verifier = window.localStorage.getItem("tape-spotify-verifier");
    if (params.get("error")) { setSpotifyErr(`Spotify auth: ${params.get("error")}`); window.history.replaceState({}, "", spotifyRedirect()); return; }
    if (!code || !verifier) return;
    const cid = (window.localStorage.getItem("tape-spotify-client-id") || "").trim();
    (async () => {
      try {
        const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: spotifyRedirect(), client_id: cid, code_verifier: verifier });
        const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const d = await r.json();
        if (d.access_token) setSpotifyAuth({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + d.expires_in * 1000 });
        else setSpotifyErr(d.error_description || "Token exchange failed");
      } catch (e) { setSpotifyErr(humanizeError(e)); }
      finally { window.localStorage.removeItem("tape-spotify-verifier"); window.history.replaceState({}, "", spotifyRedirect()); }
    })();
  }, []);

  // load the Web Playback SDK and create the player once we're authed and in Spotify mode
  useEffect(() => {
    if (!spotifyAuth?.access_token || musicSource !== "spotify") return;
    let cancelled = false;
    const setup = () => {
      if (cancelled || !window.Spotify || spotifyPlayerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Vantage Desk",
        volume: Math.max(0, Math.min(1, musicVolume)),
        getOAuthToken: async (cb) => {
          let tok = spotifyAuth.access_token;
          if (Date.now() > spotifyAuth.expires_at - 10000) { const t = await refreshSpotify(); if (t) tok = t; }
          cb(tok);
        },
      });
      player.addListener("ready", ({ device_id }) => { spotifyDeviceRef.current = device_id; setSpotifyReady(true); setSpotifyErr(""); });
      player.addListener("not_ready", () => setSpotifyReady(false));
      player.addListener("initialization_error", ({ message }) => setSpotifyErr(message));
      player.addListener("authentication_error", ({ message }) => setSpotifyErr(`Auth error: ${message}`));
      player.addListener("account_error", () => setSpotifyErr("Spotify Premium is required for in-app playback — falling back to preview player."));
      player.connect();
      spotifyPlayerRef.current = player;
    };
    if (window.Spotify) setup();
    else {
      window.onSpotifyWebPlaybackSDKReady = setup;
      if (!document.getElementById("spotify-sdk")) {
        const s = document.createElement("script");
        s.id = "spotify-sdk"; s.src = "https://sdk.scdn.co/spotify-player.js"; s.async = true;
        document.body.appendChild(s);
      }
    }
    return () => { cancelled = true; try { spotifyPlayerRef.current?.disconnect?.(); } catch { /* fine */ } spotifyPlayerRef.current = null; setSpotifyReady(false); };
  }, [spotifyAuth, musicSource, refreshSpotify, musicVolume]);

  // start / stop playback of the chosen context when the ♪ toggle changes
  useEffect(() => {
    if (musicSource !== "spotify") return;
    if (!musicOn) { spotifyPlayerRef.current?.pause?.().catch(() => {}); return; }
    if (!spotifyReady || !spotifyDeviceRef.current) return;
    (async () => {
      const ctx = spotifyContextUri(spotifyUri);
      let tok = spotifyAuth?.access_token;
      if (Date.now() > (spotifyAuth?.expires_at || 0) - 10000) { const t = await refreshSpotify(); if (t) tok = t; }
      try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceRef.current}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify(ctx ? (ctx.type === "track" ? { uris: [ctx.uri] } : { context_uri: ctx.uri }) : {}),
        });
      } catch (e) { setSpotifyErr(humanizeError(e)); }
    })();
  }, [musicOn, spotifyReady, musicSource, spotifyUri]);

  // real volume + ducking under the anchor's voice (only the SDK player supports this)
  useEffect(() => {
    if (musicSource !== "spotify" || !spotifyPlayerRef.current) return;
    const vol = speakingId ? musicVolume * 0.25 : musicVolume;
    spotifyPlayerRef.current.setVolume(Math.max(0, Math.min(1, vol))).catch(() => {});
  }, [musicVolume, speakingId, musicSource, spotifyReady]);
  const stopMusic = useCallback(() => {
    const m = musicRef.current;
    if (!m) return;
    clearInterval(m.timer);
    try {
      const ctx = m.ctx || audioCtxRef.current;
      if (ctx) {
        m.master.gain.cancelScheduledValues(ctx.currentTime);
        m.master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      }
      setTimeout(() => {
        try { m.master.disconnect(); } catch {}
      }, 400);
    } catch { /* already gone */ }
    musicRef.current = null;
  }, []);
  const ensureAudio = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextImpl();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  }, []);

  // ---- procedural environment ambience: a per-set soundscape (waves, jungle, space hum…), no audio files ----
  const [ambienceOn, setAmbienceOn] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-ambience") === "on"));
  useEffect(() => { window.localStorage?.setItem?.("tape-ambience", ambienceOn ? "on" : "off"); }, [ambienceOn]);
  const ambienceRef = useRef(null);
  const noiseBufRef = useRef(null);
  const stopAmbience = useCallback(() => {
    const a = ambienceRef.current; ambienceRef.current = null;
    if (a) try { a.stop(); } catch { /* already gone */ }
  }, []);
  const startAmbience = useCallback(async (env) => {
    const ctx = await ensureAudio(); if (!ctx) return;
    stopAmbience();
    if (!noiseBufRef.current) { // 2s of white noise, reused for every layer
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBufRef.current = buf;
    }
    const master = ctx.createGain();
    const baseGain = Math.max(0.0001, Math.min(1, soundVolumeRef.current)) * 0.5;
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(baseGain, ctx.currentTime + 1.1);
    master.connect(ctx.destination);
    const cleanup = [];
    const noise = (type, freq, q, gain) => { // a filtered-noise bed
      const s = ctx.createBufferSource(); s.buffer = noiseBufRef.current; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(master); s.start();
      cleanup.push(() => { try { s.stop(); } catch {} });
      return { f, g, s };
    };
    const drone = (freq, gain, type = "sine") => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = gain;
      o.connect(g); g.connect(master); o.start();
      cleanup.push(() => { try { o.stop(); } catch {} });
      return { o, g };
    };
    const lfo = (target, param, rate, depth, center) => { // slow modulation
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = rate; g.gain.value = depth; target[param].value = center;
      o.connect(g); g.connect(target[param]); o.start();
      cleanup.push(() => { try { o.stop(); } catch {} });
    };
    const blip = (freqA, freqB, dur, gain, type = "sine") => { // one-shot accent
      const o = ctx.createOscillator(), g = ctx.createGain(), now = ctx.currentTime;
      o.type = type; o.frequency.setValueAtTime(freqA, now); o.frequency.exponentialRampToValueAtTime(freqB, now + dur);
      g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(gain, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(master); o.start(); o.stop(now + dur + 0.05);
    };
    let timer = null;
    const every = (ms, fn) => { timer = setInterval(() => { try { fn(); } catch {} }, ms); cleanup.push(() => clearInterval(timer)); };

    // ---- per-environment soundscape ----
    if (env === "reef") {
      const bed = noise("lowpass", 500, 0.7, 0.5); lfo(bed.f, "frequency", 0.08, 200, 480); // watery rumble
      every(1400, () => { if (Math.random() < 0.7) blip(500 + Math.random() * 400, 220, 0.35, 0.12); }); // bubbles
    } else if (env === "jungle") {
      noise("bandpass", 2600, 1.2, 0.16); noise("lowpass", 300, 0.6, 0.25); // insects + warm floor
      every(900, () => { if (Math.random() < 0.5) { const f = 2200 + Math.random() * 1600; blip(f, f * 1.1, 0.09, 0.06, "triangle"); setTimeout(() => blip(f * 1.2, f, 0.08, 0.05, "triangle"), 120); } }); // bird chirps
    } else if (env === "space") {
      drone(55, 0.18); drone(82.4, 0.1); const sw = noise("lowpass", 300, 0.5, 0.3); lfo(sw.g, "gain", 0.05, 0.18, 0.22); // deep hum + swell
    } else if (env === "server") {
      noise("lowpass", 180, 0.7, 0.5); noise("bandpass", 4200, 2, 0.05); drone(120, 0.05); // fan hum + hiss
    } else if (env === "floor") {
      const m = noise("bandpass", 750, 0.8, 0.34); lfo(m.g, "gain", 0.3, 0.1, 0.3); // trading-floor murmur
      every(2600, () => blip(300, 260, 0.2, 0.05, "sine"));
    } else if (env === "skyline" || env === "castle") {
      const wind = noise("lowpass", 600, 0.6, 0.4); lfo(wind.f, "frequency", 0.06, 300, 550); lfo(wind.g, "gain", 0.12, 0.12, 0.34); // wind
      if (env === "skyline") { drone(70, 0.045); const city = noise("bandpass", 900, 0.6, 0.05); lfo(city.g, "gain", 0.2, 0.02, 0.05); every(7000, () => { if (Math.random() < 0.4) blip(680, 520, 0.6, 0.03, "sawtooth"); }); } // faint city rumble + distant traffic
      if (env === "castle") every(4200, () => { if (Math.random() < 0.55) { blip(220, 180, 0.5, 0.05, "sine"); setTimeout(() => blip(147, 130, 0.9, 0.04, "sine"), 300); } }); // low stone-hall bell/toll
    } else if (env === "tower") {
      drone(330, 0.05); drone(495, 0.035); const sh = noise("bandpass", 3000, 1.5, 0.06); lfo(sh.g, "gain", 0.2, 0.05, 0.06); // magical shimmer
      every(3200, () => blip(1200 + Math.random() * 800, 2400, 0.25, 0.05, "sine"));
    } else if (env === "palace") {
      drone(261.6, 0.05); drone(392, 0.035); noise("lowpass", 400, 0.6, 0.12); // warm chord + room tone
    } else if (env === "newsroom") {
      const m = noise("bandpass", 620, 0.7, 0.20); lfo(m.g, "gain", 0.25, 0.08, 0.20); // low newsroom chatter
      noise("lowpass", 300, 0.6, 0.14); // room floor
      every(3400, () => { if (Math.random() < 0.6) blip(1300 + Math.random() * 500, 1150, 0.05, 0.03, "square"); }); // distant keyboard/phone ticks
    } else if (env === "podcast") {
      const air = noise("highpass", 5200, 0.7, 0.05); lfo(air.g, "gain", 0.15, 0.02, 0.05); // mic "air" hiss
      drone(110, 0.04); noise("lowpass", 300, 0.6, 0.12); // warm booth tone
      every(6000, () => { if (Math.random() < 0.4) blip(660, 990, 0.12, 0.03, "sine"); }); // soft desk blip
    } else if (env === "action") {
      drone(48, 0.14); const rmb = noise("bandpass", 90, 1.2, 0.18); lfo(rmb.g, "gain", 6, 0.08, 0.2); // helicopter rotor thrum
      every(4200, () => { if (Math.random() < 0.7) blip(70, 40, 0.6, 0.16, "sine"); }); // distant explosion booms
    } else if (env === "temple") {
      drone(90, 0.06); const wind = noise("lowpass", 500, 0.6, 0.28); lfo(wind.f, "frequency", 0.05, 120, 400); // low wind
      every(3000, () => { if (Math.random() < 0.5) blip(1400, 900, 0.18, 0.04, "sine"); }); // water drips
    } else if (env === "horror") {
      drone(58, 0.12); drone(61.5, 0.08); // dissonant low pad (the close pair "beats" — unsettling)
      const wind = noise("lowpass", 400, 0.6, 0.3); lfo(wind.f, "frequency", 0.04, 130, 330); lfo(wind.g, "gain", 0.1, 0.1, 0.24);
      every(4200, () => { const r = Math.random();
        if (r < 0.4) blip(300, 90, 1.6, 0.06, "sine"); // distant howl
        else if (r < 0.62) blip(150, 210, 0.5, 0.045, "sawtooth"); }); // door creak
    } else if (env === "western") {
      const wind = noise("lowpass", 550, 0.6, 0.32); lfo(wind.f, "frequency", 0.05, 120, 400); lfo(wind.g, "gain", 0.1, 0.1, 0.24); // desert wind
      every(3600, () => { const r = Math.random();
        if (r < 0.5) { blip(196, 196, 0.5, 0.05, "triangle"); setTimeout(() => blip(147, 147, 0.8, 0.045, "triangle"), 240); } // lonesome guitar (G→D)
        else if (r < 0.8) { blip(520, 300, 0.6, 0.045, "sine"); setTimeout(() => blip(300, 210, 0.9, 0.04, "sine"), 300); } }); // coyote howl
    } else if (env === "noir") {
      const rain = noise("highpass", 3200, 0.7, 0.14); lfo(rain.g, "gain", 0.3, 0.04, 0.14); noise("lowpass", 300, 0.6, 0.12); // rain + room floor
      drone(146.8, 0.03); drone(220, 0.02); // muted sax-ish drone
      every(5000, () => { if (Math.random() < 0.4) blip(330, 262, 0.5, 0.04, "sine"); }); // soft jazz note
    } else if (env === "cyber") {
      drone(60, 0.08); drone(90, 0.05); const hum = noise("bandpass", 2000, 2, 0.05); lfo(hum.g, "gain", 0.4, 0.03, 0.05); // electronic hum
      every(1500, () => { if (Math.random() < 0.6) { const f = 400 + Math.floor(Math.random() * 6) * 150; blip(f, f * 1.5, 0.06, 0.04, "square"); } }); // data blips
    } else { // studio — soft room tone
      const rt = noise("lowpass", 350, 0.5, 0.18); lfo(rt.g, "gain", 0.1, 0.05, 0.16);
    }

    const stop = () => {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      } catch {}
      setTimeout(() => { cleanup.forEach(fn => { try { fn(); } catch {} }); try { master.disconnect(); } catch {} }, 460);
    };
    ambienceRef.current = { stop, master, ctx, baseGain };
  }, [ensureAudio, stopAmbience]);
  // start/stop/rebuild the soundscape when toggled or when the environment changes
  useEffect(() => {
    if (ambienceOn) startAmbience(envId); else stopAmbience();
    return () => stopAmbience();
  }, [ambienceOn, envId, startAmbience, stopAmbience]);
  // duck the ambience while the anchor is speaking, then bring it back (like the music)
  useEffect(() => {
    const a = ambienceRef.current; if (!a?.master || !a.ctx) return;
    const target = Math.max(0.0001, a.baseGain * (speakingId != null ? 0.28 : 1));
    try {
      a.master.gain.cancelScheduledValues(a.ctx.currentTime);
      a.master.gain.linearRampToValueAtTime(target, a.ctx.currentTime + 0.3);
    } catch { /* node gone */ }
  }, [speakingId]);
  const toggleMusic = useCallback(async (next) => {
    try {
      await ensureAudio();
    } catch { /* no audio here */ }
    setMusicOn(next);
  }, [ensureAudio]);
  const musicRef = useRef(null); // {timer, master, filter, ctx}
  useEffect(() => {
    let cancelled = false;
    const startMusic = async () => {
      if (!musicOn || musicSource !== "synth") { // Spotify mode plays through the embed, not the synth
        stopMusic();
        return;
      }
      try {
        const ctx = await ensureAudio();
        if (!ctx || cancelled) return;
        stopMusic();

        const masterVolume = Math.max(0, Math.min(1, musicVolume));
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
        master.gain.linearRampToValueAtTime(MUSIC_LEVEL * masterVolume, ctx.currentTime + 0.9);
        const filter = ctx.createBiquadFilter();
        // open, bright tone (was a dull 1050Hz that buried everything) so the music actually cuts through
        filter.type = "lowpass"; filter.frequency.value = 3200; filter.Q.value = 0.6;
        filter.connect(master);
        master.connect(ctx.destination);

        // bright, anthemic I–V–vi–IV in C major — the classic "uplifting" pop progression
        const PROG = [
          { root: 130.8, notes: [261.6, 329.6, 392.0] }, // C   (C E G)
          { root: 196.0, notes: [293.7, 392.0, 493.9] }, // G   (D G B)
          { root: 220.0, notes: [329.6, 440.0, 523.3] }, // Am  (E A C)
          { root: 174.6, notes: [349.2, 440.0, 523.3] }, // F   (F A C)
        ];
        const PENTA = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5]; // high C-major pentatonic sparkle
        let step = 0;
        const bar = () => {
          const t0 = ctx.currentTime;
          const chord = PROG[step % PROG.length];

          // warm bass root — gives the mix body so it reads as fuller and louder
          {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = "sine"; o.frequency.value = chord.root;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.16, t0 + 0.4);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.8);
            o.connect(g); g.connect(filter); o.start(t0); o.stop(t0 + 4);
          }

          // sustained pad chord
          for (const f of chord.notes) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = "triangle";
            o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.12, t0 + 0.7);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
            o.connect(g); g.connect(filter); o.start(t0); o.stop(t0 + 3.8);
          }

          // ascending arpeggio an octave up — forward motion is what makes it feel uplifting
          chord.notes.forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = "sine"; o.frequency.value = f * 2;
            const at = t0 + 0.15 + i * 0.5;
            g.gain.setValueAtTime(0.0001, at);
            g.gain.linearRampToValueAtTime(0.08, at + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0004, at + 0.7);
            o.connect(g); g.connect(filter); o.start(at); o.stop(at + 0.75);
          });

          // frequent high sparkle on top
          if (Math.random() < 0.85) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = "sine";
            o.frequency.value = PENTA[Math.floor(Math.random() * PENTA.length)];
            const pt = t0 + 0.7 + Math.random() * 2.2;
            g.gain.setValueAtTime(0.0001, pt);
            g.gain.linearRampToValueAtTime(0.1, pt + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0004, pt + 1.0);
            o.connect(g); g.connect(filter); o.start(pt); o.stop(pt + 1.05);
          }

          step += 1;
        };
        bar();
        const timer = window.setInterval(bar, 4000);
        musicRef.current = { timer, master, filter, ctx };
      } catch {
        setMusicOn(false);
      }
    };
    startMusic();
    return () => {
      cancelled = true;
      stopMusic();
    };
  }, [musicOn, musicSource, ensureAudio, stopMusic]);

  // duck music under speech, restore after
  useEffect(() => {
    const m = musicRef.current, ctx = audioCtxRef.current;
    if (!m || !ctx) return;
    try {
      const vol = Math.max(0, Math.min(1, musicVolume));
      const target = speakingId ? 0.04 * vol : MUSIC_LEVEL * vol;
      m.master.gain.cancelScheduledValues(ctx.currentTime);
      m.master.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.35);
    } catch { /* fine */ }
  }, [speakingId]);

  // ---- chart mode: classic line tape vs Point & Figure ----
  const [chartMode, setChartMode] = useState(() => {
    try { return window.localStorage.getItem("tape-chartmode") === "pnf" ? "pnf" : "line"; } catch { return "line"; }
  });
  useEffect(() => { try { window.localStorage.setItem("tape-chartmode", chartMode); } catch { /* private */ } }, [chartMode]);

  // Overlay toggles for the line chart. Off by default — overlays are an
  // analyst's tool, and the first impression of the chart should be the tape.
  const [chartSMA, setChartSMA] = useState(() => {
    try { return window.localStorage.getItem("tape-chart-sma") === "1"; } catch { return false; }
  });
  useEffect(() => { try { window.localStorage.setItem("tape-chart-sma", chartSMA ? "1" : "0"); } catch { /* private */ } }, [chartSMA]);
  // watchlist rendering: rows with sparklines, or a heat grid
  const [wlView, setWlView] = useState(() => {
    try { return window.localStorage.getItem("tape-wl-view") === "heat" ? "heat" : "list"; } catch { return "list"; }
  });
  useEffect(() => { try { window.localStorage.setItem("tape-wl-view", wlView); } catch { /* private */ } }, [wlView]);
  const [chartHL, setChartHL] = useState(() => {
    try { return window.localStorage.getItem("tape-chart-hl") === "1"; } catch { return false; }
  });
  useEffect(() => { try { window.localStorage.setItem("tape-chart-hl", chartHL ? "1" : "0"); } catch { /* private */ } }, [chartHL]);

  const chartData = useMemo(() => {
    if (live) return liveTape[selected] || [];
    const st = demoMkt[selected];
    return st ? st.bars.slice(0, st.cursor + 1) : [];
  }, [live, liveTape, demoMkt, selected]);

  // Live tapes only see the minutes since page load, so they get the finer
  // intraday box grid; demo keeps the daily 0.1% scale its 390 seeded bars are tuned for.
  const pnf = useMemo(() => (chartMode === "pnf" ? buildPnF(chartData.map(d => d.price), live ? { boxPct: INTRADAY_BOX_PCT } : {}) : null), [chartMode, chartData, live]);
  const pnfPattern = useMemo(() => (pnf ? detectPattern(pnf.columns) : null), [pnf]);
  // Warming-up detail for the P&F empty state: where the tape sits on the box
  // grid and exactly what price prints enough columns to draw the chart.
  const pnfWarmup = useMemo(() => {
    if (chartMode !== "pnf" || (pnf && pnf.columns.length >= 2)) return null;
    const prices = chartData.map(d => d.price).filter(v => Number.isFinite(v) && v > 0);
    if (!prices.length) return null;
    const targets = pnfTargets(prices, live ? { boxPct: INTRADAY_BOX_PCT } : {});
    if (!targets) return null;
    return { ...targets, last: prices[prices.length - 1], lo: Math.min(...prices), hi: Math.max(...prices) };
  }, [chartMode, chartData, pnf, live]);

  // Tight y-axis around the actual data (+ prev close). Recharts "auto" balloons to a huge range when
  // every point is identical — e.g. a market-closed frozen price — making a real value look broken.
  const yDomain = useMemo(() => {
    const ys = chartData.map(d => d.price).filter(v => v != null);
    const pc = selectedRow?.prevClose;
    if (pc != null) ys.push(pc);
    if (!ys.length) return ["auto", "auto"];
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 1e-6) { const p = Math.max(0.02, Math.abs(lo) * 0.004); lo -= p; hi += p; } // flat/frozen → hug it
    else { const p = (hi - lo) * 0.12; lo -= p; hi += p; }
    return [+lo.toFixed(2), +hi.toFixed(2)];
  }, [chartData, selectedRow]);

  // SMA rides in the same rows as the price so recharts plots both off one
  // data array. A rolling sum, not a window-slice per point: the tape is
  // hundreds of bars re-computed on every tick.
  const SMA_N = 20;
  const chartPlot = useMemo(() => {
    if (!chartSMA || chartData.length < SMA_N) return chartData;
    let sum = 0;
    return chartData.map((d, i) => {
      sum += d.price;
      if (i >= SMA_N) sum -= chartData[i - SMA_N].price;
      return i >= SMA_N - 1 ? { ...d, sma: +(sum / SMA_N).toFixed(4) } : d;
    });
  }, [chartData, chartSMA]);
  // Compare mode: a second symbol on the same chart. Both tapes are normalized
  // to % change over the shared window — two price scales can't share one axis.
  const [chartVs, setChartVs] = useState(null);
  useEffect(() => { if (chartVs === selected) setChartVs(null); }, [chartVs, selected]);

  const sessionHL = useMemo(() => {
    if (!chartHL || chartData.length < 2) return null;
    const ys = chartData.map(d => d.price).filter(Number.isFinite);
    if (ys.length < 2) return null;
    const hi = Math.max(...ys), lo = Math.min(...ys);
    return hi - lo > 1e-9 ? { hi, lo } : null;   // a frozen tape has no meaningful extremes
  }, [chartData, chartHL]);

  // Spotify dock enter/exit animation: stay mounted briefly on close so the slide-out can play
  const [spotifyRender, setSpotifyRender] = useState(false);
  const [spotifyClosing, setSpotifyClosing] = useState(false);
  useEffect(() => {
    const active = musicOn && musicSource === "spotify" && (spotifyReady || !!spotifyEmbedUrl(spotifyUri));
    if (active) { setSpotifyClosing(false); setSpotifyRender(true); }
    else { setSpotifyClosing(true); const id = setTimeout(() => setSpotifyRender(false), 320); return () => clearTimeout(id); }
  }, [musicOn, musicSource, spotifyReady, spotifyUri]);
  const spotifyAnim = spotifyClosing ? "spotifyOut 0.3s ease forwards" : "spotifyIn 0.32s ease";

  const movers = useMemo(() => {
    const rows = watchlist.map(getRow).filter(r => r && r.chgPct != null);
    return [...rows].sort((a, b) => Math.abs(b.chgPct) - Math.abs(a.chgPct)).slice(0, 5);
  }, [watchlist, getRow]);

  // ---- command bar ----
  // Resolve typed text to a REAL ticker: known alias → all-caps short token (a ticker) → Finnhub
  // symbol search (full company names like "coca cola" → KO). Returns null if it can't be recognized,
  // so unrecognized input is rejected instead of creating a dead entry. Validates against live quotes.
  const resolveTyped = useCallback(async (raw) => {
    const t = String(raw || "").trim();
    if (!t) return null;
    const upKey = t.toUpperCase();
    const tickerish = /^[A-Za-z]{1,5}$/.test(t);
    const validate = async (c) => { if (!live) return true; try { await fetchQuote(c); return true; } catch { return false; } };
    let cand = SYMBOL_ALIASES[upKey] || null;                    // 1. known company name / alias
    if (!cand && tickerish && t === upKey) cand = upKey;         // 2. ALL-CAPS 1-5 letters = a ticker
    if (cand && await validate(cand)) return cand;
    if (quotesReady) { const hit = await finnhubSearch(t); if (hit && await validate(hit)) return hit; } // 3. name search
    if (!live && tickerish) return upKey;                        // 4. demo: allow a synthesized ticker
    return null;                                                  // unrecognized → reject
  }, [live, quotesReady]);

  // The lookup half of the command bar, callable with an explicit query so the
  // The palette can chart symbols through the exact same pipeline.
  const chartQuery = async (query, isAdd = false) => {
    setCmdMsg(`Looking up “${query}”…`);
    const t = await resolveTyped(query);
    if (!t) { setCmdMsg(`“${query}” not recognized.`); return; } // reject, no dead entry
    if (!live && !demoMkt[t]) ensureDemoSymbol(t);
    if (!watchlist.includes(t)) setWatchlist(w => [...w, t]);
    setSelected(t);
    setCmdMsg(isAdd ? `Added ${t} to watchlist` : (live ? "" : `${t} — demo data`));
    completeMission("chart");
  };

  const runCmd = async () => {
    const raw = cmd.trim();
    if (!raw) return;
    const up = raw.toUpperCase();
    if (up === "HELP") { setCmdMsg("Type a symbol or company name (e.g. AAPL or “apple”) and press Enter. ADD <name> / DEL <sym> manage the watchlist."); setCmd(""); return; }
    if (up.startsWith("DEL ")) {
      const t = resolveSym(raw.slice(4));
      setWatchlist(w => w.filter(x => x !== t)); setCmd(""); setCmdMsg(`Removed ${t}`); return;
    }
    const isAdd = up.startsWith("ADD ");
    const query = isAdd ? raw.slice(4).trim() : raw;
    setCmd("");
    await chartQuery(query, isAdd);
  };

  // ---- AI desk: build context + fan out to every enabled model ----
  const buildMarketContext = useCallback(() => {
    const rows = [...new Set([selected, ...watchlist])].map(getRow).filter(Boolean).map(r => ({
      symbol: r.sym, price: r.price, changePct: r.chgPct == null ? null : +r.chgPct.toFixed(2),
      open: r.open, high: r.high, low: r.low, prevClose: r.prevClose,
    }));
    return {
      focusSymbol: selected,
      dataSource: live ? "live quotes via Finnhub" : "SIMULATED demo data (random-walk engine, not real prices)",
      snapshot: rows,
    };
  }, [selected, watchlist, getRow, live]);

  const setResp = (id, patch) =>
    setAiResponses(p => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));

  // ---- downloadable reports: gather the current dashboard state, hand to the exporters ----
  // ---- news & video: discovered by Claude's live web search (declared before buildReport uses it) ----
  const [news, setNews] = useState(null);
  const [newsBusy, setNewsBusy] = useState(false);
  const [newsErr, setNewsErr] = useState("");
  const [newsFor, setNewsFor] = useState("");

  const [exportMsg, setExportMsg] = useState("");
  const [writtenReport, setWrittenReport] = useState("");
  const [reportSym, setReportSym] = useState(""); // which symbol the current report was written for
  // auto-clear the analyst report when you switch to a different symbol (it no longer applies)
  useEffect(() => {
    if (writtenReport && reportSym && reportSym !== selected) { setWrittenReport(""); setReportSym(""); }
  }, [selected, reportSym, writtenReport]);
  const [reportBusy, setReportBusy] = useState(false);

  // ---- anchor "day in the life": scheduled bell / meal / break cues, bumped by id so the canvas fires each once ----
  const [anchorCue, setAnchorCue] = useState(null);
  const cueIdRef = useRef(0);
  const [presenting, setPresenting] = useState(false); // true while exporting a PPT/Excel/Word doc
  const presentHoldRef = useRef(null);

  // ---- live header clock: ticks every second, shown in the user's chosen timezone (default ET) ----
  const [clockNow, setClockNow] = useState(() => new Date());
  const [clockTz, setClockTz] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-timezone")) || "America/New_York");
  useEffect(() => { window.localStorage?.setItem?.("tape-timezone", clockTz); }, [clockTz]);
  useEffect(() => {
    const iv = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const triggerAnchor = useCallback((type, opts = {}) => {
    cueIdRef.current += 1;
    setAnchorCue({ id: cueIdRef.current, type, meal: opts.meal || null, label: opts.label || null });
    // sound is played by the anchor via onCue exactly when the animation starts (it waits until the
    // anchor isn't mid-sentence), so the bell "ding" lands with the visual ring instead of early.
    if (type === "bell") completeMission("bell");
  }, [completeMission]);

  // ---- Games: the anchor hosts a beginner arcade, all local (works with no API credits) ----
  const [gameOn, setGameOn] = useState(false);
  const [gameMode, setGameMode] = useState("menu");     // menu | school | bullbear | ticker
  const [gameStep, setGameStep] = useState(0);          // round/lesson index
  const [gamePhase, setGamePhase] = useState("teach");  // teach | quiz | reveal | done
  const [gameChoice, setGameChoice] = useState(null);   // index the player picked
  const [gameScore, setGameScore] = useState(0);
  const gameSet = (mode) => mode === "school" ? STOCK_LESSONS : mode === "bullbear" ? BULLBEAR_ROUNDS : mode === "ticker" ? TICKER_ROUNDS : [];
  // narrate a round: the anchor reads the lesson / headline / prompt aloud
  const narrateRound = useCallback((mode, i) => {
    if (mode === "school") speak("school", `${i === 0 ? "Welcome to Stock School! " : ""}Lesson ${i + 1}. ${STOCK_LESSONS[i].teach}`);
    else if (mode === "bullbear") speak("school", `${i === 0 ? "Bull or Bear! " : ""}Here's the news: ${BULLBEAR_ROUNDS[i].headline} Bullish, or bearish?`);
    else if (mode === "ticker") speak("school", `${i === 0 ? "Ticker Match! " : ""}Which symbol is ${TICKER_ROUNDS[i].company}?`);
  }, [speak]);
  const openGames = useCallback(() => { setGameOn(true); setGameMode("menu"); stopSpeak(); }, [stopSpeak]);
  const startMode = useCallback((mode) => {
    setGameMode(mode); setGameStep(0); setGameChoice(null); setGameScore(0);
    setGamePhase(mode === "school" ? "teach" : "quiz");
    narrateRound(mode, 0);
  }, [narrateRound]);
  const gameToQuiz = useCallback(() => { setGamePhase("quiz"); stopSpeak(); }, [stopSpeak]);
  const gameAnswer = useCallback((i) => {
    setGameChoice(i); setGamePhase("reveal");
    let correct = false, explain = "";
    if (gameMode === "school") { const R = STOCK_LESSONS[gameStep]; correct = i === R.answer; explain = R.explain; }
    else if (gameMode === "bullbear") { const R = BULLBEAR_ROUNDS[gameStep]; correct = i === (R.bullish ? 0 : 1); explain = R.why; }
    else { const R = TICKER_ROUNDS[gameStep]; correct = i === R.answer; explain = `${R.company} trades as ${R.options[R.answer]}.`; }
    if (correct) { setGameScore(s => s + 1); triggerAnchor("cheer", { label: "CORRECT! ✓" }); }
    speak("school", explain);
  }, [gameMode, gameStep, triggerAnchor, speak]);
  const gameNext = useCallback(() => {
    setGameChoice(null);
    const data = gameSet(gameMode);
    if (gameStep >= data.length - 1) {
      setGamePhase("done");
      triggerAnchor("cheer", { label: gameMode === "school" ? "GRADUATE! 🎓" : "ROUND OVER! 🏁" }); // celebrate without the market bell
      speak("school", gameMode === "school" ? "That's a wrap — you've graduated Stock School!" : "Nice work — that's the end of the round!");
    } else {
      const n = gameStep + 1;
      setGameStep(n); setGamePhase(gameMode === "school" ? "teach" : "quiz");
      narrateRound(gameMode, n);
    }
  }, [gameMode, gameStep, triggerAnchor, speak, narrateRound]);
  const closeGame = useCallback(() => { setGameOn(false); setGameMode("menu"); stopSpeak(); setCmdMsg(""); }, [stopSpeak]);

  // ---- meetings (Zoom / Google Meet) via the backend at /api (see server/index.js) ----
  // Backend calls are per-user: send the session token (Bearer) so the server scopes
  // OAuth tokens / meetings / calendar to THIS account. Empty for guests & local accounts.
  const authHdr = useMemo(() => (account?.token ? { Authorization: `Bearer ${account.token}` } : {}), [account?.token]);
  // ---- Google Calendar: upcoming events shown in a dashboard panel ----
  const [calEvents, setCalEvents] = useState(null);     // null = not loaded, [] = none, [...] = events
  const [calErr, setCalErr] = useState("");
  const [calBusy, setCalBusy] = useState(false);
  const refreshCalendar = useCallback(async () => {
    setCalBusy(true); setCalErr("");
    try {
      const r = await fetch("/api/google/events?max=8", { headers: authHdr });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setCalEvents(j.events || []);
    } catch (e) { setCalErr(humanizeError(e)); setCalEvents(null); }
    finally { setCalBusy(false); }
  }, [authHdr]);
  // auto-load events once Google is connected
  useEffect(() => {
    if (meetStatus?.google?.connected && calEvents === null && !calBusy && !calErr) refreshCalendar();
  }, [meetStatus?.google?.connected, calEvents, calBusy, calErr, refreshCalendar]);
  // zero-setup calendar: Google's embeddable agenda view shows YOUR events if you're signed in to
  // Google in this browser — no OAuth/.env needed. (The API path above is the richer, headless option.)
  const [gcalEmail, setGcalEmail] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-gcal-email")) || "");
  const [gcalEdit, setGcalEdit] = useState(false);
  useEffect(() => { if (gcalEmail) window.localStorage?.setItem?.("tape-gcal-email", gcalEmail); else window.localStorage?.removeItem?.("tape-gcal-email"); }, [gcalEmail]);
  const gcalEmbedUrl = (email) => {
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "America/New_York"; } })();
    const p = new URLSearchParams({ src: email, mode: "AGENDA", ctz: tz, showTitle: "0", showPrint: "0", showTabs: "0", showCalendars: "0", showTz: "0", bgcolor: "#ffffff" });
    return `https://calendar.google.com/calendar/embed?${p.toString()}`;
  };
  // an "active meeting" you can pin (paste the link a Go-Live tab created) — kept across reloads, shown as a live badge
  const [liveMeeting, setLiveMeeting] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-live-meeting")) || "");
  const [liveMeetDraft, setLiveMeetDraft] = useState("");
  useEffect(() => { if (liveMeeting) window.localStorage?.setItem?.("tape-live-meeting", liveMeeting); else window.localStorage?.removeItem?.("tape-live-meeting"); }, [liveMeeting]);

  // in-app browser panel: open a broker/site INSIDE Vantage (many brokers block framing → fallback to a tab)
  const [embed, setEmbed] = useState(null); // { url, title, trusted } | null
  // brokers block iframe embedding (X-Frame-Options), so opening them in-panel just shows "refused to
  // connect" — route those straight to a new tab, and reserve the in-app panel for embeddable sites.
  const NO_EMBED = ["robinhood.com", "fidelity.com", "schwab.com", "webull.com", "tdameritrade.com", "etrade.com", "vanguard.com", "coinbase.com", "netflix.com", "disneyplus.com", "hulu.com"];
  const openEmbed = useCallback((url, title, trusted = false) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (!trusted && NO_EMBED.some(h => host === h || host.endsWith("." + h))) {
        window.open(url, "_blank", "noopener");
        setCmdMsg(`${title} blocks embedding — opened in a new tab.`);
        return;
      }
    } catch { /* not a URL — fall through to the panel */ }
    setEmbed({ url, title, trusted });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // a real in-frame market view (TradingView) — actually renders, unlike brokers
  const openChart = useCallback((sym) => {
    const s = (sym || selected || "SPY").toUpperCase();
    setEmbed({ url: tvEmbedUrl(s), title: `${s} · TradingView chart`, trusted: true });
    completeMission("nav");
  }, [selected, completeMission]);

  // ---- breaking-news alerts during live trading (real Finnhub wire when live, market-move alerts otherwise) ----
  // gated on prefs.notify.breakingNews (Settings Bundle B) — legacy localStorage["tape-breaking"] is
  // migrated into prefs by loadPrefs on first load; see src/settings/preferences.js.
  const [breakingAlert, setBreakingAlert] = useState(null); // { id, text, source }
  const breakingSeenRef = useRef(new Set());
  const breakingTimerRef = useRef(null);
  // One break-in per minute. Every alert is sound + on-air speech, and the P&F
  // sweep alone runs every 3s — without a floor, a churning demo tape turns the
  // desk into a siren. force (price alerts, calendar reminders) bypasses the
  // cooldown: the user scheduled those themselves. Returns whether it aired, so
  // a suppressed caller can defer instead of dropping the alert.
  const lastBreakRef = useRef(0);
  const pushBreaking = useCallback((text, source, { force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastBreakRef.current < 60000) return false;
    lastBreakRef.current = now;
    const id = now;
    setBreakingAlert({ id, text, source });
    playBreakingSfx();
    speak("breaking", `This just in. ${text}.`);
    clearTimeout(breakingTimerRef.current);
    breakingTimerRef.current = setTimeout(() => setBreakingAlert(a => (a && a.id === id ? null : a)), 16000);
    return true;
  }, [speak, playBreakingSfx]);
  const runBreakingCheck = useCallback(async () => {
    if (!notifyEnabled(prefs, "breakingNews")) return;
    const { day, mins } = etNow();
    const marketOpen = day >= 1 && day <= 5 && mins >= 570 && mins < 960; // 9:30–16:00 ET weekdays
    if (!live || !marketOpen) return; // only during genuine live trading — live data AND market open (not demo, not after hours)
    if (live) { // real market wire, through the server's key
      try {
        const r = await fetch("/api/market-news");
        if (r.ok) {
          const arr = await r.json();
          const fresh = (Array.isArray(arr) ? arr : []).find(n => n.headline && !breakingSeenRef.current.has(n.id || n.headline));
          if (fresh) { breakingSeenRef.current.add(fresh.id || fresh.headline); pushBreaking(fresh.headline, fresh.source || "wire"); return; }
        }
      } catch { /* fall through to market-move alert */ }
    }
    // market-move alert (factual to the current session — not fabricated news)
    const rows = [...new Set([selected, ...watchlist])].map(getRow).filter(Boolean);
    const mover = rows.filter(r => r.chgPct != null && Math.abs(r.chgPct) >= 2).sort((a, b) => Math.abs(b.chgPct) - Math.abs(a.chgPct))[0];
    if (mover) {
      const bucket = `${mover.sym}:${Math.round(mover.chgPct)}`;
      if (!breakingSeenRef.current.has(bucket)) {
        breakingSeenRef.current.add(bucket);
        pushBreaking(`${mover.sym} ${mover.chgPct >= 0 ? "surges" : "slides"} ${Math.abs(mover.chgPct).toFixed(1)}% ${mover.chgPct >= 0 ? "higher" : "lower"} in the session`, "market tape");
      }
    }
  }, [prefs.notify.breakingNews, live, selected, watchlist, getRow, pushBreaking]);
  useEffect(() => {
    if (!notifyEnabled(prefs, "breakingNews")) { setBreakingAlert(null); return; }
    const first = setTimeout(runBreakingCheck, 9000);   // one shortly after load
    const iv = setInterval(runBreakingCheck, 85000);     // then periodically
    return () => { clearTimeout(first); clearInterval(iv); clearTimeout(breakingTimerRef.current); };
  }, [prefs.notify.breakingNews, runBreakingCheck]);

  // ---- calendar reminders: when a scheduled event's time arrives, break in like breaking news ----
  const calRemindedRef = useRef(new Set());
  useEffect(() => {
    const check = () => {
      let evs = [];
      try { evs = JSON.parse(window.localStorage.getItem("tape-calendar") || "[]"); } catch { return; }
      const now = new Date();
      const todayKey = calKey(now.getFullYear(), now.getMonth(), now.getDate());
      const hhmm = `${calPad(now.getHours())}:${calPad(now.getMinutes())}`;
      for (const e of evs) {
        if (e && e.date === todayKey && e.time === hhmm && !calRemindedRef.current.has(e.id)) {
          calRemindedRef.current.add(e.id);
          pushBreaking(`Calendar reminder — ${e.title}${e.time ? ` at ${to12h(e.time)}` : ""}`, "calendar", { force: true });
        }
      }
    };
    const iv = setInterval(check, 20000); // catch the target minute regardless of when it started
    check();
    return () => clearInterval(iv);
  }, [pushBreaking]);

  // ---- price alerts: "alert me when NVDA hits 150" → the anchor breaks in when the target is crossed ----
  const [priceAlerts, setPriceAlerts] = useState(() => { try { return JSON.parse(window.localStorage.getItem("tape-alerts") || "[]"); } catch { return []; } });
  useEffect(() => { try { window.localStorage.setItem("tape-alerts", JSON.stringify(priceAlerts)); } catch { /* private */ } }, [priceAlerts]);
  const parseAlertIntent = (raw) => {
    const q = raw.toLowerCase();
    const alertVerb = /\b(alert|notify|tell me|let me know|watch for|remind me|ping me)\b/.test(q);
    const condVerb = /\b(hits?|reaches?|crosses?|above|over|below|under|drops?|falls?|rises?|goes? (above|below|over|under))\b/.test(q);
    if (!alertVerb && !(condVerb && /\bwhen\b/.test(q))) return null;
    const priceM = q.match(/(\d+(?:\.\d+)?)/);
    if (!priceM) return null;
    const price = parseFloat(priceM[1]);
    const dollar = raw.match(/\$([A-Za-z]{1,5})\b/);
    const aliased = aliasFromText(raw);
    const caps = (raw.match(/\b[A-Z]{1,5}\b/g) || []).find(c => !CAPS_STOP.has(c));
    const sym = dollar ? resolveSym(dollar[1]) : aliased || (caps ? resolveSym(caps) : selected);
    const op = /\b(below|under|drops?|falls?|less than|beneath|<)\b/.test(q) ? "<" : ">";
    return { sym, op, price };
  };
  const addPriceAlert = ({ sym, op, price }) => {
    const row = getRow(sym);
    const cur = row?.price;
    const already = cur != null && (op === ">" ? cur >= price : cur <= price);
    if (already) {
      setResp("nav", { status: "done", nav: true, text: `⏰ ${sym} is already ${op === ">" ? "at/above" : "at/below"} ${fmt(price)} (now ${fmt(cur)}) — no alert set. Try the other direction.` });
      speak("nav", `${sym} is already ${op === ">" ? "above" : "below"} ${price}. No alert needed.`);
      return;
    }
    const alert = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, sym, op, price };
    setPriceAlerts(list => [...list.filter(a => !(a.sym === sym && a.op === op && a.price === price)), alert]);
    setResp("nav", { status: "done", nav: true, text: `⏰ Alert armed — I'll break in when ${sym} goes ${op === ">" ? "above" : "below"} ${fmt(price)} (now ${cur != null ? fmt(cur) : "—"}).` });
    speak("nav", `Alert set. I'll let you know when ${sym} goes ${op === ">" ? "above" : "below"} ${price}.`);
  };
  const removeAlert = (id) => setPriceAlerts(list => list.filter(a => a.id !== id));
  const firePriceAlert = useCallback((a, row) => {
    const text = `${a.sym} ${a.op === ">" ? "hit" : "fell to"} your ${fmt(a.price)} target — now ${fmt(row.price)}`;
    const id = Date.now();
    setBreakingAlert({ id, text: `⏰ Price alert — ${text}`, source: "your alert" });
    playBreakingSfx();
    speak("breaking", `Price alert. ${text}.`);
    clearTimeout(breakingTimerRef.current);
    breakingTimerRef.current = setTimeout(() => setBreakingAlert(x => (x && x.id === id ? null : x)), 18000);
  }, [speak, playBreakingSfx]);
  useEffect(() => {
    if (!priceAlerts.length) return;
    if (!notifyEnabled(prefs, "priceTriggers")) return;
    const check = () => {
      for (const a of priceAlerts) {
        const row = getRow(a.sym);
        if (!row || row.price == null) continue;
        const hit = a.op === ">" ? row.price >= a.price : row.price <= a.price;
        if (hit) { firePriceAlert(a, row); setPriceAlerts(list => list.filter(x => x.id !== a.id)); }
      }
    };
    const iv = setInterval(check, 3000); check();
    return () => clearInterval(iv);
  }, [priceAlerts, getRow, firePriceAlert, prefs.notify.priceTriggers]);

  // ---- P&F pattern scan: when a watchlist symbol prints a NEW pattern, the anchor breaks in ----
  // The scan always runs (it feeds the P&F SIGNALS rail); prefs.notify.pnfPatterns gates only
  // the on-air announcement. pnfSeenRef: undefined = never scanned (seed silently on the first
  // sweep so a page load doesn't announce every pattern already on the board), null = scanned,
  // no pattern. At most one break-in per sweep so speech never piles up — a symbol that would
  // have announced but got capped by another symbol's announcement this sweep has its seen entry
  // LEFT AT prev (not advanced), so it announces on the next sweep instead of being dropped
  // forever. That deferral only applies when the cap is the reason for suppression: if the pref
  // itself is off, the seen entry still advances, so re-enabling the pref later doesn't dump a
  // stale backlog of everything that printed while notifications were off. The driving effect
  // below mounts once and fires on a stable 3s interval; pnfCheckRef holds the latest scan
  // closure (reassigned every render) so the interval always reads fresh selected/watchlist/prefs
  // without needing to tear down and restart every time demoMkt/liveTape tick.
  const [pnfSignals, setPnfSignals] = useState({});   // sym -> { id, name, side }
  const pnfSeenRef = useRef({});
  const getCloses = useCallback((sym) => {
    if (live) return (liveTape[sym] || []).map(p => p.price);
    const st = demoMkt[sym];
    return st ? st.bars.slice(0, st.cursor + 1).map(b => b.price) : [];
  }, [live, liveTape, demoMkt]);
  const comparePlot = useMemo(() => {
    if (!chartVs || chartVs === selected || chartMode !== "line") return null;
    const bCloses = getCloses(chartVs);
    if (chartData.length < 2 || bCloses.length < 2) return null;
    const n = Math.min(chartData.length, bCloses.length);
    const aw = chartData.slice(chartData.length - n), bw = bCloses.slice(bCloses.length - n);
    const a0 = aw[0].price, b0 = bw[0];
    if (!(a0 > 0) || !(b0 > 0)) return null;
    return aw.map((d, i) => ({ t: d.t, base: +((d.price / a0 - 1) * 100).toFixed(3), vs: +((bw[i] / b0 - 1) * 100).toFixed(3) }));
  }, [chartVs, selected, chartMode, chartData, getCloses]);
  const pnfCheckRef = useRef(() => {});
  pnfCheckRef.current = () => {
    const syms = [...new Set([selected, ...watchlist])];
    const next = {};
    let announced = false;
    for (const sym of syms) {
      const pat = detectPattern(buildPnF(getCloses(sym), live ? { boxPct: INTRADAY_BOX_PCT } : {}).columns);
      if (pat) next[sym] = pat;
      const prev = pnfSeenRef.current[sym];
      const wantsAnnounce = pat && prev !== undefined && pat.id !== prev;
      if (wantsAnnounce && !announced && notifyEnabled(prefs, "pnfPatterns")) {
        if (pushBreaking(`${sym} just printed a ${pat.name} on the point-and-figure chart`, "P&F scan")) {
          announced = true;
          pnfSeenRef.current[sym] = pat.id;
        }
        // else: the break-in cooldown suppressed it — keep prev, a later sweep retries
      } else if (wantsAnnounce && announced && notifyEnabled(prefs, "pnfPatterns")) {
        // capped this sweep — keep prev so the next sweep announces it instead of dropping it
      } else {
        pnfSeenRef.current[sym] = pat ? pat.id : null;
      }
    }
    setPnfSignals(s => {
      const keys = Object.keys(s);
      if (keys.length === Object.keys(next).length && keys.every(k => next[k] && next[k].id === s[k].id)) return s;
      return next;
    });
  };
  useEffect(() => {
    const iv = setInterval(() => pnfCheckRef.current(), 3000);
    pnfCheckRef.current();
    return () => clearInterval(iv);
  }, []);

  // ---- market events: upcoming earnings dates for your watchlist, merged into the calendar ----
  const [marketEvents, setMarketEvents] = useState([]);
  const fetchMarketEvents = useCallback(async () => {
    const syms = [...new Set([selected, ...watchlist])];
    if (!live) {
      setResp("nav", { status: "done", nav: true, text: "📊 Live earnings dates need Finnhub — settings → DATA → switch to LIVE. (Ask me about a specific stock any time.)" });
      speak("nav", "Earnings dates need live market data. Switch to live in settings to see the market calendar.");
      return;
    }
    try {
      const f = (d) => d.toISOString().slice(0, 10);
      const from = new Date(), to = new Date(Date.now() + 21 * 864e5);
      const r = await fetch(`/api/earnings?from=${f(from)}&to=${f(to)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const rows = (j.earningsCalendar || []).filter(e => syms.includes(e.symbol));
      const evs = rows.map(e => ({
        date: e.date, sym: e.symbol,
        title: `📊 ${e.symbol} earnings${e.hour === "amc" ? " (after close)" : e.hour === "bmo" ? " (before open)" : ""}`,
        time: e.hour === "bmo" ? "08:00" : e.hour === "amc" ? "16:30" : "",
      }));
      setMarketEvents(evs);
      if (evs.length) {
        setResp("nav", { status: "done", nav: true, text: `📊 Earnings ahead (next 3 wks): ${evs.map(e => `${e.sym} ${calPretty(e.date)}`).join(" · ")} — now marked on your calendar.` });
        speak("nav", `Here's what's coming up. ${evs.map(e => `${e.sym} reports ${calPretty(e.date)}`).join("; ")}. I've marked them on your calendar.`);
      } else {
        setResp("nav", { status: "done", nav: true, text: "📊 No earnings on your watchlist in the next three weeks." });
        speak("nav", "No earnings on your watchlist in the next three weeks.");
      }
    } catch (e) { setResp("nav", { status: "error", nav: true, text: `Couldn't load market events — ${humanizeError(e)}` }); }
  }, [live, selected, watchlist, speak]);

  // ---- portfolio: holdings with live P&L; the anchor can brief it ----
  const [deskPortfolio, setDeskPortfolio] = useState(false); // show the portfolio inside the desk response box
  const [positions, setPositions] = useState(() => { try { return JSON.parse(window.localStorage.getItem("tape-positions") || "[]"); } catch { return []; } });
  useEffect(() => { try { window.localStorage.setItem("tape-positions", JSON.stringify(positions)); } catch { /* private */ } }, [positions]);
  const [portForm, setPortForm] = useState({ sym: "", shares: "", cost: "" });
  const portfolioRows = positions.map(p => {
    const price = getRow(p.sym)?.price;
    const cost = p.cost * p.shares;
    const val = price != null ? price * p.shares : null;
    const pnl = val != null ? val - cost : null;
    const pnlPct = (cost > 0 && pnl != null) ? (pnl / cost) * 100 : null;
    return { ...p, price, cost, val, pnl, pnlPct };
  });
  const portTotals = portfolioRows.reduce((a, r) => { a.val += r.val || 0; a.cost += r.cost || 0; return a; }, { val: 0, cost: 0 });
  portTotals.pnl = portTotals.val - portTotals.cost;
  portTotals.pnlPct = portTotals.cost > 0 ? (portTotals.pnl / portTotals.cost) * 100 : 0;
  const addPosition = () => {
    const sym = resolveSym(portForm.sym), shares = parseFloat(portForm.shares), cost = parseFloat(portForm.cost);
    if (!sym || !(shares > 0) || !(cost >= 0)) return;
    if (!live && !demoMkt[sym]) ensureDemoSymbol(sym);
    setPositions(ps => [...ps, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, sym, shares, cost }]);
    setPortForm({ sym: "", shares: "", cost: "" });
    if (!panels.portfolio) setPanels(p => ({ ...p, portfolio: true }));
  };
  const removePosition = (id) => setPositions(ps => ps.filter(p => p.id !== id));
  const briefPortfolio = useCallback(() => {
    setDeskPortfolio(true); // show the full portfolio inside the desk response box
    if (!panels.portfolio) setPanels(p => ({ ...p, portfolio: true }));
    setTimeout(() => { const el = document.getElementById("tour-response"); if (el) try { el.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch { /* older */ } }, 80);
    if (!positions.length) { speak("nav", "Your portfolio is empty. Add some holdings and I'll track your gains and losses."); return; }
    const rows = positions.map(p => { const price = getRow(p.sym)?.price; const pnl = price != null ? (price - p.cost) * p.shares : null; return { sym: p.sym, pnl }; });
    const tot = rows.reduce((a, r) => a + (r.pnl || 0), 0);
    const totCost = positions.reduce((a, p) => a + p.cost * p.shares, 0);
    const totPct = totCost > 0 ? tot / totCost * 100 : 0;
    speak("nav", `Your portfolio is ${tot >= 0 ? "up" : "down"} ${fmt(Math.abs(tot))}, or ${Math.abs(totPct).toFixed(1)} percent. ` + rows.map(r => `${r.sym} ${r.pnl >= 0 ? "up" : "down"} ${fmt(Math.abs(r.pnl))}`).join("; ") + ".");
  }, [positions, panels.portfolio, getRow, speak]);

  // ---- voice control: press-to-talk → speech recognition → run the transcript as a desk command ----
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const voiceSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ---- "open my calendar" — show the full calendar in the desk box AND have the anchor read what's coming up ----
  const [deskCalendar, setDeskCalendar] = useState(false);
  const openCalendar = useCallback(() => {
    setDeskCalendar(true); // render the interactive calendar inside the desk response box
    setPanels(p => (p.calendar ? p : { ...p, calendar: true })); // and make sure the rail panel is on too
    setTimeout(() => { const el = document.getElementById("tour-response"); if (el) try { el.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch { /* older browsers */ } }, 80);
    let events = [];
    try { events = JSON.parse(window.localStorage.getItem("tape-calendar") || "[]"); } catch { /* none */ }
    const d = new Date(), todayKey = calKey(d.getFullYear(), d.getMonth(), d.getDate());
    const upcoming = events
      .filter(e => e.date >= todayKey)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
      .slice(0, 5);
    if (upcoming.length) {
      speak("nav", `Here's your calendar. ${upcoming.length === 1 ? "You have one upcoming event" : `Your next ${upcoming.length} events`}: ` + upcoming.map(e => `${e.title}${e.time ? " at " + to12h(e.time) : ""}, ${e.date === todayKey ? "today" : "on " + calPretty(e.date)}`).join("; ") + ".");
    } else {
      speak("nav", "Here's your calendar. It's clear — no upcoming events. You can add one right here.");
    }
  }, [speak]);

  // ---- onboarding launchers: spotlight tour, hands-free demo, missions ----
  // Dismissing the welcome modal ANY way marks it seen, so it stops greeting you every launch.
  useEffect(() => {
    if (!showTutorial) { try { window.localStorage.setItem("tape-tutorial-seen", "1"); } catch { /* private */ } }
  }, [showTutorial]);
  // "Replay the welcome" from settings: clear the flag first so the effect above doesn't
  // immediately re-mark it seen on the next dismissal cycle.
  const replayTutorial = () => {
    try { window.localStorage.removeItem("tape-tutorial-seen"); } catch { /* private */ }
    setShowTutorial(true);
  };
  const launchSpotlight = () => { setShowTutorial(false); setTourStep(0); setTourMode("spotlight"); };
  const endSpotlight = () => { setTourMode(null); stopSpeak(); };
  const launchMissions = () => { setShowTutorial(false); setMissionsOpen(true); };
  const chartSymbolDirect = (sym) => { // chart without depending on the command-bar state (used by the demo)
    const s = resolveSym(String(sym).toUpperCase());
    if (!live && !demoMkt[s]) ensureDemoSymbol(s);
    setSelected(s);
    setWatchlist(w => (w.includes(s) ? w : [...w, s]));
  };
  const stopDemo = () => { demoAbortRef.current = true; setDemoRunning(false); stopSpeak(); setCmd(""); };
  const runDemo = async () => {
    if (demoRunning) return;
    demoAbortRef.current = false;
    setDemoRunning(true);
    setShowTutorial(false);
    const wait = (ms) => new Promise((res) => {
      const start = performance.now();
      const tick = () => (demoAbortRef.current ? res("abort") : performance.now() - start >= ms ? res("ok") : setTimeout(tick, 90));
      tick();
    });
    const alive = () => !demoAbortRef.current;
    const say = (t) => { if (alive()) speak("demo", t); };
    const typeInto = async (setter, text) => {
      for (let i = 0; i <= text.length; i++) { if (!alive()) return; setter(text.slice(0, i)); await wait(45); }
    };
    try {
      say("Welcome to Vantage. Sit back — I'll give you the two-minute tour.");
      if ((await wait(3400)) === "abort") return;

      say("First, I'll chart a stock from the command bar.");
      await typeInto(setCmd, "NVDA");
      await wait(900); if (!alive()) return;
      chartSymbolDirect("NVDA"); setCmd(""); completeMission("chart");
      await wait(2400); if (!alive()) return;

      if (aiReady()) {
        say("Now watch me ask the desk a question — I answer out loud.");
        await typeInto(setAiQuestion, "What's driving NVDA today?");
        await wait(700); if (!alive()) return;
        askDesk("What's driving NVDA today?"); completeMission("ask");
        await wait(6000); if (!alive()) return;
      } else {
        say("I'd answer your questions right here — but that needs an A.I. key, and you don't have one set up yet. I'll show you where at the end.");
        await wait(4600); if (!alive()) return;
      }

      say("I can pull up a full interactive chart, right inside Vantage.");
      await wait(1600); if (!alive()) return;
      openChart("NVDA"); completeMission("nav");
      await wait(3800); if (!alive()) return;
      setEmbed(null);

      say("And I run a live trading day. Here's the opening bell.");
      await wait(1400); if (!alive()) return;
      triggerAnchor("bell"); completeMission("bell");
      await wait(3000); if (!alive()) return;

      if (aiReady()) {
        say("That's the desk. Your turn — ask me anything, or say, what's on Netflix.");
        await wait(1200);
      } else {
        say("That's the tour. One last thing — let's get your A.I. key set up so I can actually answer you.");
        await wait(3200);
        if (alive()) setSetupOpen(true);
      }
    } finally {
      demoAbortRef.current = false;
      setDemoRunning(false);
    }
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false); // AI-desk header "⋯ More" dropdown (games / ambient / music)

  // Export/More behave like real menus: any press outside their wrapper — or
  // Escape — dismisses them, same as the account menu in the header.
  useEffect(() => {
    if (!showExportMenu && !showMoreMenu) return;
    const closeAll = () => { setShowExportMenu(false); setShowMoreMenu(false); };
    const onDown = (e) => { if (!e.target.closest?.("[data-deskmenu]")) closeAll(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAll(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showExportMenu, showMoreMenu]);
  // shared style for the AI-desk header toolbar buttons — one consistent look, amber when active
  const deskBtn = (active) => ({
    display: "flex", alignItems: "center", gap: 6,
    background: active ? "rgba(255,255,255,0.08)" : "transparent",
    border: `1px solid ${active ? C.accent : C.panelEdge}`,
    color: active ? C.accentText : C.muted,
    borderRadius: 5, fontFamily: SANS, fontWeight: 510, fontSize: 11, letterSpacing: "-0.010em",
    padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap",
    transition: "border-color .12s, color .12s, background .12s",
  });
  const deskBtnHover = (active) => ({
    onMouseEnter: (e) => { if (!active) { e.currentTarget.style.borderColor = C.faint; e.currentTarget.style.color = C.text; } },
    onMouseLeave: (e) => { if (!active) { e.currentTarget.style.borderColor = C.panelEdge; e.currentTarget.style.color = C.muted; } },
  });
  const refreshMeetStatus = useCallback(async () => {
    try { const r = await fetch("/api/status", { headers: authHdr }); setMeetStatus(r.ok ? await r.json() : null); }
    catch { setMeetStatus(null); } // backend not running
  }, [authHdr]);
  useEffect(() => {
    const u = new URL(window.location.href);
    // returning from Stripe Checkout (Layer 3): confirm the new plan and show the ACCOUNT tab
    const checkout = u.searchParams.get("checkout"), boughtPlan = u.searchParams.get("plan");
    if (checkout === "success" && boughtPlan) {
      // A verified Stripe webhook, never this query parameter, grants a paid plan.
      fetch("/api/auth/me", { headers: authHdr }).then(r => r.ok ? r.json() : null).then(a => { if (a) onChangePlan?.(a.plan); });
      setSettingsTab("account"); setShowSettings(true);
    }
    if (checkout) { u.searchParams.delete("checkout"); u.searchParams.delete("plan"); window.history.replaceState({}, "", u.toString()); }
  }, [authHdr, onChangePlan]);
  // load provider status whenever the Meetings tab is opened
  // Ask once on mount too. This response also says whether the server holds the
  // model key, and aiReady gates the composer — not just the Meetings tab, so
  // waiting until someone opens Meetings left the desk believing it was off.
  useEffect(() => { refreshMeetStatus(); }, [refreshMeetStatus]);

  // ---- migration: purge provider keys this browser used to hold ----
  // Every proxied provider's key now lives on the server, and the states that
  // read these localStorage entries are gone — a leftover copy is pure liability
  // with no reader. Runs every load; removing an absent entry is a no-op.
  // Claude and OpenAI-direct still call their own APIs, so their keys stay.
  useEffect(() => {
    const stale = ["tape-finnhub-key", "tape-eleven-key", "tape-youtube-key", "tape-tmdb-key", "tape-server-keys-migrated"];
    let dropped = 0;
    try {
      for (const k of stale) if (window.localStorage.getItem(k) != null) { window.localStorage.removeItem(k); dropped++; }
    } catch { /* private mode */ }
    // OpenRouter + Gemini ride the server now; blank any stored copy in the saved model config.
    // The desk also speaks through the server's OpenRouter, full stop: the model-picker UI is
    // gone, so any other entry it left enabled would be a switch stuck on with no reachable off.
    // (?local=1 keeps working as the developer escape hatch and skips the pin.)
    let localDemo = false;
    try { localDemo = new URLSearchParams(window.location.search).has("local"); } catch { /* ignore */ }
    setAiModels(ms => ms.map(m => ({
      ...m,
      apiKey: (m.id === "openrouter" || m.id === "gemini") ? "" : m.apiKey,
      ...(localDemo ? {} : { enabled: m.id === "openrouter" }),
    })));
    if (dropped) console.info(`[vantage] ${dropped} stored provider key entr${dropped === 1 ? "y" : "ies"} removed — the server holds the keys now.`);
  }, []);
  useEffect(() => { if (showSettings && settingsTab === "meetings") refreshMeetStatus(); }, [showSettings, settingsTab, refreshMeetStatus]);


  // ---- billing (Layer 3): probe Stripe availability when the ACCOUNT tab opens ----
  // If the backend has Stripe keys, paid upgrades route through Stripe's hosted checkout.
  // Otherwise billingCfg.enabled stays false and paid plans unlock as a labelled simulation.
  useEffect(() => {
    if (!showSettings || settingsTab !== "account" || billingCfg) return;
    let ok = true;
    fetch("/api/billing/config").then(r => r.ok ? r.json() : null).then(j => ok && setBillingCfg(j || { enabled: false }))
      .catch(() => ok && setBillingCfg({ enabled: false }));
    return () => { ok = false; };
  }, [showSettings, settingsTab, billingCfg]);

  useEffect(() => {
    if (!showSettings || settingsTab !== "account" || !account?.backend || !account?.token) return;
    let active = true;
    fetch("/api/agent/preferences", { headers: authHdr }).then(r => r.ok ? r.json() : null).then(j => active && setAgentPrefs(j)).catch(() => active && setAgentPrefs(null));
    return () => { active = false; };
  }, [showSettings, settingsTab, account?.backend, account?.token, authHdr]);

  const saveAgentPrefs = async (enabled) => {
    if (!account?.backend || !account?.token) return;
    setAgentBusy(true);
    try {
      const r = await fetch("/api/agent/preferences", { method: "POST", headers: { "Content-Type": "application/json", ...authHdr }, body: JSON.stringify({ enabled, symbols: watchlist }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not save agent settings");
      setAgentPrefs(j);
    } catch (e) { setCmdMsg(`Market brief agent — ${humanizeError(e)}`); }
    finally { setAgentBusy(false); }
  };

  // ---- change plan. Free/downgrade is instant & local. A paid upgrade with Stripe
  // configured opens Stripe Checkout in this tab; without Stripe it's a simulated unlock. ----
  const startPlanChange = async (planId) => {
    const paid = planId !== "free";
    if (paid && billingCfg?.enabled && account) {
      setBillingBusy(planId);
      try {
        const r = await fetch("/api/billing/checkout", {
          method: "POST", headers: { "Content-Type": "application/json", ...(account.token ? { Authorization: `Bearer ${account.token}` } : {}) },
          body: JSON.stringify({ plan: planId, email: account.email }),
        });
        const j = await r.json();
        if (r.ok && j.url) { window.location.href = j.url; return; } // hand off to Stripe's page
        throw new Error(j.error || "Checkout unavailable");
      } catch (e) { setCmdMsg(`Checkout unavailable — ${humanizeError(e)}`); return; }
      finally { setBillingBusy(""); }
    }
    onChangePlan?.(planId); // simulated / local plan switch
  };

  // Opening bell on arrival, on the exchange's clock (ET). Live: only if the market is truly open now.
  // Demo: ring only within a plausible trading window (~8:00–16:30 ET) so there's no bell at 2am.
  useEffect(() => {
    // ring the arrival bell only ONCE per browser tab session — a page reload or a hot-reload
    // during development must not re-ring it (that's the "bell keeps playing" bug)
    try { if (sessionStorage.getItem("vantage-arrival-bell")) return; } catch { /* ignore */ }
    const { day, mins } = etNow();
    const weekday = day >= 1 && day <= 5;
    const marketOpenNow = weekday && mins >= 570 && mins < 960; // 9:30–16:00 ET
    const tradingHours = weekday && mins >= 480 && mins < 990;  // ~8:00–16:30 ET
    if (!(live ? marketOpenNow : tradingHours)) return;
    try { sessionStorage.setItem("vantage-arrival-bell", "1"); } catch { /* ignore */ }
    const id = setTimeout(() => triggerAnchor("bell", { label: "OPENING BELL" }), 2600);
    return () => clearTimeout(id);
  }, []); // once per session

  // Autonomous trading-day schedule on ET — bells AND meals share NY time so ordering stays coherent
  // (opening bell then breakfast then lunch…). Window-based + a fired-set means mounting at 12:45 ET
  // fires lunch but not the breakfast that already passed. Each segment fires once per ET calendar day.
  const firedRef = useRef({});
  useEffect(() => {
    const SEG = [
      { key: "breakfast", from: 8 * 60 + 30, to: 9 * 60 + 25,  run: () => triggerAnchor("eat", { meal: "breakfast" }) },
      { key: "open",      from: 9 * 60 + 30, to: 9 * 60 + 45,  run: () => triggerAnchor("bell", { label: "OPENING BELL" }) },
      { key: "am-break",  from: 11 * 60,     to: 11 * 60 + 20, run: () => triggerAnchor("break") },
      { key: "lunch",     from: 12 * 60 + 30,to: 13 * 60 + 30, run: () => triggerAnchor("eat", { meal: "lunch" }) },
      { key: "pm-break",  from: 15 * 60,     to: 15 * 60 + 20, run: () => triggerAnchor("break") },
      { key: "close",     from: 16 * 60,     to: 16 * 60 + 15, run: () => triggerAnchor("bell", { label: "CLOSING BELL" }) },
      { key: "dinner",    from: 18 * 60,     to: 19 * 60,      run: () => triggerAnchor("eat", { meal: "dinner" }) },
    ];
    const tick = () => {
      const { day, mins, stamp } = etNow();
      if (day === 0 || day === 6) return; // markets closed on weekends
      for (const s of SEG) {
        const fk = `${stamp}:${s.key}`;
        if (mins >= s.from && mins < s.to && !firedRef.current[fk]) { firedRef.current[fk] = true; s.run(); }
      }
    };
    tick(); // catch the current window on mount
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, []);
  // scheduled "daily brief": auto-generate + download at a set time while the app is open
  const [briefTime, setBriefTime] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-brief-time")) || "");
  const [briefFormat, setBriefFormat] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-brief-format")) || "pptx");
  const briefRanRef = useRef("");
  useEffect(() => { window.localStorage?.setItem?.("tape-brief-time", briefTime); }, [briefTime]);
  useEffect(() => { window.localStorage?.setItem?.("tape-brief-format", briefFormat); }, [briefFormat]);

  // render the current session chart to a PNG data URL for embedding in Word/PPT
  const chartToDataUrl = useCallback(() => {
    const data = chartData;
    if (!data || data.length < 2) return null;
    const W = 900, H = 340, pl = 64, pr = 20, pt = 24, pb = 28;
    const cvs = document.createElement("canvas");
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const prices = data.map(d => d.price);
    let min = Math.min(...prices), max = Math.max(...prices);
    const pcv = selectedRow?.prevClose;
    if (pcv != null) { min = Math.min(min, pcv); max = Math.max(max, pcv); }
    if (min === max) { min -= 1; max += 1; }
    const padv = (max - min) * 0.08; min -= padv; max += padv;
    const X = (i) => pl + (i / (data.length - 1)) * (W - pl - pr);
    const Y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    const accent = (selectedRow?.chgPct ?? 0) >= 0 ? C.up : C.down;
    ctx.strokeStyle = C.grid; ctx.fillStyle = C.faint; ctx.font = "12px monospace"; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const gy = pt + g / 4 * (H - pt - pb);
      ctx.beginPath(); ctx.moveTo(pl, gy); ctx.lineTo(W - pr, gy); ctx.stroke();
      ctx.fillText((max - g / 4 * (max - min)).toFixed(2), 6, gy + 4);
    }
    if (pcv != null) { ctx.strokeStyle = C.faint; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pl, Y(pcv)); ctx.lineTo(W - pr, Y(pcv)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.beginPath(); ctx.moveTo(X(0), Y(prices[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(X(i), Y(prices[i]));
    ctx.lineTo(X(data.length - 1), H - pb); ctx.lineTo(X(0), H - pb); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pt, 0, H - pb);
    grad.addColorStop(0, accent + "55"); grad.addColorStop(1, accent + "00");
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(0), Y(prices[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(X(i), Y(prices[i]));
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = "bold 15px sans-serif";
    ctx.fillText(`${selected} — session`, pl, 15);
    return cvs.toDataURL("image/png");
  }, [chartData, selectedRow, selected]);

  const buildReport = useCallback((overrides = {}) => {
    const sel = getRow(selected);
    const analysis = Object.entries(aiResponses)
      .filter(([id, resp]) => id !== "nav" && resp?.text && resp.status !== "error")
      .map(([id, resp]) => ({ model: aiModels.find(m => m.id === id)?.label || id, text: resp.text }));
    return {
      generatedAt: new Date().toLocaleString(),
      live: !!live,
      selected: overrides.selected ?? (sel ? { sym: sel.sym, name: sel.name, price: sel.price, chg: sel.chg, chgPct: sel.chgPct, open: sel.open, high: sel.high, low: sel.low, prevClose: sel.prevClose } : null),
      watchlist: overrides.watchlist ?? watchlist.map(getRow).filter(Boolean).map(w => ({ sym: w.sym, price: w.price, chg: w.chg, chgPct: w.chgPct })),
      analysis: overrides.analysis ?? analysis,
      question: lastAsked,
      news: overrides.news ?? (news?.news || []),
      chartImage: overrides.chartImage !== undefined ? overrides.chartImage : chartToDataUrl(),
      writtenReport: overrides.writtenReport ?? writtenReport,
      title: overrides.title || `Vantage Market Report — ${sel?.sym || selected}`,
      logo: makeLogoDataUrl(),
    };
  }, [getRow, selected, watchlist, aiResponses, aiModels, lastAsked, news, live, chartToDataUrl, writtenReport]);

  // preview/edit before exporting: the user tweaks the title + report body, then downloads
  const [exportDraft, setExportDraft] = useState(null); // { format, title, body } | null
  const openExportPreview = useCallback((format, bodyOverride) => {
    const rep = buildReport();               // snapshot the current structured report so every cell is editable
    const sel = rep.selected || {};
    const r2 = (n) => (typeof n === "number" && isFinite(n) ? Math.round(n * 100) / 100 : n); // clean display + clean Excel cells
    const starter = bodyOverride || writtenReport ||
      `${sel.name || selected} (${sel.sym || selected})\n\n` +
      `Price ${fmt(sel.price)}  (${pct(sel.chgPct)})\n` +
      `Open ${fmt(sel.open)} · High ${fmt(sel.high)} · Low ${fmt(sel.low)} · Prev Close ${fmt(sel.prevClose)}\n\n` +
      `Summary\nAdd your notes here — this text goes into the ${(format || "docx").toUpperCase()} you export.\n`;
    setExportDraft({
      format: format || "docx",
      title: `${sel.sym || selected} Market Report`,
      body: starter,
      selected: { ...sel, price: r2(sel.price), chg: r2(sel.chg), chgPct: r2(sel.chgPct), open: r2(sel.open), high: r2(sel.high), low: r2(sel.low), prevClose: r2(sel.prevClose) }, // editable snapshot (Summary sheet / title slide)
      watchlist: rep.watchlist.map(w => ({ sym: w.sym, price: r2(w.price), chg: r2(w.chg), chgPct: r2(w.chgPct) })), // editable per-cell grid
      analysis: rep.analysis.map(a => ({ ...a })),    // editable AI-analysis blocks
      news: rep.news.map(n => ({ ...n })),            // editable news list
      include: { chart: (rep.chartImage != null), analysis: rep.analysis.length > 0, news: rep.news.length > 0 }, // section toggles
    });
  }, [buildReport, writtenReport, selected]);

  const doExport = useCallback(async (fmt, overrides) => {
    setExportMsg(`Building ${fmt.toUpperCase()}…`);
    setPresenting(true); // anchor strikes a presenting pose while the document is assembled
    try {
      const report = buildReport(overrides);
      if (fmt === "xlsx") await exportExcel(report);
      else if (fmt === "docx") await exportWord(report);
      else await exportPowerPoint(report);
      setExportMsg(`✓ ${fmt.toUpperCase()} downloaded`);
      completeMission("export");
      setTimeout(() => setExportMsg(""), 3000);
    } catch (e) {
      setExportMsg(`✗ ${fmt.toUpperCase()} failed — ${humanizeError(e)}`);
    } finally {
      // hold the pose a beat past a fast export so it's actually seen ("presenting the finished deck")
      clearTimeout(presentHoldRef.current);
      presentHoldRef.current = setTimeout(() => setPresenting(false), 2600);
    }
  }, [buildReport]);

  const buildPrompt = (question) =>
    `You are one of several analysts on a trading desk answering the same question side by side. Be concise: 2-4 sentences, no preamble. Never give personalized financial advice; frame observations analytically.${lang !== "en" ? ` Respond entirely in ${LANG_AI[lang]}.` : ""}\n` +
    `Earlier turns of this conversation may precede this message — use them to resolve follow-ups (pronouns, "what about its risks?").\n\n` +
    `If you are asked what this application is, answer with exactly this and nothing else: "${VANTAGE_ABOUT}"\n\n` +
    `The market snapshot below is this dashboard's own data — treat it as the live tape when it is real quotes, or as a hypothetical scenario (say so briefly) when it is simulated demo data.\n` +
    `For questions about current or recent real-world events — "this week in the market", latest news, a company's recent moves — use web search to ground your answer in up-to-date facts, and don't confuse the simulated snapshot with the real market.\n\n` +
    `Market snapshot (JSON):\n${JSON.stringify(buildMarketContext())}\n\nQuestion: ${question}`;

  const getClaudeBaseUrl = useCallback(() => {
    const base = aiModels.find(m => m.id === "claude")?.baseUrl || "https://api.anthropic.com/v1";
    return base.replace(/\/$/, "");
  }, [aiModels]);

  const getAnthropicHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    "x-api-key": anthropicApiKey.trim(),
    "anthropic-version": "2023-06-01",
    // required for calling the API straight from a browser — without it the request is CORS-blocked
    "anthropic-dangerous-direct-browser-access": "true",
  }), [anthropicApiKey]);

  // Turn a failed Anthropic response into a legible error — the API puts the real reason
  // (bad model, missing web-search access, invalid key…) in the JSON body, not the status code.
  const anthropicError = async (r) => {
    let detail = "";
    try { const j = await r.json(); detail = j?.error?.message || j?.message || ""; } catch { /* no body */ }
    if (!detail && r.status === 401) detail = "check the API key in settings";
    return new Error(`HTTP ${r.status}${detail ? " — " + detail : ""}`);
  };

  // Claude composes a full analyst write-up (web-search grounded) that gets embedded in every export
  const generateWrittenReport = useCallback(async () => {
    // write via the enabled models in order (OpenRouter is primary) — cascades on error, like the desk.
    const isLocal = (m) => m.kind === "ollama" || /localhost|127\.0\.0\.1/.test(m.baseUrl || "");
    // OpenRouter and Gemini are keyed by the server, so "enabled" is all they need here.
    const serverKeyed = (m) => (m.id === "openrouter" && !!meetStatus?.ai?.configured) || (m.id === "gemini" && !!meetStatus?.gemini?.configured);
    const usable = !planAllows("ai") ? [] : aiModels.filter(m => m.enabled && (isLocal(m) || serverKeyed(m) || (m.kind === "claude" ? !!anthropicApiKey.trim() : (m.needsKey ? !!(m.apiKey && m.apiKey.trim()) : true))));
    if (!usable.length) { setExportMsg("✗ Enable a model with a key (OpenRouter, Claude…) or a local model to write a report"); return null; }
    setReportBusy(true);
    const ctx = JSON.stringify(buildMarketContext());
    const snapPrompt =
      `Write a concise equity analyst report on ${selected} using ONLY the dashboard snapshot below (no web access). ` +
      `Sections, each header on its own line (no markdown symbols): Overview, Recent Price Action, Key Drivers, Risks, Outlook. ` +
      `250–450 words, plain text. If the snapshot is simulated demo data, say so briefly. Never give personalized financial advice.${lang !== "en" ? ` Write the entire report in ${LANG_AI[lang]}.` : ""}\n\nSnapshot (JSON):\n${ctx}`;
    const errors = [];
    try {
      for (const m of usable) {
        try {
          setExportMsg(`Writing analyst report via ${m.label}…`);
          let text = "";
          if (m.kind === "claude") { // Claude: web-search grounded
            const prompt = `Write a concise but complete equity analyst report on ${selected}. Use web search for the latest real developments. Structure with headers on their own lines (no markdown): Overview, Recent Price Action, Key Drivers, Risks, Outlook. 300–500 words, plain text. If the dashboard snapshot is simulated demo data, note that briefly. Never give personalized financial advice.${lang !== "en" ? ` Write the entire report in ${LANG_AI[lang]}.` : ""}\n\nDashboard snapshot (JSON):\n${ctx}`;
            const r = await fetch(`${getClaudeBaseUrl()}/messages`, { method: "POST", headers: getAnthropicHeaders(), body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1600, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] }) });
            if (!r.ok) throw await anthropicError(r);
            const data = await r.json();
            text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
          } else { // OpenRouter / OpenAI / Gemini / local: from the snapshot
            let acc = ""; const ask = m.kind === "ollama" ? askOllama : m.kind === "gemini" ? askGemini : askOpenAICompat;
            await ask(m, snapPrompt, undefined, (t) => { acc += t; }); text = acc.trim();
          }
          if (!text) throw new Error("empty response");
          setWrittenReport(text); setReportSym(selected);
          setExportMsg(`✓ Report ready (via ${m.label})`);
          setTimeout(() => setExportMsg(""), 5000);
          return text;
        } catch (e) { errors.push(`${m.label}: ${humanizeError(e)}`); }
      }
      throw new Error(errors.join(" · ") || "no model succeeded");
    } catch (e) {
      setExportMsg(`✗ Report failed — ${humanizeError(e)}`);
      return null;
    } finally {
      setReportBusy(false);
    }
  }, [aiModels, anthropicApiKey, meetStatus, selected, buildMarketContext, getClaudeBaseUrl, getAnthropicHeaders]);

  // Detect an export request typed into the MAIN desk bar — "download excel", "make a powerpoint",
  // "write a report and export the ppt". Returns {fmt, wantReport} or null (so askDesk can short-circuit).
  const matchExport = (raw) => {
    const q = (raw || "").toLowerCase();
    let fmt = null;
    if (/\b(excel|xls|xlsx|spreadsheet|sheet)\b/.test(q)) fmt = "xlsx";
    else if (/\b(word|docx?|document)\b/.test(q)) fmt = "docx";
    else if (/\b(power\s?point|pptx?|ppt|slides?|deck|presentation)\b/.test(q)) fmt = "pptx";
    const reportWord = /\b(report|write[- ]?up|brief)\b/.test(q);
    const actionWord = /\b(write|generate|create|draft|make|produce|export|download|build|need|want|give)\b/.test(q);
    const wantReport = reportWord && actionWord;
    if (!fmt && !wantReport) return null;
    return { fmt, wantReport };
  };

  const runExportCmd = useCallback(async ({ fmt, wantReport }) => {
    // write the report first if asked, then open the preview/edit step (download happens from there)
    let fresh = null;
    if (wantReport) fresh = await generateWrittenReport();
    openExportPreview(fmt || "docx", fresh || undefined);
  }, [generateWrittenReport, openExportPreview]);

  // Detect a "make the anchor do X" request typed into the desk bar. Deliberately strict on "break"
  // (explicit phrases only) so a real question like "will NVDA break out?" still reaches the analysts.
  const matchAnchorCue = (raw) => {
    const q = (raw || "").toLowerCase();
    if (/\bbreakfast\b/.test(q)) return { type: "eat", meal: "breakfast" };
    if (/\blunch\b/.test(q)) return { type: "eat", meal: "lunch" };
    if (/\b(dinner|supper)\b/.test(q)) return { type: "eat", meal: "dinner" };
    if (/\bring\b|opening bell|closing bell|\bthe bell\b/.test(q)) return { type: "bell", label: /clos/.test(q) ? "CLOSING BELL" : "OPENING BELL" };
    if (/\btake a break\b|\bcoffee break\b|\bbreather\b|\bstep away\b|\btake five\b/.test(q)) return { type: "break" };
    if (/\b(eat|meal|snack|hungry)\b/.test(q)) {
      const h = new Date().getHours();
      return { type: "eat", meal: h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner" };
    }
    return null;
  };

  // one scheduled brief: write the report, then build a fresh report object with it and download
  const runDailyBrief = useCallback(async () => {
    setExportMsg("⏰ Building daily brief…");
    const text = await generateWrittenReport();
    const report = { ...buildReport(), writtenReport: text || writtenReport };
    try {
      if (briefFormat === "xlsx") await exportExcel(report);
      else if (briefFormat === "docx") await exportWord(report);
      else await exportPowerPoint(report);
      setExportMsg("✓ Daily brief downloaded");
      setTimeout(() => setExportMsg(""), 6000);
    } catch (e) { setExportMsg(`✗ Daily brief failed — ${humanizeError(e)}`); }
  }, [generateWrittenReport, buildReport, briefFormat, writtenReport]);

  useEffect(() => {
    if (!briefTime) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (hhmm === briefTime && briefRanRef.current !== today) { briefRanRef.current = today; runDailyBrief(); }
    };
    const id = setInterval(check, 30000);
    check();
    return () => clearInterval(id);
  }, [briefTime, runDailyBrief]);

  async function askClaude(m, prompt, signal, onToken, history = []) {
    if (!anthropicApiKey.trim()) throw new Error("Add an Anthropic API key in settings to enable Claude.");
    const baseUrl = getClaudeBaseUrl();
    const call = (stream) => fetch(`${baseUrl}/messages`, {
      method: "POST", signal,
      headers: getAnthropicHeaders(),
      body: JSON.stringify({
        model: m.model, max_tokens: 1000,
        ...(stream ? { stream: true } : {}),
        // Anthropic runs this server-side; Claude searches only when a question needs current facts
        // (e.g. "this week in the market") and the answer still streams back as text. Bounded to keep cost down.
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [...history, { role: "user", content: prompt }],
      }),
    });

    // try streaming first; any failure falls back to a plain request
    let r = null;
    try { r = await call(true); } catch { r = null; }
    if (r && r.ok && (r.headers.get("content-type") || "").includes("event-stream") && r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", got = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop();
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            try {
              const j = JSON.parse(s.slice(5).trim());
              if (j.type === "content_block_delta" && j.delta?.text) { got = true; onToken(j.delta.text); }
              if (j.type === "message_stop") return;
            } catch { /* partial */ }
          }
        }
        if (got) return;
      } catch { /* stream broke mid-way — fall through to plain retry */ }
    }

    // non-streaming path (also the retry)
    const r2 = await call(false);
    if (!r2.ok) throw await anthropicError(r2);
    const data = await r2.json();
    if (data.error) throw new Error(data.error.message || "API error");
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (!text) throw new Error("Empty response");
    onToken(text);
  }

  async function askOllama(m, prompt, signal, onToken, history = []) {
    const r = await fetch(`${m.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m.model, stream: true, messages: [...history, { role: "user", content: prompt }] }),
    });
    if (!r.ok) {
      // Ollama puts the real reason in the body — a 404 almost always means the model isn't pulled yet.
      let detail = ""; try { const j = await r.json(); detail = j?.error || ""; } catch { /* no JSON body */ }
      if (r.status === 404) throw new Error(detail || `model "${m.model}" not found — run: ollama pull ${m.model}`);
      throw new Error(detail ? `Ollama HTTP ${r.status} — ${detail}` : `Ollama HTTP ${r.status} — running with OLLAMA_ORIGINS=${(typeof window !== "undefined" && window.location?.origin) || "your app origin"} ?`);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          if (j.message?.content) onToken(j.message.content);
          if (j.done) { lastEvalRef.current = { eval_count: j.eval_count, eval_duration: j.eval_duration }; return; }
        } catch { /* partial line */ }
      }
    }
  }

  async function askOpenAICompat(m, prompt, signal, onToken, history = []) {
    // A cloud model with no key of its own goes through our own backend, which
    // holds the OpenRouter key — a key shipped to the browser is a published key.
    // The backend replies with the same OpenAI-shaped SSE, so every line below
    // this point is identical either way.
    // When this server holds a key, it WINS over anything left in the browser.
    // Preferring a stored key meant a stale one from before the backend existed
    // silently kept talking to the provider direct — with the UI claiming the
    // opposite — which is precisely the leak the proxy exists to close.
    // Scoped to OpenRouter because that is precisely what the backend proxies.
    // needsKey was too broad: OpenAI-direct ships a bare model id ("gpt-4o-mini")
    // that OpenRouter cannot resolve, and Claude/Gemini never reach this function
    // at all. When this server holds a key it WINS over anything in the browser —
    // preferring a stored key is how a stale one silently kept calling the
    // provider direct while the UI claimed otherwise.
    const viaServer = m.id === "openrouter"; // OpenRouter rides the server's key, always
    const r = await fetch(viaServer ? "/api/ai/chat" : `${m.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal,
      headers: {
        "Content-Type": "application/json",
        ...(viaServer ? authHdr : (m.apiKey ? { Authorization: `Bearer ${m.apiKey}` } : {})),
      },
      body: JSON.stringify({ model: m.model, stream: true, messages: [...history, { role: "user", content: prompt }] }),
    });
    if (!r.ok) {
      // the provider (OpenRouter/OpenAI/LM Studio) puts the real reason in the JSON body — surface it
      let detail = "";
      try { const j = await r.json(); detail = j?.error?.message || (typeof j?.error === "string" ? j.error : "") || j?.message || ""; } catch { /* no body */ }
      const hint = r.status === 401 ? "check the API key"
        : r.status === 404 ? `model "${m.model}" not found — check the MODEL id (and BASE URL)`
        : r.status === 402 ? "out of credits/tokens — top up this provider or switch models"
        : r.status === 429 ? "rate limited / out of tokens — slow down or top up credits"
        : (!m.needsKey && r.status !== 401) ? "is the local server running with CORS enabled?" : "";
      // some providers return 200-with-quota-error or bury credit issues in the body text
      if (/insufficient|quota|credit|billing|out of/i.test(detail)) detail = `out of credits/tokens — ${detail}`;
      throw new Error(`HTTP ${r.status}${detail ? " — " + detail : hint ? " — " + hint : ""}`);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const j = JSON.parse(payload);
          const tok = j.choices?.[0]?.delta?.content;
          if (tok) onToken(tok);
        } catch { /* partial */ }
      }
    }
  }

  // ---- streaming navigator: "open netflix", "put on <show> on hulu", "watch <movie> on disney+" ----
  const parseStreamIntent = (raw) => {
    const q = raw.toLowerCase();
    // if they're asking about the *equity* (NFLX / DIS), this isn't a streaming request
    if (/\b(stock|shares?|price|quote|analy|chart|earnings|ticker|dividend|nflx|\$dis)\b/.test(q)) return null;
    const svc = STREAMERS.find(s => s.rx.test(q));
    if (!svc) return null;
    const launch = /(take me to|open|go to|goto|pull up|bring up|launch|navigate|put on|play|watch|stream|turn on)/.test(q);
    const bare = q.replace(/[^a-z+ ]/g, " ").replace(/\s+/g, " ").trim();
    const isBare = /^(netflix|hulu|disney\+?|disney plus)$/.test(bare);
    if (!launch && !isBare) return null; // avoid firing on incidental mentions
    const title = q
      .replace(svc.rx, " ")
      .replace(/\b(take me to|go to|goto|open( up)?|pull up|bring up|launch|navigate to|put on|play|watch|stream|turn on|show me|find|search( for)?|on|the|some|please|can you|to|for me|for|up|a|an)\b/g, " ")
      .replace(/[^\w\s'&:.-]/g, " ")
      .replace(/\s+/g, " ").trim();
    return { svc, title };
  };

  // ---- streaming catalog: "what's on netflix", "browse hulu shows", "free public-domain movies" ----
  const parseCatalogIntent = (raw) => {
    const q = raw.toLowerCase();
    if (/(public domain|free movies?|classic movies?|old movies?|archive\.?org|internet archive|b-?movies?)/.test(q)) {
      const query = q
        .replace(/\b(show me|find|play|watch|browse|pull up|open|public domain|free|classic|old|movies?|films?|flicks?|on|archive\.?org|internet archive|b-?movies?|the|some|please|can you|from|about|for)\b/g, " ")
        .replace(/\s+/g, " ").trim();
      return { archive: true, query };
    }
    const svc = STREAMERS.find(s => s.rx.test(q));
    const browse = /(what'?s on|whats on|browse|catalog|library|shows? on|movies? on|trending|popular|top on|what to watch|recommend|see on)/.test(q);
    const kind = /\b(show|shows|series|tv|episode)\b/.test(q) ? "tv" : "movie";
    if (svc && browse) return { svc, kind };
    // no service named → popular / trending across everything
    if (/\b(popular|trending|what to watch|top movies?|top shows?|top tv|recommend( me)? (a )?(movie|show|something)|what should i watch)\b/.test(q)) {
      return { popular: true, kind };
    }
    return null;
  };

  // ---- desk navigator: detect "take me to / open / pull up" intents ----
  const parseNavIntent = (raw) => {
    const q = raw.toLowerCase();
    const navVerb = /(take me|open|go to|goto|pull up|bring up|launch|navigate)/.test(q);
    const hits = [];
    if (/fidelity/.test(q)) hits.push(BROKERS[0]);
    if (/schwab|ameritrade|\btd\b/.test(q)) hits.push(BROKERS[1]);
    if (/robinhood/.test(q)) hits.push(BROKERS[2]);
    if (/webull/.test(q)) hits.push(BROKERS[3]);

    // resolve a symbol: $SYM wins, then a known ticker, then any plausible caps ticker, then the chart's focus
    let sym = selected, explicit = false;
    const dollar = raw.match(/\$([A-Za-z]{1,5})\b/);
    const aliased = aliasFromText(raw); // catches "pull up google", "take me to apple"
    if (dollar) { sym = resolveSym(dollar[1]); explicit = true; }
    else if (aliased) { sym = aliased; explicit = true; }
    else {
      const caps = raw.match(/\b[A-Z]{1,5}\b/g) || [];
      const known = caps.find(c => demoMkt[c] || watchlist.includes(c));
      const plausible = caps.find(c => c.length >= 2 && !CAPS_STOP.has(c));
      if (known) { sym = resolveSym(known); explicit = true; }
      else if (plausible) { sym = resolveSym(plausible); explicit = true; }
    }

    if (hits.length === 0 && !(navVerb && explicit)) return null;

    // navOnly: a short command with nothing analytical left in it
    const residue = q
      .replace(/(take me to|take me|go to|goto|open( up)?|pull up|bring up|launch|navigate to|show me|please|can you|on|to|the|at|for me|for)/g, " ")
      .replace(/fidelity|schwab|td ameritrade|ameritrade|\btd\b|robinhood|webull/g, " ")
      .replace(/\$?[a-z]{1,5}\b/gi, " ")
      .trim();
    const navOnly = navVerb && residue.length < 4;

    return { brokers: hits, sym, navOnly, inApp: hits.length === 0 };
  };

  async function askGemini(m, prompt, signal, onToken, history = []) {
    // No key of its own? Our backend holds one and speaks the same streaming
    // shape, so the SSE parser below is untouched.
    // Gemini rides the server's key, always.
    const r = await fetch(
      "/api/ai/gemini",
      {
        method: "POST", signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m.model, contents: [
          ...history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
          { role: "user", parts: [{ text: prompt }] },
        ] }),
      }
    );
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json())?.error || ""; } catch { /* keep status */ }
      throw new Error(msg || `HTTP ${r.status}${r.status === 429 ? " — rate limited" : ""}`);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        try {
          const j = JSON.parse(s.slice(5).trim());
          const tok = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
          if (tok) onToken(tok);
        } catch { /* partial */ }
      }
    }
  }


  // ---- in-app video theater ----
  const [player, setPlayer] = useState(null); // {id, title, channel, url, brief?} | {archive, title, channel}
  // the player docks at the TOP of the desk; opening one from deep in a catalog grid
  // would otherwise land off-screen, so bring it into view when it (re)opens
  const playerRef = useRef(null);
  // "start", not "nearest": a 16:9 frame can be taller than the viewport, and nearest would
  // align its bottom — pushing the panel's title/close row off the top of the screen.
  useEffect(() => { if (player) playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [player]);
  // ---- streaming catalog (TMDB for Netflix/Disney+/Hulu libraries; archive.org for in-desk films) ----
  const [catalog, setCatalog] = useState(null); // {service?, kind?, archive?, popular?, query?, loading, items:[], error?}
  const [catalogPick, setCatalogPick] = useState(null); // an item whose summary is expanded
  const browseCatalog = useCallback(async (svc, kind = "movie") => {
    setCatalogPick(null);
    if (!planAllows("tmdb")) { setCatalog({ service: svc, kind, loading: false, items: [], error: `Streaming catalog is a ${planFor("tmdb")} feature — upgrade in settings → ACCOUNT.` }); return; }
    if (!canBrowseCatalog) { setCatalog({ service: svc, kind, loading: false, items: [], error: "The streaming catalog isn't configured on this server." }); return; }
    setCatalog({ service: svc, kind, loading: true, items: [] });
    try {
      const r = await fetch(`/api/tmdb/discover?kind=${kind}&provider=${svc.tmdb}&region=US`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items = (d.results || []).slice(0, 12).map(m => ({
        id: m.id, kind, title: m.title || m.name, rating: m.vote_average,
        year: String(m.release_date || m.first_air_date || "").slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
        overview: m.overview,
      }));
      setCatalog({ service: svc, kind, loading: false, items });
    } catch (e) { setCatalog({ service: svc, kind, loading: false, items: [], error: humanizeError(e) }); }
  }, [canBrowseCatalog, planAllows]);
  const browsePopular = useCallback(async (kind = "movie") => {
    setCatalogPick(null);
    if (!planAllows("tmdb")) { setCatalog({ popular: true, kind, loading: false, items: [], error: `Streaming catalog is a ${planFor("tmdb")} feature — upgrade in settings → ACCOUNT.` }); return; }
    if (!canBrowseCatalog) { setCatalog({ popular: true, kind, loading: false, items: [], error: "The streaming catalog isn't configured on this server." }); return; }
    setCatalog({ popular: true, kind, loading: true, items: [] });
    try {
      const r = await fetch(`/api/tmdb/trending?kind=${kind}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items = (d.results || []).slice(0, 12).map(m => ({
        id: m.id, kind, title: m.title || m.name, rating: m.vote_average,
        year: String(m.release_date || m.first_air_date || "").slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
        overview: m.overview,
      }));
      setCatalog({ popular: true, kind, loading: false, items });
    } catch (e) { setCatalog({ popular: true, kind, loading: false, items: [], error: humanizeError(e) }); }
  }, [canBrowseCatalog, planAllows]);
  const playTrailer = useCallback(async (item, svc) => {
    if (!planAllows("tmdb")) return; // plan-gated: TMDB trailers need Pro Desk
    if (!canBrowseCatalog) return;
    try {
      const r = await fetch(`/api/tmdb/videos?kind=${item.kind}&id=${item.id}`);
      const d = await r.json();
      const vids = (d.results || []).filter(v => v.site === "YouTube");
      const t = vids.find(v => v.type === "Trailer") || vids.find(v => v.type === "Teaser") || vids[0];
      completeMission("watch");
      if (t) setPlayer({ id: t.key, title: `${item.title} — Trailer`, channel: svc?.name || "Trailer", url: `https://www.youtube.com/watch?v=${t.key}` });
      else setPlayer({ id: null, title: `${item.title} — Trailer`, channel: svc?.name || "", brief: "No trailer on file — use the search link to find it.", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + " trailer")}` });
    } catch { /* trailer is a bonus */ }
  }, [canBrowseCatalog, completeMission]);
  const browseArchive = useCallback(async (query) => {
    setCatalog({ archive: true, loading: true, items: [], query });
    try {
      const q = (query && query.length > 1) ? query : "feature_films";
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:(movies)`)}&fl[]=identifier&fl[]=title&fl[]=year&rows=12&page=1&output=json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items = (d.response?.docs || []).map(doc => ({
        archiveId: doc.identifier, title: Array.isArray(doc.title) ? doc.title[0] : doc.title, year: doc.year,
        poster: `https://archive.org/services/img/${doc.identifier}`,
      }));
      setCatalog({ archive: true, loading: false, items, query });
    } catch (e) { setCatalog({ archive: true, loading: false, items: [], error: humanizeError(e), query }); }
  }, []);
  const playArchive = useCallback((item) => {
    setPlayer({ archive: item.archiveId, title: item.title, channel: "Internet Archive" });
    completeMission("watch");
  }, [completeMission]);
  const fetchVideoBrief = useCallback(async (v) => {
    try {
      if (!anthropicApiKey.trim()) return;
      const r = await fetch(`${getClaudeBaseUrl()}/messages`, {
        method: "POST",
        headers: getAnthropicHeaders(),
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 400,
          messages: [{
            role: "user",
            content: `Search the web for this YouTube video and tell me in 2-3 sentences, entirely in your own words, what it covers and what the key takeaway is: "${v.title}" by ${v.channel} (${v.url}). If you can't find specifics, say what the title suggests it covers. Respond with only the brief, no preamble.`,
          }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      if (!r.ok) return;
      const data = await r.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join(" ").trim();
      if (text) setPlayer(p => (p && p.url === v.url ? { ...p, brief: text } : p));
    } catch { /* brief is a bonus — theater works without it */ }
  }, []);
  const ytId = (url) => {
    const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    return m ? m[1] : null;
  };
  // an always-valid outbound link: the real video if we have one, else a YouTube search for the title
  const ytWatchUrl = (v) =>
    (v?.url && /youtube\.com|youtu\.be/.test(v.url)) ? v.url
    : v?.id ? `https://www.youtube.com/watch?v=${v.id}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(v?.title || "")}`;
  // YouTube serves a 120×90 grey placeholder for IDs that don't exist — use that to reject
  // videos the model hallucinated (the usual cause of a black, unplayable embed)
  const probeYtId = (id) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 120);
    img.onerror = () => resolve(false);
    img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  });
  const openVideo = async (v) => {
    completeMission("watch");
    const id = ytId(v.url);
    const valid = id ? await probeYtId(id) : false;
    if (valid) {
      setPlayer({ id, ...v });
      if (!v.brief) fetchVideoBrief(v);
    } else {
      setPlayer({ id: null, ...v, brief: v.brief || "This exact video couldn't be embedded — use “Watch on YouTube” below to find it." });
    }
  };

  // ---- YouTube Data API: real, embeddable search results (no hallucinated IDs) ----
  const searchYouTube = useCallback(async (query, max = 3) => {
    if (!planAllows("youtube")) return []; // plan-gated: real video results need Pro Desk
    const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&max=${max}`);
    // Video search simply not being configured is not an error worth surfacing —
    // the desk just has no clips to show.
    if (r.status === 503) return [];
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j.error?.message || (typeof j.error === "string" ? j.error : msg); } catch { /* keep status */ }
      throw new Error(msg);
    }
    const data = await r.json();
    return Array.isArray(data.videos) ? data.videos : [];
  }, [planAllows]);

  // Claude with live web search — the accurate path (real URLs)
  const newsViaClaude = useCallback(async () => {
    const r = await fetch(`${getClaudeBaseUrl()}/messages`, {
      method: "POST", headers: getAnthropicHeaders(),
      body: JSON.stringify({
        model: "claude-sonnet-4-5", max_tokens: 1000,
        messages: [{ role: "user", content: `Search the web for the latest news about ${selected} stock, and search for recent YouTube videos discussing ${selected} stock. Respond with ONLY minified JSON, no markdown fences and no other text, in exactly this shape: {"news":[{"title":"","source":"","url":""}],"videos":[{"title":"","channel":"","url":""}]}. Up to 4 news items and up to 3 videos. Titles must be your own short paraphrases, not copied headlines.` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    if (!r.ok) throw await anthropicError(r);
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    const a = clean.indexOf("{"), z = clean.lastIndexOf("}");
    if (a < 0 || z < 0) throw new Error("No results returned — try again");
    return JSON.parse(clean.slice(a, z + 1));
  }, [selected, getClaudeBaseUrl, getAnthropicHeaders]);

  // Fallback: any other model (OpenRouter/OpenAI/Gemini/local) from its own knowledge — no web access,
  // so we attach SEARCH links (Google News / YouTube) instead of fabricating URLs, and label it clearly.
  const newsViaModel = useCallback(async (m) => {
    const askAny = (mm, prompt, onTok) =>
      mm.kind === "claude" ? askClaude(mm, prompt, undefined, onTok)
      : mm.kind === "ollama" ? askOllama(mm, prompt, undefined, onTok)
      : mm.kind === "gemini" ? askGemini(mm, prompt, undefined, onTok)
      : askOpenAICompat(mm, prompt, undefined, onTok);
    let acc = "";
    await askAny(m, `You have NO web access. From general knowledge, give up to 4 notable themes/storylines about ${selected} stock and up to 3 video topics investors look for. Respond with ONLY minified JSON, no fences: {"news":[{"title":"","source":""}],"videos":[{"title":"","channel":""}]}. Short paraphrased titles. Do NOT invent URLs.`, (t) => { acc += t; });
    const clean = acc.replace(/```json|```/g, "").trim();
    const a = clean.indexOf("{"), z = clean.lastIndexOf("}");
    if (a < 0 || z < 0) throw new Error("Model returned no usable results");
    const parsed = JSON.parse(clean.slice(a, z + 1));
    const nq = (q) => encodeURIComponent(`${selected} ${q || ""}`.trim());
    parsed.news = (parsed.news || []).slice(0, 4).map(n => ({ title: n.title, source: n.source || "search", url: `https://www.google.com/search?q=${nq(n.title)}` }));
    parsed.videos = (parsed.videos || []).slice(0, 3).map(v => ({ title: v.title, channel: v.channel || "YouTube", url: `https://www.youtube.com/results?search_query=${nq(v.title)}` }));
    parsed._via = m.label; // flag: sourced from model knowledge, not live web
    return parsed;
  }, [selected]);

  // Three sources, tried cheapest-and-most-real first:
  //   1. the Vantage backend's /api/news (REST; server-side Finnhub key)
  //   2. Finnhub company-news, direct REST with the user's own key
  //   3. AI web search (the original path — the only one that needs no keys/backend)
  const fetchNews = useCallback(async () => {
    setNewsBusy(true); setNewsErr("");
    try {
      let parsed = null;

      try {
        const j = await api.news(selected, { timeout: 6000 });
        if (j?.news?.length) parsed = { news: j.news, videos: [] };
      } catch { /* backend offline or unconfigured — normal, fall through */ }


      if (!parsed) {
        // pick a fallback model: any enabled/usable model that isn't direct-Claude (which needs the Anthropic key)
        const isLocal = (m) => m.kind === "ollama" || /localhost|127\.0\.0\.1/.test(m.baseUrl || "");
        const usable = (m) => m.id !== "claude" && (isLocal(m)
          || (m.id === "openrouter" && !!meetStatus?.ai?.configured) || (m.id === "gemini" && !!meetStatus?.gemini?.configured)
          || (m.needsKey ? !!(m.apiKey && m.apiKey.trim()) : true));
        const cand = aiModels.filter(usable);
        const fb = cand.find(m => m.enabled) || cand[0] || null;

        if (anthropicApiKey.trim()) {
          try { parsed = await newsViaClaude(); }
          catch (e) { if (!fb) throw e; parsed = await newsViaModel(fb); } // Claude failed (401/credits) → other model
        } else if (fb) {
          parsed = await newsViaModel(fb);
        } else {
          throw new Error("Add an Anthropic API key, or enable another model (OpenRouter/OpenAI/local), to load news.");
        }
      }

      // real embeddable videos from the YouTube Data API always win, if a key is set
      if (canSearchVideos) {
        try { const vids = await searchYouTube(`${selected} stock`, 3); if (vids.length) parsed.videos = vids; } catch { /* keep model list */ }
      }
      setNews(parsed); setNewsFor(selected);
    } catch (e) {
      setNewsErr(humanizeError(e));
    } finally {
      setNewsBusy(false);
    }
  }, [selected, canSearchVideos, searchYouTube, anthropicApiKey, aiModels, meetStatus, newsViaClaude, newsViaModel]);

  // always hand the browser a valid, openable URL — fall back to a Google search if a model omitted/mangled one
  const newsHref = (n) => (n?.url && /^https?:\/\//.test(n.url)) ? n.url : `https://www.google.com/search?q=${encodeURIComponent(`${newsFor || selected} ${n?.title || ""}`.trim())}`;

  // Read the loaded headlines on air, in the voice of the current anchor. Lifted
  // out of the news panel's JSX so NewsDesk can stay presentational and simply
  // call back when the "Read on air" button is pressed.
  const broadcastNews = useCallback(() => {
    const stories = news?.news || [];
    if (!stories.length) return;
    const anchorName = CHARACTERS.find(c => c.id === characterId)?.name || "the desk";
    const script = `This is ${anchorName} with the ${newsFor} brief. ` +
      stories.map((n, i) => `Story ${i + 1}, from ${n.source}: ${n.title}.`).join(" ") +
      " That's the tape. Back to you.";
    speak("broadcast", script);
  }, [news, newsFor, characterId, speak]);

  // One story on air, without sitting through the whole bulletin.
  // Keyed by title (stable under news filtering) so the UI can show WHICH
  // story is on air; pressing the same story again stops the read.
  const readStory = (n) => {
    if (!n?.title) return;
    const sid = `story:${n.title}`;
    if (speakingId === sid) { stopSpeak(); return; }
    const anchorName = CHARACTERS.find(c => c.id === characterId)?.name || "the desk";
    speak(sid, `${anchorName} here with one from ${n.source || "the wire"}: ${n.title}.`);
  };
  // Hand one headline to the AI. Goes through askDesk so it lands in the chat
  // thread as a normal turn — streamed answer, read-aloud, retry, all included.
  const askStory = (n) => {
    if (!n?.title) return;
    askDesk(`From ${n.source || "the wire"}: "${n.title}" — what does this headline mean for ${newsFor || selected}?`);
  };

  // ---- desk video concierge: find coverage, open the theater, brief on air ----
  const findDeskVideo = useCallback(async (topic) => {
    setResp("nav", { status: "running", nav: true, links: [], videos: [], text: `Searching video coverage of ${topic}…` });
    try {
      // Preferred path: real, embeddable results straight from YouTube — no guessed IDs, no black boxes
      if (canSearchVideos) {
        const videos = await searchYouTube(topic, 3);
        if (videos.length === 0) throw new Error(`No YouTube videos found for ${topic} — try different wording`);
        setResp("nav", { status: "done", nav: true, links: [], videos, text: `Video coverage of ${topic}:` });
        const first = videos[0];
        setPlayer({ id: first.id, ...first }); // real embeddable id — plays inline
        fetchVideoBrief(first);                 // Claude writes the desk brief when an Anthropic key is set
        speak("nav", `Pulling up ${first.title} from ${first.channel}.`);
        return;
      }
      // Fallback (no YouTube key): ask Claude to suggest videos — IDs are probed before embedding
      if (!anthropicApiKey.trim()) throw new Error(t("Video search is not configured on this server, and no key is set in this browser."));
      const r = await fetch(`${getClaudeBaseUrl()}/messages`, {
        method: "POST",
        headers: getAnthropicHeaders(),
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 800,
          messages: [{
            role: "user",
            content: `Search the web for up to 2 recent, relevant YouTube videos about ${topic} (stock market / investing context). Respond with ONLY minified JSON, no fences, exactly: {"videos":[{"title":"","channel":"","url":"","brief":""}]} — title is a short paraphrase, brief is 2 sentences in your own words on what the video covers and its takeaway.`,
          }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      if (!r.ok) throw await anthropicError(r);
      const data = await r.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      const clean = text.replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), z = clean.lastIndexOf("}");
      const videos = JSON.parse(clean.slice(a, z + 1)).videos || [];
      if (videos.length === 0) throw new Error(`No video coverage found for ${topic} — try different wording`);
      setResp("nav", { status: "done", nav: true, links: [], videos, text: `Video coverage of ${topic}:` });
      const first = videos[0];
      const id = ytId(first.url);
      const valid = id ? await probeYtId(id) : false;
      // only embed a video that actually exists; otherwise open the card with a working "Watch on YouTube" link
      setPlayer(valid ? { id, ...first } : { id: null, ...first, brief: first.brief || "This exact video couldn't be embedded — use “Watch on YouTube” below to find it." });
      speak("nav", `Pulling up ${first.title} from ${first.channel}. ${first.brief || ""}`);
    } catch (e) {
      setResp("nav", { status: "error", nav: true, links: [], videos: [], text: humanizeError(e) });
    }
  }, [speak, canSearchVideos, searchYouTube]);

  // DataHub catalog questions. Honesty rule: if the catalog has no answer we say so —
  // we never let the model invent schemas, owners, or lineage.
  const runCatalogQuery = async (q, intent) => {
    const t0 = performance.now();
    setAiResponses(p => (p.nav ? { nav: p.nav } : {}));
    setResp("desk", { status: "running", text: "", ms: null, via: "DataHub", model: "catalog", tried: [] });
    const ms = () => Math.round(performance.now() - t0);
    const fail = (msg) => setResp("desk", { status: "error", text: msg, ms: ms(), via: "DataHub", tried: [] });

    const call = async (op, variables) => {
      const r = await fetch("/api/datahub/graphql", {
        method: "POST", headers: { "Content-Type": "application/json", ...authHdr },
        body: JSON.stringify({ op, variables }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    };

    try {
      const hit = firstSearchHit(await call("search", { term: intent.term }));
      if (!hit) { fail(t('DataHub has no dataset matching "{term}".').replace("{term}", intent.term)); return; }

      // DataHub's search is fuzzy — it can return a near-match even when nothing really
      // matches. Never attribute facts to a near-match without saying so: disclose it in
      // both what's shown/spoken and what's fed to the model, so the desk never implies
      // the query resolved cleanly when it didn't.
      const closeMatch = isCloseMatch(intent.term, hit.name);
      const disclosure = closeMatch ? "" : t("DataHub had no exact match. Closest dataset: {name}.").replace("{name}", hit.name) + " ";

      if (intent.kind === "search") {
        const text = disclosure + (hit.platform
          ? t("DataHub match: {name} on {platform}.").replace("{name}", hit.name).replace("{platform}", hit.platform)
          : t("DataHub match: {name}.").replace("{name}", hit.name));
        setResp("desk", { status: "done", text, ms: ms(), via: "DataHub", model: "catalog", tried: [] });
        rememberTurn(q, text);
        if (autoSpeak) speak("desk", text);
        return;
      }

      const summary = summarizeEntity(await call("entity", { urn: hit.urn }));
      // null (not []) until we actually run a lineage query — contextForLLM must never
      // report "no upstreams" for a lookup we never performed.
      let lineage = null, direction = "UPSTREAM";
      if (intent.kind === "lineage") {
        direction = /\bdownstream\b/i.test(q) ? "DOWNSTREAM" : "UPSTREAM";
        lineage = summarizeLineage(await call("lineage", { urn: hit.urn, direction }));
      }

      // The catalog may know the dataset but hold nothing for the dimension asked about.
      const missing = missingDimension(intent.kind, summary, lineage);
      // Or it may hold the schema but not the SPECIFIC column named — same honesty rule, one
      // level finer: a model handed a full schema will still invent a type for a column that
      // isn't there, so state the absence and keep the model out.
      const absentCol = (intent.kind === "schema" && !missing) ? namedAbsentColumn(q, summary) : null;
      const absence = missing === "schema" ? t("DataHub has no schema recorded for {name}.").replace("{name}", hit.name)
        : missing === "owners" ? t("DataHub has no owner recorded for {name}.").replace("{name}", hit.name)
        : missing === "lineage" ? (direction === "DOWNSTREAM"
            ? t("DataHub records no downstream datasets for {name}.") : t("DataHub records no upstream datasets for {name}.")).replace("{name}", hit.name)
        : absentCol ? t("DataHub's schema for {name} has no column named \"{col}\".").replace("{name}", hit.name).replace("{col}", absentCol)
        : "";

      // What the viewer sees is narrowed to the dimension they asked about — answering
      // "who owns this?" with the whole column list reads as a debug dump. The model, by
      // contrast, still gets every fact we hold, so narrowing can never cost it context.
      const shown = contextForLLM(summary, lineage, direction, intent.kind === "owner" ? "owner" : intent.kind);
      const everything = contextForLLM(summary, lineage, direction);

      // Each statement on its own line — the answer is read on air and shown on screen,
      // and running the headline sentence into the fact block hurts both.
      const context = [disclosure.trim(), absence, shown].filter(Boolean).join("\n");
      const fullContext = [disclosure.trim(), absence, everything].filter(Boolean).join("\n");

      if (!closeMatch || missing || absentCol) {
        // Never hand these facts to a model. The model is the component that invents the
        // missing part — re-attributing a near-match's facts to the name the user typed,
        // or filling an absent schema/owner/lineage/column with plausible fiction (llama3.2:1b
        // did both in the majority of runs when guarded only by prompt wording). Removing
        // it from this path makes that structurally impossible; the answer is built
        // deterministically from the disclosure, the absence statement, and the facts.
        setResp("desk", { status: "done", text: context, ms: ms(), via: "DataHub", model: "catalog", tried: [] });
        rememberTurn(q, context);
        if (autoSpeak) speak("desk", context);
        return;
      }

      const enabledModels = aiModels.filter(m => m.enabled);
      if (!enabledModels.length) {
        // No model to narrate with — show the facts plainly rather than nothing.
        setResp("desk", { status: "done", text: context, ms: ms(), via: "DataHub", model: "catalog", tried: [] });
        rememberTurn(q, context);
        if (autoSpeak) speak("desk", context);
        return;
      }

      const prompt = `${fullContext}\n\nAnswer this question in one complete, natural sentence using ONLY the facts above, and include every value the facts list (for example, list all owners) — never drop any or reduce the answer to a bare comma-separated list. If the facts do not contain the answer, say so plainly. Do not invent columns, owners, or datasets. Refer to the dataset only by its actual name: ${hit.name}. Do not attribute these facts to any other name.\n\nQuestion: ${q}`;
      const m = enabledModels[0];
      const askAny = (mm, pr, onTok) =>
        mm.kind === "claude" ? askClaude(mm, pr, undefined, onTok)
        : mm.kind === "ollama" ? askOllama(mm, pr, undefined, onTok)
        : mm.kind === "gemini" ? askGemini(mm, pr, undefined, onTok)
        : askOpenAICompat(mm, pr, undefined, onTok);
      // Seed the streamed answer with the disclosure so it survives into the displayed
      // text and whatever the anchor reads aloud — not just a fact buried in the prompt
      // the model might paraphrase away or drop.
      let acc = disclosure;
      setResp("desk", { status: "running", text: acc, ms: null, via: `DataHub + ${m.label}`, model: m.model, tried: [] });
      try {
        await askAny(m, prompt, (tok) => {
          acc += tok;
          setAiResponses(p => ({ ...p, desk: { ...p.desk, text: (p.desk?.text || "") + tok } }));
        });
      } catch {
        // The catalog lookup succeeded — only the narrating model failed (no API key, model
        // offline, rate limit). Blaming DataHub would be false, and dropping real facts we
        // already hold would be worse: fall back to showing them exactly as the model-free
        // paths above do. A desk with no working model still answers catalog questions.
        setResp("desk", { status: "done", text: context, ms: ms(), via: "DataHub", model: "catalog", tried: [] });
        rememberTurn(q, context);
        if (autoSpeak) speak("desk", context);
        return;
      }
      setResp("desk", { status: "done", text: acc, ms: ms(), via: `DataHub + ${m.label}`, model: m.model, tried: [] });
      if (acc) rememberTurn(q, acc);
      if (autoSpeak && acc) speak("desk", acc);
    } catch (e) {
      fail(t("DataHub lookup failed: {reason}").replace("{reason}", humanizeError(e)));
    }
  };

  // Stopping an answer in flight. The fan-out below already builds an
  // AbortController per model attempt; this holds the live one so the user can
  // reach it, and the cancel flag stops the loop from politely cascading to the
  // next model — which is the opposite of what "stop" means.
  const askAbortRef = useRef(null);
  const askCancelRef = useRef(false);
  const stopAsk = useCallback(() => {
    askCancelRef.current = true;
    try { askAbortRef.current?.abort(); } catch { /* already settled */ }
    stopSpeak();
  }, [stopSpeak]);

  // The export pipeline reports through `exportMsg`, which rendered in a strip
  // below the chat — detached from the request that caused it. Mirror its
  // terminal states into the thread so "make a powerpoint" is answered where it
  // was asked. Only ✓/✗ are mirrored; the interim "Building…" lines would add a
  // bubble per progress update.
  const lastExportRef = useRef("");
  useEffect(() => {
    if (!exportMsg || !/^[✓✗]/.test(exportMsg)) return;
    if (lastExportRef.current === exportMsg) return;
    lastExportRef.current = exportMsg;
    deskReply(exportMsg);
  }, [exportMsg, deskReply]);

  const askDesk = (override) => {
    const q = (typeof override === "string" ? override : aiQuestion).trim();
    if (!q) return;
    setLastAsked(q);
    setAiQuestion("");

    // Open a new turn in the transcript. Bumping the counter first means any
    // response this question produces lands in its own bubble rather than
    // overwriting the previous answer.
    chatTurnRef.current += 1;
    setChatThread(t => [...t, { id: `u${chatTurnRef.current}`, role: "user", text: q }]);
    askCancelRef.current = false;   // a new question clears any previous stop
    stopSpeak();
    // Prime browser TTS INSIDE this click/Enter gesture: speaking a silent utterance now grants the
    // user-activation the later streamed sentences need, since those fire after the network response.
    if (voiceEngine === "browser" && window.speechSynthesis) {
      try {
        window.speechSynthesis.resume();
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      } catch { /* ignore */ }
    }

    // "What is Vantage?" is answered by the product, not by a model — see
    // VANTAGE_ABOUT for why.
    if (/\b(what|what's|whats|tell me about|explain)\b.{0,26}\b(vantage|this (app|application|platform|tool|site|thing)|am i (looking at|using))\b/i.test(q) || /^\s*(about|what is this)\s*\??\s*$/i.test(q)) {
      pushDeskAnswer(VANTAGE_ABOUT);
      return; // desk-handled — no model fan-out
    }

    // "hi" / "good morning": greet back, then point at what's on the desk.
    if (/^\s*(?:hi|hey|hello|hiya|howdy|yo|sup|good\s+(?:morning|afternoon|evening))(?:\s+(?:there|desk|vantage|anchor|\w+))?\s*[!,.?]*$/i.test(q)) {
      pushDeskAnswer(anchorGreeting({
        name: CHARACTERS.find(c => c.id === characterId)?.name,
        open: (() => { const { day, mins } = etNow(); return day >= 1 && day <= 5 && mins >= 570 && mins < 960; })(),
        hour: new Date().getHours(),
        sym: selected,
        said: (/\b(morning|afternoon|evening)\b/i.exec(q) || [])[1] || null,
      }));
      return; // desk-handled — no model fan-out
    }

    // "How's your day?" — the anchor answers in character, from the real session.
    if (/^\s*how(?:'s|s)?\s*(?:is|was|are|'re|re)?\s*(?:your|ur|the)?\s*(?:day|morning|afternoon|evening|shift|session)\b/i.test(q) || /\bhow\s+(?:are|r)\s+(?:you|u)(?:\s+(?:feeling|doing|holding\s+up|today|tonight))?\s*[?!.]*$/i.test(q) || /\bhow(?:'s|s)?\s+(?:is\s+)?it\s+going\b|\bhow\s+goes\s+it\b|\bhow\s+you\s+(?:feeling|doing)\b/i.test(q)) {
      const row = getRow(selected);
      pushDeskAnswer(anchorDayLine({
        name: CHARACTERS.find(c => c.id === characterId)?.name,
        open: (() => { const { day, mins } = etNow(); return day >= 1 && day <= 5 && mins >= 570 && mins < 960; })(),
        sym: selected,
        chgPct: row?.chgPct ?? null,
      }));
      return; // desk-handled — no model fan-out
    }

    // export intent runs first: "download excel", "make a powerpoint", "write a report and export ppt"
    const ex = matchExport(q);
    if (ex) {
      deskReply(ex.wantReport
        ? `Writing the analyst report, then exporting it as ${(ex.fmt || "docx").toUpperCase()}. The preview opens when it's ready.`
        : `Opening the ${(ex.fmt || "docx").toUpperCase()} export preview — review it there, then download.`);
      runExportCmd(ex); return; // desk-handled — build the file, no model fan-out
    }

    // DataHub catalog intent: schema / owners / lineage questions answered from the live catalog
    const dhIntent = detectCatalogIntent(q);
    if (dhIntent) { runCatalogQuery(q, dhIntent); return; } // desk-handled — no market model fan-out

    // Games: "play a game", "games" → the menu; "teach me / tutorial / how do stocks work" → straight to Stock School
    if (/\b(games?|play (a )?game|arcade|game room)\b/i.test(q)) {
      openGames();
      deskReply("🎮 Game room is open — pick a game and I'll host it from the desk.");
      return;
    }
    if (/\b(stock school|teach me|tutorial|how (do|does) stocks?|learn (how|to invest|stocks|the basics))\b/i.test(q)) {
      setGameOn(true); startMode("school");
      deskReply("🎓 Starting Stock School. I'll walk you through the basics on the desk — ask me anything mid-lesson.");
      return; // desk-handled — the anchor takes over teaching
    }

    // anchor cue: "ring the bell", "eat lunch", "take a break" — the anchor performs it on the desk
    const cueReq = matchAnchorCue(q);
    if (cueReq) {
      triggerAnchor(cueReq.type, cueReq);
      const cueLine =
        cueReq.type === "bell" ? `🔔 ${cueReq.label === "CLOSING BELL" ? "Closing" : "Opening"} bell!` :
        cueReq.type === "break" ? "☕ Anchor is taking a quick break." :
        `🍽 Anchor is having ${cueReq.meal}.`;
      setCmdMsg(cueLine);
      deskReply(cueLine);
      return; // desk-handled — no model fan-out
    }

    // full chart intent: "open the chart", "tradingview NVDA", "pull up the chart" → in-app TradingView
    if (/\b(trading\s?view|full chart|advanced chart|open (the )?chart|pull up (the )?chart|chart it)\b/i.test(q)) {
      const dollar = q.match(/\$([A-Za-z]{1,5})\b/);
      const caps = (q.match(/\b[A-Z]{1,5}\b/g) || []).find(c => c.length >= 2 && !CAPS_STOP.has(c));
      const aliased = aliasFromText(q);
      const chartSym = dollar ? resolveSym(dollar[1]) : aliased || (caps ? resolveSym(caps) : selected);
      openChart(chartSym);
      deskReply(`📈 Opened the full ${chartSym} chart.`);
      return; // desk-handled
    }

    // video intent runs next: "show me a video about NVDA", "watch youtube coverage of tesla"
    if (/\b(video|videos|youtube|clip|watch)\b/i.test(q)) {
      let topic = `${selected} stock`;
      const dollar = q.match(/\$([A-Za-z]{1,5})\b/);
      const caps = q.match(/\b[A-Z]{1,5}\b/g) || [];
      const known = caps.find(c => demoMkt[c] || watchlist.includes(c));
      const plausible = caps.find(c => c.length >= 2 && !CAPS_STOP.has(c));
      const aliased = aliasFromText(q);
      if (dollar) topic = `${resolveSym(dollar[1])} stock`;
      else if (aliased) topic = `${aliased} stock`;
      else if (known) topic = `${resolveSym(known)} stock`;
      else if (plausible) topic = `${resolveSym(plausible)} stock`;
      else {
        const residualTopic = q
          .replace(/\b(show me|find|pull up|open|play|watch|a|an|the|some|video|videos|youtube|clip|about|on|of|for|please|can you)\b/gi, " ")
          .replace(/\s+/g, " ").trim();
        if (residualTopic.length > 2) topic = residualTopic;
      }
      findDeskVideo(topic);
      return; // video lookups are desk-handled — no model fan-out needed
    }

    // market-events intent: "earnings this week", "market events", "when does NVDA report"
    if (/\b(market events|earnings (this week|next week|calendar|dates?|schedule|coming up|ahead)|economic calendar|earnings on my)\b/i.test(q) || /\bwhen (does|do|is|are)\b[^?]*\b(report|earnings)\b/i.test(q)) {
      fetchMarketEvents();
      return; // desk-handled
    }

    // portfolio intent: "brief my portfolio", "how are my positions", "my holdings"
    if (/\b(my )?(portfolio|positions|holdings)\b/i.test(q) || /how('?s| is| are) my (portfolio|positions|holdings|investments)\b/i.test(q)) {
      briefPortfolio();
      deskReply(positions.length
        ? `💼 Your portfolio is on the desk — ${positions.length} position${positions.length === 1 ? "" : "s"}, ${portTotals.pnl >= 0 ? "up" : "down"} ${fmt(Math.abs(portTotals.pnl))} (${portTotals.pnlPct >= 0 ? "+" : ""}${portTotals.pnlPct.toFixed(2)}%).`
        : "💼 Your portfolio is empty — add a symbol, share count and cost below and I'll track it from then on.");
      return; // desk-handled
    }

    // price-alert intent: "alert me when NVDA hits 150", "notify me if TSLA drops below 200"
    const alertReq = parseAlertIntent(q);
    if (alertReq) { addPriceAlert(alertReq); return; }

    // calendar intent: "open my calendar", "what's on my schedule", "do i have any events"
    if (/\b(open|show|pull up|check|view|bring up)?\s*(my )?(calendar|agenda)\b/i.test(q)
      || /\bmy schedule\b/i.test(q)
      || /what('?s| is| do i have)\b[^?]*\b(calendar|schedule|agenda|coming up|going on today|planned)\b/i.test(q)
      || /\bdo i have (any )?(events?|meetings?|plans|appointments?)\b/i.test(q)) {
      openCalendar();
      deskReply("▦ Your calendar is open on the desk — I've read out what's coming up.");
      return; // desk-handled
    }

    // catalog pass: browse a service library in-app (TMDB) or public-domain films (archive.org, in-desk)
    const cat = parseCatalogIntent(q);
    if (cat) {
      if (cat.archive) browseArchive(cat.query);
      else if (cat.popular) browsePopular(cat.kind);
      else browseCatalog(cat.svc, cat.kind);
      deskReply(
        cat.archive ? `🎞 Searching the public-domain archive for "${cat.query}" — results appear on the desk.`
        : cat.popular ? `🍿 Pulling this week's trending ${cat.kind === "tv" ? "shows" : "movies"}.`
        : `🍿 Browsing ${cat.svc?.name || "the catalog"} — ${cat.kind === "tv" ? "shows" : "movies"} on the desk.`);
      return; // desk-handled
    }

    // streaming pass: launch Netflix / Disney+ / Hulu (they block embedding, so → new tab)
    const stream = parseStreamIntent(q);
    if (stream) {
      const href = stream.title ? stream.svc.search(stream.title) : stream.svc.home;
      const links = stream.title
        ? [{ name: `${stream.svc.name} · "${stream.title}"`, href }, { name: `${stream.svc.name} home`, href: stream.svc.home }]
        : [{ name: stream.svc.name, href }];
      const what = stream.title ? `“${stream.title}” on ${stream.svc.name}` : stream.svc.name;
      setResp("nav", { status: "done", nav: true, stream: true, links, text: `${what} opened in a new tab — ${stream.svc.name} blocks in-app embedding (like most streaming sites), so it plays in your browser.` });
      speak("nav", stream.title ? `Opening ${stream.title} on ${stream.svc.name}.` : `Opening ${stream.svc.name}.`);
      openEmbed(href, stream.svc.name);
      return; // desk-handled — no model fan-out
    }

    // navigator pass runs next — still inside the click/Enter gesture so window.open is allowed
    const nav = parseNavIntent(q);
    if (nav) {
      if (nav.sym !== selected) {
        if (!live && !demoMkt[nav.sym]) ensureDemoSymbol(nav.sym);
        setSelected(nav.sym);
        if (!watchlist.includes(nav.sym)) setWatchlist(w => [...w, nav.sym]);
      }
      if (nav.inApp) {
        setResp("nav", { status: "done", nav: true, links: [], text: `Pulled up ${nav.sym} on the dashboard.` });
        speak("nav", `Pulled up ${nav.sym} on the dashboard.`);
      } else {
        const links = nav.brokers.map(b => ({ name: b.name, href: b.url(nav.sym) }));
        setResp("nav", { status: "done", nav: true, links, text: `${nav.brokers[0].name} for ${nav.sym} opened in a new tab (brokers block embedding). To stay inside Vantage, use the 📈 chart button below.` });
        speak("nav", `Pulling up ${nav.brokers[0].name} for ${nav.sym}.`);
        openEmbed(links[0].href, `${nav.brokers[0].name} · ${nav.sym}`); // brokers route to a tab; embeddable sites open in-panel
      }
      completeMission("nav");
      if (nav.navOnly) return; // pure navigation — no need to burn model calls
    } else {
      setAiResponses(p => { const { nav: _, ...rest } = p; return rest; });
    }

    const prompt = buildPrompt(q);
    // plan-gated: the AI desk needs Pro Desk. Treat all models as disabled below the required plan.
    if (!planAllows("ai")) {
      const line = `AI desk answers are a ${planFor("ai")} feature — upgrade in settings → ACCOUNT. Everything else I do (charts, exports, navigation, your calendar) works on any plan.`;
      setCmdMsg(line); deskReply(line); return;
    }
    const enabled = aiModels.filter(m => m.enabled);
    // The user's own configured models take precedence. Only fall back to Vantage's hosted Gemini
    // when a signed-in (backend) user hasn't enabled a usable model of their own — otherwise a local
    // Ollama / LM Studio model (or a keyed cloud model) would be silently bypassed by the hosted desk.
    // The hosted route also has to EXIST (status.hosted): without that gate, a signed-in user whose
    // /api/status hadn't answered yet was sent to an unconfigured Vertex route and shown its error.
    const hasOwnModel = enabled.some(m => isLocalModel(m)
      || (m.id === "openrouter" && !!meetStatus?.ai?.configured) || (m.id === "gemini" && !!meetStatus?.gemini?.configured)
      || (m.apiKey || "").trim() || (m.kind === "claude" && anthropicApiKey.trim()));
    const hostedAi = !!(account?.backend && account?.token) && !hasOwnModel && !!meetStatus?.hosted?.configured;
    if (hostedAi) {
      completeMission("ask");
      setAiResponses(p => (p.nav ? { nav: p.nav } : {}));
      const t0 = performance.now();
      setResp("desk", { status: "running", text: "", ms: null, via: "Vantage hosted AI", model: "Gemini on Vertex AI", tried: [] });
      const hostedCtrl = new AbortController();
      askAbortRef.current = hostedCtrl;
      fetch("/api/ai/brief", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.token}` },
        body: JSON.stringify({ prompt }), signal: hostedCtrl.signal,
      }).then(async r => {
        const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setResp("desk", { status: "done", text: j.text, ms: Math.round(performance.now() - t0), via: "Vantage hosted AI", model: j.model || "Gemini", tried: [] });
        if (j.text) rememberTurn(q, j.text);
        if (autoSpeak && j.text) speak("desk", j.text);
      }).catch(e => {
        // A user-initiated stop is not a failure, and showing it as a red error
        // bubble would be the app blaming itself for doing what it was told.
        if (askCancelRef.current) {
          setResp("desk", { status: "done", stopped: true, ms: Math.round(performance.now() - t0), via: "Vantage hosted AI", tried: [] });
          return;
        }
        setResp("desk", { status: "error", text: humanizeError(e), ms: Math.round(performance.now() - t0), via: "Vantage hosted AI", tried: [] });
      });
      return;
    }
    if (enabled.length === 0) {
      const line = t("This server has no model key configured yet, so the desk can't answer. Everything else works.");
      setCmdMsg(line); deskReply(line); return;
    }
    completeMission("ask");

    // ONE answer box: try enabled models in order; the first that answers wins. If one errors
    // (Claude 401/credits, a dead local server…), it cascades to the next enabled model automatically.
    setAiResponses(p => (p.nav ? { nav: p.nav } : {})); // clear old answers; keep the navigator card
    // multi-turn: pass the remembered conversation (plain questions/answers, not snapshot-wrapped
    // prompts, so context stays small) — follow-ups like "and its risks?" resolve correctly
    const history = deskMemoryRef.current.slice(-DESK_MEMORY_MAX);
    const dispatch = (m, sig, onToken) =>
      m.kind === "claude" ? askClaude(m, prompt, sig, onToken, history)
      : m.kind === "ollama" ? askOllama(m, prompt, sig, onToken, history)
      : m.kind === "gemini" ? askGemini(m, prompt, sig, onToken, history)
      : askOpenAICompat(m, prompt, sig, onToken, history);
    const streamVoice = autoSpeak && voiceEngine === "browser" && !!window.speechSynthesis;
    const friendly = (m, e) => {
      let msg = humanizeError(e);
      if (e.name === "AbortError") return "timed out";
      if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
        return m.kind === "ollama" ? `can't reach Ollama — restart it with: OLLAMA_ORIGINS=${PAGE_ORIGIN} ollama serve (or *)`
          : (m.kind === "openai" && !m.needsKey) ? "local server unreachable (CORS?)"
          : "network error";
      }
      return humanizeError(msg);
    };

    (async () => {
      const t0 = performance.now();
      const errors = [];
      for (const m of enabled) {
        if (askCancelRef.current) break;   // stopped between models — do not start another
        const ctrl = new AbortController();
        askAbortRef.current = ctrl;        // the one the stop button reaches
        const timeout = setTimeout(() => ctrl.abort(), 60000);
        let acc = "", voiceOn = false;
        setResp("desk", { status: "running", text: "", ms: null, via: m.label, model: m.model, tried: errors.slice() });
        const onToken = (tok) => {
          acc += tok;
          if (streamVoice && !voiceOn) { beginStreamSpeak("desk"); voiceOn = true; }
          setAiResponses(p => ({ ...p, desk: { ...p.desk, text: (p.desk?.text || "") + tok } }));
          if (voiceOn) feedStreamSpeak(acc);
        };
        try {
          await dispatch(m, ctrl.signal, onToken);
          clearTimeout(timeout);
          if (!acc.trim()) throw new Error("empty response");
          setResp("desk", { status: "done", ms: Math.round(performance.now() - t0), via: m.label, model: m.model, tried: errors.slice() });
          rememberTurn(q, acc); // local multi-turn memory — next question sees this exchange
          if (autoSpeak && acc) { if (voiceOn) endStreamSpeak(acc); else speak("desk", acc); }
          return; // first success wins — one box, done
        } catch (e) {
          clearTimeout(timeout);
          if (voiceOn) stopSpeak();
          // Cancelling aborts the same signal a timeout would, so the abort has
          // to be attributed before it is treated as this model failing —
          // otherwise "stop" cascades to the next model, which is the one thing
          // a stop button must never do.
          if (askCancelRef.current) {
            setResp("desk", {
              status: "done", stopped: true, ms: Math.round(performance.now() - t0),
              via: m.label, model: m.model, tried: errors.slice(),
              ...(acc.trim() ? {} : { text: "Stopped before an answer came back." }),
            });
            return;
          }
          errors.push(`${m.label}: ${friendly(m, e)}`);
          setResp("desk", { status: "running", text: "", ms: null, via: null, tried: errors.slice() }); // reset for the next model
        }
      }
      if (askCancelRef.current) return;
      setResp("desk", { status: "error", ms: Math.round(performance.now() - t0), text: `All models failed — ${errors.join(" · ")}`, tried: errors.slice() });
    })();
  };

  // press-to-talk: start/stop speech recognition; the final transcript runs as a desk command
  const toggleVoice = () => {
    if (!voiceSupported) { setCmdMsg("Voice input isn't supported in this browser — try Chrome or Edge."); return; }
    if (listening) { try { recognitionRef.current?.stop(); } catch { /* already stopped */ } return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onstart = () => { setListening(true); setCmdMsg("🎙 Listening…"); };
    rec.onend = () => { setListening(false); setCmdMsg(m => (m === "🎙 Listening…" ? "" : m)); };
    rec.onerror = (e) => { setListening(false); setCmdMsg(e.error === "not-allowed" ? "🎙 Mic blocked — allow microphone access." : ""); };
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setAiQuestion(txt);
      if (e.results[e.results.length - 1].isFinal) {
        const cmd = txt.trim();
        try { rec.stop(); } catch { /* ok */ }
        if (cmd) setTimeout(() => askDesk(cmd), 60);
      }
    };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setListening(false); }
  };

  const updateModel = (id, patch) =>
    setAiModels(ms => ms.map(m => (m.id === id ? { ...m, ...patch } : m)));

  // a local model to fall back to when a cloud model fails: Ollama or LM Studio (no key, runs on localhost)
  const pickLocalModel = () =>
    aiModels.find(m => m.enabled && isLocalModel(m)) || aiModels.find(isLocalModel) || null;

  // run a prompt against a given local model, routing to the right adapter
  const runLocalModel = (lm, prompt, signal, onToken) =>
    lm.kind === "ollama" ? askOllama(lm, prompt, signal, onToken) : askOpenAICompat(lm, prompt, signal, onToken);

  // ---- model selection: one at a time by default, but several can work together if enabled ----
  // soloModel = "use only this one"; the Settings checkboxes add/remove models for working together.
  const soloModel = (id) => setAiModels(ms => ms.map(m => ({ ...m, enabled: m.id === id })));
  const enabledCount = aiModels.filter(m => m.enabled).length;

  const chgDir = selectedRow?.chg > 0 ? "up" : selectedRow?.chg < 0 ? "down" : "flat";
  const accent = selectedRow?.chg == null ? C.accent : prefDirColor(selectedRow?.chg > 0 ? "up" : "down");

  // ---- ticker tape items (doubled for seamless loop) ----
  const tapeRows = watchlist.map(getRow).filter(Boolean);
  const tape = [...tapeRows, ...tapeRows];


  // ============================================================
  //  App shell wiring — navigation sections, header clock and market status.
  //  The shell itself (src/ui/AppShell.jsx) is presentational; everything it
  //  needs to render is derived here, where the dashboard's state already lives.
  // ============================================================

  // Clock shows the user's chosen timezone; OPEN/CLOSED always tracks NYSE
  // (Eastern) hours regardless of what the clock is set to.
  const shellClock = useMemo(
    () => new Intl.DateTimeFormat("en-US", { timeZone: clockTz, hour: "2-digit", minute: "2-digit", hour12: true }).format(clockNow),
    [clockNow, clockTz],
  );
  const marketOpen = useMemo(() => {
    const { day, mins } = etNow();
    return day >= 1 && day <= 5 && mins >= 570 && mins < 960;   // 9:30–16:00 ET, weekdays
  }, [clockNow]);

  // The destinations the primary nav offers. `panel` names the panel that must be
  // switched on before scrolling, so navigating to a hidden section reveals it
  // rather than silently doing nothing.
  const NAV_SECTIONS = useMemo(() => [
    // Labels go through t(); `keywords` stay English on purpose — they are
    // palette search terms, not display text.
    { id: "desk", label: t("Desk"), icon: "◈", anchor: "sec-desk", keywords: ["ai", "anchor", "broadcast", "assistant", "chat"] },
    { id: "watchlist", label: t("Markets"), icon: "▤", anchor: "sec-watchlist", panel: "watchlist", keywords: ["chart", "symbols", "quotes", "tape"] },
    { id: "news", label: t("News"), icon: "▧", anchor: "sec-news", panel: "news", keywords: ["headlines", "video", "coverage", "stories"] },
    { id: "portfolio", label: t("Portfolio"), icon: "◧", anchor: "sec-portfolio", panel: "portfolio", keywords: ["positions", "holdings", "pnl", "gains"] },
    { id: "calendar", label: t("Calendar"), icon: "▦", anchor: "app-calendar-panel", panel: "calendar", keywords: ["events", "earnings", "schedule"] },
  ], [t]);

  const [activeSection, setActiveSection] = useState("desk");

  // While a click-driven smooth scroll is travelling it crosses every section in
  // between, and the scroll-spy below would flicker the nav through each one. This
  // suppresses the spy until the animation settles.
  const spyLockRef = useRef(0);
  // A clicked destination stays selected until the user genuinely scrolls away
  // from where the navigation landed. The time lock above only covers the
  // travel; without the pin, the spy re-labels the click the moment the scroll
  // settles wherever its own rule disagrees with the clicked section — which
  // happens whenever two sections start at nearly the same offset.
  const spyPinRef = useRef(null);

  // A click-driven navigation is pushed into history, so Back walks the sections
  // you visited. Silent navigations (deep-link arrival, popstate) skip the push —
  // the URL is already correct, and pushing again would corrupt the history the
  // user is trying to traverse.
  const navigateSection = useCallback((section, opts = {}) => {
    if (!section) return;
    setActiveSection(section.id);
    spyLockRef.current = Date.now() + 900;
    if (!opts.silent && window.location.hash !== `#${section.id}`) {
      try { window.history.pushState(null, "", `#${section.id}`); } catch { /* sandboxed iframe */ }
    }
    // Reveal the panel first if it is toggled off, then scroll. The scroll is
    // deferred a frame so the element exists by the time we look for it.
    if (section.panel) setPanels(p => (p[section.panel] ? p : { ...p, [section.panel]: true }));
    requestAnimationFrame(() => {
      const el = document.getElementById(section.anchor);
      if (!el) return;
      // ~72px is where scroll-margin puts a section top once it lands under the
      // sticky header; precision doesn't matter, the pin has 150px of slack.
      spyPinRef.current = { id: section.id, y: el.getBoundingClientRect().top + window.scrollY - 72 };
      el.scrollIntoView({ behavior: opts.instant ? "auto" : "smooth", block: "start" });
      // Arrival is asserted for ~2s, not checked once: the dashboard keeps
      // growing for a moment after mount as data seeds panels, which moves the
      // target, aborts in-flight smooth scrolls, and lets the scroll-spy
      // mislabel the hash mid-settle. Each tick either confirms we're there or
      // finishes the trip instantly. The loop halts the moment the pin is gone —
      // the spy clears it when the user genuinely scrolls away, so a user who
      // changes their mind is never yanked back. The last tick restores the
      // hash if the spy overwrote it while the layout was still moving.
      let settleChecks = 0;
      const settle = window.setInterval(() => {
        settleChecks += 1;
        const pin = spyPinRef.current;
        const el2 = document.getElementById(section.anchor);
        if (!pin || pin.id !== section.id || !el2) { window.clearInterval(settle); return; }
        if (Math.abs(el2.getBoundingClientRect().top - 72) > 160) {
          el2.scrollIntoView({ block: "start" });
          spyPinRef.current = { id: section.id, y: window.scrollY };
        }
        if (settleChecks >= 4) {
          window.clearInterval(settle);
          setActiveSection(section.id);
          const want = `#${section.id}`;
          if (window.location.hash !== want) {
            try { window.history.replaceState(window.history.state, "", want); } catch { /* sandboxed iframe */ }
          }
        }
      }, 500);
    });
  }, []);

  // ---- URL ↔ section sync ----
  // #news, #portfolio… deep-link into the dashboard: a reload lands back in the
  // section it left, a copied link opens on the right section for whoever gets
  // it, and Back/Forward move between sections. The hash carries section ids
  // ("news"), never element ids ("sec-news") — that gap is what stops the
  // browser's native jump-to-anchor from firing before the panel-reveal logic
  // has run, which matters when the target panel is currently toggled off.
  useEffect(() => {
    const byHash = () => {
      const id = window.location.hash.slice(1);
      // An empty hash is the launch URL — that means the first section. An
      // unknown hash (e.g. the #vantage-main skip-link target) is not ours.
      return id ? NAV_SECTIONS.find(sec => sec.id === id) : NAV_SECTIONS[0];
    };
    // The browser's own scroll restoration would race the scroll below on every
    // Back/Forward, with the two landing in different places. History moves are
    // owned here for as long as the dashboard is mounted.
    const prevRestoration = window.history.scrollRestoration;
    try { window.history.scrollRestoration = "manual"; } catch { /* older browsers */ }
    if (window.location.hash.length > 1) {
      const sec = byHash();
      if (sec) navigateSection(sec, { silent: true, instant: true });
    }
    const onPop = () => {
      const sec = byHash();
      if (sec) navigateSection(sec, { silent: true, instant: true });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      try { window.history.scrollRestoration = prevRestoration || "auto"; } catch { /* older browsers */ }
    };
  }, [NAV_SECTIONS, navigateSection]);

  // ---- scroll-spy ----
  // Without this the nav only ever tells the truth immediately after a click: scroll
  // by hand and it keeps claiming you are wherever you last clicked. An
  // IntersectionObserver is the right tool — a scroll listener would run on every
  // frame of every scroll, which is exactly what this app does not need.
  useEffect(() => {
    const select = (id) => {
      setActiveSection(prev => (prev === id ? prev : id));
      // replaceState, not pushState: hand-scrolling across five sections must
      // not cost five Back presses. The launch URL stays bare until you leave
      // the first section, so nobody acquires a hash just by opening the app.
      const want = `#${id}`;
      if (window.location.hash !== want && !(id === NAV_SECTIONS[0].id && !window.location.hash)) {
        try { window.history.replaceState(window.history.state, "", want); } catch { /* sandboxed iframe */ }
      }
    };

    // Once the page can scroll no further, the trailing sections can never reach
    // the observation band, so "topmost visible" stops being the right answer and
    // "last one actually on screen" becomes it.
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    const selectTrailing = () => {
      for (let i = NAV_SECTIONS.length - 1; i >= 0; i--) {
        const el = document.getElementById(NAV_SECTIONS[i].anchor);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { select(NAV_SECTIONS[i].id); return; }
      }
    };

    const io = new IntersectionObserver(() => {
      if (Date.now() < spyLockRef.current) return;         // a programmatic scroll is in flight
      const pin = spyPinRef.current;
      if (pin) {
        if (Math.abs(window.scrollY - pin.y) < 150) return;   // still where the click landed
        spyPinRef.current = null;                              // the user has moved on — resume tracking
      }
      // The bottom rule has to be checked here too, not only in the scroll handler:
      // the observer callback lands *after* that handler and would otherwise
      // overwrite its answer a moment later.
      if (atBottom()) { selectTrailing(); return; }
      // You are "in" the last section whose top has passed the reading line just
      // under the sticky header. Computed from live rects rather than the
      // observer's entries: entries only report what crossed the band, and a tall
      // section stays "intersecting" for its entire height — the old
      // "topmost visible" rule sat on Desk for a thousand pixels of scroll
      // because of exactly that. The observer's job is reduced to saying WHEN to
      // re-measure; five getBoundingClientRect calls per crossing is nothing.
      const LINE = 140;
      let winner = null;
      for (const sec of NAV_SECTIONS) {
        const el = document.getElementById(sec.anchor);
        if (el && el.getBoundingClientRect().top <= LINE) winner = sec;   // later tops overwrite: last one past the line wins
      }
      select((winner || NAV_SECTIONS[0]).id);
    }, {
      // A thin band around the reading line, not the old top-40% slab: section
      // edges crossing this neighbourhood are the only moments the answer above
      // can change, so they are the only moments worth a callback.
      rootMargin: "-70px 0px -78% 0px",
      threshold: 0,
    });

    // Observation is re-checked on a slow tick rather than captured once: five
    // getElementById calls every 1.5s is free, and it means a section that
    // mounts late — or is re-created by React — is picked up instead of the
    // spy silently watching detached nodes for the rest of the session.
    const observed = new Set();
    const observeAll = () => {
      for (const sec of NAV_SECTIONS) {
        const el = document.getElementById(sec.anchor);
        if (el && !observed.has(el)) { observed.add(el); io.observe(el); }
      }
    };
    observeAll();
    const heal = window.setInterval(observeAll, 1500);

    // Passive listener that does nothing at all until the very end of the page,
    // where it hands the last visible section to the nav.
    const onScroll = () => {
      if (Date.now() < spyLockRef.current) return;
      if (atBottom()) selectTrailing();
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => { io.disconnect(); window.clearInterval(heal); window.removeEventListener("scroll", onScroll); };
    // `panels` is a dependency because toggling one adds or removes an anchor
    // (the healer would also catch it, a re-run just catches it sooner).
  }, [NAV_SECTIONS, panels]);

  // ---- Escape ----
  // Escape only. There are no hotkeys: this ships on mobile and the web, where
  // a keys-to-learn layer is undiscoverable and mostly unreachable.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Ordered by what the user actually sees on top (z-index), not by hand:
      // tour 70 > setup 61 > export/embed/tutorial 60 > missions 55 >
      // settings 51. Exactly one surface closes per press.
      const stack = [
        [tourMode, endSpotlight],
        [setupOpen, () => setSetupOpen(false)],
        [exportDraft, () => setExportDraft(null)],
        [embed, () => setEmbed(null)],
        [showTutorial, () => setShowTutorial(false)],
        [missionsOpen, () => setMissionsOpen(false)],
        [showSettings, () => setShowSettings(false)],
      ];
      stack.find(([open]) => open)?.[1]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourMode, endSpotlight, exportDraft, setupOpen, showSettings, missionsOpen, embed, showTutorial]);

  // Extra palette entries beyond the nav destinations, which AppShell adds itself.
  const shellCommands = useMemo(() => [
    { id: "cmd:settings", label: "Open settings", icon: "⚙", group: "Action", keywords: ["keys", "api", "preferences", "config"], run: () => { setSettingsTab("quick"); setShowSettings(true); } },
    { id: "cmd:account", label: "Account & plan", icon: "◆", group: "Action", keywords: ["billing", "subscription", "upgrade"], run: () => { setSettingsTab("account"); setShowSettings(true); } },
    { id: "cmd:news", label: `Load news for ${selected}`, icon: "📰", group: "Action", keywords: ["headlines", "search"], run: () => { setPanels(p => ({ ...p, news: true })); fetchNews(); } },
    { id: "cmd:export-xlsx", label: "Export to Excel", icon: "📊", group: "Export", keywords: ["xlsx", "spreadsheet", "download"], run: () => openExportPreview("xlsx") },
    { id: "cmd:export-docx", label: "Export to Word", icon: "📄", group: "Export", keywords: ["docx", "document", "download"], run: () => openExportPreview("docx") },
    { id: "cmd:export-pptx", label: "Export to PowerPoint", icon: "📽", group: "Export", keywords: ["pptx", "slides", "deck", "download"], run: () => openExportPreview("pptx") },
    ...[["tape", "ticker tape"], ["watchlist", "watchlist"], ["movers", "top movers"], ["news", "news & video"], ["calendar", "calendar"], ["portfolio", "portfolio"], ["pnf", "P&F signals"]].map(([k, name]) => ({
      id: `panel:${k}`,
      label: `${panels[k] ? "Hide" : "Show"} ${name}`,
      icon: panels[k] ? "◻" : "◼",
      group: "Panel",
      keywords: ["panel", "toggle", "layout", "show", "hide"],
      run: () => setPanels(p => ({ ...p, [k]: !p[k] })),
    })),
    // Every watchlist symbol is reachable by name from the palette.
    ...watchlist.map(sym => ({
      id: `sym:${sym}`, label: sym, icon: "▲", group: "Symbol",
      keywords: ["chart", "quote", "stock"],
      run: () => { setSelected(sym); navigateSection(NAV_SECTIONS[1]); },
    })),
  ], [selected, watchlist, panels, fetchNews, openExportPreview, navigateSection, NAV_SECTIONS]);

  // ---- the streaming catalog, as a chat attachment ----
  // Browsing Netflix is something the desk was ASKED to do, so the shelf of
  // posters is that request's answer. It used to render in the results box
  // above the conversation, which left the question in one place and the
  // thing it produced in another. It rides the transcript now.
  const catalogPanel = catalog && (
    <div style={{ display: "flex", flexDirection: "column", background: C.surface, border: `1px solid ${C.edge}`, borderRadius: R.lg, overflow: "hidden" }}>
      <div style={{ minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}`, ...TYPE.eyebrow, color: C.muted, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <span>🎬 {catalog.archive ? "FREE FILMS · Internet Archive" : `${catalog.popular ? "🔥 POPULAR" : catalog.service?.name?.toUpperCase()} · ${catalog.kind === "tv" ? "SHOWS" : "MOVIES"}`}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!catalog.archive && (
            <>
              {["movie", "tv"].map(k => (
                <button key={k} onClick={() => catalog.popular ? browsePopular(k) : browseCatalog(catalog.service, k)}
                  style={{ background: catalog.kind === k ? "rgba(255,255,255,0.08)" : "transparent", border: `1px solid ${catalog.kind === k ? C.accent : C.panelEdge}`, color: catalog.kind === k ? C.accentText : C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>
                  {k === "tv" ? "shows" : "movies"}
                </button>
              ))}
            </>
          )}
          <button onClick={() => { setCatalog(null); setCatalogPick(null); }} aria-label="Close catalog" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
        </span>
      </div>
      {catalog.loading ? (
        <div style={{ padding: 12, fontFamily: MONO, fontSize: 12, color: C.faint }}>Loading catalog… <span className="cursor">▍</span></div>
      ) : catalog.error ? (
        <div style={{ padding: 12, fontFamily: SANS, fontSize: 11, color: C.down, lineHeight: 1.6 }}>{catalog.error}</div>
      ) : catalog.items.length === 0 ? (
        <div style={{ padding: 12, fontFamily: MONO, fontSize: 12, color: C.faint }}>Nothing found. Try another search.</div>
      ) : (
        <>
          {/* summary panel for the picked title */}
          {catalogPick && !catalog.archive && (
            <div style={{ display: "flex", gap: 10, padding: 12, borderBottom: `1px solid ${C.panelEdge}`, background: "#161718" }}>
              {catalogPick.poster && <img src={catalogPick.poster} alt="" style={{ width: 70, height: 105, objectFit: "cover", borderRadius: R.sm, flexShrink: 0 }} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: C.text }}>{catalogPick.title}{catalogPick.year ? ` (${catalogPick.year})` : ""}{catalogPick.rating > 0 ? <span style={{ color: C.accentText, fontWeight: 400 }}>  ★{Number(catalogPick.rating).toFixed(1)}</span> : null}</span>
                  <button onClick={() => setCatalogPick(null)} aria-label="Close summary" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.55, color: C.muted, maxHeight: 96, overflowY: "auto" }}>{catalogPick.overview || "No summary available."}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button onClick={() => playTrailer(catalogPick, catalog.service)} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, fontWeight: 510, padding: "4px 10px", cursor: "pointer" }}>▶ trailer</button>
                  {catalog.service
                    ? <button onClick={() => openEmbed(catalog.service.search(catalogPick.title), catalog.service.name)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>watch on {catalog.service.name} ↗</button>
                    : <a href={`https://www.themoviedb.org/${catalogPick.kind}/${catalogPick.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "4px 10px" }}>details ↗</a>}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, padding: 12 }}>
            {catalog.items.map((it, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", background: "#161718", border: `1px solid ${catalogPick && catalogPick.id === it.id && catalogPick.archiveId === it.archiveId ? C.accent : C.panelEdge}`, borderRadius: R.md, overflow: "hidden" }}>
                <div onClick={() => catalog.archive ? playArchive(it) : setCatalogPick(p => (p && p.id === it.id ? null : it))}
                  title={catalog.archive ? "Play in-desk" : "Show summary"}
                  style={{ position: "relative", width: "100%", paddingTop: "150%", background: "#161718", cursor: "pointer" }}>
                  {it.poster && <img src={it.poster} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                  {it.rating > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.75)", color: C.accentText, fontFamily: MONO, fontSize: 12, padding: "1px 5px", borderRadius: R.xs }}>★ {Number(it.rating).toFixed(1)}</span>}
                  {!catalog.archive && <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.7)", color: C.faint, fontFamily: MONO, fontSize: 12, padding: "1px 5px", borderRadius: R.xs }}>ⓘ summary</span>}
                </div>
                <div style={{ padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  <span style={{ fontFamily: SANS, fontSize: 10, color: C.text, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{it.title}{it.year ? ` (${it.year})` : ""}</span>
                  <span style={{ marginTop: "auto", display: "flex", gap: 4 }}>
                    {catalog.archive ? (
                      <>
                        <button onClick={() => playArchive(it)} title="Play in-desk" style={{ flex: 1, background: "rgba(39,166,68,0.14)", border: `1px solid ${C.up}`, color: C.up, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, fontWeight: 510, padding: "4px 0", cursor: "pointer" }}>▶ play</button>
                        <a href={`https://archive.org/details/${it.archiveId}`} target="_blank" rel="noopener noreferrer" title="Open on Archive" style={{ textDecoration: "none", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "4px 7px" }}>↗</a>
                      </>
                    ) : (
                      <>
                        <button onClick={() => playTrailer(it, catalog.service)} title="Play trailer in-desk" style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, fontWeight: 510, padding: "4px 0", cursor: "pointer" }}>▶ trailer</button>
                        {catalog.service
                          ? <button onClick={() => openEmbed(catalog.service.search(it.title), catalog.service.name)} title={`Watch on ${catalog.service.name}`} style={{ border: `1px solid ${C.panelEdge}`, color: C.muted, background: "transparent", borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "4px 7px", cursor: "pointer" }}>↗</button>
                          : <a href={`https://www.themoviedb.org/${it.kind}/${it.id}`} target="_blank" rel="noopener noreferrer" title="Details" style={{ textDecoration: "none", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "4px 7px" }}>↗</a>}
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
  // ---- the games, as a chat attachment ----
  // Games are hosted BY the anchor — it teaches the lesson, calls the round and
  // reacts to the score — so the game belongs in the conversation it is being
  // played through, not on a stage above the composer where the host's replies
  // and the host's game ended up in two different columns.
  const gamePanel = gameOn && (() => {
    const primaryBtn = { background: C.accentPress, color: C.textOnAccent, border: "none", borderRadius: R.sm, fontFamily: SANS, fontWeight: 510, fontSize: 12, padding: "9px 16px", cursor: "pointer" };
    const ghostBtn = { background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "9px 12px", cursor: "pointer" };
    const ctlBtn = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.panelEdge}`, color: C.text, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, lineHeight: 1, padding: "6px 10px", cursor: "pointer" };
    // Titles arrive as "<glyph> NAME". The glyph is an emoji, so it
    // cannot take a colour and it cannot ride at the eyebrow's 11px
    // without collapsing into a smudge — it gets split off and sized
    // on its own, and the name gets full text contrast.
    const shell = (title, headerRight, body) => {
      const cut = title.indexOf(" ");
      const icon = cut > 0 ? title.slice(0, cut) : "";
      const label = cut > 0 ? title.slice(cut + 1) : title;
      return (
      <div style={{ flexShrink: 0, minWidth: 0, background: "#161718", border: `1px solid ${C.edgeStrong}`, borderRadius: R.lg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {icon && <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{icon}</span>}
            <span style={{ ...TYPE.eyebrow, color: C.text }}>{label}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {headerRight}
            <button onClick={closeGame} className="v-gamectl" aria-label="Close games" style={{ ...ctlBtn, fontSize: 12, padding: "6px 9px" }}>✕</button>
          </span>
        </div>
        {body}
      </div>
      );
    };

    // ---- game selection menu ----
    if (gameMode === "menu") {
      const games = [
        { id: "school", icon: "🎓", name: "Stock School", desc: "8 short lessons on stocks, prices, and P&L." },
        { id: "bullbear", icon: "📊", name: "Bull or Bear", desc: "Read a headline, call it up or down." },
        { id: "ticker", icon: "🔤", name: "Ticker Match", desc: "Match companies to their tickers." },
        { id: "cards", icon: "🃏", name: "Market Blackjack", desc: "21 against the dealer, with a chip bankroll." },
        { id: "chess", icon: "♟", name: "Bulls vs Bears Chess", desc: "Two-player chess: Bulls vs Bears." },
        { id: "algowars", icon: "🖥️", name: "Algorithm Wars", desc: "A trading-floor RTS: script bot armies in real time." },
      ];
      return shell("🎮 GAME ROOM", <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted }}>no account needed</span>,
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          {games.map(g => (
            <button key={g.id} onClick={() => startMode(g.id)} className="v-lift"
              style={{ textAlign: "left", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, minHeight: 112 }}>
              <span aria-hidden="true" style={{ fontSize: 20 }}>{g.icon}</span>
              <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 13, color: C.text }}>{g.name}</span>
              <span style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.5, color: C.faint }}>{g.desc}</span>
            </button>
          ))}
        </div>
      );
    }

    // ---- board/card games render their own self-contained components ----
    const backBtn = <button onClick={() => { setGameMode("menu"); stopSpeak(); }} className="v-gamectl" style={ctlBtn}>← games</button>;
    if (gameMode === "cards") {
      return shell("🃏 MARKET BLACKJACK", backBtn,
        <BlackjackGame onCheer={() => triggerAnchor("cheer", { label: "WINNER! ✓" })} onWin={() => triggerAnchor("cheer", { label: "BLACKJACK! 🃏" })} />);
    }
    if (gameMode === "chess") {
      return shell("♟ BULLS vs BEARS", backBtn,
        <ChessGame sfx={chessSfx} onWin={(w) => triggerAnchor("cheer", { label: w === "w" ? "BULLS WIN! 🐂" : "BEARS WIN! 🐻" })} />);
    }
    if (gameMode === "algowars") {
      return shell("🖥️ ALGORITHM WARS", backBtn,
        <AlgoWarsGame onWin={(w) => triggerAnchor(w === "you" ? "cheer" : "break", { label: w === "you" ? "MARKET DOMINATED! 🏆" : "OUTGUNNED 💥" })} onCheer={() => {}} />);
    }

    // ---- an active quiz game (school / bullbear / ticker) ----
    // NB: named `round`, never `R` — a local `R` here shadows the theme's
    // radius token across this whole closure (TDZ crash on open).
    const data = gameSet(gameMode), total = data.length, round = data[gameStep] || {};
    const done = gamePhase === "done";
    const meta = gameMode === "school"
      ? { hdr: "🎓 STOCK SCHOOL", unit: "lesson", title: round.title, question: round.q, choices: round.choices || [], answer: round.answer, explain: round.explain }
      : gameMode === "bullbear"
        ? { hdr: "📊 BULL OR BEAR", unit: "round", title: "Will the stock go up or down?", question: round.headline, choices: ["📈 Bullish — likely UP", "📉 Bearish — likely DOWN"], answer: round.bullish ? 0 : 1, explain: round.why }
        : { hdr: "🔤 TICKER MATCH", unit: "round", title: "Pick the real ticker symbol", question: `Which symbol is ${round.company}?`, choices: round.options || [], answer: round.answer, explain: `${round.company} trades as ${round.options?.[round.answer]}.` };
    const headerRight = (
      <>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{done ? `score ${gameScore}/${total}` : `${meta.unit} ${gameStep + 1}/${total} · score ${gameScore}`}</span>
        {backBtn}
      </>
    );
    const body = (
      <>
        <div style={{ height: 3, background: C.panelEdge }}>
          <div style={{ height: "100%", width: `${((done ? total : gameStep) / total) * 100}%`, background: C.text, transition: "width 0.4s" }} />
        </div>
        <div style={{ padding: 14, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 12 }}>
          {done ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 510, color: C.accentText }}>{gameMode === "school" ? "🎓 You graduated!" : "🏁 Round complete!"}</div>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: C.text }}>
                You scored <b style={{ color: gameScore > total / 2 ? C.up : C.accentText }}>{gameScore} / {total}</b>. {gameMode === "school" ? "You now know the basics of how stocks work." : gameScore === total ? "Perfect run!" : "Play again to beat your score."}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => startMode(gameMode)} style={primaryBtn}>Play again ↻</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 510, color: C.text }}>{meta.title}</div>
              {gameMode === "school" && gamePhase === "teach" && (
                <>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: C.text }}>{R.teach}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={gameToQuiz} style={primaryBtn}>Quiz me →</button>
                    <button onClick={() => speak("school", R.teach)} style={ghostBtn}>🔊 read again</button>
                  </div>
                </>
              )}
              {(gamePhase === "quiz" || gamePhase === "reveal") && (
                <>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: C.muted }}>{gameMode === "bullbear" ? "📰 " : ""}{meta.question}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {meta.choices.map((c, i) => {
                      const chosen = gameChoice === i, isRight = i === meta.answer, revealed = gamePhase === "reveal";
                      const bg = revealed ? (isRight ? "rgba(39,166,68,0.15)" : chosen ? "rgba(235,87,87,0.12)" : "transparent") : "transparent";
                      const bd = revealed ? (isRight ? C.up : chosen ? C.down : C.panelEdge) : C.panelEdge;
                      return (
                        <button key={i} disabled={revealed} onClick={() => gameAnswer(i)}
                          style={{ textAlign: "left", background: bg, border: `1px solid ${bd}`, color: C.text, borderRadius: 5, fontFamily: SANS, fontSize: 12, padding: "9px 11px", cursor: revealed ? "default" : "pointer" }}>
                          {gameMode === "school" ? `${String.fromCharCode(65 + i)}. ` : ""}{c}{revealed && isRight ? "  ✓" : revealed && chosen ? "  ✕" : ""}
                        </button>
                      );
                    })}
                  </div>
                  {gamePhase === "reveal" && (
                    <>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: gameChoice === meta.answer ? C.up : C.muted }}>
                        {meta.explain}
                      </div>
                      <button onClick={gameNext} style={primaryBtn}>{gameStep >= total - 1 ? (gameMode === "school" ? "Finish 🎓" : "See score 🏁") : "Next →"}</button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </>
    );
    return shell(meta.hdr, headerRight, body);
  })();
  const deskBoxFilled = !!aiResponses.nav || deskCalendar || deskPortfolio
    || !!(news && (news.news?.length > 0 || news.videos?.length > 0)) || newsBusy || !!newsErr || !!writtenReport;

  // What rides at the tail of the transcript. Order is arrival order: a game is
  // opened deliberately and stays, a catalog is the answer to the last thing asked.
  const deskAttachments = (gamePanel || catalogPanel)
    ? <>{gamePanel}{catalogPanel}</>
    : null;

  return (
    <div onClickCapture={handleUiClick} style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Archivo:wght@500;600;800&display=swap');
        @keyframes tapeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .tape-track { animation: tapeScroll 40s linear infinite; }
        .tape-track:hover, .tape-track:has(:focus-visible) { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .tape-track { animation: none; } }
        /* A marquee cannot be used with a finger: the target is moving, and
           because hover:none holds on touch the tape never pauses the way
           it does under a mouse. On coarse pointers it stops scrolling itself
           and becomes a strip you swipe, so every symbol can actually be hit.
           The duplicate half exists only to loop the animation seamlessly, so
           it goes when the animation does. !important on overflow because the
           container sets it inline. */
        @media (pointer: coarse) {
          #tour-ticker { overflow-x: auto !important; overflow-y: hidden !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          #tour-ticker::-webkit-scrollbar { display: none; }
          .tape-track { animation: none; }
          .tape-track > [aria-hidden="true"] { display: none; }
        }
        @keyframes blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
        .cursor { animation: blink 0.9s step-end infinite; color: ${C.accentText}; }
        @media (prefers-reduced-motion: reduce) { .cursor { animation: none; } }
        .wl-row { transition: background ${MOTION.fast} ${MOTION.ease}, border-left-color ${MOTION.fast} ${MOTION.ease}; }
        .wl-row:hover { background: ${C.surfaceRaised} !important; }
        @media (prefers-reduced-motion: reduce) { .wl-row { transition: none; } }
        /* Keyboard-only focus ring (mouse clicks no longer draw a hard box).
           Violet, not amber: amber is reserved for genuinely live/on-air state,
           so using it for focus made every focused control look like it was
           broadcasting. global.css sets the same ring for everything else. */
        input:focus-visible, button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: ${R.sm}px; }
        /* The command bar and chat composer highlight the whole rounded container,
           not the inner input — they are the app's primary interface, so focusing
           one should light up the surface rather than draw a box inside it. */
        .cmdbar:focus-within { border-color: ${C.accentText} !important; box-shadow: 0 0 0 3px ${C.accentGlow}; }
        .cmdbar input:focus, .cmdbar input:focus-visible, .cmdbar textarea:focus, .cmdbar textarea:focus-visible { outline: none; }
        ::selection { background: rgba(255,255,255,0.16); color: #fff; }
        /* Spotify dock slide/fade in & out */
        @keyframes spotifyIn { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes spotifyOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(24px) scale(0.96); } }
        @keyframes breakingPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        .breaking-pulse { animation: breakingPulse 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .breaking-pulse { animation: none; } }
        @media (prefers-reduced-motion: reduce) { .spotify-dock { animation: none !important; } }
      `}</style>

      {/* ===== Spotify ambient player (replaces the synth when music source = spotify) ===== */}
      {/* Premium + connected → SDK plays full tracks silently in the background, show a status chip */}
      {spotifyRender && spotifyReady && (
        <div className="spotify-dock" style={{ position: "fixed", bottom: 12, right: 12, zIndex: 40, display: "flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 999, padding: "8px 14px", fontFamily: MONO, fontSize: 12, color: C.up, boxShadow: "0 8px 30px rgba(0,0,0,0.5)", animation: spotifyAnim }}>
          <span style={{ color: "#1DB954", fontSize: 13 }}>♫</span> Spotify · playing on Vantage Desk
        </div>
      )}
      {/* not connected (or no Premium) → fall back to the no-login preview embed */}
      {spotifyRender && !spotifyReady && spotifyEmbedUrl(spotifyUri) && (
        <div className="spotify-dock" style={{ position: "fixed", bottom: 12, right: 12, width: 340, maxWidth: "90vw", zIndex: 40, borderRadius: R.lg, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", border: `1px solid ${C.panelEdge}`, animation: spotifyAnim }}>
          <iframe
            title="Spotify player"
            src={spotifyEmbedUrl(spotifyUri)}
            width="100%" height="152" frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ display: "block", border: "none" }}
          />
        </div>
      )}

      {/* ===== export preview/editor: review & edit before the file downloads ===== */}
      {exportDraft && (() => {
        const FMT = { xlsx: "Excel", docx: "Word", pptx: "PowerPoint" };
        // per-cell edit helpers for the structured draft (watchlist grid + snapshot fields)
        const setSel = (k, v) => setExportDraft(d => ({ ...d, selected: { ...d.selected, [k]: v } }));
        const setWl = (i, k, v) => setExportDraft(d => { const wl = d.watchlist.slice(); wl[i] = { ...wl[i], [k]: v }; return { ...d, watchlist: wl }; });
        const delWl = (i) => setExportDraft(d => ({ ...d, watchlist: d.watchlist.filter((_, j) => j !== i) }));
        const addWl = () => setExportDraft(d => ({ ...d, watchlist: [...d.watchlist, { sym: "", price: "", chg: "", chgPct: "" }] }));
        const wlCols = "1.4fr 1fr 1fr 1fr 28px";
        const setInc = (k, v) => setExportDraft(d => ({ ...d, include: { ...(d.include || {}), [k]: v } }));
        const setAn = (i, v) => setExportDraft(d => { const a = d.analysis.slice(); a[i] = { ...a[i], text: v }; return { ...d, analysis: a }; });
        const delAn = (i) => setExportDraft(d => ({ ...d, analysis: d.analysis.filter((_, j) => j !== i) }));
        const setNews = (i, k, v) => setExportDraft(d => { const n = d.news.slice(); n[i] = { ...n[i], [k]: v }; return { ...d, news: n }; });
        const delNews = (i) => setExportDraft(d => ({ ...d, news: d.news.filter((_, j) => j !== i) }));
        const addNews = () => setExportDraft(d => ({ ...d, news: [...d.news, { title: "", source: "", url: "" }] }));
        const inc = exportDraft.include || {};
        return (
          <div role="dialog" aria-label="Export preview" style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.85)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setExportDraft(null)}>
            <div id="export-modal" onClick={e => e.stopPropagation()} className="v-rise" style={{ width: 620, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.panelEdge}` }}>
                <span style={{ ...TYPE.eyebrow, color: C.muted }}>⬇ REVIEW & EDIT <span style={{ color: C.faint, fontWeight: 510, letterSpacing: "-0.013em", textTransform: "none" }}>· before you export</span></span>
                <button onClick={() => setExportDraft(null)} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>DOCUMENT TITLE</label>
                  <input value={exportDraft.title} onChange={e => setExportDraft(d => ({ ...d, title: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 14, padding: "9px 10px" }} />
                </div>
                <div>
                  <label style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>REPORT BODY · edit freely, this goes into the document</label>
                  <textarea value={exportDraft.body} onChange={e => setExportDraft(d => ({ ...d, body: e.target.value }))} rows={13}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, lineHeight: 1.6, padding: "10px", resize: "vertical" }} />
                  {!writtenReport && <button onClick={async () => { const t = await generateWrittenReport(); if (t) setExportDraft(d => ({ ...d, body: t })); }} disabled={reportBusy}
                    style={{ marginTop: 6, background: "transparent", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>{reportBusy ? "✍ writing…" : "✨ write it for me (AI)"}</button>}
                </div>

                {/* editable snapshot — the Summary sheet / title-slide numbers */}
                <div>
                  <label style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>SNAPSHOT · edit any value ({exportDraft.selected?.sym || selected})</label>
                  <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["name", "Name"], ["price", "Price"], ["chgPct", "Change %"], ["chg", "Change"], ["open", "Open"], ["high", "High"], ["low", "Low"], ["prevClose", "Prev Close"]].map(([k, lbl]) => (
                      <label key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, width: 74, flexShrink: 0 }}>{lbl}</span>
                        <input value={exportDraft.selected?.[k] ?? ""} onChange={e => setSel(k, e.target.value)}
                          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px" }} />
                      </label>
                    ))}
                  </div>
                </div>

                {/* editable watchlist grid — per-cell for the Watchlist sheet / slide / table */}
                <div>
                  <label style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>WATCHLIST · edit any cell, add or remove rows</label>
                  <div style={{ marginTop: 6, border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: wlCols, background: "#161718", borderBottom: `1px solid ${C.panelEdge}` }}>
                      {["Symbol", "Price", "Change", "Change %", ""].map((h, i) => (
                        <span key={i} style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint, padding: "6px 8px" }}>{h}</span>
                      ))}
                    </div>
                    {exportDraft.watchlist.map((w, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: wlCols, borderBottom: i < exportDraft.watchlist.length - 1 ? `1px solid ${C.panelEdge}` : "none" }}>
                        {["sym", "price", "chg", "chgPct"].map(k => (
                          <input key={k} value={w[k] ?? ""} onChange={e => setWl(i, k, e.target.value)} aria-label={`${k} row ${i + 1}`}
                            style={{ boxSizing: "border-box", background: "transparent", border: "none", borderRight: `1px solid ${C.panelEdge}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", minWidth: 0 }} />
                        ))}
                        <button onClick={() => delWl(i)} title="Remove row" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                    {!exportDraft.watchlist.length && <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, padding: "8px" }}>No rows — add one below.</div>}
                  </div>
                  <button onClick={addWl} style={{ marginTop: 6, background: "transparent", border: `1px dashed ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>+ add row</button>
                </div>

                {/* editable AI-analysis blocks */}
                {exportDraft.analysis.length > 0 && (
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint, cursor: "pointer" }}>
                      <Toggle checked={inc.analysis !== false} onChange={e => setInc("analysis", e.target.checked)} /> AI ANALYSIS · edit or remove
                    </label>
                    {inc.analysis !== false && exportDraft.analysis.map((a, i) => (
                      <div key={i} style={{ marginTop: 6, border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, padding: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: C.accentText }}>{a.model}</span>
                          <button onClick={() => delAn(i)} title="Remove" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                        </div>
                        <textarea value={a.text ?? ""} onChange={e => setAn(i, e.target.value)} rows={3}
                          style={{ width: "100%", boxSizing: "border-box", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, lineHeight: 1.5, padding: "6px 8px", resize: "vertical" }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* editable news list */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint, cursor: "pointer" }}>
                    <Toggle checked={inc.news !== false} onChange={e => setInc("news", e.target.checked)} /> NEWS · edit, add or remove
                  </label>
                  {inc.news !== false && (<>
                    {exportDraft.news.map((n, i) => (
                      <div key={i} style={{ marginTop: 6, display: "grid", gridTemplateColumns: "2.4fr 1fr 28px", gap: 6, alignItems: "center" }}>
                        <input value={n.title ?? ""} onChange={e => setNews(i, "title", e.target.value)} placeholder="Headline" aria-label={`news title ${i + 1}`}
                          style={{ boxSizing: "border-box", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", minWidth: 0 }} />
                        <input value={n.source ?? ""} onChange={e => setNews(i, "source", e.target.value)} placeholder="Source" aria-label={`news source ${i + 1}`}
                          style={{ boxSizing: "border-box", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", minWidth: 0 }} />
                        <button onClick={() => delNews(i)} title="Remove" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                    {!exportDraft.news.length && <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginTop: 6 }}>No headlines — add one below.</div>}
                    <button onClick={addNews} style={{ marginTop: 6, background: "transparent", border: `1px dashed ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>+ add headline</button>
                  </>)}
                </div>

                <div style={{ fontFamily: SANS, fontSize: 11, color: C.faint, lineHeight: 1.6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, cursor: "pointer" }}>
                    <Toggle checked={inc.chart !== false} onChange={e => setInc("chart", e.target.checked)} /> include session chart
                  </label>
                  <span>· logo + snapshot always included.</span>
                  {exportMsg && <span style={{ color: exportMsg.startsWith("✗") ? C.down : exportMsg.startsWith("✓") ? C.up : C.muted }}>· {exportMsg}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>FORMAT</span>
                  {["xlsx", "docx", "pptx"].map(f => (
                    <button key={f} onClick={() => setExportDraft(d => ({ ...d, format: f }))}
                      style={{ background: exportDraft.format === f ? "rgba(255,255,255,0.09)" : "transparent", border: `1px solid ${exportDraft.format === f ? C.accent : C.panelEdge}`, color: exportDraft.format === f ? C.accentText : C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>{FMT[f]}</button>
                  ))}
                  <button onClick={async () => {
                    const toNum = (v) => { if (v === "" || v == null) return null; const n = Number(v); return isNaN(n) ? v : n; };
                    const sel = exportDraft.selected || {};
                    await doExport(exportDraft.format, {
                      title: exportDraft.title,
                      writtenReport: exportDraft.body,
                      selected: { ...sel, price: toNum(sel.price), chg: toNum(sel.chg), chgPct: toNum(sel.chgPct), open: toNum(sel.open), high: toNum(sel.high), low: toNum(sel.low), prevClose: toNum(sel.prevClose) },
                      watchlist: exportDraft.watchlist.map(w => ({ sym: w.sym, price: toNum(w.price), chg: toNum(w.chg), chgPct: toNum(w.chgPct) })),
                      analysis: inc.analysis === false ? [] : exportDraft.analysis,
                      news: inc.news === false ? [] : exportDraft.news,
                      chartImage: inc.chart === false ? null : undefined,
                    });
                    setExportDraft(null);
                  }}
                    style={{ marginLeft: "auto", background: C.accentPress, color: C.textOnAccent, border: "none", borderRadius: R.sm, fontFamily: SANS, fontWeight: 510, fontSize: 12, padding: "9px 18px", cursor: "pointer" }}>⬇ Download {FMT[exportDraft.format]}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== in-app browser: opens a broker/site inside Vantage (with a tab fallback for framed-blocked sites) ===== */}
      {embed && (
        <div role="dialog" aria-label="In-app browser" style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.85)", zIndex: 60, display: "flex", flexDirection: "column", padding: 18 }} onClick={() => setEmbed(null)}>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", flex: 1, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.md, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: C.accentText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🌐 {embed.title}</span>
              <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <a href={embed.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: C.accentPress, color: C.textOnAccent, border: "none", borderRadius: R.sm, fontFamily: MONO, fontSize: 12, fontWeight: 510, padding: "6px 14px", textDecoration: "none" }}>open in new tab ↗</a>
                <button onClick={() => setEmbed(null)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>✕ close</button>
              </span>
            </div>
            <iframe title={embed.title} src={embed.url} style={{ flex: 1, width: "100%", border: "none", background: embed.trusted ? "#08090a" : "#fff" }}
              allow="clipboard-write; fullscreen" referrerPolicy="no-referrer-when-downgrade" />
            {!embed.trusted && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", fontFamily: SANS, fontSize: 10, color: C.faint, borderTop: `1px solid ${C.panelEdge}`, lineHeight: 1.5, flexWrap: "wrap" }}>
                <span>Blank? Brokers (Robinhood, Fidelity…) block embedding — use <b style={{ color: C.muted }}>open in new tab ↗</b>, or view the live chart in-app:</span>
                <button onClick={() => openChart(selected)} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, fontWeight: 510, padding: "5px 10px", cursor: "pointer" }}>📈 {selected} chart (works in-frame)</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ticker tape ===== */}
      {/* ===== application chrome =====
           AppShell supplies the header: brand, primary navigation, market status,
           the command palette and the account menu. It is presentational — every value
           it renders is derived above and every action is a callback into this
           component, so the dashboard below is unchanged by its presence.

           onSignIn is deliberately signOut: it clears the session, which drops
           the visitor back at the auth gate to sign in again. */}
      <AppShell
        sections={NAV_SECTIONS}
        activeSection={activeSection}
        onNavigate={navigateSection}
        account={account}
        plan={account?.plan}
        onSignIn={onSignOut}
        onSignOut={onSignOut}
        onOpenSettings={() => { setSettingsTab("quick"); setShowSettings(true); }}
        onOpenPlans={() => { setSettingsTab("account"); setShowSettings(true); }}
        marketOpen={marketOpen}
        marketLabel={marketOpen ? `NYSE ${t("OPEN")}` : `NYSE ${t("CLOSED")}`}
        clock={shellClock}
        commands={shellCommands}
        paletteFallback={q => (q.length <= 20 && /^[A-Za-z][A-Za-z0-9.\- ]*$/.test(q)) ? {
          id: `chart:${q}`, label: `Chart “${q.toUpperCase()}”`, icon: "📈", group: "Symbol",
          run: () => {
            chartQuery(q);
            const sec = NAV_SECTIONS.find(x => x.id === "watchlist");
            if (sec) navigateSection(sec);
          },
        } : null}
        status={live ? <span style={chip("up")}>● LIVE DATA</span> : null}
        searchRef={openPaletteRef}
      >
      {panels.tape && (
      <div id="tour-ticker" style={{ overflow: "hidden", borderBottom: `1px solid ${C.panelEdge}`, background: "#0D111A", whiteSpace: "nowrap" }}>
        <div className="tape-track" style={{ display: "inline-block", padding: "7px 0" }}>
          {/* Each entry charts its symbol — the tape already pauses on hover, so
              it reads as navigation, not just decoration. */}
          {tape.map((r, i) => (
            <button key={i} onClick={() => setSelected(r.sym)} title={`Chart ${r.sym}`} className="v-tap"
              // The duplicate half exists only so the loop is seamless — hide it
              // from the tab order and from assistive tech so each symbol is
              // offered exactly once. It stays clickable with the mouse.
              aria-hidden={i >= tapeRows.length || undefined}
              tabIndex={i >= tapeRows.length ? -1 : undefined}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontSize: 12, marginRight: 34 }}>
              <span style={{ color: C.accentText, fontWeight: 510 }}>{r.sym}</span>{" "}
              <span style={{ color: C.text }}>{fmt(r.price)}</span>{" "}
              <span style={{ color: dirColorN(r.chg) }}>{r.chg > 0 ? "▲" : r.chg < 0 ? "▼" : "•"} {pct(r.chgPct)}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {cmdMsg && (
        <div style={{ padding: "6px 20px", fontFamily: MONO, fontSize: 12, color: C.accentText, borderBottom: `1px solid ${C.panelEdge}` }}>{cmdMsg}</div>
      )}
      {breakingAlert && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 20px", background: "linear-gradient(90deg, rgba(235,87,87,0.24), rgba(235,87,87,0.04))", borderBottom: `1px solid ${C.down}` }}>
          <span className="breaking-pulse" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, letterSpacing: "-0.013em", color: "#08090a", background: C.down, borderRadius: R.xs, padding: "3px 8px", whiteSpace: "nowrap" }}>⚡ BREAKING</span>
          <span style={{ fontFamily: SANS, fontSize: 12, color: C.text, flex: 1, lineHeight: 1.4 }}>{breakingAlert.text}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint, whiteSpace: "nowrap" }}>{breakingAlert.source}</span>
          <button onClick={() => speak("breaking", `This just in. ${breakingAlert.text}.`)} title="Read on air"
            style={{ background: "transparent", border: `1px solid ${C.down}`, color: C.down, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>▶ read</button>
          <button onClick={() => setBreakingAlert(null)} aria-label="Dismiss alert"
            style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 13 }}>✕</button>
        </div>
      )}
      {live && liveErr && (
        <div style={{ padding: "6px 20px", fontFamily: MONO, fontSize: 12, color: C.down, borderBottom: `1px solid ${C.panelEdge}` }}>live feed: {liveErr}</div>
      )}

      {/* ===== AI desk ===== */}
      <div id="sec-desk" style={{ padding: "14px 14px 0" }}>
        <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div className="v-deskhead" style={{ borderBottom: `1px solid ${C.panelEdge}` }}>
            <span className="v-deskhead-title" style={{ ...TYPE.eyebrow, color: C.muted }}>AI DESK</span>
            {/* Session state lives up here with the desk, not buried under the
                chart: one glance says why every price is holding still. */}
            {liveStale && (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, background: "rgba(255,255,255,0.05)", borderRadius: R.xs, padding: "3px 9px", letterSpacing: "-0.013em", whiteSpace: "nowrap" }}>
                {t("MARKET CLOSED")} · {t("last trade")} {liveStale.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <span className="v-deskhead-tools">
              {/* visible export menu (Excel / Word / PowerPoint / report), all generated inside Vantage */}
              <span data-deskmenu="" style={{ position: "relative" }}>
                <button id="tour-export" onClick={() => { setShowExportMenu(v => !v); setShowMoreMenu(false); }} aria-label="Export a document"
                  title="Export as Excel, Word, or PowerPoint"
                  style={deskBtn(showExportMenu)} {...deskBtnHover(showExportMenu)}>
                  ⬇ {t("Export")} ▾
                </button>
                {showExportMenu && (
                  <div className="v-rise" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", minWidth: 150, overflow: "hidden" }}>
                    {exportMsg && <div style={{ fontFamily: MONO, fontSize: 12, color: exportMsg.startsWith("✗") ? C.down : exportMsg.startsWith("✓") ? C.up : C.muted, padding: "6px 10px", borderBottom: `1px solid ${C.panelEdge}` }}>{exportMsg}</div>}
                    {[["xlsx", "📊 Excel (.xlsx)"], ["docx", "📄 Word (.docx)"], ["pptx", "📽 PowerPoint (.pptx)"]].map(([fmt, label]) => (
                      <button key={fmt} onClick={() => { setShowExportMenu(false); openExportPreview(fmt); }}
                        style={{ textAlign: "left", background: "transparent", border: "none", color: C.text, fontFamily: SANS, fontSize: 11, padding: "8px 12px", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#161718"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{label}</button>
                    ))}
                    <button onClick={() => { setShowExportMenu(false); generateWrittenReport(); }} disabled={reportBusy}
                      style={{ textAlign: "left", background: "transparent", borderTop: `1px solid ${C.panelEdge}`, borderLeft: "none", borderRight: "none", borderBottom: "none", color: C.accentText, fontFamily: SANS, fontSize: 11, padding: "8px 12px", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#161718"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{reportBusy ? "✍ writing…" : "📝 write analyst report"}</button>
                  </div>
                )}
              </span>
              {/* consolidated "More" menu: games + ambient + music, so the row stays uncluttered */}
              <span data-deskmenu="" style={{ position: "relative" }}>
                <button onClick={() => { setShowMoreMenu(v => !v); setShowExportMenu(false); }} aria-label="More — games, ambient sound and music"
                  title="Games, ambient sound and music"
                  style={deskBtn(showMoreMenu || gameOn || ambienceOn || musicOn)} {...deskBtnHover(showMoreMenu || gameOn || ambienceOn || musicOn)}>
                  ⋯ {t("More")} ▾
                </button>
                {showMoreMenu && (
                  <div className="v-rise" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", minWidth: 258, overflow: "hidden" }}>
                    {[
                      { key: "games", icon: "🎮", label: t("Games"), sub: t("learn how stocks work"), active: gameOn, onClick: () => { setShowMoreMenu(false); gameOn ? closeGame() : openGames(); } },
                      { key: "ambient", icon: "🎧", label: t("Ambient sound"), sub: t("waves, jungle, space hum…"), active: ambienceOn, onClick: () => setAmbienceOn(v => !v) },
                      { key: "music", icon: "♪", label: t("Music"), sub: t("background score"), active: musicOn, onClick: () => toggleMusic(!musicOn) },
                    ].map((it, idx) => (
                      <button key={it.key} onClick={it.onClick} aria-pressed={it.active}
                        style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "transparent", border: "none", borderBottom: idx < 2 ? `1px solid ${C.panelEdge}` : "none", color: C.text, fontFamily: SANS, fontSize: 11, padding: "9px 12px", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#161718"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{it.icon}</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: "block", fontSize: 12, color: it.active ? C.accentText : C.text }}>{it.label}</span>
                          <span style={{ display: "block", fontSize: 11, color: C.faint, marginTop: 1 }}>{it.sub}</span>
                        </span>
                        <ToggleGlyph checked={it.active} />
                      </button>
                    ))}
                  </div>
                )}
              </span>
              {/* language rides last, keeping Export + More as an adjacent pair; it switches the whole UI, but above all the anchor's spoken answers */}
              <select id="tour-lang" value={lang} onChange={e => setLang(e.target.value)} aria-label={t("Language")} title={t("Language")}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 5, fontFamily: SANS, fontWeight: 510, fontSize: 11, letterSpacing: "-0.010em", padding: "5px 6px", cursor: "pointer" }}>
                {LANGS.map(l => <option key={l.code} value={l.code} style={{ background: C.surface, color: C.text }}>{l.code === "en" ? "🌐 " + l.label : l.label}</option>)}
              </select>
            </span>
          </div>

          {/* ===== command bar =====
               Brand, navigation, the clock and the account menu live in
               AppShell's sticky header. What is left is the thing this row was
               actually for: typing a symbol — and that belongs to the desk,
               not to the page chrome. Typing a symbol and asking about it are
               the same gesture, so they share a panel. */}
          <div className="v-cmdrow" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderBottom: `1px solid ${C.panelEdge}`, flexWrap: "wrap" }}>
            <div id="tour-symbol" className="cmdbar" style={{ flex: 1, minWidth: 240, display: "flex", alignItems: "center", background: C.inputBg, border: `1px solid ${C.edge}`, borderRadius: R.md, padding: "0 6px 0 12px" }}>
              <span aria-hidden="true" style={{ fontFamily: MONO, color: C.accentText, fontSize: 14 }}>&gt;</span>
              <input
                value={cmd}
                onChange={e => setCmd(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runCmd()}
                placeholder={t("Type a symbol and press Enter  ·  HELP for commands")}
                aria-label="Command bar"
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: MONO, fontSize: 14, padding: "10px 8px" }}
              />
              <button onClick={() => openPaletteRef.current?.()} aria-label="Open command palette" title={t("Search")}
                style={{ display: "flex", alignItems: "center", gap: 7, background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, fontWeight: 510, padding: "7px 12px", marginRight: 6, cursor: "pointer", whiteSpace: "nowrap", transition: "border-color .12s, background .12s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.faint; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.edgeStrong; }}>
                <span aria-hidden="true" style={{ color: C.accentText, fontSize: 13 }}>⌕</span>
                <span>{t("Search")}</span>
              </button>
              <button onClick={runCmd} style={button("primary", "sm")}>GO</button>
            </div>

            {live && <span style={chip("up")}>● LIVE</span>}

            {liveMeeting && (
              <a href={liveMeeting} target="_blank" rel="noopener noreferrer" title="Rejoin your live meeting"
                style={{ ...chip("live"), color: C.textOnLive, background: C.liveFill, borderColor: C.liveFill, textDecoration: "none" }}>
                <span className="v-pulse" aria-hidden="true">🔴</span> ON AIR ↗
              </a>
            )}

          </div>


          {/* embedded player — docked at the TOP of the desk so a trailer opened from a
              tall catalog grid is visible without scrolling */}
          {player && (
            <div ref={playerRef} style={{ margin: "12px 12px 0", border: `1px solid ${C.accent}`, borderRadius: R.md, overflow: "hidden", background: "#161718" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: C.text }}>
                  <span style={{ color: C.down }}>▶</span> {player.title}
                  <span style={{ color: C.faint, fontWeight: 400, marginLeft: 8 }}>{player.channel}</span>
                </span>
                <button onClick={() => setPlayer(null)} aria-label="Close embedded player"
                  style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 12, padding: "3px 10px", cursor: "pointer" }}>✕</button>
              </div>
              {player.archive ? (
                <ArchiveFrame id={player.archive} title={player.title} />
              ) : player.id ? (
                <VideoFrame id={player.id} title={player.title} />
              ) : (
                <div style={{ padding: 12, fontFamily: SANS, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                  {player.brief || "This link cannot be embedded directly, but the desk brief is available above."}
                </div>
              )}
              {player.archive ? (
                <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>Public-domain film · playing inside Vantage</span>
                  <a href={`https://archive.org/details/${player.archive}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: MONO, fontSize: 12, color: C.accentText, textDecoration: "none", border: `1px solid ${C.accentEdge}`, borderRadius: R.xs, padding: "3px 9px" }}>
                    Open on Archive ↗
                  </a>
                </div>
              ) : (
                <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.accentText }}>DESK BRIEF</span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a href={ytWatchUrl(player)} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: MONO, fontSize: 12, color: C.accentText, textDecoration: "none", border: `1px solid ${C.accentEdge}`, borderRadius: R.xs, padding: "3px 9px" }}>
                        Watch on YouTube ↗
                      </a>
                      {player.brief && (
                        <button onClick={() => speak("brief", player.brief)}
                          style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "3px 9px", cursor: "pointer" }}>
                          ▶ read
                        </button>
                      )}
                    </span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.7, color: C.text, marginTop: 6 }}>
                    {player.brief || "Researching what this video covers…"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Anchor beside the response box. The response box only has something
              to show when a navigator answer, the calendar or the portfolio has
              been pulled onto the desk — which is the minority of the time. When
              it is empty it is hidden outright and the anchor centres, instead of
              rendering a 2px sliver that pushed the anchor against a column of
              dead panel. */}
          {(() => {
            if (!deskBoxFilled) return null;
            return (
            <div className="v-deskrow">


              {/* response area — ONE box; navigator / desk answer / report / news are sections within it */}
              <div id="tour-response" className="v-deskrow-main" style={{ display: !deskBoxFilled ? "none" : "flex", flexDirection: "column", background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
                {/* The blank-slate prompt that used to live here now belongs to
                    <ChatAssistant> below, which owns the conversation and its
                    starter chips. This box is only for responses. */}
                {aiResponses.nav && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}`, ...TYPE.eyebrow, color: C.muted, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>⌖ NAVIGATOR</span>
                      <button onClick={() => setAiResponses(p => { const { nav, ...rest } = p; return rest; })} aria-label="Dismiss navigator"
                        style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                    </div>
                    <div style={{ padding: 10, fontFamily: SANS, fontSize: 12, lineHeight: 1.65, color: aiResponses.nav.status === "error" ? C.down : C.text }}>
                      {aiResponses.nav.text}
                      {aiResponses.nav.status === "running" && <span className="cursor">▍</span>}
                      {aiResponses.nav.links?.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {aiResponses.nav.links.map(l => (
                            <span key={l.name} style={{ display: "inline-flex", border: `1px solid ${C.accent}`, borderRadius: R.sm, overflow: "hidden" }}>
                              <button onClick={() => openEmbed(l.href, l.name)} title={`Open ${l.name} inside Vantage`}
                                style={{ background: "rgba(255,255,255,0.07)", border: "none", color: C.accentText, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "6px 12px", cursor: "pointer" }}>
                                {l.name}
                              </button>
                              <a href={l.href} target="_blank" rel="noopener noreferrer" title="Open in a new tab instead"
                                style={{ textDecoration: "none", background: "transparent", borderLeft: `1px solid ${C.accent}`, color: C.accentText, fontFamily: SANS, fontSize: 11, padding: "6px 8px" }}>↗</a>
                            </span>
                          ))}
                          {!aiResponses.nav.stream && (
                            <button onClick={() => openChart(selected)} title="Open the in-app chart"
                              style={{ background: "rgba(39,166,68,0.12)", border: `1px solid ${C.up}`, color: C.up, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "6px 12px", cursor: "pointer" }}>
                              📈 {selected} chart in-app
                            </button>
                          )}
                        </div>
                      )}
                      {aiResponses.nav.videos?.map((v, i) => (
                        <div key={i} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.panelEdge}` }}>
                          <div style={{ fontSize: 11, fontWeight: 510 }}>
                            <span style={{ color: C.down }}>▶</span> {v.title}
                            <span style={{ color: C.faint, fontWeight: 400, marginLeft: 6 }}>{v.channel}</span>
                          </div>
                          {v.brief && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{v.brief}</div>}
                          <button onClick={() => openVideo(v)}
                            style={{ marginTop: 6, background: "rgba(255,255,255,0.07)", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, fontWeight: 510, padding: "5px 10px", cursor: "pointer" }}>
                            play in desk
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {deskCalendar && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: aiResponses.nav ? `1px solid ${C.panelEdge}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}`, ...TYPE.eyebrow, color: C.muted }}>
                      <span>{t("Calendar")}</span>
                      <button onClick={() => setDeskCalendar(false)} aria-label="Close calendar" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                    </div>
                    <div style={{ maxWidth: 460, width: "100%" }}>
                      <AppCalendar extra={marketEvents} />
                    </div>
                  </div>
                )}
                {deskPortfolio && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: (aiResponses.nav || deskCalendar) ? `1px solid ${C.panelEdge}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}`, ...TYPE.eyebrow, color: C.muted }}>
                      <span>💼 PORTFOLIO {positions.length > 0 && priv(<span style={{ color: dirColorN(portTotals.pnl), marginLeft: 6 }}>{portTotals.pnl >= 0 ? "+" : ""}{fmt(portTotals.pnl)} ({portTotals.pnlPct >= 0 ? "+" : ""}{portTotals.pnlPct.toFixed(2)}%)</span>)}</span>
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {positions.length > 0 && <button onClick={briefPortfolio} title="Read on air" style={{ background: "transparent", border: `1px solid ${C.liveDim}`, color: C.live, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>▶ read</button>}
                        <button onClick={() => setDeskPortfolio(false)} aria-label="Close portfolio" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                      </span>
                    </div>
                    <div style={{ padding: "6px 10px" }}>
                      {positions.length === 0 && <div style={{ fontFamily: MONO, fontSize: 12, color: C.faint, padding: "6px 0" }}>No holdings yet — add symbol, shares, and your cost per share below.</div>}
                      {portfolioRows.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 4, fontFamily: MONO, fontSize: 12, color: C.faint, padding: "2px 0", borderBottom: `1px solid ${C.grid}` }}>
                          <span>SYMBOL</span><span style={{ textAlign: "right" }}>COST→NOW</span><span style={{ textAlign: "right" }}>VALUE</span><span style={{ textAlign: "right" }}>P&L</span><span />
                        </div>
                      )}
                      {portfolioRows.map(r => (
                        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 4, alignItems: "center", fontFamily: MONO, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.grid}` }}>
                          <button onClick={() => setSelected(r.sym)} style={{ background: "transparent", border: "none", color: C.text, fontFamily: MONO, fontSize: 12, fontWeight: 510, textAlign: "left", cursor: "pointer", padding: 0 }}>{r.sym} <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>×{r.shares}</span></button>
                          <span style={{ textAlign: "right", color: C.muted, fontSize: 10, ...privacyStyle }} aria-label={prefs.privacy ? t("hidden") : undefined}>{fmt(r.cost / r.shares)}→{r.price != null ? fmt(r.price) : "—"}</span>
                          <span style={{ textAlign: "right", color: C.text, ...privacyStyle }} aria-label={prefs.privacy ? t("hidden") : undefined}>{r.val != null ? fmt(r.val) : "—"}</span>
                          <span style={{ textAlign: "right", color: dirColorN(r.pnl), ...privacyStyle }} aria-label={prefs.privacy ? t("hidden") : undefined}>{r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)}`}{r.pnlPct != null ? <span style={{ fontSize: 10, display: "block", color: dirColorN(r.pnl) }}>{r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%</span> : null}</span>
                          <button onClick={() => removePosition(r.id)} aria-label="Remove" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 11 }}>✕</button>
                        </div>
                      ))}
                      {positions.length > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", fontFamily: MONO, fontSize: 12, fontWeight: 510 }}>
                          {priv(<span style={{ color: C.muted }}>TOTAL · {fmt(portTotals.val)}</span>)}
                          {priv(<span style={{ color: dirColorN(portTotals.pnl) }}>{prefDirGlyph(portTotals.pnl > 0 ? "up" : portTotals.pnl < 0 ? "down" : "flat") ? `${prefDirGlyph(portTotals.pnl > 0 ? "up" : portTotals.pnl < 0 ? "down" : "flat")} ` : ""}{portTotals.pnl >= 0 ? "+" : ""}{fmt(portTotals.pnl)} ({portTotals.pnlPct >= 0 ? "+" : ""}{portTotals.pnlPct.toFixed(2)}%)</span>)}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                        <input value={portForm.sym} onChange={e => setPortForm(f => ({ ...f, sym: e.target.value.toUpperCase() }))} placeholder="SYM" aria-label="Symbol"
                          style={{ width: 60, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 6px" }} />
                        <input value={portForm.shares} onChange={e => setPortForm(f => ({ ...f, shares: e.target.value }))} placeholder="shares" inputMode="decimal" aria-label="Shares"
                          style={{ width: 64, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 6px" }} />
                        <input value={portForm.cost} onChange={e => setPortForm(f => ({ ...f, cost: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPosition()} placeholder="cost / share" inputMode="decimal" aria-label="Cost basis"
                          style={{ flex: 1, minWidth: 0, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 6px" }} />
                        <button onClick={addPosition} style={{ background: C.accentPress, border: "none", color: C.textOnAccent, borderRadius: R.sm, fontFamily: SANS, fontSize: 13, fontWeight: 510, padding: "0 12px", cursor: "pointer" }}>+ add</button>
                      </div>
                    </div>
                  </div>
                )}
                {/* --- news & video ---
                     News is a desk RESULT, so it belongs in the box results
                     appear in — beside the navigator answer, the calendar, the
                     portfolio and the report — not in a section of its own
                     under the composer. Compact: this column is narrower than
                     the desk, so the cards run single file.
                     Keeps #sec-news so the News nav item still lands on it. */}
                {panels.news && (news?.news?.length > 0 || news?.videos?.length > 0 || newsBusy || newsErr) && (
                  <div id="sec-news" style={{ borderTop: `1px solid ${C.panelEdge}` }}>
                    <NewsDesk
                      items={news?.news || []}
                      videos={news?.videos || []}
                      subject={selected}
                      loadedFor={newsFor}
                      busy={newsBusy}
                      error={newsErr}
                      stale={!!news && newsFor !== selected}
                      onLoad={fetchNews}
                      onBroadcast={broadcastNews}
                      onPlayVideo={openVideo}
                      onReadStory={readStory}
                      readingTitle={typeof speakingId === "string" && speakingId.startsWith("story:") ? speakingId.slice(6) : null}
                      onAskStory={askStory}
                      hrefFor={newsHref}
                      compact
                    />
                  </div>
                )}
                {/* --- analyst report ---
                     The desk's conversational answer now lives in the chat
                     transcript below; what remains here is the long-form report,
                     which is a document to scroll rather than a chat turn. */}
                {writtenReport && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: (aiResponses.nav || news) ? `1px solid ${C.panelEdge}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}`, ...TYPE.eyebrow, color: C.muted }}>
                      <span>📝 ANALYST REPORT — {reportSym || selected}</span>
                      <span style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => (speakingId === "report" ? stopSpeak() : speak("report", writtenReport))}
                          style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>{speakingId === "report" ? "■" : "▶ read"}</button>
                        <button onClick={() => setWrittenReport("")} aria-label="Dismiss report" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
                      </span>
                    </div>
                    <div style={{ padding: "12px 14px", fontSize: 13, lineHeight: 1.7, color: C.text, maxHeight: 320, overflowY: "auto" }}><RichText text={writtenReport} /></div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}
          {/* ===== chat assistant =====
               Replaces the old single-line question bar. The engine is unchanged —
               askDesk() still does the routing, intent matching and model fallback —
               but the exchange is now a transcript instead of one answer that
               overwrites the last, so follow-ups like "why?" have something to
               refer back to. Turns are mirrored in from `aiResponses` by
               syncChatBubble() above.

               In `suggestions`, label is what the chip says and value is what the
               desk actually receives — the fuller prompt gets a better answer than
               the chip's shorthand would.

               The anchor column sits in this row (it used to lead the desk):
               the presenter is in view from the composer, instead of a scroll
               of responses above it.

               `busy` is scoped to the desk answer on purpose: `aiResponses`
               accumulates entries from several features, so asking "is anything
               running" would let one stalled entry lock the composer for good. */}
          <div id="tour-ask" className="v-askrow" style={{ borderTop: `1px solid ${C.panelEdge}` }}>
            {/* desk anchor */}
            <div id="tour-anchor" className="v-deskrow-anchor" style={{ background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, padding: "10px 8px" }}>
              <DeskAnchor
                talking={speakingId != null}
                mood={selectedRow?.chgPct}
                speakerLabel={aiModels.find(m => m.id === speakingId)?.label}
                character={CHARACTERS.find(c => c.id === characterId)}
                analyserRef={analyserRef}
                speechRef={speechMouthRef}
                env={envId}
                crew={
                  crewId === "off" ? null :
                  crewId === "auto"
                    ? CHARACTERS[(CHARACTERS.findIndex(c => c.id === characterId) + 1) % CHARACTERS.length]
                    : CHARACTERS.find(c => c.id === crewId) || null
                }
                cue={anchorCue}
                onAction={playActionSfx}
                onCue={playCueSfx}
                busy={
                  gameOn ? "teach"
                  : presenting ? "present"
                  : (reportBusy || Object.values(aiResponses).some(r => r?.status === "running")) ? "work"
                  : null
                }
              />
              {/* anchor + environment pickers — dropdowns scale cleanly past a dozen options; arrows browse */}
              <div style={{ display: "grid", gap: 6, marginTop: 8, width: 190 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button
                    onClick={() => { const i = CHARACTERS.findIndex(c => c.id === characterId); setCharacterId(CHARACTERS[(i - 1 + CHARACTERS.length) % CHARACTERS.length].id); }}
                    aria-label="Previous anchor" className="v-tap"
                    style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 12, lineHeight: 1, padding: "5px 8px", cursor: "pointer" }}>‹</button>
                  <select value={characterId} onChange={e => setCharacterId(e.target.value)} aria-label="Anchor"
                    style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "5px 6px", cursor: "pointer" }}>
                    {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    onClick={() => { const i = CHARACTERS.findIndex(c => c.id === characterId); setCharacterId(CHARACTERS[(i + 1) % CHARACTERS.length].id); }}
                    aria-label="Next anchor" className="v-tap"
                    style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 12, lineHeight: 1, padding: "5px 8px", cursor: "pointer" }}>›</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint, flexShrink: 0 }}>{t("SET")}</span>
                  <select value={envId} onChange={e => setEnvId(e.target.value)} aria-label="Environment"
                    style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.muted, fontFamily: SANS, fontSize: 11, padding: "5px 6px", cursor: "pointer" }}>
                    {ENVIRONMENTS.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
                {speakingId ? (
                  <button onClick={stopSpeak}
                    style={{ background: "transparent", border: `1px solid ${C.down}`, color: C.down, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "6px 0", cursor: "pointer" }}>
                    ■ {t("stop reading")}
                  </button>
                ) : (
                  <button onClick={() => { setSettingsTab("anchor"); setShowSettings(true); }}
                    style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.faint, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "6px 0", cursor: "pointer" }}>
                    {t("voice & anchor settings")}
                  </button>
                )}
              </div>
            </div>
            <div className="v-askrow-chat">
            <ChatAssistant
              embedded
              compact
              messages={chatThread}
              attachments={deskAttachments}
              onSend={(text) => askDesk(text)}
              onClear={() => { stopAsk(); setChatThread([]); }}
              /* Retry re-asks the question that produced the failed answer, not
                 the last thing typed — by the time someone hits it they may have
                 typed something else into the composer. The user turn sits
                 directly above its answer, so walk back to it. */
              onRetry={(m) => {
                const i = chatThread.findIndex(x => x.id === m.id);
                const asked = i > 0 ? [...chatThread.slice(0, i)].reverse().find(x => x.role === "user") : null;
                if (asked?.text) askDesk(asked.text);
                else if (lastAsked) askDesk(lastAsked);
              }}
              onStop={stopAsk}
              onSpeak={(m) => (speakingId === m.id ? stopSpeak() : speak(m.id, m.text))}
              speakingId={speakingId}
              busy={aiResponses.desk?.status === "running" || reportBusy}
              subject={selected}
              placeholder={t('Ask about {sym} — or tap a suggestion below').replace("{sym}", selected)}
              suggestions={[
                { label: t("Summarize {sym} today").replace("{sym}", selected), value: `Summarize ${selected} today — price action and why` },
                { label: t("What's moving today?"), value: "What's moving in the market today and why?" },
                { label: t("Take me to Robinhood"), value: "take me to Robinhood" },
                { label: t("What's on Netflix?"), value: "what's on netflix" },
                { label: t("Write a report → PPT"), value: "write a report and export ppt" },
              ]}
              toolbar={voiceSupported ? (
                <button onClick={toggleVoice} aria-label={listening ? "Stop listening" : "Talk to the desk"} title="Talk to the desk"
                  className={listening ? "v-tap v-pulse" : "v-tap"}
                  aria-pressed={listening}
                  /* Recording is an on-air state, so it wears the broadcast red
                     (white on liveFill is 5.5:1). At rest the icon sits in muted
                     ink — visible, but quieter than Send. */
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: listening ? C.liveFill : "transparent", color: listening ? C.textOnLive : C.muted, border: `1px solid ${listening ? C.liveFill : C.edge}`, borderRadius: R.sm, padding: "7px 10px", cursor: "pointer", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                </button>
              ) : null}
            />
            {exportMsg && (
              <div style={{ marginTop: 8, ...TYPE.bodySm, fontSize: 12, color: exportMsg.startsWith("✗") ? C.down : exportMsg.startsWith("✓") ? C.up : C.muted }}>
                {exportMsg}
              </div>
            )}
            </div>
          </div>

          {/* The stage. When nothing is on the desk, the space beside the
              anchor offers the desk's verbs instead of rendering as a void —
              every card here is an existing capability whose result fills
              this same slot, so the empty state teaches the filled one. */}
          {!gameOn && !deskBoxFilled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderTop: `1px solid ${C.panelEdge}` }}>
              <div style={{ ...TYPE.eyebrowSm, color: C.faint }}>{t("ON THE DESK")} · {selected}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                {[
                  ["📰", newsBusy ? "Searching…" : "Load the news", `latest ${selected} headlines and video`, () => fetchNews(), newsBusy],
                  ["💼", "Portfolio on desk", "positions and P&L", () => setDeskPortfolio(true), false],
                  ["📅", "Calendar on desk", "your events and market earnings", () => setDeskCalendar(true), false],
                  ["📈", "Full chart", `the full ${selected} chart`, () => openChart(selected), false],
                ].map(([icon, label, hint, run, off]) => (
                  <button key={hint} onClick={run} disabled={off} className="v-lift"
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5, textAlign: "left",
                      background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.lg,
                      padding: "12px 14px", cursor: off ? "default" : "pointer", opacity: off ? 0.6 : 1, minHeight: 88,
                    }}>
                    <span aria-hidden="true" style={{ fontSize: 15, color: C.accentText }}>{icon}</span>
                    <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 13, color: C.text }}>{label}</span>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: C.faint, lineHeight: 1.45 }}>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>


      {/* ===== main grid ===== */}
      <div className="v-dash">

        {/* left rail: watchlist + portfolio */}
        <div className="v-dash-col v-dash-left">
        {/* --- watchlist --- */}
        {panels.watchlist && (
        <div id="sec-watchlist" style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 32, boxSizing: "border-box", padding: "0 6px 0 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
            <span style={{ ...TYPE.eyebrow, color: C.muted }}>{t("WATCHLIST")}</span>
            <span style={{ display: "flex" }}>
              {[["list", "≡", "List"], ["heat", "▦", "Heat map"]].map(([id, glyph, hint]) => (
                <button key={id} onClick={() => setWlView(id)} title={hint} aria-pressed={wlView === id} aria-label={`${id} view`} className="v-tap"
                  style={{ background: wlView === id ? "#161718" : "transparent", border: "none", color: wlView === id ? C.accentText : C.muted, fontFamily: SANS, fontSize: 12, padding: "4px 9px", cursor: "pointer", borderRadius: R.sm, transition: `background ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}` }}>
                  {glyph}
                </button>
              ))}
            </span>
          </div>
          {/* heat grid: one tile per symbol; colour carries direction, intensity
              carries the size of the move relative to today's biggest. Uses
              dirColorN so the colour-blind palette applies here too. */}
          {wlView === "heat" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, padding: 10 }}>
              {(() => {
                const rows = watchlist.map(getRow).filter(Boolean);
                const maxAbs = Math.max(0.5, ...rows.map(r => Math.abs(r.chgPct ?? 0)));
                const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(2)})`; };
                return rows.map(r => {
                  const on = r.sym === selected;
                  const alpha = 0.10 + (Math.abs(r.chgPct ?? 0) / maxAbs) * 0.42;
                  return (
                    <button key={r.sym} onClick={() => setSelected(r.sym)}
                      aria-label={`${r.sym} ${fmt(r.price)} ${pct(r.chgPct)}`}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                        padding: "9px 10px", borderRadius: R.md, cursor: "pointer", textAlign: "left",
                        background: hexA(dirColorN(r.chg), alpha),
                        border: `1px solid ${on ? C.accent : "transparent"}`,
                        transition: "background 0.5s ease",
                      }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: on ? C.accentText : C.text }}>{r.sym}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, opacity: 0.8 }}>{fmt(r.price)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: dirColorN(r.chg) }}>{pct(r.chgPct)}</span>
                    </button>
                  );
                });
              })()}
            </div>
          )}
          {wlView === "list" && watchlist.map(s => {
            const r = getRow(s);
            if (!r) return null;
            const on = s === selected;
            return (
              <button
                key={s}
                className="wl-row"
                onClick={() => setSelected(s)}
                style={{
                  display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 12px", background: on ? "#161718" : "transparent",
                  border: "none", borderLeft: `2px solid ${on ? C.accent : "transparent"}`,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 510, color: on ? C.accentText : C.text }}>{s}</span>
                {/* the shape of the session, at a glance — dotted line is prev close */}
                <span aria-hidden="true" style={{ flex: 1, display: "flex", justifyContent: "center", padding: "0 10px", color: C.faint, minWidth: 0, overflow: "hidden" }}>
                  <Sparkline data={getCloses(s)} color={dirColorN(r.chg)} refValue={r.prevClose} />
                </span>
                <span style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}><TickFlash value={r.price}>{fmt(r.price)}</TickFlash></div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: dirColorN(r.chg) }}>{pct(r.chgPct)}</div>
                </span>
              </button>
            );
          })}
        </div>
        )}

        </div>

        {/* --- chart + stats --- */}
        <div className="v-dash-col v-dash-main">
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 24, letterSpacing: "-0.012em" }}>{selected}</span>
              {selectedRow?.name && <span className="v-coname" style={{ color: C.muted, fontSize: 12 }}>{selectedRow.name}</span>}
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 510, color: accent }}><TickFlash value={selectedRow?.price}>{selectedRow?.chg != null && prefDirGlyph(chgDir) ? `${prefDirGlyph(chgDir)} ` : ""}{fmt(selectedRow?.price)}</TickFlash></span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: live && liveBad[selected] ? C.down : dirColorN(selectedRow?.chg) }}>
                {selectedRow?.chg != null
                  ? `${prefDirGlyph(chgDir) ? prefDirGlyph(chgDir) + " " : ""}${selectedRow.chg >= 0 ? "+" : ""}${fmt(selectedRow.chg)} (${pct(selectedRow.chgPct)})`
                  : live && liveBad[selected] ? "unrecognized symbol" : "waiting for data…"}
              </span>
              {liveStale && (
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, background: "rgba(255,255,255,0.05)", borderRadius: R.xs, padding: "2px 6px", letterSpacing: "-0.013em" }}>
                  MARKET CLOSED
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, overflow: "hidden" }}>
                {[["line", t("LINE")], ["pnf", "P&F"]].map(([m, label]) => (
                  <button key={m} onClick={() => setChartMode(m)} className="v-tap"
                    title={m === "pnf" ? "Point & Figure — X/O columns, 3-box reversal" : "Line chart of the session tape"}
                    style={{ background: chartMode === m ? "#161718" : "transparent", border: "none", color: chartMode === m ? C.accentText : C.muted, fontFamily: SANS, fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
              {chartMode === "line" && (
                <div style={{ display: "flex", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, overflow: "hidden" }}>
                  {[
                    ["sma", "SMA20", chartSMA, () => setChartSMA(v => !v), "20-point moving average of the tape"],
                    ["hl", "H/L", chartHL, () => setChartHL(v => !v), "session high / low lines"],
                  ].map(([k, label, isOn, toggle, hint]) => (
                    <button key={k} onClick={toggle} title={hint} aria-pressed={isOn}
                      style={{ background: isOn ? "#161718" : "transparent", border: "none", color: isOn ? C.accentText : C.muted, fontFamily: SANS, fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                  <select value={chartVs || ""} onChange={e => setChartVs(e.target.value || null)} aria-label="Compare with"
                    title="Overlay another symbol — both plotted as % change"
                    style={{ background: chartVs ? "#161718" : "transparent", border: "none", borderLeft: `1px solid ${C.panelEdge}`, color: chartVs ? "#C08BFF" : C.muted, fontFamily: SANS, fontSize: 11, padding: "5px 6px", cursor: "pointer" }}>
                    <option value="" style={{ background: C.surface, color: C.text }}>vs —</option>
                    {watchlist.filter(x => x !== selected).map(x => <option key={x} value={x} style={{ background: C.surface, color: C.text }}>vs {x}</option>)}
                  </select>
                </div>
              )}
              <button onClick={() => openChart(selected)} title="Open the full chart"
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "5px 12px", cursor: "pointer" }}>
                {t("full chart")}
              </button>
            </div>

            {/* P&F gets extra height: box cells are square and scale with rows, so a
                session spanning ~20 boxes renders unreadably small inside the line
                chart's 300px. */}
            <div className={`v-chartbox${chartMode === "pnf" ? " is-pnf" : ""}`} style={{ marginTop: 10, position: "relative" }}>
              {chartMode === "pnf" ? (
                pnf && pnf.columns.length >= 2 ? (
                  /* the pattern callout sits in flow ABOVE the grid — overlaying it
                     covered the chart's top rows, which are the newest action */
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
                    {pnfPattern && (
                      <div style={{ alignSelf: "flex-start", fontFamily: SANS, fontSize: 11, fontWeight: 510, letterSpacing: "-0.010em", textTransform: "uppercase", color: pnfPattern.side === "bull" ? dirColorN(1) : dirColorN(-1), background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, padding: "4px 8px" }}>
                        {pnfPattern.name}
                      </div>
                    )}
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <PnFChart columns={pnf.columns} boxSize={pnf.boxSize} up={dirColorN(1)} down={dirColorN(-1)} />
                    </div>
                  </div>
                ) : (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: C.faint, fontFamily: MONO, fontSize: 12, textAlign: "center", padding: "0 24px" }}>
                    <div>{t("not enough movement for a P&F column yet")}</div>
                    {pnfWarmup && (
                      <>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {t("tracking {price} · box {box} · session range {lo}–{hi}")
                            .replace("{price}", fmt(pnfWarmup.last)).replace("{box}", fmt(pnfWarmup.boxSize))
                            .replace("{lo}", fmt(pnfWarmup.lo)).replace("{hi}", fmt(pnfWarmup.hi))}
                        </div>
                        <div style={{ fontSize: 11, color: C.accentText }}>
                          {pnfWarmup.kind === "first"
                            ? t("first column at ≥ {up} or < {down}").replace("{up}", fmt(pnfWarmup.up)).replace("{down}", fmt(pnfWarmup.down))
                            : pnfWarmup.down != null
                              ? t("column 2 needs a reversal < {down}").replace("{down}", fmt(pnfWarmup.down))
                              : t("column 2 needs a reversal ≥ {up}").replace("{up}", fmt(pnfWarmup.up))}
                        </div>
                      </>
                    )}
                  </div>
                )
              ) : chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={comparePlot || chartPlot} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: C.faint, fontSize: 12, fontFamily: MONO }} minTickGap={48} axisLine={{ stroke: C.panelEdge }} tickLine={false} />
                    <YAxis domain={comparePlot ? ["auto", "auto"] : yDomain} tick={{ fill: C.faint, fontSize: 12, fontFamily: MONO }} width={56} axisLine={false} tickLine={false} tickFormatter={v => (comparePlot ? `${v > 0 ? "+" : ""}${(+v).toFixed(1)}%` : fmt(v))} />
                    <Tooltip
                      contentStyle={{ background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, fontFamily: MONO, fontSize: 12 }}
                      labelStyle={{ color: C.muted }} itemStyle={{ color: C.text }}
                      formatter={(v, name) => (comparePlot
                        ? [`${v > 0 ? "+" : ""}${(+v).toFixed(2)}%`, name === "vs" ? chartVs : selected]
                        : [fmt(v), name === "sma" ? `SMA ${SMA_N}` : "price"])}
                    />
                    {comparePlot && (
                      <ReferenceLine y={0} stroke={C.faint} strokeDasharray="4 4"
                        label={{ value: "0%", fill: C.faint, fontSize: 12, fontFamily: MONO, position: "insideTopRight" }} />
                    )}
                    {!comparePlot && selectedRow?.prevClose != null && (
                      <ReferenceLine y={selectedRow.prevClose} stroke={C.faint} strokeDasharray="4 4"
                        label={{ value: `prev ${fmt(selectedRow.prevClose)}`, fill: C.faint, fontSize: 12, fontFamily: MONO, position: "insideTopRight" }} />
                    )}
                    {!comparePlot && sessionHL && (
                      <ReferenceLine y={sessionHL.hi} stroke={C.up} strokeOpacity={0.5} strokeDasharray="2 4"
                        label={{ value: `hi ${fmt(sessionHL.hi)}`, fill: C.up, fontSize: 12, fontFamily: MONO, position: "insideTopLeft" }} />
                    )}
                    {!comparePlot && sessionHL && (
                      <ReferenceLine y={sessionHL.lo} stroke={C.down} strokeOpacity={0.5} strokeDasharray="2 4"
                        label={{ value: `lo ${fmt(sessionHL.lo)}`, fill: C.down, fontSize: 12, fontFamily: MONO, position: "insideBottomLeft" }} />
                    )}
                    {/* C.info, not amber or a direction colour: the SMA is data,
                        and every other hue on this chart already has a meaning. */}
                    {!comparePlot && chartSMA && chartPlot.some(d => d.sma != null) && (
                      <Area type="monotone" dataKey="sma" stroke={C.info} strokeWidth={1.3} strokeDasharray="5 3" fill="transparent" isAnimationActive={false} dot={false} />
                    )}
                    {!comparePlot && <Area type="monotone" dataKey="price" stroke={accent} strokeWidth={1.8} fill="url(#fillArea)" isAnimationActive={false} dot={false} />}
                    {comparePlot && <Area type="monotone" dataKey="base" stroke={accent} strokeWidth={1.8} fill="url(#fillArea)" isAnimationActive={false} dot={false} />}
                    {/* the comparison line owns purple — every other hue here has a meaning already */}
                    {comparePlot && <Area type="monotone" dataKey="vs" stroke="#C08BFF" strokeWidth={1.5} fill="transparent" isAnimationActive={false} dot={false} />}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: live && liveBad[selected] ? C.down : C.faint, fontFamily: MONO, fontSize: 12, textAlign: "center", padding: "0 24px" }}>
                  {live && liveBad[selected] ? (
                    <>
                      <div>“{selected}” isn't a symbol Finnhub recognizes{suggestSym(selected) ? ` — did you mean ${suggestSym(selected)}?` : "."}</div>
                      {suggestSym(selected) && (
                        <button
                          onClick={() => { const t = suggestSym(selected); setSelected(t); if (!watchlist.includes(t)) setWatchlist(w => [...w, t]); }}
                          style={{ fontFamily: SANS, fontSize: 12, color: C.bg, background: C.accent, border: "none", borderRadius: R.sm, padding: "6px 12px", cursor: "pointer", fontWeight: 510 }}
                        >
                          Switch to {suggestSym(selected)}
                        </button>
                      )}
                    </>
                  ) : live ? "building session tape from live quotes — first points arrive within seconds" : "no data"}
                </div>
              )}
            </div>
            {chartMode === "pnf" && pnf && pnf.columns.length >= 2 && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.faint, marginTop: 6 }}>
                box {fmt(pnf.boxSize)} · {t("3-box reversal · this session")}
              </div>
            )}
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint, marginTop: 6 }}>
              {live
                ? "LIVE · quotes via Finnhub, polled every 15s · chart accumulates this session's polls"
                : "DEMO · simulated session from a seeded random-walk engine · ticks every ~2s"}
            </div>
          </div>

          {/* stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
            {[
              ["OPEN", selectedRow?.open], ["HIGH", selectedRow?.high],
              ["LOW", selectedRow?.low], ["PREV CLOSE", selectedRow?.prevClose],
              ["CHANGE", selectedRow?.chg], ["CHANGE %", selectedRow?.chgPct],
            ].map(([label, val]) => (
              <div key={label} style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, padding: "10px 12px" }}>
                <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.muted }}>{label}</div>
                <div style={{
                  fontFamily: MONO, fontSize: 14, fontWeight: 510, marginTop: 3,
                  color: label.startsWith("CHANGE") ? dirColorN(val) : C.text,
                }}>
                  {label.startsWith("CHANGE") && prefDirGlyph(val > 0 ? "up" : val < 0 ? "down" : "flat") ? `${prefDirGlyph(val > 0 ? "up" : val < 0 ? "down" : "flat")} ` : ""}{label === "CHANGE %" ? pct(val) : fmt(val)}
                </div>
              </div>
            ))}
            {selectedRow?.high != null && selectedRow?.low != null && selectedRow.high > selectedRow.low && (() => {
              const { low, high, price, prevClose, chg } = selectedRow;
              const at = v => `${Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100))}%`;
              return (
                <div style={{ gridColumn: "1 / -1", background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, padding: "10px 12px" }}
                  role="img" aria-label={`Day range: ${fmt(low)} to ${fmt(high)}, last ${fmt(price)}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.muted }}>{t("DAY RANGE")}</div>
                    <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint }}>● {t("last")}{prevClose != null && prevClose >= low && prevClose <= high ? ` · │ ${t("prev close")}` : ""}</div>
                  </div>
                  <div style={{ position: "relative", height: 6, background: C.grid, borderRadius: 3, marginTop: 11 }}>
                    {prevClose != null && prevClose >= low && prevClose <= high && (
                      <div style={{ position: "absolute", top: -3, bottom: -3, width: 2, borderRadius: 1, background: C.faint, left: at(prevClose) }} />
                    )}
                    <div style={{ position: "absolute", top: "50%", left: at(price), transform: "translate(-50%, -50%)", width: 10, height: 10, borderRadius: "50%", background: dirColorN(chg), boxShadow: `0 0 0 2px ${C.panel}`, transition: "left 0.5s ease, background 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: MONO, fontSize: 12 }}>
                    <span style={{ color: dirColorN(-1) }}>{fmt(low)}</span>
                    <span style={{ color: dirColorN(1) }}>{fmt(high)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* --- P&F pattern signals (below stats, only when a pattern is on the board) --- */}
          {panels.pnf && Object.keys(pnfSignals).length > 0 && (
            <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", ...TYPE.eyebrow, color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>✕○ {t("P&F SIGNALS")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, padding: 12 }}>
                {Object.entries(pnfSignals).map(([sym, p]) => (
                  <div key={sym} style={{ background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.md, padding: "10px 12px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: C.text }}>{sym}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11, marginTop: 3, color: p.side === "bull" ? dirColorN(1) : dirColorN(-1) }}>{p.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right rail: movers + trade */}
        <div className="v-dash-col v-dash-right">
        {/* --- movers --- */}
        {panels.movers && (
        <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", ...TYPE.eyebrow, color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>{t("TOP MOVERS")}</div>
          {movers.length === 0 && (
            <div style={{ padding: 12, fontFamily: SANS, fontSize: 11, color: C.faint }}>
              {watchlist.length === 0 ? "Add a symbol to rank today's movers." : "Waiting for quotes…"}
            </div>
          )}
          {(() => {
            const maxAbs = Math.max(0.01, ...movers.map(m => Math.abs(m.chgPct)));
            return movers.map(r => {
              const half = (Math.abs(r.chgPct) / maxAbs) * 50;
              const on = r.sym === selected;
              return (
                <button key={r.sym} className="wl-row" onClick={() => setSelected(r.sym)} aria-current={on ? "true" : undefined}
                  style={{ display: "block", width: "100%", padding: "10px 12px", background: on ? "#161718" : "transparent", border: "none", borderLeft: `2px solid ${on ? C.accent : "transparent"}`, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: C.text }}>
                      {r.sym} <span style={{ fontWeight: 400, color: C.faint }}>{fmt(r.price)}</span>
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: dirColorN(r.chg) }}>{prefDirGlyph(r.chg > 0 ? "up" : r.chg < 0 ? "down" : "flat") ? `${prefDirGlyph(r.chg > 0 ? "up" : r.chg < 0 ? "down" : "flat")} ` : ""}{pct(r.chgPct)}</span>
                  </div>
                  <div style={{ position: "relative", height: 5, background: C.grid, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.panelEdge }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, background: dirColorN(r.chg), left: r.chgPct >= 0 ? "50%" : `${50 - half}%`, width: `${half}%`, transition: "left 0.5s ease, width 0.5s ease" }} />
                  </div>
                </button>
              );
            });
          })()}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}`, fontFamily: SANS, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
            {t("ranked by |Δ%| across your watchlist")}
          </div>
        </div>
        )}

        {/* --- Portfolio (right rail) --- */}
        {panels.portfolio && (
          <div id="sec-portfolio" style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ ...TYPE.eyebrow, color: C.muted }}>{t("Portfolio")}</span>
              {positions.length > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {priv(<span style={{ fontFamily: MONO, fontSize: 12, color: dirColorN(portTotals.pnl) }}>{prefDirGlyph(portTotals.pnl > 0 ? "up" : portTotals.pnl < 0 ? "down" : "flat") ? `${prefDirGlyph(portTotals.pnl > 0 ? "up" : portTotals.pnl < 0 ? "down" : "flat")} ` : ""}{portTotals.pnl >= 0 ? "+" : ""}{fmt(portTotals.pnl)} ({portTotals.pnlPct >= 0 ? "+" : ""}{portTotals.pnlPct.toFixed(2)}%)</span>)}
                  <button onClick={briefPortfolio} title={t("Read on air")} aria-label={t("Read on air")} className="v-tap" style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.accentText, borderRadius: R.xs, fontFamily: SANS, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>▶</button>
                </span>
              )}
            </div>
            {positions.length > 0 && (() => {
              const series = portfolioRows
                .map(r => ({ closes: getCloses(r.sym), shares: r.shares }))
                .filter(x => x.closes.length > 1);
              if (!series.length) return null;
              const n = Math.min(...series.map(x => x.closes.length));
              const totals = Array.from({ length: n }, (_, i) =>
                series.reduce((a, x) => a + x.closes[x.closes.length - n + i] * x.shares, 0));
              const refVals = portfolioRows.map(r => ({ pc: getRow(r.sym)?.prevClose, sh: r.shares }));
              const refValue = refVals.every(x => x.pc != null) ? refVals.reduce((a, x) => a + x.pc * x.sh, 0) : null;
              return (
                <div style={{ padding: "8px 12px 0", display: "flex", alignItems: "center", gap: 10, color: C.faint }}>
                  <Sparkline data={totals} width={132} height={28} color={dirColorN(portTotals.pnl)} refValue={refValue} />
                  <span title="Dotted line marks yesterday's value" style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>SESSION VALUE</span>
                </div>
              );
            })()}
            {/* Allocation strip: each holding's share of portfolio value, coloured
                by its P&L direction. Percent-of-total only — no dollar amounts —
                so it stays honest with privacy mode on. */}
            {portfolioRows.length > 1 && (() => {
              const slices = portfolioRows.map(r => ({ sym: r.sym, v: (r.price != null ? r.price : r.cost / r.shares) * r.shares, pnl: r.pnl ?? 0 }));
              const total = slices.reduce((a, x) => a + x.v, 0);
              if (!(total > 0)) return null;
              return (
                <div style={{ padding: "8px 12px 4px" }}>
                  <div role="img" aria-label={`Allocation by value: ${slices.map(x => `${x.sym} ${(x.v / total * 100).toFixed(0)}%`).join(", ")}`}
                    style={{ display: "flex", height: 6, borderRadius: R.xs, overflow: "hidden", gap: 1 }}>
                    {slices.map(x => (
                      <span key={x.sym} title={`${x.sym} · ${(x.v / total * 100).toFixed(1)}% of portfolio value`}
                        style={{ width: `${(x.v / total * 100).toFixed(2)}%`, background: dirColorN(x.pnl), opacity: 0.85, minWidth: 2 }} />
                    ))}
                  </div>
                  <div style={{ marginTop: 4, fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>{t("ALLOCATION BY VALUE")}</div>
                </div>
              );
            })()}
            {(() => {
              const maxPnl = Math.max(0.5, ...portfolioRows.map(r => Math.abs(r.pnlPct ?? 0)));
              return portfolioRows.map(r => (
              <button key={r.id} className="wl-row" onClick={() => setSelected(r.sym)} aria-current={r.sym === selected ? "true" : undefined}
                style={{ display: "block", width: "100%", padding: "8px 12px", background: r.sym === selected ? "#161718" : "transparent", border: "none", borderLeft: `2px solid ${r.sym === selected ? C.accent : "transparent"}`, borderTop: `1px solid ${C.grid}`, cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 510, color: C.text }}>{r.sym} <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>×{r.shares}</span></span>
                  {priv(<span style={{ fontFamily: MONO, fontSize: 12, color: dirColorN(r.pnl) }}>{r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)}`}</span>)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  {priv(<span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>@{fmt(r.cost / r.shares)} → {r.price != null ? fmt(r.price) : "—"}</span>)}
                  {priv(<span style={{ fontFamily: MONO, fontSize: 12, color: dirColorN(r.pnl) }}>{r.pnlPct == null ? "" : `${r.pnlPct >= 0 ? "+" : ""}${r.pnlPct.toFixed(1)}%`}</span>)}
                  <span onClick={e => { e.stopPropagation(); removePosition(r.id); }} style={{ fontFamily: MONO, fontSize: 12, color: C.faint, cursor: "pointer" }}>✕</span>
                </div>
                {r.pnlPct != null && (
                  <div style={{ position: "relative", height: 4, background: C.grid, borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.panelEdge }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, background: dirColorN(r.pnl), transition: "left 0.5s ease, width 0.5s ease",
                      left: r.pnlPct >= 0 ? "50%" : `${50 - (Math.abs(r.pnlPct) / maxPnl) * 50}%`, width: `${(Math.abs(r.pnlPct) / maxPnl) * 50}%` }} />
                  </div>
                )}
              </button>
              ));
            })()}
            <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}` }}>
              <input value={portForm.sym} onChange={e => setPortForm(f => ({ ...f, sym: e.target.value.toUpperCase() }))} placeholder="SYM" aria-label="Symbol"
                style={{ width: 56, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 7px" }} />
              <input value={portForm.shares} onChange={e => setPortForm(f => ({ ...f, shares: e.target.value }))} placeholder="qty" inputMode="decimal" aria-label="Shares"
                style={{ width: 48, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 7px" }} />
              <input value={portForm.cost} onChange={e => setPortForm(f => ({ ...f, cost: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPosition()} placeholder="$ cost" inputMode="decimal" aria-label="Cost basis"
                style={{ flex: 1, minWidth: 0, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 7px" }} />
              <button onClick={addPosition} aria-label="Add position" style={{ background: C.accentPress, border: "none", color: C.textOnAccent, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, letterSpacing: "-0.010em", padding: "0 12px", cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
            </div>
            {positions.length === 0 && <div style={{ padding: "0 12px 10px", fontFamily: SANS, fontSize: 10, color: C.faint, lineHeight: 1.5 }}>Symbol, shares, cost per share.</div>}
          </div>
        )}

        {/* --- Price alerts (right rail, only when armed) --- */}
        {priceAlerts.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", ...TYPE.eyebrow, color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>{t("Price alerts")}</div>
            {priceAlerts.map(a => {
              const row = getRow(a.sym); const cur = row?.price;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.grid}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{a.sym}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: a.op === ">" ? C.up : C.down }}>{a.op === ">" ? "▲ ≥" : "▼ ≤"} {fmt(a.price)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint, marginLeft: "auto" }}>now {cur != null ? fmt(cur) : "—"}</span>
                  <button onClick={() => removeAlert(a.id)} aria-label="Remove alert" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 11 }}>✕</button>
                </div>
              );
            })}
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.panelEdge}`, fontFamily: SANS, fontSize: 12, color: C.faint, lineHeight: 1.5 }}>Say "alert me when <span style={{ fontFamily: MONO, color: C.muted }}>{selected}</span> hits <span style={{ fontFamily: MONO, color: C.muted }}>{fmt((getRow(selected)?.price || 100) * 1.05, 0)}</span>" to add more.</div>
          </div>
        )}

        {/* --- Vantage Calendar (native, right rail) --- */}
        {panels.calendar && (
          <div id="app-calendar-panel" style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 32, boxSizing: "border-box", padding: "0 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ ...TYPE.eyebrow, color: C.muted }}>{t("Calendar")}</span>
              <span style={{ fontFamily: SANS, fontSize: 10, color: C.faint }}>saved on this device</span>
            </div>
            <AppCalendar extra={marketEvents} />
          </div>
        )}
        </div>
      </div>

      {/* ===== spotlight coach-marks: dim the screen, cut a hole around the real element, narrate ===== */}
      {tourMode === "spotlight" && (() => {
        const step = TOUR_STEPS[tourStep];
        const last = tourStep === TOUR_STEPS.length - 1;
        const r = tourRect, pad = 8;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const TIPW = Math.min(320, vw - 24); // never wider than the viewport
        let left = (vw - TIPW) / 2, top = Math.max(12, vh - 300);
        if (r) {
          left = Math.min(Math.max(12, r.x), vw - TIPW - 12);
          const belowY = r.y + r.h + pad + 12;
          const roomBelow = vh - belowY - 12;
          const roomAbove = r.y - pad - 12;
          top = (roomBelow >= 200 || roomBelow >= roomAbove) ? Math.max(12, belowY) : 12;
        }
        const maxH = vh - top - 12; // cap so the card + its buttons always fit; scroll if longer
        const tip = { left, top };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }}>
              <defs>
                <mask id="tour-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {r && <rect x={r.x - pad} y={r.y - pad} width={r.w + pad * 2} height={r.h + pad * 2} rx="8" fill="black" />}
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(5,8,13,0.80)" mask="url(#tour-mask)" />
              {r && <rect x={r.x - pad} y={r.y - pad} width={r.w + pad * 2} height={r.h + pad * 2} rx="8" fill="none" stroke={C.accent} strokeWidth="2" />}
            </svg>
            <div style={{ position: "absolute", boxSizing: "border-box", width: TIPW, maxWidth: "calc(100vw - 24px)", left: tip.left, top: tip.top, maxHeight: maxH, overflowY: "auto", background: C.panel, border: `1px solid ${C.accent}`, borderRadius: R.md, padding: 16, boxShadow: "0 16px 50px rgba(0,0,0,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>TOUR · {tourStep + 1}/{TOUR_STEPS.length}</span>
                <button onClick={endSpotlight} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 11, cursor: "pointer" }}>{t("exit")} ✕</button>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 15, letterSpacing: "-0.011em", color: C.accentText, marginTop: 6 }}>{t(step.title)}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.65, color: C.text, marginTop: 8 }}>{t(step.body)}</div>
              <div style={{ display: "flex", gap: 4, margin: "12px 0" }}>
                {TOUR_STEPS.map((_, i) => (
                  <button key={i} onClick={() => setTourStep(i)} aria-label={`Step ${i + 1}`}
                    style={{ flex: 1, height: 3, borderRadius: 2, border: "none", padding: 0, cursor: "pointer", background: i <= tourStep ? C.accent : C.grid }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={endSpotlight} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 11, cursor: "pointer" }}>{t("skip tour")}</button>
                <div style={{ display: "flex", gap: 6 }}>
                  {tourStep > 0 && (
                    <button onClick={() => setTourStep(s => s - 1)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>{t("Back")}</button>
                  )}
                  <button onClick={() => (last ? endSpotlight() : setTourStep(s => s + 1))} style={{ background: C.accentPress, border: "none", color: C.textOnAccent, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "6px 16px", cursor: "pointer" }}>{last ? t("Done") : t("Next")}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== anchor-led auto demo: a slim banner while the desk drives itself ===== */}
      {demoRunning && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 65, display: "flex", alignItems: "center", gap: 12, background: C.panel, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "7px 8px 7px 16px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", fontFamily: MONO, fontSize: 12, color: C.text }}>
          <span className="cursor" style={{ color: C.down }}>▶</span> Demo — the anchor is driving
          <button onClick={stopDemo} style={{ background: "rgba(235,87,87,0.14)", border: `1px solid ${C.down}`, color: C.down, borderRadius: 999, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "5px 14px", cursor: "pointer" }}>■ stop</button>
        </div>
      )}

      {/* ===== interactive missions: a docked checklist that ticks off as you use the app ===== */}
      {missionsOpen && (() => {
        const done = MISSIONS.filter(m => missionsDone.has(m.id)).length;
        const allDone = done === MISSIONS.length;
        return (
          <div className="v-rise" style={{ position: "fixed", left: 12, bottom: 12, zIndex: 55, width: 268, maxWidth: "92vw", background: C.panel, border: `1px solid ${C.accent}`, borderRadius: R.lg, boxShadow: "0 12px 40px rgba(0,0,0,0.55)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ ...TYPE.eyebrow, color: C.muted }}>{t("Getting started")} · <span style={{ color: C.accentText }}>{done}/{MISSIONS.length}</span></span>
              <button onClick={() => setMissionsOpen(false)} aria-label="Close missions" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>✕</button>
            </div>
            <div style={{ padding: "6px 12px 10px" }}>
              {MISSIONS.map(m => {
                const ok = missionsDone.has(m.id);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 0", borderBottom: `1px solid ${C.grid}` }}>
                    <span aria-hidden="true" style={{
                      width: 15, height: 15, marginTop: 1, flexShrink: 0, borderRadius: R.xs, boxSizing: "border-box",
                      background: ok ? C.accent : "transparent", border: `1px solid ${ok ? C.accent : C.panelEdge}`,
                      display: "grid", placeItems: "center", color: "#08090a", fontSize: 10, fontWeight: 510,
                      transition: "background .15s, border-color .15s",
                    }}>{ok ? "✓" : ""}</span>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: SANS, fontSize: 13, color: ok ? C.faint : C.text, textDecoration: ok ? "line-through" : "none" }}>{m.label}</span>
                      {!ok && <span style={{ fontFamily: SANS, fontSize: 11, color: C.faint, marginTop: 1 }}>{m.hint}</span>}
                    </span>
                  </div>
                );
              })}
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 5, borderRadius: 3, background: C.grid, overflow: "hidden" }}>
                  <div style={{ width: `${(done / MISSIONS.length) * 100}%`, height: "100%", background: C.text, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: allDone ? C.up : C.faint, marginTop: 8, textAlign: "center" }}>
                  {allDone ? "🎉 All six. You know the desk." : "These check off as you use the app."}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== setup guide: explains the setup process — what each key does, required vs optional ===== */}
      {setupOpen && (
        <div role="dialog" aria-label="Setup guide"
          style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 61, padding: 16 }}
          onClick={() => setSetupOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 520, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.accent}`, borderRadius: R.lg, padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 17, letterSpacing: "-0.010em", color: C.accentText }}>⚙️ SETUP GUIDE</div>
              <button onClick={() => setSetupOpen(false)} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.7, color: C.text, marginTop: 10 }}>
              Vantage works right now — <b style={{ color: C.text }}>there are no keys to paste</b>. Every provider is wired up on the server, so this is just what the desk can do and where to find it.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {SETUP_STEPS.map((s, i) => (
                <div key={i} style={{ background: "#161718", border: `1px solid ${s.req ? C.accent : C.panelEdge}`, borderRadius: R.md, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{s.icon}</span>
                    <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 14, color: C.text }}>{s.name}</span>
                    <span style={{ marginLeft: "auto", fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: s.req ? "#08090a" : C.faint, background: s.req ? C.accent : "transparent", border: `1px solid ${s.req ? C.accent : C.panelEdge}`, borderRadius: 999, padding: "2px 8px" }}>{s.need.toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.6, color: C.muted, marginTop: 7 }}>{s.what}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.6, color: C.text, marginTop: 5 }}>
                    <span style={{ color: C.faint }}>How: </span>{s.how}{" "}
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: C.accentText }}>{s.link}</a>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button onClick={() => { setSetupOpen(false); setSettingsTab("quick"); setShowSettings(true); }}
                style={{ flex: 1, minWidth: 180, background: C.accentPress, border: "none", color: C.textOnAccent, borderRadius: 5, fontFamily: SANS, fontSize: 12, fontWeight: 510, padding: "10px 0", cursor: "pointer" }}>
                Open Settings →
              </button>
              <button onClick={() => setSetupOpen(false)}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 5, fontFamily: SANS, fontSize: 12, padding: "10px 18px", cursor: "pointer" }}>
                later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== tutorial — a guided, click-to-try walkthrough of every feature ===== */}
      {showTutorial && (
        <div role="dialog" aria-label="Welcome to Vantage"
          style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div className="v-rise" style={{ width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.accent}`, borderRadius: R.lg, padding: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>
            <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 20, letterSpacing: "-0.012em", color: C.accentText }}>
              VANTAGE <span style={{ fontSize: 10, letterSpacing: "-0.010em", color: C.faint, fontWeight: 510 }}>· GETTING STARTED</span>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.55, color: C.text, marginTop: 7 }}>
              Your AI market desk — an animated anchor that charts stocks, answers out loud, reads the news, even plays trailers. Pick how you'd like to learn it:
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.55, color: C.muted, marginTop: 7, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.md, padding: "8px 10px" }}>
              💡 <b style={{ color: C.text }}>No setup required.</b> Demo mode runs on nothing at all, and the AI desk, live prices, streaming and video switch on automatically when this server provides them — there are no keys to paste.
            </div>
            {!aiReady() && (
              <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.6, color: C.down, marginTop: 8, background: "rgba(235,87,87,0.08)", border: `1px solid ${C.down}`, borderRadius: R.md, padding: "8px 10px" }}>
                ⚠ <b>No AI key set up yet.</b> Charts, news, games, streaming and the calendar all work — but the desk can't answer questions until you add one.{" "}
                <button onClick={() => { setShowTutorial(false); setSetupOpen(true); }} style={{ background: "transparent", border: "none", color: C.accentText, textDecoration: "underline", cursor: "pointer", fontFamily: SANS, fontSize: 11, padding: 0 }}>Set it up →</button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
              {[
                { icon: "🔦", title: "Take the guided tour", desc: "I'll spotlight each part of the screen, step by step.", cta: "Start tour", on: launchSpotlight },
                { icon: "▶", title: "Watch me demo it", desc: "Sit back — I'll chart a stock, ask a question, ring the bell.", cta: "Play demo", on: runDemo },
                { icon: "🎯", title: "Try the missions", desc: "Six hands-on tasks that check off as you do them.", cta: "Show missions", on: launchMissions },
                { icon: "⚙️", title: "Set it up (keys & options)", desc: "What each key does and where to get it.", cta: "Setup guide", on: () => { setShowTutorial(false); setSetupOpen(true); } },
              ].map((o, i) => (
                <button key={i} onClick={o.on}
                  style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 11, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.md, padding: "9px 12px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.accent} onMouseLeave={e => e.currentTarget.style.borderColor = C.panelEdge}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{o.icon}</span>
                  <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: SANS, fontWeight: 510, fontSize: 13, color: C.text }}>{o.title}</span>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{o.desc}</span>
                  </span>
                  <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 510, color: C.accentText, whiteSpace: "nowrap" }}>{o.cta} →</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 11, gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: SANS, fontSize: 11, color: C.faint }}>Replay anytime from Settings → DATA SOURCE</span>
              <button onClick={() => setShowTutorial(false)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.muted; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.panelEdge; e.currentTarget.style.color = C.muted; }}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 5, fontFamily: SANS, fontSize: 11, fontWeight: 510, cursor: "pointer", padding: "8px 16px", whiteSpace: "nowrap", transition: "border-color .12s, color .12s" }}>
                {t("skip — I'll explore on my own")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== settings modal ===== */}
      {showSettings && (
        <div role="dialog" aria-label="Settings"
          style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.header + 1 }}
          onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()} className="v-rise"
            style={{ width: 520, maxWidth: "94vw", maxHeight: "86vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: R.lg }}>

            {/* tab bar */}
            <div style={{ display: "flex", gap: 4, padding: "0 6px", borderBottom: `1px solid ${C.panelEdge}`, position: "sticky", top: 0, zIndex: 2, background: C.panel }}>
              {[["account", "ACCOUNT"], ["quick", "START"], ["data", "DATA"], ["models", "AI"], ["anchor", "VOICE"], ["meetings", "MEET"]].map(([id, label]) => (
                <button key={id} onClick={() => setSettingsTab(id)}
                  style={{
                    flex: 1, padding: "12px 6px", background: "transparent", cursor: "pointer",
                    border: "none", borderBottom: `2px solid ${settingsTab === id ? C.accent : "transparent"}`,
                    color: settingsTab === id ? C.accentText : C.muted,
                    ...TYPE.eyebrow,
                  }}>{t(label)}</button>
              ))}
              {/* The tab bar is sticky, so this closes from any scroll position —
                  the footer "Close" sits below six tabs of content. */}
              <button onClick={() => setShowSettings(false)} aria-label="Close settings"
                style={{ flex: "0 0 auto", marginLeft: 4, padding: "0 12px", background: "transparent", border: "none", color: C.faint, fontFamily: SANS, fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ padding: 18 }}>
              {/* ---- START HERE tab: the easy path — one key + a plain-language status board ---- */}
              {settingsTab === "quick" && (() => {
                const serverAi = !!meetStatus?.ai?.configured;
                const localAi = aiModels.some(m => m.enabled && isLocalModel(m));
                const aiReady = planAllows("ai") && (!!meetStatus?.ai?.configured || aiModels.some(m => m.enabled && (isLocalModel(m) || (m.kind === "claude" ? anthropicApiKey.trim() : (m.apiKey || "").trim()))));
                const meetOn = !!(meetStatus?.zoom?.connected || meetStatus?.google?.connected);
                const chips = [
                  { label: t("AI desk"), ready: aiReady, note: aiReady ? t("ready") : t("not configured"), tab: "models" },
                  { label: t("Voice"), ready: true, note: voiceEngine === "elevenlabs" && canUseStudioVoice ? "ElevenLabs" : t("browser"), tab: "anchor" },
                  { label: t("Live quotes"), ready: mode === "live" && quotesReady, note: (mode === "live" && quotesReady) ? t("live") : t("demo"), tab: "data" },
                  { label: t("Real videos"), ready: canSearchVideos, note: canSearchVideos ? t("on") : t("optional"), tab: "data" },
                  { label: t("Streaming"), ready: canBrowseCatalog, note: canBrowseCatalog ? t("on") : t("optional"), tab: "data" },
                  { label: t("Calendar"), ready: true, note: t("built-in"), tab: "data" },
                  { label: t("Meetings"), ready: meetOn, note: meetOn ? t("connected") : t("optional"), tab: "meetings" },
                  { label: t("Memory"), ready: memoryTurns > 0, note: memoryTurns > 0 ? `${memoryTurns}` : t("empty"), tab: "models" },
                ];
                return (
                  <div style={{ display: "grid", gap: 16 }}>
                    <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.7, color: C.text, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.panelEdge}`, borderRadius: R.md, padding: "10px 12px" }}>
                      👋 <b style={{ color: C.accentText }}>{t("You're already set up.")}</b>{" "}
                      {aiReady ? t("This server holds the model key, so the desk can already answer.") : t("Demo mode needs no keys — everything below works right now.")}
                    </div>

                    {/* The desk's model key is the operator's to configure, not the
                        visitor's to obtain. Asking every user to go and create an
                        OpenRouter account before the product answers anything is a
                        dev-tool flow, and on a phone it is close to unusable — so
                        this reports state and nothing else. Bring-your-own-key and
                        local models still live in the AI tab for people who want them. */}
                    <div>
                      <div style={{ ...TYPE.eyebrow, color: aiReady ? C.up : C.muted }}>
                        {aiReady ? `● ${t("AI DESK IS ON")}` : `○ ${t("AI DESK IS OFF")}`}
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
                        {aiReady
                          ? (serverAi
                              ? t("Answers run on this server's model key. Nothing to set up.")
                              : t("Answers run on your local model. Nothing leaves this device."))
                          : !planAllows("ai")
                            // The key is not the blocker here — the plan is. Saying
                            // "not configured" would send people hunting for a setting.
                            ? <>{t("The AI desk is part of")} {planFor("ai")}. {lockChip("ai")}</>
                            : t("This server has no model key configured yet, so the desk can't answer. Everything else works.")}
                      </div>
                    </div>

                    {/* status board */}
                    <div>
                      <div id="start-setup-lbl" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("WHAT'S SET UP")} <span style={{ color: C.faint, textTransform: "none" }}>· {t("tap to configure")}</span></div>
                      <div role="group" aria-labelledby="start-setup-lbl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                        {chips.map(c => (
                          <button key={c.label} onClick={() => setSettingsTab(c.tab)}
                            style={{ display: "flex", alignItems: "center", gap: 7, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: 5, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ color: c.ready ? C.up : C.faint, fontSize: 12 }}>{c.ready ? "●" : "○"}</span>
                            <span style={{ fontFamily: SANS, fontSize: 11, color: C.text }}>{c.label}</span>
                            <span style={{ fontFamily: SANS, fontSize: 10, color: c.ready ? C.up : C.faint, marginLeft: "auto" }}>{c.note}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* quick actions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => { setShowSettings(false); setTutStep(0); replayTutorial(); }}
                        style={{ flex: 1, minWidth: 140, background: "transparent", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "9px 0", cursor: "pointer" }}>
                        ↺ {t("tour · demo · missions")}
                      </button>
                      <button onClick={() => setSettingsTab("anchor")}
                        style={{ flex: 1, minWidth: 140, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "9px 0", cursor: "pointer" }}>
                        🎙️ {t("pick your anchor")}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ---- DATA tab ---- */}
              {settingsTab === "data" && (
                <>
                  <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.panelEdge}` }}>
                    <div id="data-panels-lbl" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("PANELS")}</div>
                    <div role="group" aria-labelledby="data-panels-lbl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      {[["tape", "ticker tape"], ["watchlist", "watchlist"], ["movers", "top movers"], ["news", "news & video"], ["calendar", "calendar"], ["portfolio", "portfolio"], ["pnf", "P&F signals"]].map(([k, label]) => (
                        <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 12, color: panels[k] ? C.text : C.faint, cursor: "pointer" }}>
                          <Toggle checked={panels[k]} onChange={() => togglePanel(k)} />
                          {t(label)}
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: 14, ...TYPE.eyebrow, color: C.muted }}>{t("in-app alerts")}</div>
                    {[["priceTriggers", "price triggers"], ["breakingNews", "breaking news"], ["pnfPatterns", "P&F pattern alerts"]].map(([key, label]) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontFamily: SANS, fontSize: 12, color: prefs.notify[key] ? C.text : C.faint, cursor: "pointer" }}>
                        <Toggle checked={prefs.notify[key]}
                          onChange={() => setPref("notify", { ...prefs.notify, [key]: !prefs.notify[key] })} />
                        {t(label)}
                      </label>
                    ))}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontFamily: SANS, fontSize: 12, color: C.text, cursor: "pointer" }}>
                      <Toggle checked={prefs.colorBlind} onChange={() => setPref("colorBlind", !prefs.colorBlind)} />
                      {t("color-blind mode (blue/orange + ▲▼)")}
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontFamily: SANS, fontSize: 12, color: C.text, cursor: "pointer" }}>
                      <Toggle checked={prefs.privacy} onChange={() => setPref("privacy", !prefs.privacy)} />
                      {t("privacy mode — blur balances")}
                    </label>
                    <div style={{ marginTop: 14 }}>
                      <label htmlFor="data-clock-tz" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("CLOCK TIMEZONE")}</label>
                      <select id="data-clock-tz" value={clockTz} onChange={e => setClockTz(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, padding: "8px 10px" }}>
                        <optgroup label="Americas">
                          {TIMEZONES.filter(z => z.group === "Americas").map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                        </optgroup>
                        <optgroup label="Europe">
                          {TIMEZONES.filter(z => z.group === "Europe").map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                        </optgroup>
                      </select>
                      <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
                        {t("Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.")}
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 6 }}>{t("refresh interval")}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[["Manual", 0], ["5s", 5000], ["15s", 15000], ["30s", 30000]].map(([label, ms]) => (
                          <button key={ms} onClick={() => setPref("refreshMs", coerceRefreshMs(ms))}
                            style={{ flex: 1, padding: "6px 0", borderRadius: R.sm, cursor: "pointer", fontFamily: SANS, fontSize: 11,
                              border: `1px solid ${prefs.refreshMs === ms ? C.accent : C.panelEdge}`,
                              background: prefs.refreshMs === ms ? "rgba(255,255,255,0.05)" : "transparent",
                              color: prefs.refreshMs === ms ? C.accentText : C.muted }}>{ms === 0 ? t(label) : label}</button>
                        ))}
                      </div>
                      {prefs.refreshMs === 0 && (
                        <button onClick={() => pollLive()} disabled={!live}
                          style={{ marginTop: 8, width: "100%", padding: "7px 0", borderRadius: R.sm, cursor: live ? "pointer" : "not-allowed",
                            fontFamily: SANS, fontSize: 11, background: "transparent", border: `1px solid ${C.panelEdge}`,
                            color: live ? C.muted : C.faint }}>
                          ↻ {t("refresh now")}
                        </button>
                      )}
                    </div>
                    <button onClick={() => { setTutStep(0); replayTutorial(); setShowSettings(false); }}
                      style={{ marginTop: 12, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, padding: "7px 12px", cursor: "pointer" }}>
                      ↺ {t("replay tutorial")}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                    {["demo", "live"].map(mm => {
                      const locked = mm === "live" && !planAllows("finnhub"); // LIVE needs Pro Desk
                      return (
                      <button key={mm} disabled={locked} onClick={() => {
                        if (locked) { setSettingsTab("account"); return; } // nudge upgrade instead of enabling
                        setMode(mm);
                      }}
                        style={{
                          flex: 1, padding: "9px 0", borderRadius: R.sm, cursor: locked ? "not-allowed" : "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 510,
                          background: mode === mm ? C.accent : "transparent",
                          color: locked ? C.faint : mode === mm ? "#08090a" : C.muted,
                          border: `1px solid ${mode === mm ? C.accent : C.panelEdge}`,
                          opacity: locked ? 0.6 : 1,
                        }}>{t(mm.toUpperCase())}{locked ? " 🔒" : ""}</button>
                      );
                    })}
                    {lockChip("finnhub")}
                  </div>
                  {mode === "demo" && (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                      {t("Demo mode is a seeded random-walk session: reproducible, no key or network needed.")}
                    </div>
                  )}
                  {mode === "live" && (
                    <div style={{ fontFamily: SANS, fontSize: 12, color: quotesReady ? C.muted : C.down, lineHeight: 1.7 }}>
                      {quotesReady
                        ? `● ${t("Live quotes are provided by this server — no key needed on this device.")}`
                        : `○ ${t("Live quotes are not configured on this server.")}`}
                    </div>
                  )}

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.panelEdge}` }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.eyebrow, color: C.muted }}>
                      {t("VIDEO SEARCH")} {lockChip("youtube")}
                    </label>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: canSearchVideos ? C.muted : C.faint, lineHeight: 1.7, marginTop: 6 }}>
                      {canSearchVideos
                        ? `● ${t("Real, embeddable video results are provided by this server — no key needed on this device.")}`
                        : `○ ${t("Not configured on this server — \"show videos of …\" asks the AI to guess instead.")}`}
                    </div>
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.panelEdge}` }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.eyebrow, color: C.muted }}>
                      {t("STREAMING CATALOG")} {lockChip("tmdb")}
                    </label>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: canBrowseCatalog ? C.muted : C.faint, lineHeight: 1.7, marginTop: 6 }}>
                      {canBrowseCatalog
                        ? `● ${t("Netflix / Disney+ / Hulu libraries and trailers are provided by this server — no key needed on this device.")}`
                        : `○ ${t("Not configured on this server — public-domain films via \"free movies …\" still play in-desk.")}`}
                    </div>
                  </div>

                </>
              )}

              {/* ---- AI tab: one engine, provided by this server ----
                   The old developer surface (model cards, BYOK key fields, local
                   Ollama / LM Studio wiring, fallback chains) is gone from the UI:
                   people using this product should not have to choose an inference
                   stack. The desk speaks through the server's OpenRouter key; the
                   only thing left to manage here is memory. */}
              {settingsTab === "models" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 11px", borderRadius: R.md,
                    border: `1px solid ${meetStatus?.ai?.configured ? C.up : C.faint}`, background: "rgba(255,255,255,0.02)",
                    fontFamily: SANS, fontWeight: 510, fontSize: 11, letterSpacing: "-0.010em",
                    color: meetStatus?.ai?.configured ? C.up : C.faint,
                  }}>
                    <span>{meetStatus?.ai?.configured ? "●" : "○"}</span>
                    <span>{meetStatus?.ai?.configured ? t("AI DESK IS ON") : t("AI DESK IS OFF")}</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                    {meetStatus?.ai?.configured
                      ? t("Answers run on this server's model key. Nothing to set up.")
                      : t("This server has no model key configured yet, so the desk can't answer. Everything else works.")}
                  </div>
                  {!planAllows("ai") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 11, lineHeight: 1.6, color: C.accentText, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.accent}`, borderRadius: R.md, padding: "8px 10px" }}>
                      {lockChip("ai")} {t("AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).").replace("{plan}", planFor("ai"))}
                    </div>
                  )}
                  {/* local multi-turn memory: lives only in this browser; one click forgets it */}
                  <div style={{ marginTop: 4, padding: "10px 11px", border: `1px solid ${C.panelEdge}`, borderRadius: R.md }}>
                    <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 6 }}>
                      {t("MEMORY")}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.text, marginBottom: 8 }}>
                      {t("{n} turns remembered on this device").replace("{n}", String(memoryTurns))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SANS, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                      <span>🧠 {t("The desk remembers this conversation locally (this device only) so follow-up questions work.")}</span>
                      <button onClick={() => { forgetConversation(); setCmdMsg(t("Desk memory cleared — the conversation is forgotten.")); }}
                        style={{ flex: "0 0 auto", background: "transparent", color: C.muted, border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>
                        {t("forget conversation")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ---- ANCHOR tab ---- */}
              {settingsTab === "anchor" && (
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <div id="voice-anchor-lbl" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("ANCHOR")}</div>
                    <div role="radiogroup" aria-labelledby="voice-anchor-lbl" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 8 }}>
                      {CHARACTERS.map(c => (
                        <button key={c.id} role="radio" aria-checked={characterId === c.id} onClick={() => setCharacterId(c.id)}
                          style={{
                            padding: "10px 0", borderRadius: R.md, cursor: "pointer",
                            fontFamily: SANS, fontSize: 11, fontWeight: 510,
                            background: characterId === c.id ? "rgba(255,255,255,0.07)" : "transparent",
                            color: characterId === c.id ? C.accentText : C.muted,
                            border: `1px solid ${characterId === c.id ? C.accent : C.panelEdge}`,
                          }}>{c.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div id="voice-env-lbl" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("ENVIRONMENT")}</div>
                    <div role="radiogroup" aria-labelledby="voice-env-lbl" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 8 }}>
                      {ENVIRONMENTS.map(ev => (
                        <button key={ev.id} role="radio" aria-checked={envId === ev.id} onClick={() => setEnvId(ev.id)}
                          style={{
                            padding: "10px 0", borderRadius: R.md, cursor: "pointer",
                            fontFamily: SANS, fontSize: 11, fontWeight: 510,
                            background: envId === ev.id ? "rgba(255,255,255,0.07)" : "transparent",
                            color: envId === ev.id ? C.accentText : C.muted,
                            border: `1px solid ${envId === ev.id ? C.accent : C.panelEdge}`,
                          }}>{ev.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="voice-crew" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("BACKGROUND CREW")}</label>
                    <select
                      id="voice-crew" value={crewId} onChange={e => setCrewId(e.target.value)}
                      style={{ width: "100%", marginTop: 6, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, padding: "8px" }}>
                      <option value="auto">{t("Auto — whoever isn't anchoring")}</option>
                      <option value="off">{t("Off — solo broadcast")}</option>
                      {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div id="voice-engine-lbl" style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.eyebrow, color: C.muted }}>{t("VOICE ENGINE")} {lockChip("elevenlabs")}</div>
                    <div role="radiogroup" aria-labelledby="voice-engine-lbl" style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {[["browser", t("BROWSER · free")], ["elevenlabs", "ELEVENLABS"]].map(([id, label]) => {
                        const locked = id === "elevenlabs" && !planAllows("elevenlabs"); // studio voice needs Trading Floor
                        return (
                        <button key={id} role="radio" aria-checked={voiceEngine === id} disabled={locked} onClick={() => { if (locked) { setSettingsTab("account"); return; } setVoiceEngine(id); }}
                          style={{
                            flex: 1, padding: "9px 0", borderRadius: R.sm, cursor: locked ? "not-allowed" : "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 510,
                            background: voiceEngine === id ? C.accent : "transparent",
                            color: locked ? C.faint : voiceEngine === id ? "#08090a" : C.muted,
                            border: `1px solid ${voiceEngine === id ? C.accent : C.panelEdge}`,
                            opacity: locked ? 0.6 : 1,
                          }}>{label}{locked ? " 🔒" : ""}</button>
                        );
                      })}
                    </div>
                  </div>
                  {voiceEngine === "elevenlabs" && (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: (canUseStudioVoice && !elevenErr) ? C.muted : C.down, lineHeight: 1.7 }}>
                        {!canUseStudioVoice
                          ? `○ ${t("Studio voice is not configured on this server.")}`
                          : elevenErr
                            ? `○ ${t("This server has a studio-voice key set, but the last call to it failed.")}`
                            : `● ${t("Studio voice is provided by this server — no key needed on this device.")}`}
                      </div>
                      {elevenVoices.length > 0 && (
                        <div>
                          <label htmlFor="voice-eleven" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("ELEVENLABS VOICE")}</label>
                          <select
                            id="voice-eleven" value={elevenVoiceId} onChange={e => setElevenVoiceId(e.target.value)}
                            style={{ width: "100%", marginTop: 6, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, padding: "8px" }}>
                            {elevenVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                      )}
                      {elevenErr && <div style={{ fontFamily: SANS, fontSize: 12, color: C.down, lineHeight: 1.6 }}>{elevenErr}</div>}
                      {canUseStudioVoice && elevenVoices.length === 0 && !elevenErr && (
                        <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint }}>{t("Loading voices…")}</div>
                      )}
                    </div>
                  )}
                  {voiceEngine === "browser" && (
                  <div>
                    <label htmlFor="voice-browser" style={{ ...TYPE.eyebrow, color: C.muted }}>
                      {t("VOICE")} {voices.length > 0 && <span style={{ color: C.faint, letterSpacing: 0, textTransform: "none" }}>· {voices.length} {t("free")}</span>}
                    </label>
                    <select
                      id="voice-browser" value={voiceName} onChange={e => setVoiceName(e.target.value)}
                      style={{ width: "100%", marginTop: 6, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: SANS, fontSize: 12, padding: "8px" }}>
                      {(() => {
                        // every voice the OS/browser exposes is free — group them all by language, current language first
                        const cur = (TTS_LANG[lang] || "en-US").slice(0, 2);
                        const langName = (code) => { try { return new Intl.DisplayNames([lang], { type: "language" }).of(code) || code; } catch { return code; } };
                        const groups = {};
                        for (const v of voices) { const k = (v.lang || "").slice(0, 2) || "··"; (groups[k] = groups[k] || []).push(v); }
                        const keys = Object.keys(groups).sort((a, b) => (a === cur ? -1 : b === cur ? 1 : (langName(a)).localeCompare(langName(b))));
                        return keys.map(k => (
                          <optgroup key={k} label={langName(k)}>
                            {groups[k].map(v => <option key={v.name} value={v.name}>{v.name} {v.localService ? "· local" : "· network"}</option>)}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  </div>
                  )}
                  <div>
                    <label htmlFor="voice-rate" style={{ ...TYPE.eyebrow, color: C.muted }}>
                      {t("READING SPEED")} · <span style={{ fontFamily: MONO, fontWeight: 510 }}>{speechRate.toFixed(2)}x</span>
                    </label>
                    <input id="voice-rate" type="range" min="0.7" max="1.5" step="0.02" value={speechRate}
                      onChange={e => setSpeechRate(+e.target.value)}
                      style={{ width: "100%", marginTop: 6, accentColor: C.accent }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <Toggle checked={autoSpeak} onChange={e => setAutoSpeak(e.target.checked)} />
                    {t("auto-read the first answer that finishes")}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <Toggle checked={uiSounds} onChange={e => setUiSounds(e.target.checked)} />
                    {t("UI click sounds — terminal blips on every button")}
                  </label>
                  <div>
                    <label htmlFor="voice-sound-vol" style={{ ...TYPE.eyebrow, color: C.muted }}>
                      {t("SOUND VOLUME")} · {(soundVolume * 100).toFixed(0)}%
                    </label>
                    <input id="voice-sound-vol" type="range" min="0" max="1" step="0.01" value={soundVolume}
                      onChange={e => setSoundVolume(+e.target.value)}
                      style={{ width: "100%", marginTop: 6, accentColor: C.accent }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <Toggle checked={musicOn} onChange={e => toggleMusic(e.target.checked)} />
                    ♪ {t("ambient music")} — {musicSource === "spotify" ? t("your Spotify playlist, docked bottom-right") : t("generative synth, ducks under the anchor's voice")}
                  </label>
                  <div>
                    <div id="voice-music-src-lbl" style={{ ...TYPE.eyebrow, color: C.muted }}>{t("MUSIC SOURCE")}</div>
                    <div role="radiogroup" aria-labelledby="voice-music-src-lbl" style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[["synth", "Synth"], ["spotify", "Spotify"]].map(([id, label]) => (
                        <button key={id} role="radio" aria-checked={musicSource === id} onClick={() => setMusicSource(id)}
                          style={{ flex: 1, background: musicSource === id ? "rgba(255,255,255,0.08)" : "transparent", border: `1px solid ${musicSource === id ? C.accent : C.panelEdge}`, color: musicSource === id ? C.accentText : C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "7px 0", cursor: "pointer" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {musicSource === "spotify" ? (
                    <div>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
                        {t("No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)")}
                      </div>

                      {/* Optional full playback via OAuth (Premium) — collapsed so it never demands a login */}
                      <details style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.panelEdge}` }}>
                        <summary style={{ ...TYPE.eyebrow, color: C.muted, cursor: "pointer" }}>
                          {t("OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS")}
                        </summary>
                        <label style={{ display: "block", marginTop: 10, ...TYPE.eyebrow, color: C.muted }}>
                          {t("FULL PLAYBACK · SPOTIFY PREMIUM")}{" "}
                          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: C.accentText, letterSpacing: "-0.010em" }}>{t("create an app ↗")}</a>
                          {" "}{lockChip("spotify")}
                        </label>
                        {spotifyReady ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                            <span style={{ fontFamily: SANS, fontSize: 11, color: C.up }}>{t("● connected — full tracks enabled")}</span>
                            <button onClick={disconnectSpotify}
                              style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>{t("disconnect")}</button>
                          </div>
                        ) : (
                          <>
                            <input
                              value={spotifyClientId}
                              onChange={e => setSpotifyClientId(e.target.value)}
                              placeholder={t("Spotify app Client ID")}
                              style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }}
                            />
                            <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
                              {lang === "en"
                                ? <>In your Spotify app settings, add this exact <b style={{ color: C.muted }}>Redirect URI</b>:</>
                                : <>{t("In your Spotify app settings, add this exact Redirect URI:")}</>}<br />
                              <code style={{ color: C.accentText, wordBreak: "break-all" }}>{spotifyRedirect()}</code>
                              {!/^https:|127\.0\.0\.1/.test(spotifyRedirect()) && (
                                <span style={{ color: C.down }}><br />⚠ {t("Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.")}</span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                              {(() => { const ok = planAllows("spotify") && spotifyClientId.trim(); return (
                              <button onClick={() => { if (!planAllows("spotify")) { setSettingsTab("account"); return; } connectSpotify(); }} disabled={!ok}
                                style={{ background: ok ? "#1DB954" : C.panelEdge, color: ok ? "#ffffff" : C.faint, border: "none", borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "8px 16px", cursor: ok ? "pointer" : "default" }}>
                                {planAllows("spotify") ? t("Connect Spotify") : `${t("Connect Spotify")} 🔒`}
                              </button>
                              ); })()}
                              {spotifyAuth && !spotifyReady && <span style={{ fontFamily: SANS, fontSize: 10, color: C.muted }}>{t("connecting…")}</span>}
                            </div>
                          </>
                        )}
                        {spotifyErr && <div style={{ fontFamily: SANS, fontSize: 10, color: C.down, marginTop: 8 }}>{spotifyErr}</div>}
                      </details>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="voice-music-vol" style={{ ...TYPE.eyebrow, color: C.muted }}>
                        {t("MUSIC VOLUME")} · {(musicVolume * 100).toFixed(0)}%
                      </label>
                      <input id="voice-music-vol" type="range" min="0" max="1" step="0.01" value={musicVolume}
                        onChange={e => setMusicVolume(+e.target.value)}
                        style={{ width: "100%", marginTop: 6, accentColor: C.accent }} />
                    </div>
                  )}
                  <button
                    onClick={() => speak("preview", `This is ${CHARACTERS.find(c => c.id === characterId)?.name} at the Vantage desk. ${selected} is currently trading at ${fmt(selectedRow?.price)}.`)}
                    style={{ background: "transparent", border: `1px solid ${C.accent}`, color: C.accentText, borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "9px 0", cursor: "pointer" }}>
                    ▶ {t("preview voice")}
                  </button>
                </div>
              )}

              {/* ---- MEETINGS tab ---- */}
              {settingsTab === "meetings" && (
                <div style={{ display: "grid", gap: 12 }}>
                  {/* zero-setup: just open a new meeting in a tab (uses your existing Zoom/Google login, no OAuth app) */}
                  <div style={{ border: `1px solid ${C.liveEdge}`, background: C.liveGlow, borderRadius: R.md, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ ...TYPE.subhead, fontSize: 12, fontWeight: 510, color: C.live }}>⚡ {t("Go Live — no setup")}</span>
                    <span style={{ ...TYPE.bodySm, fontSize: 13, color: C.muted }}>{t("Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.")}</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => window.open("https://meet.new", "_blank", "noopener")}
                        style={{ background: "#00796B", color: "#fff", border: "none", borderRadius: R.sm, fontFamily: SANS, fontSize: 12, fontWeight: 510, padding: "9px 16px", cursor: "pointer" }}>{t("New Google Meet")} ↗</button>
                      <button onClick={() => window.open("https://zoom.us/start/videomeeting", "_blank", "noopener")}
                        style={{ background: "#1567D3", color: "#fff", border: "none", borderRadius: R.sm, fontFamily: SANS, fontSize: 12, fontWeight: 510, padding: "9px 16px", cursor: "pointer" }}>{t("New Zoom meeting")} ↗</button>
                    </div>
                    {/* pin the link the tab created, so Vantage shows a live badge you can rejoin/share */}
                    <div style={{ borderTop: `1px solid ${C.panelEdge}`, paddingTop: 8, marginTop: 2 }}>
                      {liveMeeting ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <a href={liveMeeting} target="_blank" rel="noopener noreferrer"
                            style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 12, color: C.amber, textDecoration: "none", overflow: "hidden" }}>
                            <span style={{ color: C.down, flexShrink: 0 }}>🔴 LIVE</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meetingLabel(liveMeeting)} ↗</span>
                          </a>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <a href={liveMeeting} target="_blank" rel="noopener noreferrer" style={{ background: C.down, color: "#08090a", border: "none", borderRadius: R.sm, fontFamily: MONO, fontSize: 12, fontWeight: 510, padding: "6px 16px", cursor: "pointer", textDecoration: "none" }}>{t("Join")} ↗</a>
                            <button onClick={() => navigator.clipboard?.writeText(liveMeeting)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>{t("copy link")}</button>
                            <button onClick={() => setLiveMeeting("")} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>{t("end")}</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input value={liveMeetDraft} onChange={e => setLiveMeetDraft(e.target.value)}
                            placeholder={t("paste your meeting link to pin it as LIVE…")}
                            style={{ flex: 1, minWidth: 160, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.sm, color: C.text, fontFamily: MONO, fontSize: 12, padding: "7px 9px" }} />
                          <button onClick={() => { const u = liveMeetDraft.trim(); if (/^https?:\/\//.test(u)) { setLiveMeeting(u); setLiveMeetDraft(""); } }}
                            style={{ background: C.accentPress, color: C.textOnAccent, border: "none", borderRadius: R.sm, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "7px 14px", cursor: "pointer" }}>{t("Pin")}</button>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* ---- ACCOUNT tab: who's signed in, plan management, sign out (Layers 1 & 3) ---- */}
              {settingsTab === "account" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {!account ? (
                    // guest: no account yet — offer to sign out (which returns to the auth gate)
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 15, color: C.text }}>{t("You're exploring as a guest")}</div>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{t("Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.")}</div>
                      <button onClick={() => { setShowSettings(false); onSignOut?.(); }}
                        style={{ background: C.accentPress, color: C.textOnAccent, border: "none", borderRadius: R.md, fontFamily: SANS, fontWeight: 510, fontSize: 13, padding: "10px 18px", cursor: "pointer" }}>{t("Sign in / create account")}</button>
                    </div>
                  ) : (<>
                    {/* identity card */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#161718", border: `1px solid ${C.panelEdge}`, borderRadius: R.md, padding: 14 }}>
                      <span style={{ width: 40, height: 40, borderRadius: "50%", background: C.text, color: C.bg, display: "grid", placeItems: "center", fontWeight: 510, fontSize: 17, fontFamily: SANS, flex: "0 0 auto" }}>
                        {(account.name || account.email).trim().charAt(0).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 15, color: C.text }}>{account.name || account.email.split("@")[0]}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.faint, wordBreak: "break-all" }}>{account.email}</div>
                        <div style={{ fontFamily: SANS, fontSize: 10, color: C.up, marginTop: 3 }}>{account.backend ? t("secured on server") : t("stored on this device")}</div>
                      </div>
                    </div>

                    {account.backend && (
                      <div style={{ border: `1px solid ${agentPrefs?.enabled ? C.accent : C.panelEdge}`, borderRadius: R.md, padding: 12, background: agentPrefs?.enabled ? "rgba(255,255,255,0.05)" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div>
                            <div style={{ ...TYPE.eyebrow, color: C.accentText }}>AI MARKET-BRIEF AGENT</div>
                            <div style={{ marginTop: 5, fontFamily: SANS, fontSize: 10, lineHeight: 1.55, color: C.muted }}>Runs daily on your current watchlist, stores a factual brief, and never trades or makes recommendations.</div>
                          </div>
                          <button onClick={() => saveAgentPrefs(!agentPrefs?.enabled)} disabled={agentBusy || !agentPrefs}
                            style={{ background: agentPrefs?.enabled ? "transparent" : C.accent, color: agentPrefs?.enabled ? C.accentText : "#08090a", border: agentPrefs?.enabled ? `1px solid ${C.accent}` : "none", borderRadius: R.sm, fontFamily: SANS, fontSize: 10, fontWeight: 510, padding: "6px 10px", cursor: agentBusy ? "default" : "pointer", opacity: agentBusy || !agentPrefs ? 0.6 : 1, whiteSpace: "nowrap" }}>
                            {agentBusy ? "…" : agentPrefs?.enabled ? "PAUSE" : "ENABLE"}
                          </button>
                        </div>
                        {agentPrefs?.enabled && <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: C.faint }}>Watching: {agentPrefs.symbols?.join(" · ") || "no symbols"}</div>}
                      </div>
                    )}

                    {/* plan chooser */}
                    <div>
                      <label style={{ fontFamily: SANS, fontWeight: 510, fontSize: 10, letterSpacing: "-0.010em", color: C.faint }}>{t("YOUR PLAN")}</label>
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        {PLANS.map(p => {
                          const on = account.plan === p.id;
                          const paid = p.id !== "free";
                          return (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, border: `1.5px solid ${on ? C.accent : C.panelEdge}`, borderRadius: R.md, padding: "10px 12px", background: on ? "rgba(255,255,255,0.04)" : "transparent" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: SANS, fontWeight: 510, fontSize: 14, color: C.text }}>{p.label} <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint, fontWeight: 400 }}>{p.price}{p.cadence === "forever" ? "" : p.cadence}</span></div>
                                <div style={{ fontFamily: SANS, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{p.tagline}</div>
                              </div>
                              {on ? (
                                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 510, color: C.accentText, whiteSpace: "nowrap" }}>{t("CURRENT")}</span>
                              ) : (
                                <button onClick={() => startPlanChange(p.id)} disabled={!!billingBusy}
                                  style={{ background: paid ? C.accent : "transparent", color: paid ? "#08090a" : C.accentText, border: paid ? "none" : `1px solid ${C.accent}`, borderRadius: 5, fontFamily: SANS, fontSize: 11, fontWeight: 510, padding: "7px 14px", cursor: billingBusy ? "default" : "pointer", opacity: billingBusy ? 0.6 : 1, whiteSpace: "nowrap" }}>
                                  {billingBusy === p.id ? "…" : paid ? t("Upgrade") : t("Switch")}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* billing honesty: say plainly whether a real charge could happen */}
                      <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                        {billingCfg?.enabled
                          ? t("Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.")
                          : t("No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.")}
                      </div>
                    </div>

                    <button onClick={() => { setShowSettings(false); onSignOut?.(); }}
                      style={{ alignSelf: "flex-start", background: "transparent", border: `1px solid ${C.panelEdge}`, color: "#f28080", borderRadius: R.md, fontFamily: SANS, fontSize: 11, padding: "8px 14px", cursor: "pointer" }}>{t("Sign out")}</button>
                    <div style={{ fontFamily: SANS, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>{t("Terms & Privacy accepted")} {account.agreedAt ? "· v" + LEGAL_VERSION : ""}. {t("This account UI is a prototype; see the security note in the code.")}</div>
                  </>)}
                </div>
              )}
            </div>

            {/* footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 18px 18px" }}>
              <button onClick={() => setShowSettings(false)}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: R.sm, fontFamily: SANS, fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>{t("Close")}</button>

            </div>
          </div>
        </div>
      )}
      </AppShell>
    </div>
  );
}

// ============================================================
//  App — the default export. Decides between the auth gate and the dashboard.
//  The gate is mandatory: every visitor signs up or logs in. The heavy MarketDashboard
//  only mounts once we're past the gate, so no rules-of-hooks juggling and the
//  dashboard never runs behind a locked screen.
// ============================================================
export default function App() {
  // account: the signed-in user — the only way past the gate.
  const [account, setAccount] = useState(loadAccount);
  // UI + AI language (persisted). Provided app-wide so AuthScreen and the dashboard both translate.
  const [lang, setLangState] = useState(loadLang);
  const setLang = useCallback((code) => { setLangState(code); try { localStorage.setItem("vantage-lang", code); } catch { /* ignore */ } }, []);
  const t = useMemo(() => makeT(lang), [lang]);
  const i18n = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  // social sign-in return: the backend bounced to /?auth=1&token=…&email=…&name=…&plan=…
  // Consume it once, sign the user in, then scrub the params from the URL.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("auth") === "1" && u.searchParams.get("token")) {
      const a = { email: u.searchParams.get("email"), name: u.searchParams.get("name") || u.searchParams.get("email"), plan: u.searchParams.get("plan") || "free", token: u.searchParams.get("token"), backend: true };
      saveAccount(a); setAccount(a);
      ["auth", "token", "email", "name", "plan"].forEach(k => u.searchParams.delete(k));
      window.history.replaceState({}, "", u.toString());
    }
  }, []);

  const signIn = (a) => { saveAccount(a); setAccount(a); };
  const signOut = () => {
    // best-effort backend logout; local state always clears
    if (account?.backend && account?.token) { fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${account.token}` } }).catch(() => {}); }
    saveAccount(null); setAccount(null);
  };
  // Update the current plan. For a local account, also patch the tape-users record so it
  // survives sign-out/in. (Real paid upgrades route through Stripe in the ACCOUNT tab first.)
  const changePlan = (planId) => {
    if (!account) return;
    const next = { ...account, plan: planId };
    if (account.backend && account.token) {
      // backend account: persist the plan server-side so it survives sign-out/in (best-effort)
      fetch("/api/auth/plan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ plan: planId }) }).catch(() => {});
    } else {
      // local account: patch the tape-users record so it survives sign-out/in
      const users = loadUsers(); const em = account.email.toLowerCase();
      if (users[em]) { users[em].plan = planId; saveUsers(users); }
    }
    saveAccount(next); setAccount(next);
  };

  return (
    <I18nContext.Provider value={i18n}>
      {!account
        ? <AuthScreen onAuthed={signIn} />
        : <MarketDashboard account={account} onSignOut={signOut} onChangePlan={changePlan} />}
    </I18nContext.Provider>
  );
}
