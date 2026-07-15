 import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { exportExcel, exportWord, exportPowerPoint } from "./exporters.js";

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
const C = {
  bg: "#0B0E14",
  panel: "#121722",
  panelEdge: "#1D2433",
  amber: "#FFB300",
  amberDim: "#8A6200",
  text: "#E8EBF2",
  muted: "#7E879B",
  faint: "#4A5266",
  up: "#2FD37A",
  down: "#F6465D",
  grid: "#1A2130",
};

const MONO = "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";
const SANS = "'Archivo', 'Helvetica Neue', Arial, sans-serif";

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
    "Export": "Exportar", "More": "Más", "Settings": "Ajustes", "sign in": "iniciar sesión",
    "Games": "Juegos", "learn how stocks work": "aprende cómo funcionan las acciones",
    "Ambient sound": "Sonido ambiente", "waves, jungle, space hum…": "olas, jungla, zumbido espacial…",
    "Music": "Música", "background score": "música de fondo",
    "one model on the desk": "un modelo en la mesa",
    "Type a symbol and press Enter  ·  HELP for commands": "Escribe un símbolo y pulsa Enter  ·  HELP para comandos",
    "OPEN": "ABIERTO", "CLOSED": "CERRADO",
    "standing by": "en espera",
    "voice & anchor settings": "ajustes de voz y presentador", "SET": "SET", "stop reading": "detener lectura", "free": "gratis",
    "Ask a question below — answers appear here, and the anchor can read any of them on air.": "Haz una pregunta abajo — las respuestas aparecen aquí, y el presentador puede leerlas en directo.",
    "ASK ALL": "PREGUNTAR A TODOS",
    "WATCHLIST": "LISTA DE SEGUIMIENTO", "TOP MOVERS": "MAYORES MOVIMIENTOS", "full chart": "gráfico completo",
    "Language": "Idioma",
    "The AI broadcast desk for the markets.": "La mesa de retransmisión con IA para los mercados.",
    "Create account": "Crear cuenta", "Log in": "Iniciar sesión", "Explore in demo mode →": "Explorar en modo demo →",
    "ranked by |Δ%| across your watchlist": "ordenado por |Δ%| en tu lista de seguimiento",
    'Ask about {sym}, "take me to Robinhood", or "download excel" / "make a powerpoint" / "write a report and export ppt"': 'Pregunta sobre {sym}, "take me to Robinhood", o "download excel" / "make a powerpoint" / "write a report and export ppt"',
    // settings tabs + guided tour
    "ACCOUNT": "CUENTA", "START": "INICIO", "DATA": "DATOS", "VOICE": "VOZ", "MEET": "REUNIÓN",
    "exit": "salir", "skip tour": "saltar recorrido", "Back": "Atrás", "Next": "Siguiente", "Done": "Listo",
    "Command bar": "Barra de comandos",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Escribe cualquier símbolo aquí y pulsa Enter para graficarlo. “ADD TSLA” y “DEL TSLA” gestionan tu lista de seguimiento. Los nombres de empresa también funcionan.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Esta es tu barra de comandos. Escribe un símbolo como Apple o Nvidia y pulsa Enter para graficarlo.",
    "Your anchor — that's me": "Tu presentador — ese soy yo",
    "I run a live trading day: opening bell, meals, breaks. I read any answer on air. Swap my character, environment, and sounds in settings.": "Dirijo una jornada bursátil en directo: campana de apertura, comidas, descansos. Leo cualquier respuesta en directo. Cambia mi personaje, entorno y sonidos en ajustes.",
    "That's me, your anchor. I run a live trading day and I can read anything on air.": "Ese soy yo, tu presentador. Dirijo una jornada bursátil en directo y puedo leer cualquier cosa en directo.",
    "The AI desk": "La mesa de IA",
    "Ask a question here and I answer in one box, cascading across your models. I also take commands — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Haz una pregunta aquí y respondo en un solo cuadro, en cascada por tus modelos. También acepto comandos — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Pregúntame lo que quieras aquí. También entiendo comandos sencillos, como, take me to Robinhood, o, what's on Netflix.",
    "Answers, news & Watch": "Respuestas, noticias y Ver",
    "Everything lands here in one box — desk answers, the navigator, news, and the streaming catalog. Trailers and public-domain films play right inside.": "Todo aparece aquí en un solo cuadro: respuestas de la mesa, el navegador, noticias y el catálogo de streaming. Los tráileres y las películas de dominio público se reproducen aquí mismo.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Las respuestas, las noticias y el catálogo de streaming aparecen aquí, en un solo lugar.",
    "Ticker tape": "Cinta de cotizaciones",
    "Your whole watchlist scrolls across the top with live-style movement.": "Toda tu lista de seguimiento se desplaza por la parte superior con movimiento en tiempo real.",
    "Your watchlist scrolls across the ticker tape, up top.": "Tu lista de seguimiento se desplaza por la cinta de cotizaciones, arriba.",
    "Why setup? (mostly optional)": "¿Por qué configurar? (casi todo opcional)",
    "Vantage runs fully in DEMO with zero setup. The one thing worth adding is an AI key — the desk's answers come from external models (OpenRouter, Claude…) billed to your own account, so they need your key. Everything else is optional: charts, calendar, games and news need nothing. Open Start to paste that one key.": "Vantage funciona por completo en DEMO sin configuración. Lo único que vale la pena añadir es una clave de IA — las respuestas de la mesa vienen de modelos externos (OpenRouter, Claude…) facturados a tu propia cuenta, así que necesitan tu clave. Todo lo demás es opcional: gráficos, calendario, juegos y noticias no necesitan nada. Abre Inicio para pegar esa clave.",
    "Here's why setup exists. Vantage works in demo with zero setup. The one key worth adding is for the A.I. — my answers come from external models that bill to your own account, so they need your key. Everything else is optional. Open Start to paste that one key. That's the tour!": "Aquí tienes por qué existe la configuración. Vantage funciona en demo sin configuración. La única clave que vale la pena añadir es la de la IA — mis respuestas vienen de modelos externos que se facturan a tu propia cuenta, así que necesitan tu clave. Todo lo demás es opcional. Abre Inicio para pegar esa clave. ¡Ese es el recorrido!",
    // settings footer + MEET tab
    "Close": "Cerrar", "Applied": "Aplicado", "Apply": "Aplicar",
    "Go Live — no setup": "En directo — sin configuración",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Inicia al instante una nueva reunión en una pestaña del navegador (usa la sesión que ya tengas iniciada) y comparte la pantalla de Vantage. Sin claves, sin OAuth.",
    "New Google Meet": "Nueva Google Meet", "New Zoom meeting": "Nueva reunión de Zoom",
    "Join": "Unirse", "copy link": "copiar enlace", "end": "finalizar",
    "paste your meeting link to pin it as LIVE…": "pega el enlace de tu reunión para fijarla como EN DIRECTO…",
    "Pin": "Fijar",
    "Or, for meetings created & tracked inside Vantage (with join links here), connect your own OAuth apps below — see MEETINGS_SETUP.md. This is the part that needs .env credentials.": "O, para reuniones creadas y gestionadas dentro de Vantage (con enlaces de acceso aquí), conecta tus propias apps OAuth abajo — consulta MEETINGS_SETUP.md. Esta es la parte que necesita credenciales .env.",
    "Backend not reachable. Start it in the project folder:": "No se puede acceder al backend. Inícialo en la carpeta del proyecto:",
    "retry": "reintentar", "create app": "crear app",
    "connected": "conectado", "not connected": "no conectado", "not configured (.env)": "no configurado (.env)",
    "Sign in to connect": "Inicia sesión para conectar", "Connect": "Conectar",
    "creating…": "creando…", "New meeting": "Nueva reunión", "disconnect": "desconectar",
    "RECENT MEETINGS": "REUNIONES RECIENTES",
    // START tab
    "AI desk": "Mesa de IA", "ready": "listo", "add key ↑": "añadir clave ↑", "Voice": "Voz", "browser": "navegador",
    "Live quotes": "Cotizaciones en directo", "live": "en directo", "demo": "demo", "Real videos": "Vídeos reales",
    "on": "activado", "optional": "opcional", "Streaming": "Streaming", "Calendar": "Calendario", "built-in": "integrado", "Meetings": "Reuniones",
    "You're already set up.": "Ya está todo listo.",
    "Vantage runs right now in demo mode — no keys needed. The one thing worth adding is an AI key so the desk can actually answer you:": "Vantage funciona ahora mismo en modo demo — sin claves. Lo único que vale la pena añadir es una clave de IA para que la mesa pueda responderte:",
    "AI DESK IS ON": "LA MESA DE IA ESTÁ ACTIVA", "TURN ON THE AI DESK — paste one key": "ACTIVA LA MESA DE IA — pega una clave",
    "One key unlocks the whole desk — OpenRouter gives you dozens of models (GPT, Llama, more) behind a single key, and it's the primary model.": "Una sola clave desbloquea toda la mesa — OpenRouter te da docenas de modelos (GPT, Llama y más) tras una única clave, y es el modelo principal.",
    "get a key": "obtener una clave",
    "No AI key? The desk still can't answer, but everything else — charts, news, games, streaming, calendar — works without it.": "¿Sin clave de IA? La mesa aún no puede responder, pero todo lo demás — gráficos, noticias, juegos, streaming, calendario — funciona sin ella.",
    "WHAT'S SET UP": "QUÉ ESTÁ CONFIGURADO", "tap to configure": "toca para configurar",
    "tour · demo · missions": "recorrido · demo · misiones", "pick your anchor": "elige tu presentador",
    "skip — I'll explore on my own": "omitir — exploraré por mi cuenta",
    // DATA tab
    "PANELS": "PANELES", "ticker tape": "cinta de cotizaciones", "watchlist": "lista de seguimiento", "top movers": "mayores movimientos", "news & video": "noticias y vídeo", "calendar": "calendario", "portfolio": "cartera",
    "breaking-news alerts during live trading": "alertas de última hora durante la negociación en directo",
    "CLOCK TIMEZONE": "ZONA HORARIA DEL RELOJ",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Ajusta el reloj de la cabecera. La insignia de mercado ABIERTO/CERRADO siempre sigue el horario del NYSE (hora del Este).",
    "replay tutorial": "repetir tutorial", "DEMO": "DEMO", "LIVE": "EN DIRECTO",
    "Demo mode runs a seeded random-walk market engine — a reproducible simulated session, no key or network needed.": "El modo demo ejecuta un motor de mercado de paseo aleatorio con semilla — una sesión simulada reproducible, sin clave ni red.",
    "FINNHUB API KEY (free tier works)": "CLAVE API DE FINNHUB (el plan gratuito funciona)", "paste key": "pega la clave",
    "Key is saved on this device and sent only to finnhub.io.": "La clave se guarda en este dispositivo y solo se envía a finnhub.io.",
    "get a free key": "obtener una clave gratis",
    "YOUTUBE DATA API KEY": "CLAVE API DE YOUTUBE DATA", "(optional — real, playable video results)": "(opcional — resultados de vídeo reales y reproducibles)",
    "paste key (AIza…)": "pega la clave (AIza…)", "needs": "requiere",
    "Without a key, \"show videos of …\" asks Claude to guess videos (often unembeddable). With one, the desk pulls real embeddable results from YouTube.": "Sin una clave, \"mostrar vídeos de …\" pide a Claude que adivine vídeos (a menudo no incrustables). Con una, la mesa obtiene resultados reales e incrustables de YouTube.",
    "enable API": "activar API",
    "TMDB API KEY": "CLAVE API DE TMDB", "(optional — in-app Netflix / Disney+ / Hulu catalog + trailers)": "(opcional — catálogo de Netflix / Disney+ / Hulu y tráileres en la app)",
    "paste TMDB API key (v3 auth)": "pega la clave API de TMDB (auth v3)",
    "Powers \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — real libraries with posters, ratings & in-desk trailers. Playback still opens on the service (they block embedding); public-domain films play fully in-desk via \"free movies …\" (no key needed).": "Impulsa \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — bibliotecas reales con carátulas, valoraciones y tráileres en la mesa. La reproducción se abre en el servicio (bloquean la incrustación); las películas de dominio público se reproducen por completo en la mesa con \"free movies …\" (sin clave).",
    "DAILY BRIEF": "RESUMEN DIARIO", "(auto-download while the app is open)": "(descarga automática mientras la app está abierta)",
    "at": "a las", "off": "desactivar", "run now": "ejecutar ahora",
    "Each day at {time}, the desk writes an analyst report on {sym} and downloads a {fmt} brief automatically. Requires this tab to be open (browsers can't run it closed) and an Anthropic key for the write-up.": "Cada día a las {time}, la mesa redacta un informe de analista sobre {sym} y descarga automáticamente un resumen en {fmt}. Requiere que esta pestaña esté abierta (los navegadores no pueden ejecutarlo cerrada) y una clave de Anthropic para la redacción.",
    "Set a time to auto-generate and download a branded report each day. Leave blank to disable.": "Establece una hora para generar y descargar automáticamente un informe con tu marca cada día. Déjalo en blanco para desactivar.",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "Las respuestas de la mesa de IA requieren {plan}. Los modelos de abajo están desactivados hasta que mejores tu plan (o actives el modo desarrollador en CUENTA).",
    "{n} models enabled": "{n} modelos activados", "One model at a time": "Un modelo a la vez",
    "Use \"only this\" for a single model, or enable several — the desk answers in one box, trying them top-to-bottom and falling back to the next if one errors (e.g. Claude → OpenRouter).": "Usa \"solo este\" para un único modelo, o activa varios — la mesa responde en un solo cuadro, probándolos de arriba abajo y recurriendo al siguiente si uno falla (p. ej. Claude → OpenRouter).",
    "Auto-fallback to a local model.": "Recurrir automáticamente a un modelo local.",
    "If Claude fails (no credits, bad key, offline), the desk and reports retry on your local model (Ollama or LM Studio) automatically. Configure one below — set its BASE URL and start the local server.": "Si Claude falla (sin créditos, clave incorrecta, sin conexión), la mesa y los informes reintentan automáticamente con tu modelo local (Ollama o LM Studio). Configura uno abajo — establece su BASE URL e inicia el servidor local.",
    "ACTIVE": "ACTIVO", "use only this": "usar solo este", "BASE URL": "BASE URL", "MODEL": "MODELO",
    "format:": "formato:", "e.g.": "p. ej.", "browse models": "explorar modelos",
    "Proton Lumo has no official hosted API yet — run a local OpenAI-compatible bridge and point BASE URL at it.": "Proton Lumo aún no tiene una API alojada oficial — ejecuta un puente local compatible con OpenAI y apunta la BASE URL a él.", "Lumo bridge": "puente Lumo",
    "API KEY": "CLAVE API",
    "Local endpoints need CORS enabled to accept requests from this page:": "Los endpoints locales necesitan CORS activado para aceptar solicitudes desde esta página:",
    "start with": "inicia con", "or": "o", "Developer tab → enable server + turn on CORS": "pestaña Developer → activa el servidor + activa CORS",
    "The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).": "La ranura de LM Studio funciona con cualquier cosa que hable el formato de chat de OpenAI (llama.cpp, vLLM…).",
    "ANCHOR": "PRESENTADOR", "ENVIRONMENT": "ENTORNO", "BACKGROUND CREW": "EQUIPO DE FONDO",
    "Auto — whoever isn't anchoring": "Auto — quien no esté presentando", "Off — solo broadcast": "Desactivado — transmisión en solitario",
    "VOICE ENGINE": "MOTOR DE VOZ", "BROWSER · free": "NAVEGADOR · gratis",
    "ELEVENLABS API KEY": "CLAVE API DE ELEVENLABS", "get a key ↗": "obtener una clave ↗",
    "Held in memory only, sent only to api.elevenlabs.io. Uses eleven_flash_v2_5 for low latency — each read costs quota characters.": "Se guarda solo en memoria, se envía solo a api.elevenlabs.io. Usa eleven_flash_v2_5 para baja latencia — cada lectura consume caracteres de tu cuota.",
    "ELEVENLABS VOICE": "VOZ DE ELEVENLABS", "Paste a key and hit Apply — voices load automatically.": "Pega una clave y pulsa Aplicar — las voces se cargan automáticamente.",
    "READING SPEED": "VELOCIDAD DE LECTURA", "auto-read the first answer that finishes": "leer automáticamente la primera respuesta que termine",
    "UI click sounds — terminal blips on every button": "sonidos de clic de la interfaz — pitidos de terminal en cada botón", "SOUND VOLUME": "VOLUMEN DEL SONIDO",
    "ambient music": "música ambiental", "your Spotify playlist, docked bottom-right": "tu lista de Spotify, anclada abajo a la derecha",
    "generative synth, ducks under the anchor's voice": "sintetizador generativo, baja bajo la voz del presentador", "MUSIC SOURCE": "FUENTE DE MÚSICA",
    "SPOTIFY PLAYLIST / ALBUM / TRACK LINK": "ENLACE DE LISTA / ÁLBUM / CANCIÓN DE SPOTIFY",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Sin necesidad de iniciar sesión — activa ♪ y el reproductor se ancla abajo a la derecha. (El reproductor incrustado de Spotify reproduce vistas previas de 30 segundos sin cuenta; las canciones completas suenan automáticamente si ya has iniciado sesión en Spotify en este navegador.)",
    "Paste a Spotify share link — open Spotify → any playlist/album/track → Share → Copy link.": "Pega un enlace para compartir de Spotify — abre Spotify → cualquier lista/álbum/canción → Compartir → Copiar enlace.",
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
    "Developer mode (testing).": "Modo desarrollador (pruebas).",
    "Unlocks every premium feature regardless of plan — AI desk, live data, YouTube, TMDB, Spotify and the ElevenLabs voice. You still need each feature's own API key to actually use it. Not for production.": "Desbloquea todas las funciones premium sin importar el plan — mesa de IA, datos en vivo, YouTube, TMDB, Spotify y la voz de ElevenLabs. Aún necesitas la clave API de cada función para usarla. No apto para producción.",
    "also toggles with ?dev=1 in the URL": "también se activa con ?dev=1 en la URL", "DEV MODE ON — all plan gates bypassed": "MODO DEV ACTIVADO — todas las restricciones de plan omitidas",
  },
  fr: {
    "Export": "Exporter", "More": "Plus", "Settings": "Réglages", "sign in": "se connecter",
    "Games": "Jeux", "learn how stocks work": "apprenez le fonctionnement des actions",
    "Ambient sound": "Son d'ambiance", "waves, jungle, space hum…": "vagues, jungle, bourdonnement spatial…",
    "Music": "Musique", "background score": "musique de fond",
    "one model on the desk": "un modèle sur le plateau",
    "Type a symbol and press Enter  ·  HELP for commands": "Saisissez un symbole et appuyez sur Entrée  ·  HELP pour les commandes",
    "OPEN": "OUVERT", "CLOSED": "FERMÉ",
    "standing by": "en attente",
    "voice & anchor settings": "réglages voix et présentateur", "SET": "DÉCOR", "stop reading": "arrêter la lecture", "free": "gratuites",
    "Ask a question below — answers appear here, and the anchor can read any of them on air.": "Posez une question ci-dessous — les réponses apparaissent ici, et le présentateur peut les lire à l'antenne.",
    "ASK ALL": "TOUT DEMANDER",
    "WATCHLIST": "LISTE DE SUIVI", "TOP MOVERS": "PLUS FORTES VARIATIONS", "full chart": "graphique complet",
    "Language": "Langue",
    "The AI broadcast desk for the markets.": "Le plateau de diffusion IA pour les marchés.",
    "Create account": "Créer un compte", "Log in": "Se connecter", "Explore in demo mode →": "Explorer en mode démo →",
    "ranked by |Δ%| across your watchlist": "classé par |Δ%| dans votre liste de suivi",
    'Ask about {sym}, "take me to Robinhood", or "download excel" / "make a powerpoint" / "write a report and export ppt"': 'Posez une question sur {sym}, "take me to Robinhood", ou "download excel" / "make a powerpoint" / "write a report and export ppt"',
    // settings tabs + guided tour
    "ACCOUNT": "COMPTE", "START": "DÉMARRER", "DATA": "DONNÉES", "VOICE": "VOIX", "MEET": "RÉUNION",
    "exit": "quitter", "skip tour": "passer la visite", "Back": "Retour", "Next": "Suivant", "Done": "Terminé",
    "Command bar": "Barre de commande",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Saisissez ici n'importe quel symbole et appuyez sur Entrée pour l'afficher. « ADD TSLA » et « DEL TSLA » gèrent votre liste de suivi. Les noms d'entreprise fonctionnent aussi.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Voici votre barre de commande. Saisissez un symbole comme Apple ou Nvidia et appuyez sur Entrée pour l'afficher.",
    "Your anchor — that's me": "Votre présentateur — c'est moi",
    "I run a live trading day: opening bell, meals, breaks. I read any answer on air. Swap my character, environment, and sounds in settings.": "J'anime une journée de bourse en direct : cloche d'ouverture, repas, pauses. Je lis n'importe quelle réponse à l'antenne. Changez mon personnage, mon décor et mes sons dans les réglages.",
    "That's me, your anchor. I run a live trading day and I can read anything on air.": "C'est moi, votre présentateur. J'anime une journée de bourse en direct et je peux tout lire à l'antenne.",
    "The AI desk": "Le plateau IA",
    "Ask a question here and I answer in one box, cascading across your models. I also take commands — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Posez une question ici et je réponds dans une seule fenêtre, en cascade sur vos modèles. J'accepte aussi des commandes — « take me to Robinhood », « what's on netflix », « write a report and export ppt ».",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Demandez-moi ce que vous voulez ici. Je comprends aussi les commandes simples, comme, take me to Robinhood, ou, what's on Netflix.",
    "Answers, news & Watch": "Réponses, actualités et Visionnage",
    "Everything lands here in one box — desk answers, the navigator, news, and the streaming catalog. Trailers and public-domain films play right inside.": "Tout arrive ici dans une seule fenêtre — réponses du plateau, navigateur, actualités et catalogue de streaming. Les bandes-annonces et films du domaine public se lisent directement à l'intérieur.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Les réponses, les actualités et le catalogue de streaming apparaissent tous ici, au même endroit.",
    "Ticker tape": "Bandeau de cotation",
    "Your whole watchlist scrolls across the top with live-style movement.": "Toute votre liste de suivi défile en haut avec un mouvement en temps réel.",
    "Your watchlist scrolls across the ticker tape, up top.": "Votre liste de suivi défile sur le bandeau de cotation, en haut.",
    "Why setup? (mostly optional)": "Pourquoi la configuration ? (presque tout est optionnel)",
    "Vantage runs fully in DEMO with zero setup. The one thing worth adding is an AI key — the desk's answers come from external models (OpenRouter, Claude…) billed to your own account, so they need your key. Everything else is optional: charts, calendar, games and news need nothing. Open Start to paste that one key.": "Vantage fonctionne entièrement en DÉMO sans configuration. La seule chose à ajouter est une clé IA — les réponses du plateau proviennent de modèles externes (OpenRouter, Claude…) facturés sur votre propre compte, ils ont donc besoin de votre clé. Tout le reste est optionnel : graphiques, calendrier, jeux et actualités n'ont besoin de rien. Ouvrez Démarrer pour coller cette clé.",
    "Here's why setup exists. Vantage works in demo with zero setup. The one key worth adding is for the A.I. — my answers come from external models that bill to your own account, so they need your key. Everything else is optional. Open Start to paste that one key. That's the tour!": "Voici pourquoi la configuration existe. Vantage fonctionne en démo sans configuration. La seule clé à ajouter est celle de l'IA — mes réponses proviennent de modèles externes facturés sur votre propre compte, ils ont donc besoin de votre clé. Tout le reste est optionnel. Ouvrez Démarrer pour coller cette clé. Et voilà la visite !",
    // settings footer + MEET tab
    "Close": "Fermer", "Applied": "Appliqué", "Apply": "Appliquer",
    "Go Live — no setup": "En direct — sans configuration",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Démarrez instantanément une nouvelle réunion dans un onglet du navigateur (utilise la session déjà ouverte), puis partagez l'écran de Vantage. Aucune clé, aucun OAuth.",
    "New Google Meet": "Nouveau Google Meet", "New Zoom meeting": "Nouvelle réunion Zoom",
    "Join": "Rejoindre", "copy link": "copier le lien", "end": "terminer",
    "paste your meeting link to pin it as LIVE…": "collez le lien de votre réunion pour l'épingler comme EN DIRECT…",
    "Pin": "Épingler",
    "Or, for meetings created & tracked inside Vantage (with join links here), connect your own OAuth apps below — see MEETINGS_SETUP.md. This is the part that needs .env credentials.": "Ou, pour des réunions créées et suivies dans Vantage (avec les liens de connexion ici), connectez vos propres applis OAuth ci-dessous — voir MEETINGS_SETUP.md. C'est la partie qui nécessite des identifiants .env.",
    "Backend not reachable. Start it in the project folder:": "Backend inaccessible. Démarrez-le dans le dossier du projet :",
    "retry": "réessayer", "create app": "créer une appli",
    "connected": "connecté", "not connected": "non connecté", "not configured (.env)": "non configuré (.env)",
    "Sign in to connect": "Connectez-vous pour relier", "Connect": "Relier",
    "creating…": "création…", "New meeting": "Nouvelle réunion", "disconnect": "déconnecter",
    "RECENT MEETINGS": "RÉUNIONS RÉCENTES",
    // START tab
    "AI desk": "Plateau IA", "ready": "prêt", "add key ↑": "ajouter une clé ↑", "Voice": "Voix", "browser": "navigateur",
    "Live quotes": "Cotations en direct", "live": "en direct", "demo": "démo", "Real videos": "Vraies vidéos",
    "on": "activé", "optional": "optionnel", "Streaming": "Streaming", "Calendar": "Calendrier", "built-in": "intégré", "Meetings": "Réunions",
    "You're already set up.": "Tout est déjà prêt.",
    "Vantage runs right now in demo mode — no keys needed. The one thing worth adding is an AI key so the desk can actually answer you:": "Vantage fonctionne dès maintenant en mode démo — aucune clé requise. La seule chose à ajouter est une clé IA pour que le plateau puisse vraiment vous répondre :",
    "AI DESK IS ON": "LE PLATEAU IA EST ACTIF", "TURN ON THE AI DESK — paste one key": "ACTIVEZ LE PLATEAU IA — collez une clé",
    "One key unlocks the whole desk — OpenRouter gives you dozens of models (GPT, Llama, more) behind a single key, and it's the primary model.": "Une seule clé débloque tout le plateau — OpenRouter vous donne des dizaines de modèles (GPT, Llama, et plus) derrière une seule clé, et c'est le modèle principal.",
    "get a key": "obtenir une clé",
    "No AI key? The desk still can't answer, but everything else — charts, news, games, streaming, calendar — works without it.": "Pas de clé IA ? Le plateau ne peut pas encore répondre, mais tout le reste — graphiques, actualités, jeux, streaming, calendrier — fonctionne sans elle.",
    "WHAT'S SET UP": "CE QUI EST CONFIGURÉ", "tap to configure": "touchez pour configurer",
    "tour · demo · missions": "visite · démo · missions", "pick your anchor": "choisissez votre présentateur",
    "skip — I'll explore on my own": "passer — je vais explorer par moi-même",
    // DATA tab
    "PANELS": "PANNEAUX", "ticker tape": "bandeau de cotation", "watchlist": "liste de suivi", "top movers": "plus fortes variations", "news & video": "actualités et vidéo", "calendar": "calendrier", "portfolio": "portefeuille",
    "breaking-news alerts during live trading": "alertes de dernière minute pendant la séance en direct",
    "CLOCK TIMEZONE": "FUSEAU HORAIRE DE L'HORLOGE",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Règle l'horloge de l'en-tête. Le badge de marché OUVERT/FERMÉ suit toujours les heures du NYSE (heure de l'Est).",
    "replay tutorial": "revoir le tutoriel", "DEMO": "DÉMO", "LIVE": "EN DIRECT",
    "Demo mode runs a seeded random-walk market engine — a reproducible simulated session, no key or network needed.": "Le mode démo utilise un moteur de marché à marche aléatoire avec graine — une séance simulée reproductible, sans clé ni réseau.",
    "FINNHUB API KEY (free tier works)": "CLÉ API FINNHUB (l'offre gratuite suffit)", "paste key": "collez la clé",
    "Key is saved on this device and sent only to finnhub.io.": "La clé est enregistrée sur cet appareil et envoyée uniquement à finnhub.io.",
    "get a free key": "obtenir une clé gratuite",
    "YOUTUBE DATA API KEY": "CLÉ API YOUTUBE DATA", "(optional — real, playable video results)": "(optionnel — résultats vidéo réels et lisibles)",
    "paste key (AIza…)": "collez la clé (AIza…)", "needs": "nécessite",
    "Without a key, \"show videos of …\" asks Claude to guess videos (often unembeddable). With one, the desk pulls real embeddable results from YouTube.": "Sans clé, \"show videos of …\" demande à Claude de deviner des vidéos (souvent non intégrables). Avec une clé, le plateau récupère de vrais résultats intégrables de YouTube.",
    "enable API": "activer l'API",
    "TMDB API KEY": "CLÉ API TMDB", "(optional — in-app Netflix / Disney+ / Hulu catalog + trailers)": "(optionnel — catalogue Netflix / Disney+ / Hulu et bandes-annonces dans l'app)",
    "paste TMDB API key (v3 auth)": "collez la clé API TMDB (auth v3)",
    "Powers \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — real libraries with posters, ratings & in-desk trailers. Playback still opens on the service (they block embedding); public-domain films play fully in-desk via \"free movies …\" (no key needed).": "Alimente \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — de vraies bibliothèques avec affiches, notes et bandes-annonces sur le plateau. La lecture s'ouvre toujours sur le service (ils bloquent l'intégration) ; les films du domaine public se lisent entièrement sur le plateau via \"free movies …\" (aucune clé requise).",
    "DAILY BRIEF": "BRIEF QUOTIDIEN", "(auto-download while the app is open)": "(téléchargement automatique tant que l'app est ouverte)",
    "at": "à", "off": "désactiver", "run now": "lancer maintenant",
    "Each day at {time}, the desk writes an analyst report on {sym} and downloads a {fmt} brief automatically. Requires this tab to be open (browsers can't run it closed) and an Anthropic key for the write-up.": "Chaque jour à {time}, le plateau rédige un rapport d'analyste sur {sym} et télécharge automatiquement un brief en {fmt}. Nécessite que cet onglet reste ouvert (les navigateurs ne peuvent pas l'exécuter fermé) et une clé Anthropic pour la rédaction.",
    "Set a time to auto-generate and download a branded report each day. Leave blank to disable.": "Définissez une heure pour générer et télécharger automatiquement un rapport à votre marque chaque jour. Laissez vide pour désactiver.",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "Les réponses du plateau IA nécessitent {plan}. Les modèles ci-dessous sont désactivés jusqu'à ce que vous passiez à l'offre supérieure (ou activiez le mode développeur dans COMPTE).",
    "{n} models enabled": "{n} modèles activés", "One model at a time": "Un modèle à la fois",
    "Use \"only this\" for a single model, or enable several — the desk answers in one box, trying them top-to-bottom and falling back to the next if one errors (e.g. Claude → OpenRouter).": "Utilisez \"only this\" pour un seul modèle, ou activez-en plusieurs — le plateau répond dans une seule fenêtre, en les essayant de haut en bas et en passant au suivant si l'un échoue (par ex. Claude → OpenRouter).",
    "Auto-fallback to a local model.": "Bascule automatique vers un modèle local.",
    "If Claude fails (no credits, bad key, offline), the desk and reports retry on your local model (Ollama or LM Studio) automatically. Configure one below — set its BASE URL and start the local server.": "Si Claude échoue (pas de crédits, mauvaise clé, hors ligne), le plateau et les rapports réessaient automatiquement avec votre modèle local (Ollama ou LM Studio). Configurez-en un ci-dessous — définissez sa BASE URL et démarrez le serveur local.",
    "ACTIVE": "ACTIF", "use only this": "utiliser seulement celui-ci", "BASE URL": "BASE URL", "MODEL": "MODÈLE",
    "format:": "format :", "e.g.": "par ex.", "browse models": "parcourir les modèles",
    "Proton Lumo has no official hosted API yet — run a local OpenAI-compatible bridge and point BASE URL at it.": "Proton Lumo n'a pas encore d'API hébergée officielle — exécutez un pont local compatible OpenAI et faites pointer la BASE URL dessus.", "Lumo bridge": "pont Lumo",
    "API KEY": "CLÉ API",
    "Local endpoints need CORS enabled to accept requests from this page:": "Les points de terminaison locaux ont besoin de CORS activé pour accepter les requêtes de cette page :",
    "start with": "démarrez avec", "or": "ou", "Developer tab → enable server + turn on CORS": "onglet Developer → activez le serveur + activez CORS",
    "The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).": "L'emplacement LM Studio fonctionne avec tout ce qui parle le format de chat OpenAI (llama.cpp, vLLM…).",
    "ANCHOR": "PRÉSENTATEUR", "ENVIRONMENT": "ENVIRONNEMENT", "BACKGROUND CREW": "ÉQUIPE EN FOND",
    "Auto — whoever isn't anchoring": "Auto — celui qui ne présente pas", "Off — solo broadcast": "Désactivé — diffusion en solo",
    "VOICE ENGINE": "MOTEUR VOCAL", "BROWSER · free": "NAVIGATEUR · gratuit",
    "ELEVENLABS API KEY": "CLÉ API ELEVENLABS", "get a key ↗": "obtenir une clé ↗",
    "Held in memory only, sent only to api.elevenlabs.io. Uses eleven_flash_v2_5 for low latency — each read costs quota characters.": "Conservée uniquement en mémoire, envoyée seulement à api.elevenlabs.io. Utilise eleven_flash_v2_5 pour une faible latence — chaque lecture consomme des caractères de votre quota.",
    "ELEVENLABS VOICE": "VOIX ELEVENLABS", "Paste a key and hit Apply — voices load automatically.": "Collez une clé et cliquez sur Appliquer — les voix se chargent automatiquement.",
    "READING SPEED": "VITESSE DE LECTURE", "auto-read the first answer that finishes": "lire automatiquement la première réponse terminée",
    "UI click sounds — terminal blips on every button": "sons de clic de l'interface — bips de terminal sur chaque bouton", "SOUND VOLUME": "VOLUME DU SON",
    "ambient music": "musique d'ambiance", "your Spotify playlist, docked bottom-right": "votre playlist Spotify, ancrée en bas à droite",
    "generative synth, ducks under the anchor's voice": "synthé génératif, s'atténue sous la voix du présentateur", "MUSIC SOURCE": "SOURCE MUSICALE",
    "SPOTIFY PLAYLIST / ALBUM / TRACK LINK": "LIEN PLAYLIST / ALBUM / TITRE SPOTIFY",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Aucune connexion requise — activez ♪ et le lecteur s'ancre en bas à droite. (Le lecteur intégré de Spotify diffuse des extraits de 30 secondes sans compte ; les titres complets se lisent automatiquement si vous êtes déjà connecté à Spotify dans ce navigateur.)",
    "Paste a Spotify share link — open Spotify → any playlist/album/track → Share → Copy link.": "Collez un lien de partage Spotify — ouvrez Spotify → n'importe quelle playlist/album/titre → Partager → Copier le lien.",
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
    "Developer mode (testing).": "Mode développeur (test).",
    "Unlocks every premium feature regardless of plan — AI desk, live data, YouTube, TMDB, Spotify and the ElevenLabs voice. You still need each feature's own API key to actually use it. Not for production.": "Débloque toutes les fonctionnalités premium quel que soit le forfait — bureau IA, données en direct, YouTube, TMDB, Spotify et la voix ElevenLabs. Vous avez toujours besoin de la clé API propre à chaque fonctionnalité pour l'utiliser. Pas pour la production.",
    "also toggles with ?dev=1 in the URL": "s'active aussi avec ?dev=1 dans l'URL", "DEV MODE ON — all plan gates bypassed": "MODE DEV ACTIVÉ — toutes les restrictions d'offre contournées",
  },
  de: {
    "Export": "Exportieren", "More": "Mehr", "Settings": "Einstellungen", "sign in": "anmelden",
    "Games": "Spiele", "learn how stocks work": "lerne, wie Aktien funktionieren",
    "Ambient sound": "Umgebungston", "waves, jungle, space hum…": "Wellen, Dschungel, Weltraumbrummen…",
    "Music": "Musik", "background score": "Hintergrundmusik",
    "one model on the desk": "ein Modell am Pult",
    "Type a symbol and press Enter  ·  HELP for commands": "Symbol eingeben und Enter drücken  ·  HELP für Befehle",
    "OPEN": "OFFEN", "CLOSED": "GESCHLOSSEN",
    "standing by": "bereit",
    "voice & anchor settings": "Stimme & Moderator-Einstellungen", "SET": "KULISSE", "stop reading": "Vorlesen stoppen", "free": "kostenlos",
    "Ask a question below — answers appear here, and the anchor can read any of them on air.": "Stellen Sie unten eine Frage — Antworten erscheinen hier, und der Moderator kann jede davon vorlesen.",
    "ASK ALL": "ALLE FRAGEN",
    "WATCHLIST": "BEOBACHTUNGSLISTE", "TOP MOVERS": "GRÖSSTE BEWEGUNGEN", "full chart": "vollständiges Diagramm",
    "Language": "Sprache",
    "The AI broadcast desk for the markets.": "Das KI-Broadcast-Pult für die Märkte.",
    "Create account": "Konto erstellen", "Log in": "Anmelden", "Explore in demo mode →": "Im Demo-Modus erkunden →",
    "ranked by |Δ%| across your watchlist": "sortiert nach |Δ%| in Ihrer Beobachtungsliste",
    'Ask about {sym}, "take me to Robinhood", or "download excel" / "make a powerpoint" / "write a report and export ppt"': 'Fragen zu {sym}, "take me to Robinhood", oder "download excel" / "make a powerpoint" / "write a report and export ppt"',
    // settings tabs + guided tour
    "ACCOUNT": "KONTO", "START": "START", "DATA": "DATEN", "VOICE": "STIMME", "MEET": "MEETING",
    "exit": "beenden", "skip tour": "Tour überspringen", "Back": "Zurück", "Next": "Weiter", "Done": "Fertig",
    "Command bar": "Befehlsleiste",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Geben Sie hier ein beliebiges Kürzel ein und drücken Sie Enter, um es zu charten. „ADD TSLA“ und „DEL TSLA“ verwalten Ihre Beobachtungsliste. Firmennamen funktionieren auch.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Das ist Ihre Befehlsleiste. Geben Sie ein Kürzel wie Apple oder Nvidia ein und drücken Sie Enter, um es zu charten.",
    "Your anchor — that's me": "Ihr Moderator — das bin ich",
    "I run a live trading day: opening bell, meals, breaks. I read any answer on air. Swap my character, environment, and sounds in settings.": "Ich moderiere einen Live-Handelstag: Eröffnungsglocke, Mahlzeiten, Pausen. Ich lese jede Antwort auf Sendung vor. Ändern Sie meine Figur, Umgebung und Klänge in den Einstellungen.",
    "That's me, your anchor. I run a live trading day and I can read anything on air.": "Das bin ich, Ihr Moderator. Ich moderiere einen Live-Handelstag und kann alles auf Sendung vorlesen.",
    "The AI desk": "Das KI-Pult",
    "Ask a question here and I answer in one box, cascading across your models. I also take commands — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Stellen Sie hier eine Frage und ich antworte in einem Feld, kaskadierend über Ihre Modelle. Ich nehme auch Befehle entgegen — „take me to Robinhood“, „what's on netflix“, „write a report and export ppt“.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Fragen Sie mich hier alles. Ich verstehe auch einfache Befehle, wie, take me to Robinhood, oder, what's on Netflix.",
    "Answers, news & Watch": "Antworten, Nachrichten & Ansehen",
    "Everything lands here in one box — desk answers, the navigator, news, and the streaming catalog. Trailers and public-domain films play right inside.": "Alles landet hier in einem Feld — Pult-Antworten, der Navigator, Nachrichten und der Streaming-Katalog. Trailer und gemeinfreie Filme laufen direkt darin.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Antworten, Nachrichten und der Streaming-Katalog erscheinen alle hier, an einem Ort.",
    "Ticker tape": "Kursband",
    "Your whole watchlist scrolls across the top with live-style movement.": "Ihre gesamte Beobachtungsliste läuft oben mit Live-Bewegung durch.",
    "Your watchlist scrolls across the ticker tape, up top.": "Ihre Beobachtungsliste läuft oben über das Kursband.",
    "Why setup? (mostly optional)": "Warum einrichten? (meist optional)",
    "Vantage runs fully in DEMO with zero setup. The one thing worth adding is an AI key — the desk's answers come from external models (OpenRouter, Claude…) billed to your own account, so they need your key. Everything else is optional: charts, calendar, games and news need nothing. Open Start to paste that one key.": "Vantage läuft vollständig in der DEMO ohne Einrichtung. Das Einzige, was sich lohnt, ist ein KI-Schlüssel — die Antworten des Pults stammen von externen Modellen (OpenRouter, Claude…), die Ihrem eigenen Konto berechnet werden, sie brauchen also Ihren Schlüssel. Alles andere ist optional: Charts, Kalender, Spiele und Nachrichten brauchen nichts. Öffnen Sie Start, um diesen einen Schlüssel einzufügen.",
    "Here's why setup exists. Vantage works in demo with zero setup. The one key worth adding is for the A.I. — my answers come from external models that bill to your own account, so they need your key. Everything else is optional. Open Start to paste that one key. That's the tour!": "Hier ist, warum es die Einrichtung gibt. Vantage funktioniert in der Demo ohne Einrichtung. Der einzige Schlüssel, der sich lohnt, ist der für die KI — meine Antworten stammen von externen Modellen, die Ihrem eigenen Konto berechnet werden, sie brauchen also Ihren Schlüssel. Alles andere ist optional. Öffnen Sie Start, um diesen einen Schlüssel einzufügen. Das war die Tour!",
    // settings footer + MEET tab
    "Close": "Schließen", "Applied": "Übernommen", "Apply": "Übernehmen",
    "Go Live — no setup": "Live gehen — ohne Einrichtung",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Starten Sie sofort ein neues Meeting in einem Browser-Tab (nutzt Ihre bestehende Anmeldung) und teilen Sie dann den Vantage-Bildschirm. Keine Schlüssel, kein OAuth.",
    "New Google Meet": "Neues Google Meet", "New Zoom meeting": "Neues Zoom-Meeting",
    "Join": "Beitreten", "copy link": "Link kopieren", "end": "beenden",
    "paste your meeting link to pin it as LIVE…": "Meeting-Link einfügen, um ihn als LIVE anzuheften…",
    "Pin": "Anheften",
    "Or, for meetings created & tracked inside Vantage (with join links here), connect your own OAuth apps below — see MEETINGS_SETUP.md. This is the part that needs .env credentials.": "Oder verbinden Sie für innerhalb von Vantage erstellte und verfolgte Meetings (mit Beitrittslinks hier) unten Ihre eigenen OAuth-Apps — siehe MEETINGS_SETUP.md. Das ist der Teil, der .env-Anmeldedaten benötigt.",
    "Backend not reachable. Start it in the project folder:": "Backend nicht erreichbar. Starten Sie es im Projektordner:",
    "retry": "erneut versuchen", "create app": "App erstellen",
    "connected": "verbunden", "not connected": "nicht verbunden", "not configured (.env)": "nicht konfiguriert (.env)",
    "Sign in to connect": "Zum Verbinden anmelden", "Connect": "Verbinden",
    "creating…": "wird erstellt…", "New meeting": "Neues Meeting", "disconnect": "trennen",
    "RECENT MEETINGS": "LETZTE MEETINGS",
    // START tab
    "AI desk": "KI-Pult", "ready": "bereit", "add key ↑": "Schlüssel hinzufügen ↑", "Voice": "Stimme", "browser": "Browser",
    "Live quotes": "Live-Kurse", "live": "live", "demo": "Demo", "Real videos": "Echte Videos",
    "on": "an", "optional": "optional", "Streaming": "Streaming", "Calendar": "Kalender", "built-in": "integriert", "Meetings": "Meetings",
    "You're already set up.": "Sie sind bereits startklar.",
    "Vantage runs right now in demo mode — no keys needed. The one thing worth adding is an AI key so the desk can actually answer you:": "Vantage läuft gerade jetzt im Demo-Modus — keine Schlüssel nötig. Das Einzige, was sich lohnt, ist ein KI-Schlüssel, damit das Pult Ihnen tatsächlich antworten kann:",
    "AI DESK IS ON": "DAS KI-PULT IST AN", "TURN ON THE AI DESK — paste one key": "KI-PULT EINSCHALTEN — einen Schlüssel einfügen",
    "One key unlocks the whole desk — OpenRouter gives you dozens of models (GPT, Llama, more) behind a single key, and it's the primary model.": "Ein Schlüssel schaltet das ganze Pult frei — OpenRouter gibt Ihnen Dutzende Modelle (GPT, Llama und mehr) hinter einem einzigen Schlüssel, und es ist das Hauptmodell.",
    "get a key": "Schlüssel holen",
    "No AI key? The desk still can't answer, but everything else — charts, news, games, streaming, calendar — works without it.": "Kein KI-Schlüssel? Das Pult kann noch nicht antworten, aber alles andere — Charts, Nachrichten, Spiele, Streaming, Kalender — funktioniert auch ohne ihn.",
    "WHAT'S SET UP": "WAS EINGERICHTET IST", "tap to configure": "zum Konfigurieren tippen",
    "tour · demo · missions": "Tour · Demo · Missionen", "pick your anchor": "Moderator wählen",
    "skip — I'll explore on my own": "überspringen — ich erkunde selbst",
    // DATA tab
    "PANELS": "PANELS", "ticker tape": "Kursband", "watchlist": "Beobachtungsliste", "top movers": "größte Bewegungen", "news & video": "Nachrichten & Video", "calendar": "Kalender", "portfolio": "Portfolio",
    "breaking-news alerts during live trading": "Eilmeldungen während des Live-Handels",
    "CLOCK TIMEZONE": "ZEITZONE DER UHR",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Stellt die Kopfzeilen-Uhr ein. Das OFFEN/GESCHLOSSEN-Abzeichen folgt immer den NYSE-Zeiten (Eastern).",
    "replay tutorial": "Tutorial wiederholen", "DEMO": "DEMO", "LIVE": "LIVE",
    "Demo mode runs a seeded random-walk market engine — a reproducible simulated session, no key or network needed.": "Der Demo-Modus nutzt eine Random-Walk-Markt-Engine mit festem Startwert — eine reproduzierbare simulierte Sitzung, ohne Schlüssel oder Netzwerk.",
    "FINNHUB API KEY (free tier works)": "FINNHUB-API-SCHLÜSSEL (kostenlose Stufe genügt)", "paste key": "Schlüssel einfügen",
    "Key is saved on this device and sent only to finnhub.io.": "Der Schlüssel wird auf diesem Gerät gespeichert und nur an finnhub.io gesendet.",
    "get a free key": "kostenlosen Schlüssel holen",
    "YOUTUBE DATA API KEY": "YOUTUBE-DATA-API-SCHLÜSSEL", "(optional — real, playable video results)": "(optional — echte, abspielbare Videoergebnisse)",
    "paste key (AIza…)": "Schlüssel einfügen (AIza…)", "needs": "erfordert",
    "Without a key, \"show videos of …\" asks Claude to guess videos (often unembeddable). With one, the desk pulls real embeddable results from YouTube.": "Ohne Schlüssel bittet \"show videos of …\" Claude, Videos zu erraten (oft nicht einbettbar). Mit Schlüssel holt das Pult echte einbettbare Ergebnisse von YouTube.",
    "enable API": "API aktivieren",
    "TMDB API KEY": "TMDB-API-SCHLÜSSEL", "(optional — in-app Netflix / Disney+ / Hulu catalog + trailers)": "(optional — Netflix / Disney+ / Hulu-Katalog + Trailer in der App)",
    "paste TMDB API key (v3 auth)": "TMDB-API-Schlüssel einfügen (v3-Auth)",
    "Powers \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — real libraries with posters, ratings & in-desk trailers. Playback still opens on the service (they block embedding); public-domain films play fully in-desk via \"free movies …\" (no key needed).": "Treibt \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" an — echte Bibliotheken mit Postern, Bewertungen und Trailern im Pult. Die Wiedergabe öffnet sich weiterhin beim Dienst (Einbettung wird blockiert); gemeinfreie Filme laufen vollständig im Pult über \"free movies …\" (kein Schlüssel nötig).",
    "DAILY BRIEF": "TÄGLICHER BRIEFING", "(auto-download while the app is open)": "(automatischer Download, solange die App offen ist)",
    "at": "um", "off": "aus", "run now": "jetzt ausführen",
    "Each day at {time}, the desk writes an analyst report on {sym} and downloads a {fmt} brief automatically. Requires this tab to be open (browsers can't run it closed) and an Anthropic key for the write-up.": "Jeden Tag um {time} verfasst das Pult einen Analystenbericht zu {sym} und lädt automatisch ein {fmt}-Briefing herunter. Erfordert, dass dieser Tab geöffnet ist (Browser können es nicht geschlossen ausführen) und einen Anthropic-Schlüssel für den Text.",
    "Set a time to auto-generate and download a branded report each day. Leave blank to disable.": "Legen Sie eine Uhrzeit fest, um täglich automatisch einen Bericht mit Ihrer Marke zu erstellen und herunterzuladen. Leer lassen zum Deaktivieren.",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "KI-Pult-Antworten erfordern {plan}. Die Modelle unten sind deaktiviert, bis Sie upgraden (oder den Entwicklermodus in KONTO aktivieren).",
    "{n} models enabled": "{n} Modelle aktiviert", "One model at a time": "Ein Modell zur Zeit",
    "Use \"only this\" for a single model, or enable several — the desk answers in one box, trying them top-to-bottom and falling back to the next if one errors (e.g. Claude → OpenRouter).": "Verwenden Sie \"only this\" für ein einzelnes Modell oder aktivieren Sie mehrere — das Pult antwortet in einem Feld, probiert sie von oben nach unten durch und wechselt zum nächsten, wenn eines fehlschlägt (z. B. Claude → OpenRouter).",
    "Auto-fallback to a local model.": "Automatischer Rückgriff auf ein lokales Modell.",
    "If Claude fails (no credits, bad key, offline), the desk and reports retry on your local model (Ollama or LM Studio) automatically. Configure one below — set its BASE URL and start the local server.": "Wenn Claude fehlschlägt (keine Credits, falscher Schlüssel, offline), versuchen das Pult und die Berichte es automatisch erneut mit Ihrem lokalen Modell (Ollama oder LM Studio). Konfigurieren Sie unten eines — legen Sie seine BASE URL fest und starten Sie den lokalen Server.",
    "ACTIVE": "AKTIV", "use only this": "nur dieses verwenden", "BASE URL": "BASE URL", "MODEL": "MODELL",
    "format:": "Format:", "e.g.": "z. B.", "browse models": "Modelle durchsuchen",
    "Proton Lumo has no official hosted API yet — run a local OpenAI-compatible bridge and point BASE URL at it.": "Proton Lumo hat noch keine offizielle gehostete API — betreiben Sie eine lokale OpenAI-kompatible Brücke und richten Sie die BASE URL darauf aus.", "Lumo bridge": "Lumo-Brücke",
    "API KEY": "API-SCHLÜSSEL",
    "Local endpoints need CORS enabled to accept requests from this page:": "Lokale Endpunkte benötigen aktiviertes CORS, um Anfragen von dieser Seite zu akzeptieren:",
    "start with": "starten mit", "or": "oder", "Developer tab → enable server + turn on CORS": "Developer-Tab → Server aktivieren + CORS einschalten",
    "The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).": "Der LM-Studio-Slot funktioniert mit allem, das das OpenAI-Chat-Format spricht (llama.cpp, vLLM…).",
    "ANCHOR": "MODERATOR", "ENVIRONMENT": "UMGEBUNG", "BACKGROUND CREW": "HINTERGRUND-TEAM",
    "Auto — whoever isn't anchoring": "Auto — wer gerade nicht moderiert", "Off — solo broadcast": "Aus — Solo-Sendung",
    "VOICE ENGINE": "SPRACH-ENGINE", "BROWSER · free": "BROWSER · kostenlos",
    "ELEVENLABS API KEY": "ELEVENLABS-API-SCHLÜSSEL", "get a key ↗": "Schlüssel holen ↗",
    "Held in memory only, sent only to api.elevenlabs.io. Uses eleven_flash_v2_5 for low latency — each read costs quota characters.": "Nur im Speicher gehalten, nur an api.elevenlabs.io gesendet. Nutzt eleven_flash_v2_5 für geringe Latenz — jede Vorlesung verbraucht Kontingent-Zeichen.",
    "ELEVENLABS VOICE": "ELEVENLABS-STIMME", "Paste a key and hit Apply — voices load automatically.": "Schlüssel einfügen und Anwenden drücken — Stimmen laden automatisch.",
    "READING SPEED": "LESEGESCHWINDIGKEIT", "auto-read the first answer that finishes": "die erste fertige Antwort automatisch vorlesen",
    "UI click sounds — terminal blips on every button": "UI-Klickgeräusche — Terminal-Pieptöne bei jedem Button", "SOUND VOLUME": "TON-LAUTSTÄRKE",
    "ambient music": "Hintergrundmusik", "your Spotify playlist, docked bottom-right": "deine Spotify-Playlist, angedockt unten rechts",
    "generative synth, ducks under the anchor's voice": "generativer Synth, senkt sich unter die Stimme des Moderators", "MUSIC SOURCE": "MUSIKQUELLE",
    "SPOTIFY PLAYLIST / ALBUM / TRACK LINK": "SPOTIFY-PLAYLIST- / ALBUM- / TITEL-LINK",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Keine Anmeldung nötig — schalte ♪ ein und der Player dockt unten rechts an. (Spotifys Embed spielt 30-Sekunden-Vorschauen ohne Konto; vollständige Titel laufen automatisch, wenn du in diesem Browser bereits bei Spotify angemeldet bist.)",
    "Paste a Spotify share link — open Spotify → any playlist/album/track → Share → Copy link.": "Füge einen Spotify-Freigabelink ein — öffne Spotify → beliebige Playlist/Album/Titel → Teilen → Link kopieren.",
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
    "Developer mode (testing).": "Entwicklermodus (Test).",
    "Unlocks every premium feature regardless of plan — AI desk, live data, YouTube, TMDB, Spotify and the ElevenLabs voice. You still need each feature's own API key to actually use it. Not for production.": "Schaltet alle Premium-Funktionen unabhängig vom Tarif frei — KI-Desk, Live-Daten, YouTube, TMDB, Spotify und die ElevenLabs-Stimme. Du brauchst weiterhin den eigenen API-Schlüssel jeder Funktion, um sie tatsächlich zu nutzen. Nicht für den Produktivbetrieb.",
    "also toggles with ?dev=1 in the URL": "lässt sich auch mit ?dev=1 in der URL umschalten", "DEV MODE ON — all plan gates bypassed": "DEV-MODUS AN — alle Tarifsperren umgangen",
  },
  pt: {
    "Export": "Exportar", "More": "Mais", "Settings": "Definições", "sign in": "iniciar sessão",
    "Games": "Jogos", "learn how stocks work": "aprenda como as ações funcionam",
    "Ambient sound": "Som ambiente", "waves, jungle, space hum…": "ondas, selva, zumbido espacial…",
    "Music": "Música", "background score": "música de fundo",
    "one model on the desk": "um modelo na mesa",
    "Type a symbol and press Enter  ·  HELP for commands": "Escreva um símbolo e prima Enter  ·  HELP para comandos",
    "OPEN": "ABERTO", "CLOSED": "FECHADO",
    "standing by": "em espera",
    "voice & anchor settings": "definições de voz e apresentador", "SET": "CENÁRIO", "stop reading": "parar leitura", "free": "grátis",
    "Ask a question below — answers appear here, and the anchor can read any of them on air.": "Faça uma pergunta abaixo — as respostas aparecem aqui, e o apresentador pode lê-las ao vivo.",
    "ASK ALL": "PERGUNTAR A TODOS",
    "WATCHLIST": "LISTA DE ACOMPANHAMENTO", "TOP MOVERS": "MAIORES VARIAÇÕES", "full chart": "gráfico completo",
    "Language": "Idioma",
    "The AI broadcast desk for the markets.": "A mesa de transmissão com IA para os mercados.",
    "Create account": "Criar conta", "Log in": "Iniciar sessão", "Explore in demo mode →": "Explorar no modo demo →",
    "ranked by |Δ%| across your watchlist": "ordenado por |Δ%| na sua lista de acompanhamento",
    'Ask about {sym}, "take me to Robinhood", or "download excel" / "make a powerpoint" / "write a report and export ppt"': 'Pergunte sobre {sym}, "take me to Robinhood", ou "download excel" / "make a powerpoint" / "write a report and export ppt"',
    "ACCOUNT": "CONTA", "START": "INÍCIO", "DATA": "DADOS", "VOICE": "VOZ", "MEET": "REUNIÃO",
    "exit": "sair", "skip tour": "ignorar visita", "Back": "Voltar", "Next": "Seguinte", "Done": "Concluído",
    "Command bar": "Barra de comandos",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Escreva aqui qualquer símbolo e prima Enter para o representar no gráfico. “ADD TSLA” e “DEL TSLA” gerem a sua lista de acompanhamento. Nomes de empresas também funcionam.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Esta é a sua barra de comandos. Escreva um símbolo como Apple ou Nvidia e prima Enter para o representar no gráfico.",
    "Your anchor — that's me": "O seu apresentador — sou eu",
    "I run a live trading day: opening bell, meals, breaks. I read any answer on air. Swap my character, environment, and sounds in settings.": "Conduzo um dia de negociação ao vivo: sino de abertura, refeições, pausas. Leio qualquer resposta ao vivo. Troque a minha personagem, o ambiente e os sons nas definições.",
    "That's me, your anchor. I run a live trading day and I can read anything on air.": "Sou eu, o seu apresentador. Conduzo um dia de negociação ao vivo e posso ler qualquer coisa ao vivo.",
    "The AI desk": "A mesa de IA",
    "Ask a question here and I answer in one box, cascading across your models. I also take commands — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Faça uma pergunta aqui e respondo numa só caixa, em cascata pelos seus modelos. Também aceito comandos — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Pergunte-me o que quiser aqui. Também compreendo comandos simples, como, take me to Robinhood, ou, what's on Netflix.",
    "Answers, news & Watch": "Respostas, notícias e Ver",
    "Everything lands here in one box — desk answers, the navigator, news, and the streaming catalog. Trailers and public-domain films play right inside.": "Tudo chega aqui numa só caixa — respostas da mesa, o navegador, notícias e o catálogo de streaming. Os trailers e os filmes de domínio público são reproduzidos aqui mesmo.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "As respostas, as notícias e o catálogo de streaming aparecem todos aqui, num só lugar.",
    "Ticker tape": "Fita de cotações",
    "Your whole watchlist scrolls across the top with live-style movement.": "Toda a sua lista de acompanhamento desliza no topo com movimento em tempo real.",
    "Your watchlist scrolls across the ticker tape, up top.": "A sua lista de acompanhamento desliza pela fita de cotações, no topo.",
    "Why setup? (mostly optional)": "Porquê configurar? (quase tudo opcional)",
    "Vantage runs fully in DEMO with zero setup. The one thing worth adding is an AI key — the desk's answers come from external models (OpenRouter, Claude…) billed to your own account, so they need your key. Everything else is optional: charts, calendar, games and news need nothing. Open Start to paste that one key.": "O Vantage funciona totalmente em DEMO sem configuração. A única coisa que vale a pena adicionar é uma chave de IA — as respostas da mesa vêm de modelos externos (OpenRouter, Claude…) faturados à sua própria conta, por isso precisam da sua chave. Tudo o resto é opcional: gráficos, calendário, jogos e notícias não precisam de nada. Abra Início para colar essa chave.",
    "Here's why setup exists. Vantage works in demo with zero setup. The one key worth adding is for the A.I. — my answers come from external models that bill to your own account, so they need your key. Everything else is optional. Open Start to paste that one key. That's the tour!": "Eis porque existe a configuração. O Vantage funciona em demo sem configuração. A única chave que vale a pena adicionar é a da IA — as minhas respostas vêm de modelos externos faturados à sua própria conta, por isso precisam da sua chave. Tudo o resto é opcional. Abra Início para colar essa chave. E esta foi a visita!",
    // settings footer + MEET tab
    "Close": "Fechar", "Applied": "Aplicado", "Apply": "Aplicar",
    "Go Live — no setup": "Ao vivo — sem configuração",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Inicie instantaneamente uma nova reunião num separador do navegador (usa a sessão que já tem iniciada) e depois partilhe o ecrã do Vantage. Sem chaves, sem OAuth.",
    "New Google Meet": "Novo Google Meet", "New Zoom meeting": "Nova reunião Zoom",
    "Join": "Entrar", "copy link": "copiar ligação", "end": "terminar",
    "paste your meeting link to pin it as LIVE…": "cole a ligação da sua reunião para a fixar como AO VIVO…",
    "Pin": "Fixar",
    "Or, for meetings created & tracked inside Vantage (with join links here), connect your own OAuth apps below — see MEETINGS_SETUP.md. This is the part that needs .env credentials.": "Ou, para reuniões criadas e geridas dentro do Vantage (com ligações de acesso aqui), ligue as suas próprias apps OAuth abaixo — consulte MEETINGS_SETUP.md. Esta é a parte que precisa de credenciais .env.",
    "Backend not reachable. Start it in the project folder:": "Backend inacessível. Inicie-o na pasta do projeto:",
    "retry": "tentar novamente", "create app": "criar app",
    "connected": "ligado", "not connected": "não ligado", "not configured (.env)": "não configurado (.env)",
    "Sign in to connect": "Inicie sessão para ligar", "Connect": "Ligar",
    "creating…": "a criar…", "New meeting": "Nova reunião", "disconnect": "desligar",
    "RECENT MEETINGS": "REUNIÕES RECENTES",
    // START tab
    "AI desk": "Mesa de IA", "ready": "pronto", "add key ↑": "adicionar chave ↑", "Voice": "Voz", "browser": "navegador",
    "Live quotes": "Cotações ao vivo", "live": "ao vivo", "demo": "demo", "Real videos": "Vídeos reais",
    "on": "ligado", "optional": "opcional", "Streaming": "Streaming", "Calendar": "Calendário", "built-in": "integrado", "Meetings": "Reuniões",
    "You're already set up.": "Já está tudo pronto.",
    "Vantage runs right now in demo mode — no keys needed. The one thing worth adding is an AI key so the desk can actually answer you:": "O Vantage funciona agora mesmo em modo demo — sem chaves. A única coisa que vale a pena adicionar é uma chave de IA para que a mesa possa responder-lhe:",
    "AI DESK IS ON": "A MESA DE IA ESTÁ ATIVA", "TURN ON THE AI DESK — paste one key": "ATIVE A MESA DE IA — cole uma chave",
    "One key unlocks the whole desk — OpenRouter gives you dozens of models (GPT, Llama, more) behind a single key, and it's the primary model.": "Uma só chave desbloqueia toda a mesa — o OpenRouter dá-lhe dezenas de modelos (GPT, Llama e mais) por trás de uma única chave, e é o modelo principal.",
    "get a key": "obter uma chave",
    "No AI key? The desk still can't answer, but everything else — charts, news, games, streaming, calendar — works without it.": "Sem chave de IA? A mesa ainda não pode responder, mas tudo o resto — gráficos, notícias, jogos, streaming, calendário — funciona sem ela.",
    "WHAT'S SET UP": "O QUE ESTÁ CONFIGURADO", "tap to configure": "toque para configurar",
    "tour · demo · missions": "visita · demo · missões", "pick your anchor": "escolha o seu apresentador",
    "skip — I'll explore on my own": "ignorar — vou explorar sozinho",
    // DATA tab
    "PANELS": "PAINÉIS", "ticker tape": "fita de cotações", "watchlist": "lista de acompanhamento", "top movers": "maiores variações", "news & video": "notícias e vídeo", "calendar": "calendário", "portfolio": "carteira",
    "breaking-news alerts during live trading": "alertas de última hora durante a negociação ao vivo",
    "CLOCK TIMEZONE": "FUSO HORÁRIO DO RELÓGIO",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Define o relógio do cabeçalho. O crachá de mercado ABERTO/FECHADO segue sempre o horário da NYSE (hora do Leste).",
    "replay tutorial": "repetir tutorial", "DEMO": "DEMO", "LIVE": "AO VIVO",
    "Demo mode runs a seeded random-walk market engine — a reproducible simulated session, no key or network needed.": "O modo demo usa um motor de mercado de passeio aleatório com semente — uma sessão simulada reproduzível, sem chave nem rede.",
    "FINNHUB API KEY (free tier works)": "CHAVE API FINNHUB (o plano gratuito funciona)", "paste key": "cole a chave",
    "Key is saved on this device and sent only to finnhub.io.": "A chave é guardada neste dispositivo e enviada apenas para finnhub.io.",
    "get a free key": "obter uma chave gratuita",
    "YOUTUBE DATA API KEY": "CHAVE API YOUTUBE DATA", "(optional — real, playable video results)": "(opcional — resultados de vídeo reais e reproduzíveis)",
    "paste key (AIza…)": "cole a chave (AIza…)", "needs": "requer",
    "Without a key, \"show videos of …\" asks Claude to guess videos (often unembeddable). With one, the desk pulls real embeddable results from YouTube.": "Sem uma chave, \"show videos of …\" pede ao Claude para adivinhar vídeos (muitas vezes não incorporáveis). Com uma, a mesa obtém resultados reais e incorporáveis do YouTube.",
    "enable API": "ativar API",
    "TMDB API KEY": "CHAVE API TMDB", "(optional — in-app Netflix / Disney+ / Hulu catalog + trailers)": "(opcional — catálogo Netflix / Disney+ / Hulu e trailers na app)",
    "paste TMDB API key (v3 auth)": "cole a chave API TMDB (auth v3)",
    "Powers \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — real libraries with posters, ratings & in-desk trailers. Playback still opens on the service (they block embedding); public-domain films play fully in-desk via \"free movies …\" (no key needed).": "Alimenta \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — bibliotecas reais com cartazes, classificações e trailers na mesa. A reprodução abre sempre no serviço (bloqueiam a incorporação); os filmes de domínio público reproduzem-se por completo na mesa via \"free movies …\" (sem chave).",
    "DAILY BRIEF": "RESUMO DIÁRIO", "(auto-download while the app is open)": "(descarga automática enquanto a app está aberta)",
    "at": "às", "off": "desativar", "run now": "executar agora",
    "Each day at {time}, the desk writes an analyst report on {sym} and downloads a {fmt} brief automatically. Requires this tab to be open (browsers can't run it closed) and an Anthropic key for the write-up.": "Todos os dias às {time}, a mesa redige um relatório de analista sobre {sym} e descarrega automaticamente um resumo em {fmt}. Requer que este separador esteja aberto (os navegadores não o executam fechado) e uma chave Anthropic para a redação.",
    "Set a time to auto-generate and download a branded report each day. Leave blank to disable.": "Defina uma hora para gerar e descarregar automaticamente um relatório com a sua marca todos os dias. Deixe em branco para desativar.",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "As respostas da mesa de IA requerem {plan}. Os modelos abaixo estão desativados até fazer o upgrade (ou ativar o modo programador em CONTA).",
    "{n} models enabled": "{n} modelos ativados", "One model at a time": "Um modelo de cada vez",
    "Use \"only this\" for a single model, or enable several — the desk answers in one box, trying them top-to-bottom and falling back to the next if one errors (e.g. Claude → OpenRouter).": "Use \"only this\" para um único modelo, ou ative vários — a mesa responde numa só caixa, testando-os de cima para baixo e recorrendo ao seguinte se um falhar (por ex. Claude → OpenRouter).",
    "Auto-fallback to a local model.": "Recorrer automaticamente a um modelo local.",
    "If Claude fails (no credits, bad key, offline), the desk and reports retry on your local model (Ollama or LM Studio) automatically. Configure one below — set its BASE URL and start the local server.": "Se o Claude falhar (sem créditos, chave errada, offline), a mesa e os relatórios tentam novamente com o seu modelo local (Ollama ou LM Studio) automaticamente. Configure um abaixo — defina a BASE URL e inicie o servidor local.",
    "ACTIVE": "ATIVO", "use only this": "usar apenas este", "BASE URL": "BASE URL", "MODEL": "MODELO",
    "format:": "formato:", "e.g.": "por ex.", "browse models": "explorar modelos",
    "Proton Lumo has no official hosted API yet — run a local OpenAI-compatible bridge and point BASE URL at it.": "O Proton Lumo ainda não tem uma API alojada oficial — execute uma ponte local compatível com OpenAI e aponte a BASE URL para ela.", "Lumo bridge": "ponte Lumo",
    "API KEY": "CHAVE API",
    "Local endpoints need CORS enabled to accept requests from this page:": "Os endpoints locais precisam de CORS ativado para aceitar pedidos desta página:",
    "start with": "inicie com", "or": "ou", "Developer tab → enable server + turn on CORS": "separador Developer → ative o servidor + ative CORS",
    "The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).": "A ranhura do LM Studio funciona com qualquer coisa que fale o formato de chat da OpenAI (llama.cpp, vLLM…).",
    "ANCHOR": "APRESENTADOR", "ENVIRONMENT": "AMBIENTE", "BACKGROUND CREW": "EQUIPA DE FUNDO",
    "Auto — whoever isn't anchoring": "Auto — quem não estiver a apresentar", "Off — solo broadcast": "Desligado — transmissão a solo",
    "VOICE ENGINE": "MOTOR DE VOZ", "BROWSER · free": "NAVEGADOR · grátis",
    "ELEVENLABS API KEY": "CHAVE API DA ELEVENLABS", "get a key ↗": "obter uma chave ↗",
    "Held in memory only, sent only to api.elevenlabs.io. Uses eleven_flash_v2_5 for low latency — each read costs quota characters.": "Guardada apenas em memória, enviada só para api.elevenlabs.io. Usa eleven_flash_v2_5 para baixa latência — cada leitura consome caracteres da tua quota.",
    "ELEVENLABS VOICE": "VOZ DA ELEVENLABS", "Paste a key and hit Apply — voices load automatically.": "Cola uma chave e clica em Aplicar — as vozes carregam automaticamente.",
    "READING SPEED": "VELOCIDADE DE LEITURA", "auto-read the first answer that finishes": "ler automaticamente a primeira resposta que terminar",
    "UI click sounds — terminal blips on every button": "sons de clique da interface — bips de terminal em cada botão", "SOUND VOLUME": "VOLUME DO SOM",
    "ambient music": "música ambiente", "your Spotify playlist, docked bottom-right": "a tua playlist do Spotify, ancorada em baixo à direita",
    "generative synth, ducks under the anchor's voice": "sintetizador generativo, baixa sob a voz do apresentador", "MUSIC SOURCE": "FONTE DE MÚSICA",
    "SPOTIFY PLAYLIST / ALBUM / TRACK LINK": "LIGAÇÃO DE PLAYLIST / ÁLBUM / FAIXA DO SPOTIFY",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Sem necessidade de iniciar sessão — ativa ♪ e o leitor ancora em baixo à direita. (O leitor incorporado do Spotify reproduz pré-visualizações de 30 segundos sem conta; as faixas completas tocam automaticamente se já tiveres sessão iniciada no Spotify neste navegador.)",
    "Paste a Spotify share link — open Spotify → any playlist/album/track → Share → Copy link.": "Cola uma ligação de partilha do Spotify — abre o Spotify → qualquer playlist/álbum/faixa → Partilhar → Copiar ligação.",
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
    "Developer mode (testing).": "Modo de programador (teste).",
    "Unlocks every premium feature regardless of plan — AI desk, live data, YouTube, TMDB, Spotify and the ElevenLabs voice. You still need each feature's own API key to actually use it. Not for production.": "Desbloqueia todas as funcionalidades premium independentemente do plano — mesa de IA, dados em direto, YouTube, TMDB, Spotify e a voz da ElevenLabs. Continuas a precisar da chave API de cada funcionalidade para a usar. Não é para produção.",
    "also toggles with ?dev=1 in the URL": "também alterna com ?dev=1 no URL", "DEV MODE ON — all plan gates bypassed": "MODO DEV LIGADO — todas as restrições de plano ignoradas",
  },
  it: {
    "Export": "Esporta", "More": "Altro", "Settings": "Impostazioni", "sign in": "accedi",
    "Games": "Giochi", "learn how stocks work": "scopri come funzionano le azioni",
    "Ambient sound": "Suono ambientale", "waves, jungle, space hum…": "onde, giungla, ronzio spaziale…",
    "Music": "Musica", "background score": "musica di sottofondo",
    "one model on the desk": "un modello alla scrivania",
    "Type a symbol and press Enter  ·  HELP for commands": "Digita un simbolo e premi Invio  ·  HELP per i comandi",
    "OPEN": "APERTO", "CLOSED": "CHIUSO",
    "standing by": "in attesa",
    "voice & anchor settings": "impostazioni voce e conduttore", "SET": "SET", "stop reading": "ferma lettura", "free": "gratis",
    "Ask a question below — answers appear here, and the anchor can read any of them on air.": "Fai una domanda qui sotto — le risposte appaiono qui, e il conduttore può leggerle in diretta.",
    "ASK ALL": "CHIEDI A TUTTI",
    "WATCHLIST": "LISTA DI OSSERVAZIONE", "TOP MOVERS": "MAGGIORI VARIAZIONI", "full chart": "grafico completo",
    "Language": "Lingua",
    "The AI broadcast desk for the markets.": "La postazione di trasmissione IA per i mercati.",
    "Create account": "Crea account", "Log in": "Accedi", "Explore in demo mode →": "Esplora in modalità demo →",
    "ranked by |Δ%| across your watchlist": "ordinato per |Δ%| nella tua lista di osservazione",
    'Ask about {sym}, "take me to Robinhood", or "download excel" / "make a powerpoint" / "write a report and export ppt"': 'Chiedi di {sym}, "take me to Robinhood", oppure "download excel" / "make a powerpoint" / "write a report and export ppt"',
    "ACCOUNT": "ACCOUNT", "START": "INIZIO", "DATA": "DATI", "VOICE": "VOCE", "MEET": "RIUNIONE",
    "exit": "esci", "skip tour": "salta il tour", "Back": "Indietro", "Next": "Avanti", "Done": "Fatto",
    "Command bar": "Barra dei comandi",
    "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.": "Digita qui un simbolo qualsiasi e premi Invio per rappresentarlo nel grafico. “ADD TSLA” e “DEL TSLA” gestiscono la tua lista di osservazione. Funzionano anche i nomi delle aziende.",
    "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it.": "Questa è la tua barra dei comandi. Digita un simbolo come Apple o Nvidia e premi Invio per rappresentarlo nel grafico.",
    "Your anchor — that's me": "Il tuo conduttore — sono io",
    "I run a live trading day: opening bell, meals, breaks. I read any answer on air. Swap my character, environment, and sounds in settings.": "Conduco una giornata di borsa in diretta: campanella di apertura, pasti, pause. Leggo qualsiasi risposta in diretta. Cambia il mio personaggio, l'ambiente e i suoni nelle impostazioni.",
    "That's me, your anchor. I run a live trading day and I can read anything on air.": "Sono io, il tuo conduttore. Conduco una giornata di borsa in diretta e posso leggere qualsiasi cosa in diretta.",
    "The AI desk": "La postazione IA",
    "Ask a question here and I answer in one box, cascading across your models. I also take commands — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.": "Fai una domanda qui e rispondo in un unico riquadro, a cascata sui tuoi modelli. Accetto anche comandi — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.",
    "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix.": "Chiedimi qualsiasi cosa qui. Capisco anche comandi semplici, come, take me to Robinhood, oppure, what's on Netflix.",
    "Answers, news & Watch": "Risposte, notizie e Guarda",
    "Everything lands here in one box — desk answers, the navigator, news, and the streaming catalog. Trailers and public-domain films play right inside.": "Tutto arriva qui in un unico riquadro — risposte della postazione, il navigatore, notizie e il catalogo di streaming. Trailer e film di pubblico dominio si riproducono proprio qui.",
    "Answers, news, and the streaming catalog all appear here, in one place.": "Le risposte, le notizie e il catalogo di streaming appaiono tutti qui, in un unico posto.",
    "Ticker tape": "Nastro delle quotazioni",
    "Your whole watchlist scrolls across the top with live-style movement.": "L'intera lista di osservazione scorre in alto con un movimento in tempo reale.",
    "Your watchlist scrolls across the ticker tape, up top.": "La tua lista di osservazione scorre sul nastro delle quotazioni, in alto.",
    "Why setup? (mostly optional)": "Perché configurare? (quasi tutto opzionale)",
    "Vantage runs fully in DEMO with zero setup. The one thing worth adding is an AI key — the desk's answers come from external models (OpenRouter, Claude…) billed to your own account, so they need your key. Everything else is optional: charts, calendar, games and news need nothing. Open Start to paste that one key.": "Vantage funziona completamente in DEMO senza configurazione. L'unica cosa che vale la pena aggiungere è una chiave IA — le risposte della postazione provengono da modelli esterni (OpenRouter, Claude…) addebitati sul tuo account, quindi serve la tua chiave. Tutto il resto è opzionale: grafici, calendario, giochi e notizie non richiedono nulla. Apri Inizio per incollare quella chiave.",
    "Here's why setup exists. Vantage works in demo with zero setup. The one key worth adding is for the A.I. — my answers come from external models that bill to your own account, so they need your key. Everything else is optional. Open Start to paste that one key. That's the tour!": "Ecco perché esiste la configurazione. Vantage funziona in demo senza configurazione. L'unica chiave che vale la pena aggiungere è quella dell'IA — le mie risposte provengono da modelli esterni addebitati sul tuo account, quindi serve la tua chiave. Tutto il resto è opzionale. Apri Inizio per incollare quella chiave. E questo era il tour!",
    // settings footer + MEET tab
    "Close": "Chiudi", "Applied": "Applicato", "Apply": "Applica",
    "Go Live — no setup": "Vai in diretta — nessuna configurazione",
    "Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.": "Avvia all'istante una nuova riunione in una scheda del browser (usa la sessione con cui hai già effettuato l'accesso), poi condividi lo schermo di Vantage. Nessuna chiave, nessun OAuth.",
    "New Google Meet": "Nuovo Google Meet", "New Zoom meeting": "Nuova riunione Zoom",
    "Join": "Partecipa", "copy link": "copia link", "end": "termina",
    "paste your meeting link to pin it as LIVE…": "incolla il link della tua riunione per fissarlo come IN DIRETTA…",
    "Pin": "Fissa",
    "Or, for meetings created & tracked inside Vantage (with join links here), connect your own OAuth apps below — see MEETINGS_SETUP.md. This is the part that needs .env credentials.": "Oppure, per riunioni create e gestite dentro Vantage (con i link di partecipazione qui), collega le tue app OAuth qui sotto — vedi MEETINGS_SETUP.md. Questa è la parte che richiede le credenziali .env.",
    "Backend not reachable. Start it in the project folder:": "Backend non raggiungibile. Avvialo nella cartella del progetto:",
    "retry": "riprova", "create app": "crea app",
    "connected": "connesso", "not connected": "non connesso", "not configured (.env)": "non configurato (.env)",
    "Sign in to connect": "Accedi per collegare", "Connect": "Collega",
    "creating…": "creazione…", "New meeting": "Nuova riunione", "disconnect": "disconnetti",
    "RECENT MEETINGS": "RIUNIONI RECENTI",
    // START tab
    "AI desk": "Postazione IA", "ready": "pronto", "add key ↑": "aggiungi chiave ↑", "Voice": "Voce", "browser": "browser",
    "Live quotes": "Quotazioni in diretta", "live": "in diretta", "demo": "demo", "Real videos": "Video reali",
    "on": "attivo", "optional": "opzionale", "Streaming": "Streaming", "Calendar": "Calendario", "built-in": "integrato", "Meetings": "Riunioni",
    "You're already set up.": "Sei già pronto.",
    "Vantage runs right now in demo mode — no keys needed. The one thing worth adding is an AI key so the desk can actually answer you:": "Vantage funziona già adesso in modalità demo — nessuna chiave necessaria. L'unica cosa che vale la pena aggiungere è una chiave IA perché la postazione possa risponderti davvero:",
    "AI DESK IS ON": "LA POSTAZIONE IA È ATTIVA", "TURN ON THE AI DESK — paste one key": "ATTIVA LA POSTAZIONE IA — incolla una chiave",
    "One key unlocks the whole desk — OpenRouter gives you dozens of models (GPT, Llama, more) behind a single key, and it's the primary model.": "Una sola chiave sblocca l'intera postazione — OpenRouter ti offre decine di modelli (GPT, Llama e altri) dietro un'unica chiave, ed è il modello principale.",
    "get a key": "ottieni una chiave",
    "No AI key? The desk still can't answer, but everything else — charts, news, games, streaming, calendar — works without it.": "Nessuna chiave IA? La postazione non può ancora rispondere, ma tutto il resto — grafici, notizie, giochi, streaming, calendario — funziona senza.",
    "WHAT'S SET UP": "COSA È CONFIGURATO", "tap to configure": "tocca per configurare",
    "tour · demo · missions": "tour · demo · missioni", "pick your anchor": "scegli il tuo conduttore",
    "skip — I'll explore on my own": "salta — esplorerò da solo",
    // DATA tab
    "PANELS": "PANNELLI", "ticker tape": "nastro delle quotazioni", "watchlist": "lista di osservazione", "top movers": "maggiori variazioni", "news & video": "notizie e video", "calendar": "calendario", "portfolio": "portafoglio",
    "breaking-news alerts during live trading": "avvisi dell'ultima ora durante la contrattazione in diretta",
    "CLOCK TIMEZONE": "FUSO ORARIO DELL'OROLOGIO",
    "Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.": "Imposta l'orologio dell'intestazione. Il badge di mercato APERTO/CHIUSO segue sempre gli orari del NYSE (ora orientale).",
    "replay tutorial": "rivedi il tutorial", "DEMO": "DEMO", "LIVE": "IN DIRETTA",
    "Demo mode runs a seeded random-walk market engine — a reproducible simulated session, no key or network needed.": "La modalità demo usa un motore di mercato a passeggiata casuale con seme — una sessione simulata riproducibile, senza chiave né rete.",
    "FINNHUB API KEY (free tier works)": "CHIAVE API FINNHUB (il piano gratuito funziona)", "paste key": "incolla la chiave",
    "Key is saved on this device and sent only to finnhub.io.": "La chiave viene salvata su questo dispositivo e inviata solo a finnhub.io.",
    "get a free key": "ottieni una chiave gratuita",
    "YOUTUBE DATA API KEY": "CHIAVE API YOUTUBE DATA", "(optional — real, playable video results)": "(opzionale — risultati video reali e riproducibili)",
    "paste key (AIza…)": "incolla la chiave (AIza…)", "needs": "richiede",
    "Without a key, \"show videos of …\" asks Claude to guess videos (often unembeddable). With one, the desk pulls real embeddable results from YouTube.": "Senza chiave, \"show videos of …\" chiede a Claude di indovinare i video (spesso non incorporabili). Con una, la postazione ottiene risultati reali e incorporabili da YouTube.",
    "enable API": "abilita API",
    "TMDB API KEY": "CHIAVE API TMDB", "(optional — in-app Netflix / Disney+ / Hulu catalog + trailers)": "(opzionale — catalogo Netflix / Disney+ / Hulu e trailer nell'app)",
    "paste TMDB API key (v3 auth)": "incolla la chiave API TMDB (auth v3)",
    "Powers \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — real libraries with posters, ratings & in-desk trailers. Playback still opens on the service (they block embedding); public-domain films play fully in-desk via \"free movies …\" (no key needed).": "Alimenta \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — librerie reali con locandine, valutazioni e trailer nella postazione. La riproduzione si apre sempre sul servizio (bloccano l'incorporazione); i film di pubblico dominio si riproducono per intero nella postazione tramite \"free movies …\" (nessuna chiave).",
    "DAILY BRIEF": "BRIEFING GIORNALIERO", "(auto-download while the app is open)": "(download automatico mentre l'app è aperta)",
    "at": "alle", "off": "disattiva", "run now": "esegui ora",
    "Each day at {time}, the desk writes an analyst report on {sym} and downloads a {fmt} brief automatically. Requires this tab to be open (browsers can't run it closed) and an Anthropic key for the write-up.": "Ogni giorno alle {time}, la postazione redige un rapporto d'analisi su {sym} e scarica automaticamente un brief in {fmt}. Richiede che questa scheda resti aperta (i browser non possono eseguirlo da chiusa) e una chiave Anthropic per la stesura.",
    "Set a time to auto-generate and download a branded report each day. Leave blank to disable.": "Imposta un orario per generare e scaricare automaticamente ogni giorno un rapporto con il tuo marchio. Lascia vuoto per disattivare.",
    // AI tab
    "AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).": "Le risposte della postazione IA richiedono {plan}. I modelli qui sotto sono disattivati finché non esegui l'upgrade (o attivi la modalità sviluppatore in ACCOUNT).",
    "{n} models enabled": "{n} modelli attivati", "One model at a time": "Un modello alla volta",
    "Use \"only this\" for a single model, or enable several — the desk answers in one box, trying them top-to-bottom and falling back to the next if one errors (e.g. Claude → OpenRouter).": "Usa \"only this\" per un singolo modello, oppure attivane diversi — la postazione risponde in un unico riquadro, provandoli dall'alto in basso e passando al successivo se uno fallisce (es. Claude → OpenRouter).",
    "Auto-fallback to a local model.": "Ripiego automatico su un modello locale.",
    "If Claude fails (no credits, bad key, offline), the desk and reports retry on your local model (Ollama or LM Studio) automatically. Configure one below — set its BASE URL and start the local server.": "Se Claude fallisce (niente crediti, chiave errata, offline), la postazione e i rapporti riprovano automaticamente sul tuo modello locale (Ollama o LM Studio). Configurane uno qui sotto — imposta la sua BASE URL e avvia il server locale.",
    "ACTIVE": "ATTIVO", "use only this": "usa solo questo", "BASE URL": "BASE URL", "MODEL": "MODELLO",
    "format:": "formato:", "e.g.": "es.", "browse models": "sfoglia i modelli",
    "Proton Lumo has no official hosted API yet — run a local OpenAI-compatible bridge and point BASE URL at it.": "Proton Lumo non ha ancora un'API ospitata ufficiale — esegui un bridge locale compatibile con OpenAI e punta la BASE URL su di esso.", "Lumo bridge": "bridge Lumo",
    "API KEY": "CHIAVE API",
    "Local endpoints need CORS enabled to accept requests from this page:": "Gli endpoint locali necessitano di CORS abilitato per accettare richieste da questa pagina:",
    "start with": "avvia con", "or": "o", "Developer tab → enable server + turn on CORS": "scheda Developer → abilita il server + attiva CORS",
    "The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).": "Lo slot LM Studio funziona con qualsiasi cosa parli il formato chat di OpenAI (llama.cpp, vLLM…).",
    "ANCHOR": "CONDUTTORE", "ENVIRONMENT": "AMBIENTE", "BACKGROUND CREW": "TROUPE DI SOTTOFONDO",
    "Auto — whoever isn't anchoring": "Auto — chi non sta conducendo", "Off — solo broadcast": "Off — trasmissione in solitaria",
    "VOICE ENGINE": "MOTORE VOCALE", "BROWSER · free": "BROWSER · gratis",
    "ELEVENLABS API KEY": "CHIAVE API ELEVENLABS", "get a key ↗": "ottieni una chiave ↗",
    "Held in memory only, sent only to api.elevenlabs.io. Uses eleven_flash_v2_5 for low latency — each read costs quota characters.": "Conservata solo in memoria, inviata solo a api.elevenlabs.io. Usa eleven_flash_v2_5 per bassa latenza — ogni lettura consuma caratteri della tua quota.",
    "ELEVENLABS VOICE": "VOCE ELEVENLABS", "Paste a key and hit Apply — voices load automatically.": "Incolla una chiave e premi Applica — le voci si caricano automaticamente.",
    "READING SPEED": "VELOCITÀ DI LETTURA", "auto-read the first answer that finishes": "leggi automaticamente la prima risposta completata",
    "UI click sounds — terminal blips on every button": "suoni di clic dell'interfaccia — bip da terminale su ogni pulsante", "SOUND VOLUME": "VOLUME AUDIO",
    "ambient music": "musica d'ambiente", "your Spotify playlist, docked bottom-right": "la tua playlist Spotify, ancorata in basso a destra",
    "generative synth, ducks under the anchor's voice": "synth generativo, si abbassa sotto la voce del conduttore", "MUSIC SOURCE": "SORGENTE MUSICALE",
    "SPOTIFY PLAYLIST / ALBUM / TRACK LINK": "LINK PLAYLIST / ALBUM / BRANO SPOTIFY",
    "No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)": "Nessun accesso necessario — attiva ♪ e il player si ancora in basso a destra. (L'embed di Spotify riproduce anteprime di 30 secondi senza account; i brani completi partono automaticamente se hai già effettuato l'accesso a Spotify in questo browser.)",
    "Paste a Spotify share link — open Spotify → any playlist/album/track → Share → Copy link.": "Incolla un link di condivisione Spotify — apri Spotify → qualsiasi playlist/album/brano → Condividi → Copia link.",
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
    "Developer mode (testing).": "Modalità sviluppatore (test).",
    "Unlocks every premium feature regardless of plan — AI desk, live data, YouTube, TMDB, Spotify and the ElevenLabs voice. You still need each feature's own API key to actually use it. Not for production.": "Sblocca ogni funzione premium indipendentemente dal piano — desk IA, dati in tempo reale, YouTube, TMDB, Spotify e la voce ElevenLabs. Serve comunque la chiave API di ciascuna funzione per usarla davvero. Non per la produzione.",
    "also toggles with ?dev=1 in the URL": "si attiva anche con ?dev=1 nell'URL", "DEV MODE ON — all plan gates bypassed": "MODALITÀ DEV ATTIVA — tutti i blocchi di piano ignorati",
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
  ctx.strokeStyle = C.amber; ctx.lineWidth = 2; rr(2, 2, W - 4, H - 4, 16); ctx.stroke();
  ctx.fillStyle = C.amber; ctx.font = "bold 36px Arial, sans-serif"; ctx.fillText("VANTAGE", 24, 54);
  [[C.up, 22], [C.down, 34], [C.up, 15], [C.up, 28]].forEach((b, i) => { ctx.fillStyle = b[0]; ctx.fillRect(206 + i * 14, 52 - b[1], 9, b[1]); });
  ctx.fillStyle = C.muted; ctx.font = "12px monospace"; ctx.fillText("MARKET INTELLIGENCE", 26, 80);
  _logoCache = cvs.toDataURL("image/png");
  return _logoCache;
}

// ---------- demo market engine ----------
const UNIVERSE = [
  { sym: "AAPL", name: "Apple Inc.", base: 228.4, vol: 0.012 },
  { sym: "MSFT", name: "Microsoft Corp.", base: 452.1, vol: 0.010 },
  { sym: "NVDA", name: "NVIDIA Corp.", base: 131.8, vol: 0.024 },
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
const dirColor = (n) => (n > 0 ? C.up : n < 0 ? C.down : C.muted);

// ---------- Finnhub (live mode) ----------
async function fetchQuote(sym, key) {
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`);
  if (!r.ok) {
    const e = new Error(
      r.status === 429 ? "HTTP 429 — Finnhub rate limit (free tier is ~60 calls/min; add your own key in settings → DATA)"
      : (r.status === 401 || r.status === 403) ? `HTTP ${r.status} — invalid Finnhub key`
      : `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  const q = await r.json();
  if (q.c === 0 && q.pc === 0) throw new Error("Unknown symbol");
  return q; // {c,d,dp,h,l,o,pc,t}
}
// Resolve a typed company NAME to its ticker via Finnhub's symbol search (e.g. "coca cola" → "KO").
// Prefers a clean US common-stock symbol (skips foreign ".XX" listings). Returns null on miss/no key.
async function finnhubSearch(query, key) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${key}`);
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
const TOUR_STEPS = [
  { target: "tour-symbol", title: "Command bar", body: "Type any ticker here and press Enter to chart it. “ADD TSLA” and “DEL TSLA” manage your watchlist. Company names work too.", say: "This is your command bar. Type a ticker like Apple or Nvidia and press enter to chart it." },
  { target: "tour-anchor", title: "Your anchor — that's me", body: "I run a live trading day: opening bell, meals, breaks. I read any answer on air. Swap my character, environment, and sounds in settings.", say: "That's me, your anchor. I run a live trading day and I can read anything on air." },
  { target: "tour-ask", title: "The AI desk", body: "Ask a question here and I answer in one box, cascading across your models. I also take commands — “take me to Robinhood”, “what's on netflix”, “write a report and export ppt”.", say: "Ask me anything here. I understand plain commands too, like, take me to Robinhood, or, what's on Netflix." },
  { target: "tour-response", title: "Answers, news & Watch", body: "Everything lands here in one box — desk answers, the navigator, news, and the streaming catalog. Trailers and public-domain films play right inside.", say: "Answers, news, and the streaming catalog all appear here, in one place." },
  { target: "tour-ticker", title: "Ticker tape", body: "Your whole watchlist scrolls across the top with live-style movement.", say: "Your watchlist scrolls across the ticker tape, up top." },
  { target: "tour-settings", title: "Why setup? (mostly optional)", body: "Vantage runs fully in DEMO with zero setup. The one thing worth adding is an AI key — the desk's answers come from external models (OpenRouter, Claude…) billed to your own account, so they need your key. Everything else is optional: charts, calendar, games and news need nothing. Open Start to paste that one key.", say: "Here's why setup exists. Vantage works in demo with zero setup. The one key worth adding is for the A.I. — my answers come from external models that bill to your own account, so they need your key. Everything else is optional. Open Start to paste that one key. That's the tour!" },
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

// Setup guide shown in onboarding — what each key does, if it's required, and where to get it.
const SETUP_STEPS = [
  { icon: "🤖", name: "AI desk answers", need: "needed for answers", req: true, what: "The anchor's answers come from an external AI model that bills to your own account — so it needs your key. Without one, everything else still works; the desk just can't answer.", how: "Paste a free OpenRouter key in Settings → START. One key covers dozens of models.", url: "https://openrouter.ai/keys", link: "get OpenRouter key ↗" },
  { icon: "📈", name: "Live market prices", need: "optional", what: "Swaps the demo random-walk market for real-time quotes.", how: "Settings → DATA → switch to LIVE, paste a free Finnhub key.", url: "https://finnhub.io/register", link: "get Finnhub key ↗" },
  { icon: "🎬", name: "Streaming catalog", need: "optional", what: "Adds real Netflix / Disney+ / Hulu libraries and in-desk trailers.", how: "Settings → DATA → TMDB API key.", url: "https://www.themoviedb.org/settings/api", link: "get free TMDB key ↗" },
  { icon: "📰", name: "Real video results", need: "optional", what: "Pulls actual embeddable YouTube clips instead of AI guesses.", how: "Settings → DATA → YouTube Data API key.", url: "https://console.cloud.google.com/apis/credentials", link: "get YouTube key ↗" },
  { icon: "🎙️", name: "Studio voice", need: "optional", what: "The browser voice works instantly; ElevenLabs sounds broadcast-grade.", how: "Settings → VOICE → ElevenLabs key.", url: "https://elevenlabs.io/app/settings/api-keys", link: "get ElevenLabs key ↗" },
  { icon: "📹", name: "Real meetings", need: "optional", what: "Create real Zoom / Google Meet links from the desk.", how: "Needs the local backend + your own OAuth app — full steps in MEETINGS_SETUP.md.", url: null, link: null },
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

// ---- Bull vs Bear chess: standard legal piece moves, pass-and-play (no engine, no checkmate) ----
const CHESS_GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
function chessInit() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) { b[0][c] = { s: "b", t: back[c] }; b[1][c] = { s: "b", t: "p" }; b[6][c] = { s: "w", t: "p" }; b[7][c] = { s: "w", t: back[c] }; }
  return b;
}
// pseudo-legal moves for the piece at (r,c) — enough for a casual pass-and-play game (no check/castling/en-passant)
function chessMoves(board, r, c) {
  const p = board[r][c]; if (!p) return [];
  const out = [], inB = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
  const own = (x, y) => inB(x, y) && board[x][y] && board[x][y].s === p.s;
  const enemy = (x, y) => inB(x, y) && board[x][y] && board[x][y].s !== p.s;
  const empty = (x, y) => inB(x, y) && !board[x][y];
  const ray = (dirs) => { for (const [dx, dy] of dirs) { let x = r + dx, y = c + dy; while (empty(x, y)) { out.push({ r: x, c: y }); x += dx; y += dy; } if (enemy(x, y)) out.push({ r: x, c: y }); } };
  if (p.t === "p") {
    const dir = p.s === "w" ? -1 : 1, start = p.s === "w" ? 6 : 1;
    if (empty(r + dir, c)) { out.push({ r: r + dir, c }); if (r === start && empty(r + 2 * dir, c)) out.push({ r: r + 2 * dir, c }); }
    for (const dc of [-1, 1]) if (enemy(r + dir, c + dc)) out.push({ r: r + dir, c: c + dc });
  } else if (p.t === "n") {
    for (const [dx, dy] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]]) { const x = r + dx, y = c + dy; if (inB(x, y) && !own(x, y)) out.push({ r: x, c: y }); }
  } else if (p.t === "b") ray([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
  else if (p.t === "r") ray([[-1, 0], [1, 0], [0, -1], [0, 1]]);
  else if (p.t === "q") ray([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
  else if (p.t === "k") { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; const x = r + dx, y = c + dy; if (inB(x, y) && !own(x, y)) out.push({ r: x, c: y }); } }
  return out;
}

const CHESS_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };
// simple greedy AI: take the most valuable capture available, otherwise a random legal move
function chessAIMove(board, side) {
  const moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.s === side) for (const t of chessMoves(board, r, c)) {
      const tgt = board[t.r][t.c];
      moves.push({ from: { r, c }, to: t, val: tgt ? CHESS_VAL[tgt.t] : 0 });
    }
  }
  if (!moves.length) return null;
  const best = Math.max(...moves.map(m => m.val));
  const pool = moves.filter(m => m.val === best);
  return pool[Math.floor(Math.random() * pool.length)];
}
// return a NEW board with the piece moved from→to (immutable; assumes the move was already validated)
function chessApply(bd, from, to) {
  const next = bd.map(row => row.slice());
  const moving = next[from.r][from.c];
  const taken = next[to.r][to.c];
  next[to.r][to.c] = moving; next[from.r][from.c] = null;
  if (moving.t === "p" && (to.r === 0 || to.r === 7)) next[to.r][to.c] = { s: moving.s, t: "q" }; // auto-queen
  return { next, taken };
}

// ---- Chess game component: pass-and-play, vs AI or 2-player ----
function ChessGame({ onCheer, onWin }) {
  const [vsAI, setVsAI] = useState(true);        // default: play the computer (Bears) — good for a lone player
  const [board, setBoard] = useState(chessInit);
  const [turn, setTurn] = useState("w");         // 'w' = Bulls (green, the human) move first
  const [sel, setSel] = useState(null);
  const [targets, setTargets] = useState([]);
  const [winner, setWinner] = useState(null);
  const [captured, setCaptured] = useState({ w: [], b: [] });

  const reset = (ai = vsAI) => { setVsAI(ai); setBoard(chessInit()); setTurn("w"); setSel(null); setTargets([]); setWinner(null); setCaptured({ w: [], b: [] }); };

  // commit a move (from either the human or the AI) and pass the turn / detect a king capture
  const commit = (next, taken, side) => {
    setBoard(next);
    if (taken) {
      setCaptured(cap => ({ ...cap, [side]: [...cap[side], taken.t] }));
      if (!(vsAI && side === "b")) onCheer?.();            // cheer for the player's captures, not the computer's
      if (taken.t === "k") { setWinner(side); onWin?.(side); return; }
    }
    setTurn(side === "w" ? "b" : "w");
  };

  // the computer's turn (plays Bears/black) — fires shortly after the human moves
  useEffect(() => {
    if (!vsAI || winner || turn !== "b") return;
    const id = setTimeout(() => {
      const mv = chessAIMove(board, "b");
      if (!mv) { setWinner("w"); onWin?.("w"); return; }    // computer has no moves → player wins
      const { next, taken } = chessApply(board, mv.from, mv.to);
      commit(next, taken, "b");
    }, 550);
    return () => clearTimeout(id);
  }, [turn, vsAI, winner, board]); // eslint-disable-line react-hooks/exhaustive-deps

  // click a square: if it's a legal target, move the selected piece; otherwise select/deselect
  const clickSquare = (r, c) => {
    if (winner || (vsAI && turn === "b")) return;          // ignore clicks while the computer is thinking
    const piece = board[r][c];
    if (sel && targets.some(t => t.r === r && t.c === c)) {
      const { next, taken } = chessApply(board, sel, { r, c });
      setSel(null); setTargets([]);
      commit(next, taken, turn);
      return;
    }
    if (piece && piece.s === turn) { setSel({ r, c }); setTargets(chessMoves(board, r, c)); }
    else { setSel(null); setTargets([]); }
  };


  // ---- Render the chessboard, controls, and status ----
  const status = winner
    ? (vsAI ? (winner === "w" ? "🎉 You win!" : "💀 You lose") : (winner === "w" ? "🐂 Bulls win!" : "🐻 Bears win!"))
    : (vsAI && turn === "b" ? "🐻 Computer thinking…" : `${turn === "w" ? "🐂 Bulls" : "🐻 Bears"} to move`);
  const capLabel = (arr) => arr.map(t => CHESS_GLYPH[t]).join(" ");
  const modeBtn = (ai, label) => (
    <button onClick={() => reset(ai)}
      style={{ background: vsAI === ai ? "rgba(255,179,0,0.16)" : "transparent", border: `1px solid ${vsAI === ai ? C.amber : C.panelEdge}`, color: vsAI === ai ? C.amber : C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "4px 9px", cursor: "pointer" }}>{label}</button>
  );
  return (
    <div style={{ padding: 12, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "flex", gap: 5 }}>{modeBtn(true, "vs Computer")}{modeBtn(false, "2 Player")}</span>
        <button onClick={() => reset()} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "5px 12px", cursor: "pointer" }}>new game ↻</button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, textAlign: "center", color: winner ? (winner === "w" ? C.up : C.down) : turn === "w" ? C.up : C.down }}>{status}</div>
      <div style={{ width: "100%", maxWidth: 320, aspectRatio: "1 / 1", display: "grid", gridTemplateColumns: "repeat(8, 1fr)", border: `1px solid ${C.panelEdge}`, alignSelf: "center", opacity: (vsAI && turn === "b" && !winner) ? 0.75 : 1 }}>
        {board.map((row, r) => row.map((p, c) => {
          const light = (r + c) % 2 === 0;
          const isSel = sel && sel.r === r && sel.c === c;
          const isTarget = targets.some(t => t.r === r && t.c === c);
          return (
            <button key={`${r}-${c}`} onClick={() => clickSquare(r, c)}
              style={{
                position: "relative", border: "none", cursor: winner ? "default" : "pointer", padding: 0,
                background: isSel ? "rgba(255,179,0,0.5)" : light ? "#2A3346" : "#1A2233",
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
              }}>
              {p && <span style={{ fontSize: 22, color: p.s === "w" ? "#3FE08A" : "#FF6B7A", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{CHESS_GLYPH[p.t]}</span>}
              {isTarget && <span style={{ position: "absolute", width: p ? "82%" : 12, height: p ? "82%" : 12, borderRadius: p ? 6 : "50%", boxSizing: "border-box", border: p ? `2px solid ${C.amber}` : "none", background: p ? "transparent" : "rgba(255,179,0,0.55)" }} />}
            </button>
          );
        }))}
      </div>
      <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
        {vsAI ? "You are 🐂 Bulls (green). Capture the Bears' king to win — lose yours and it's over." : "Two players, one screen: 🐂 Bulls vs 🐻 Bears. Capture the enemy king to win."} Pawns auto-promote to queens. (Casual rules — no check/castling.)
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
        ctx.fillStyle = "rgba(255,179,0,0.05)";
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
        ctx.fillStyle = "rgba(255,179,0,0.10)"; ctx.fillRect(10, 14, logoW + 12, 15);
        ctx.fillStyle = C.amber; ctx.textBaseline = "middle"; ctx.fillText("VANTAGE", 16, 22); ctx.textBaseline = "alphabetic";
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
            ctx.fillStyle = lit ? "rgba(47,211,122,0.30)" : "rgba(246,70,93,0.30)";
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
        ctx.fillStyle = (reduced || Math.sin(t / 500) > 0) ? "rgba(246,70,93,0.8)" : "rgba(246,70,93,0.15)";
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
            ctx.fillStyle = led > 0.3 ? "rgba(47,211,122,0.8)" : led < -0.5 ? "rgba(255,179,0,0.7)" : "rgba(74,82,102,0.5)";
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
        ctx.fillStyle = on ? "rgba(246,70,93,0.9)" : "rgba(246,70,93,0.25)"; ctx.fillRect(58, 10, 74, 16);
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
      glow.addColorStop(0, "rgba(255,179,0,0.08)");
      glow.addColorStop(1, "rgba(255,179,0,0)");
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
          // boom mic angled up to the mouth
          ctx.strokeStyle = "#20262F"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(cx - 42, hy + 42); ctx.lineTo(cx - 16, hy + 22); ctx.stroke();
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
          // adventurer's tan fedora
          const tan = "#8A6A3E", tanD = "#5E4626";
          ctx.fillStyle = tanD; ctx.beginPath(); ctx.ellipse(cx, hy - 12, 44, 11, 0, 0, Math.PI * 2); ctx.fill(); // brim
          ctx.fillStyle = tan; ctx.beginPath(); ctx.moveTo(cx - 26, hy - 12); ctx.quadraticCurveTo(cx - 24, hy - 40, cx, hy - 42); ctx.quadraticCurveTo(cx + 24, hy - 40, cx + 26, hy - 12); ctx.closePath(); ctx.fill(); // crown
          ctx.strokeStyle = tanD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, hy - 40); ctx.lineTo(cx, hy - 22); ctx.stroke(); // dent
          ctx.fillStyle = "#3A2A18"; ctx.fillRect(cx - 26, hy - 18, 52, 5); // band
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
          // wide-brim western hat with a pinched crown + star pin
          const tan = "#9A7B4A", tanD = "#6B5230";
          ctx.fillStyle = tanD; ctx.beginPath(); ctx.moveTo(cx - 50, hy - 10); ctx.quadraticCurveTo(cx, hy - 2, cx + 50, hy - 10); ctx.quadraticCurveTo(cx, hy - 20, cx - 50, hy - 10); ctx.closePath(); ctx.fill(); // brim
          ctx.fillStyle = tan; ctx.beginPath(); ctx.moveTo(cx - 22, hy - 12); ctx.quadraticCurveTo(cx - 20, hy - 44, cx, hy - 44); ctx.quadraticCurveTo(cx + 20, hy - 44, cx + 22, hy - 12); ctx.closePath(); ctx.fill(); // crown
          ctx.strokeStyle = tanD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 9, hy - 42); ctx.lineTo(cx - 8, hy - 22); ctx.moveTo(cx + 9, hy - 42); ctx.lineTo(cx + 8, hy - 22); ctx.stroke(); // side pinches
          ctx.fillStyle = "#3A2A18"; ctx.fillRect(cx - 22, hy - 18, 44, 5); // band
          ctx.fillStyle = "#C9A24B"; ctx.beginPath(); ctx.arc(cx, hy - 15, 2, 0, Math.PI * 2); ctx.fill(); // star pin
        } else if (ch.hat === "noir") {
          // rakishly tilted detective fedora + brim shadow across the eyes
          ctx.save(); ctx.translate(cx, hy - 6); ctx.rotate(-0.14);
          const dk = "#26262A", dkD = "#141416";
          ctx.fillStyle = dkD; ctx.beginPath(); ctx.ellipse(0, -8, 44, 10, 0, 0, Math.PI * 2); ctx.fill(); // brim
          ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(-24, -8); ctx.quadraticCurveTo(-22, -38, 0, -40); ctx.quadraticCurveTo(22, -38, 24, -8); ctx.closePath(); ctx.fill(); // crown
          ctx.strokeStyle = dkD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, -20); ctx.stroke(); // dent
          ctx.fillStyle = "#0C0C0E"; ctx.fillRect(-24, -14, 48, 5); // band
          ctx.restore();
          ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.beginPath(); ctx.ellipse(cx, eyeY, 22, 8, 0, 0, Math.PI * 2); ctx.fill(); // brim shadow
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
      <div style={{ fontFamily: MONO, fontSize: 10, color: talking ? C.amber : C.faint, letterSpacing: "0.1em", textAlign: "center", minHeight: 14 }}>
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
      style={{ position: "absolute", ...pos, zIndex: 2, background: "rgba(0,0,0,0.78)", color: "#fff", fontFamily: MONO, fontSize: 10, padding: "3px 8px", borderRadius: 4, textDecoration: "none" }}>
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
  const card = (c, key, hidden) => (
    <div key={key} style={{ width: 34, height: 48, borderRadius: 5, border: `1px solid ${hidden ? C.amber : "#C7CEDB"}`, flexShrink: 0,
      background: hidden ? "#1A2233" : "#EDEFF4", color: hidden ? C.amber : (c.s === "♥" || c.s === "♦" ? "#C0392B" : "#141821"),
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700 }}>
      {hidden ? <span style={{ fontSize: 18 }}>★</span> : <><span style={{ fontSize: 12 }}>{c.r}</span><span style={{ fontSize: 14 }}>{c.s}</span></>}
    </div>
  );
  const btn = (label, on, kind = "primary") => (
    <button onClick={on} style={kind === "primary"
      ? { background: C.amber, color: "#141414", border: "none", borderRadius: 4, fontFamily: MONO, fontWeight: 700, fontSize: 12, padding: "9px 18px", cursor: "pointer" }
      : { background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 12, padding: "9px 14px", cursor: "pointer" }}>{label}</button>
  );
  const resultCol = result ? (result.kind === "win" ? C.up : result.kind === "lose" ? C.down : C.amber) : C.muted;
  const broke = bankroll < 10;
  return (
    <div style={{ padding: 14, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
        <span style={{ color: C.text }}>💰 Bankroll: <b style={{ color: C.amber }}>${bankroll}</b></span>
        <span style={{ color: C.muted }}>bet ${bet}</span>
      </div>

      {/* dealer */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.faint, marginBottom: 4 }}>DEALER {phase !== "bet" && !hideHole ? `· ${bjValue(dealer)}` : ""}</div>
        <div style={{ display: "flex", gap: 6, minHeight: 48 }}>
          {dealer.map((c, i) => card(c, `d${i}`, hideHole && i === 1))}
        </div>
      </div>
      {/* player */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.faint, marginBottom: 4 }}>YOU {player.length ? `· ${bjValue(player)}` : ""}</div>
        <div style={{ display: "flex", gap: 6, minHeight: 48 }}>
          {player.map((c, i) => card(c, `p${i}`, false))}
        </div>
      </div>

      {result && <div style={{ fontSize: 13, fontWeight: 700, color: resultCol }}>{result.text}</div>}

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

      <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
        Get closer to 21 than the dealer without going over. Face cards = 10, Ace = 1 or 11. Dealer draws to 17. Blackjack pays 3:2.
      </div>
    </div>
  );
}

// ============================================================
// Algorithm Wars — a real-time trading-floor auto-battler. You don't trade; you deploy & re-script
// automated bots (RTS units) and flip your army's AI logic (stance) live to counter the enemy AI.
// Self-contained (canvas + rAF); sim state lives in a ref so the loop never restarts on render.
const AW_W = 560, AW_H = 300;
const AW_BOTS = {
  day:    { name: "Day-Trader",  cost: 14, hp: 24, dmg: 6,  range: 26, speed: 48, rate: 0.55, r: 7,  color: "#2FD37A", blurb: "fast, cheap, fragile — swarm and rush" },
  index:  { name: "Index-Fund",  cost: 28, hp: 92, dmg: 4,  range: 22, speed: 22, rate: 0.9,  r: 11, color: "#4DA3FF", blurb: "tanky, slow — soaks damage, holds the line" },
  sniper: { name: "Sniper",      cost: 24, hp: 12, dmg: 22, range: 96, speed: 32, rate: 1.5,  r: 6,  color: "#C9A24B", blurb: "long range, high burst — melts tanks, dies fast" },
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
  ctx.fillStyle = "#0B0E14"; ctx.fillRect(0, 0, AW_W, AW_H);
  ctx.strokeStyle = "#141B27"; ctx.lineWidth = 1;
  for (let x = 0; x <= AW_W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, AW_H); ctx.stroke(); }
  for (let y = 0; y <= AW_H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(AW_W, y); ctx.stroke(); }
  ctx.strokeStyle = "#1D2433"; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(AW_W / 2, 0); ctx.lineTo(AW_W / 2, AW_H); ctx.stroke(); ctx.setLineDash([]);
  const base = (x, color, hp) => {
    ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fillRect(x - 10, AW_H / 2 - 42, 20, 84); ctx.globalAlpha = 1;
    ctx.fillStyle = "#0009"; ctx.fillRect(x - 15, AW_H / 2 - 56, 30, 5);
    ctx.fillStyle = color; ctx.fillRect(x - 15, AW_H / 2 - 56, 30 * Math.max(0, hp) / 200, 5);
  };
  base(sim.you.baseX, "#2FD37A", sim.you.baseHp);
  base(sim.cpu.baseX, "#F6465D", sim.cpu.baseHp);
  for (const tr of sim.tracers) { ctx.strokeStyle = `rgba(201,162,75,${Math.max(0, tr.life / 0.12) * 0.8})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke(); }
  for (const u of sim.units) {
    const b = AW_BOTS[u.type];
    ctx.beginPath(); ctx.arc(u.x, u.y, b.r, 0, Math.PI * 2); ctx.fillStyle = b.color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = u.side === "you" ? "#EAFBF1" : "#2A0E12"; ctx.stroke();
    ctx.fillStyle = "#000A"; ctx.fillRect(u.x - b.r, u.y - b.r - 5, b.r * 2, 3);
    ctx.fillStyle = u.side === "you" ? "#2FD37A" : "#F6465D"; ctx.fillRect(u.x - b.r, u.y - b.r - 5, b.r * 2 * Math.max(0, u.hp) / u.maxHp, 3);
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
  const btn = { fontFamily: MONO, fontSize: 11, borderRadius: 5, padding: "8px 10px", cursor: "pointer" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* HUD */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 11, flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: "#2FD37A" }}>▮ YOU · server {hud.youBase}/200 · {hud.youN} bots</span>
        <span style={{ color: C.amber }}>⚡ capital {cap}</span>
        <span style={{ color: "#F6465D" }}>ENEMY · server {hud.cpuBase}/200 · {hud.cpuN} bots · {hud.cpuStance} ▮</span>
      </div>
      {/* battlefield */}
      <div style={{ position: "relative", width: "100%", maxWidth: AW_W, alignSelf: "center" }}>
        <canvas ref={canvasRef} width={AW_W} height={AW_H} style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, border: `1px solid ${C.panelEdge}` }} />
        {over && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,13,0.82)", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: over === "you" ? C.up : C.down }}>
              {over === "you" ? "🏆 MARKET DOMINATED" : "💥 ALGORITHMS CRUSHED"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{over === "you" ? "Your bots took the enemy server." : "The enemy overran your server."}</div>
            <button onClick={reset} style={{ ...btn, background: C.amber, border: "none", color: "#141414", fontWeight: 700, padding: "9px 18px" }}>Rematch ↻</button>
          </div>
        )}
      </div>
      {/* deploy bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(AW_BOTS).map(([id, b]) => {
          const afford = cap >= b.cost;
          return (
            <button key={id} onClick={() => deploy(id)} disabled={!afford || !!over} title={b.blurb}
              style={{ ...btn, flex: 1, minWidth: 120, textAlign: "left", background: afford ? "#111827" : "#0D121C", border: `1px solid ${afford ? b.color : C.panelEdge}`, color: afford ? C.text : C.faint, opacity: over ? 0.5 : 1 }}>
              <div style={{ fontWeight: 700, color: afford ? b.color : C.faint }}>{b.name} <span style={{ color: C.amber, fontWeight: 400 }}>⚡{b.cost}</span></div>
              <div style={{ fontSize: 9, color: C.faint, marginTop: 2, lineHeight: 1.4 }}>{b.blurb}</div>
            </button>
          );
        })}
      </div>
      {/* stance = live AI re-scripting */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: C.faint, marginBottom: 5 }}>YOUR ARMY LOGIC — flip it live to counter the enemy</div>
        <div style={{ display: "flex", gap: 6 }}>
          {AW_STANCES.map(s => (
            <button key={s.id} onClick={() => setStance(s.id)} title={s.hint}
              style={{ ...btn, flex: 1, background: stance === s.id ? "rgba(255,179,0,0.16)" : "transparent", border: `1px solid ${stance === s.id ? C.amber : C.panelEdge}`, color: stance === s.id ? C.amber : C.muted, fontWeight: 600 }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
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
  const pretty = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }); };
  const navBtn = { background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 12, padding: "2px 9px", cursor: "pointer" };

  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => shift(-1)} aria-label="Previous month" style={navBtn}>‹</button>
        <button onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSel(todayKey); }} title="Jump to today"
          style={{ background: "transparent", border: "none", color: C.text, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>{CAL_MON[ym.m]} {ym.y}</button>
        <button onClick={() => shift(1)} aria-label="Next month" style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 2 }}>
        {CAL_DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: MONO, fontSize: 8, color: C.faint }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const key = calKey(ym.y, ym.m, d);
          const isToday = key === todayKey, isSel = key === sel;
          const hasUser = userDays.has(key), hasMkt = mktDays.has(key);
          return (
            <button key={i} onClick={() => setSel(key)} style={{
              aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
              background: isSel ? "rgba(255,179,0,0.18)" : "transparent",
              border: `1px solid ${isToday ? C.amber : "transparent"}`, borderRadius: 4, cursor: "pointer",
              fontFamily: MONO, fontSize: 10, color: isSel ? C.amber : C.text, padding: 0,
            }}>
              {d}
              {(hasUser || hasMkt) && (
                <span style={{ position: "absolute", bottom: 3, display: "flex", gap: 2 }}>
                  {hasUser && <span style={{ width: 4, height: 4, borderRadius: "50%", background: isSel ? C.amber : C.up }} />}
                  {hasMkt && <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.amber }} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, borderTop: `1px solid ${C.panelEdge}`, paddingTop: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", color: C.faint, marginBottom: 6 }}>{pretty(sel)}{sel === todayKey ? " · today" : ""}</div>
        {dayEvents.length === 0 && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginBottom: 4 }}>No events yet.</div>}
        {dayEvents.map((e, i) => (
          <div key={e.id || `m${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.amber, minWidth: 56 }}>{e.time ? to12h(e.time) : (e.kind === "market" ? "📊" : "—")}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: e.kind === "market" ? C.amber : C.text, flex: 1, lineHeight: 1.3 }}>{e.title}</span>
            {e.kind === "user"
              ? <button onClick={() => del(e.id)} aria-label="Delete event" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 11 }}>✕</button>
              : <span title="Market event" style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>mkt</span>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <input value={time} onChange={e => setTime(e.target.value)} type="time" aria-label="Event time"
            style={{ width: 92, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 10, padding: "5px 4px" }} />
          <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="add event…" aria-label="Event title"
            style={{ flex: 1, minWidth: 0, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "5px 6px" }} />
          <button onClick={add} aria-label="Add event" style={{ background: C.amber, border: "none", color: "#141414", borderRadius: 4, fontFamily: MONO, fontSize: 14, fontWeight: 700, padding: "0 11px", cursor: "pointer" }}>+</button>
        </div>
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
  "Any API keys you enter (Finnhub, OpenRouter, TMDB, etc.) are stored only in your own browser's localStorage and are sent only to those providers' APIs — never to us.",
  "This build may include a simulated subscription flow. Unless a real Stripe checkout is explicitly presented, no payment is taken and any paid plan is unlocked for demonstration only.",
  "The software is provided “as is”, without warranty of any kind. Use it at your own risk.",
];
const LEGAL_PRIVACY = [
  "Your account (email, display name, chosen plan, and agreement timestamp) is stored locally in your browser. If you run the optional backend, it is also stored there in a gitignored file.",
  "Passwords are never stored in plain text — they are salted and hashed before storage.",
  "We do not sell your data or embed third-party trackers. External requests go only to the market/AI/media APIs whose keys you provide.",
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
//  AuthScreen — the sign-in / sign-up / plan / legal gate (Layer 1 client flow,
//  automatically upgraded to the backend when it is reachable). Self-contained: its
//  own hooks keep new state out of the giant MarketDashboard component. Calls
//  onAuthed(account) when the user is in, or onGuest() to explore the demo unwalled.
// ============================================================
function AuthScreen({ onAuthed, onGuest }) {
  const { t } = useI18n();
  const [step, setStep] = useState("welcome");     // welcome | login | signup | plan | legal
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
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
    fetch("/api/auth/providers").then(r => r.ok ? r.json() : {}).then(j => ok && setSocialProviders(j || {})).catch(() => {});
    return () => { ok = false; };
  }, [useBackend]);
  // "Continue with …" buttons. Social sign-in is a full-page redirect to the provider and back.
  // Only rendered for configured providers; Proton has no third-party SSO, so it's a plain-email note.
  const socialBlock = (socialProviders.google || socialProviders.yahoo) ? (
    <div style={{ display: "grid", gap: 8 }}>
      {socialProviders.google && (
        <button style={{ ...primaryBtn(), background: "#fff", color: "#1a1a1a", border: "1px solid #dadce0" }}
          onClick={() => { window.location.href = "/api/auth/oauth/google/login"; }}>Continue with Google</button>
      )}
      {socialProviders.yahoo && (
        <button style={{ ...primaryBtn(), background: "#5f01d1", color: "#fff" }}
          onClick={() => { window.location.href = "/api/auth/oauth/yahoo/login"; }}>Continue with Yahoo</button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0" }}>
        <div style={{ flex: 1, height: 1, background: C.panelEdge }} /><span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>or</span><div style={{ flex: 1, height: 1, background: C.panelEdge }} />
      </div>
    </div>
  ) : null;

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  // ---- LOG IN ----
  async function doLogin() {
    setErr(""); setBusy(true);
    try {
      if (useBackend) {
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Login failed");
        onAuthed({ email: j.email, name: j.name, plan: j.plan, token: j.token, backend: true });
        return;
      }
      const users = loadUsers();
      const rec = users[email.trim().toLowerCase()];
      if (!rec) throw new Error("No account found for that email — try signing up.");
      const { hashHex } = await hashPassword(password, rec.saltHex);
      if (hashHex !== rec.hashHex) throw new Error("Incorrect password.");
      onAuthed({ email: rec.email, name: rec.name, plan: rec.plan, backend: false });
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }

  // ---- CREATE ACCOUNT (after plan + legal) ----
  async function doSignup() {
    setErr(""); setBusy(true);
    try {
      const em = email.trim().toLowerCase();
      if (useBackend) {
        const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: em, name: name.trim(), password, plan, legalVersion: LEGAL_VERSION }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Sign-up failed");
        onAuthed({ email: j.email, name: j.name, plan: j.plan, token: j.token, backend: true });
        return;
      }
      const users = loadUsers();
      if (users[em]) throw new Error("An account with that email already exists — log in instead.");
      const { saltHex, hashHex } = await hashPassword(password);
      const rec = { email: em, name: name.trim() || em.split("@")[0], saltHex, hashHex, plan, agreedAt: Date.now(), legalVersion: LEGAL_VERSION };
      users[em] = rec; saveUsers(users);
      onAuthed({ email: rec.email, name: rec.name, plan: rec.plan, backend: false });
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }

  // shared field styling
  const field = { width: "100%", boxSizing: "border-box", padding: "11px 12px", background: "#0B0E14", border: `1px solid ${C.panelEdge}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 13, outline: "none" };
  const primaryBtn = (extra = {}) => ({ width: "100%", padding: "12px", background: C.amber, color: "#0B0E14", border: "none", borderRadius: 8, fontFamily: SANS, fontWeight: 700, fontSize: 14, cursor: "pointer", ...extra });
  const ghostBtn = { background: "transparent", border: "none", color: C.amber, fontFamily: MONO, fontSize: 12, cursor: "pointer", textDecoration: "underline" };
  const errBox = err ? <div style={{ background: "rgba(255,90,90,0.12)", border: "1px solid rgba(255,90,90,0.4)", color: "#ff8a8a", borderRadius: 8, padding: "9px 11px", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5 }}>{err}</div> : null;

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(1200px 600px at 50% -10%, #16324a55, transparent), ${C.bg}`, color: C.text, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Archivo:wght@500;600;800&display=swap');`}</style>
      <div style={{ width: step === "plan" ? 860 : 420, maxWidth: "96vw", background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>

        {/* header / brand */}
        <div style={{ padding: "22px 26px 14px", borderBottom: `1px solid ${C.panelEdge}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 7, background: C.amber, color: "#0B0E14", display: "grid", placeItems: "center", fontWeight: 800, fontFamily: SANS }}>V</span>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, letterSpacing: 0.3 }}>VANTAGE</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{useBackend ? "secured by server" : "runs on this device"}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 26px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ---------- WELCOME ---------- */}
          {step === "welcome" && (<>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20 }}>{t("The AI broadcast desk for the markets.")}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>Create an account to save your watchlist, portfolio and plan — or jump straight into the live demo, no sign-up required.</div>
            {socialBlock}
            <button style={primaryBtn()} onClick={() => { setErr(""); setStep("signup"); }}>{t("Create account")}</button>
            <button style={{ ...primaryBtn(), background: "transparent", color: C.text, border: `1px solid ${C.panelEdge}` }} onClick={() => { setErr(""); setStep("login"); }}>{t("Log in")}</button>
            <button style={{ ...ghostBtn, marginTop: 2, alignSelf: "center" }} onClick={onGuest}>{t("Explore in demo mode →")}</button>
          </>)}

          {/* ---------- LOG IN ---------- */}
          {step === "login" && (<>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18 }}>Welcome back</div>
            {errBox}
            {socialBlock}
            <input style={field} type="email" placeholder="Email" value={email} autoComplete="username" onChange={e => setEmail(e.target.value)} />
            <input style={field} type="password" placeholder="Password" value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && emailOk && password && doLogin()} />
            <button style={primaryBtn({ opacity: busy || !emailOk || !password ? 0.6 : 1 })} disabled={busy || !emailOk || !password} onClick={doLogin}>{busy ? "Signing in…" : "Log in"}</button>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.faint }}>
              <button style={ghostBtn} onClick={() => { setErr(""); setStep("signup"); }}>Create account</button>
              <button style={ghostBtn} onClick={onGuest}>Skip → demo</button>
            </div>
          </>)}

          {/* ---------- SIGN UP (credentials) ---------- */}
          {step === "signup" && (<>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18 }}>Create your account</div>
            {errBox}
            {socialBlock}
            <input style={field} placeholder="Display name (optional)" value={name} onChange={e => setName(e.target.value)} />
            <input style={field} type="email" placeholder="Email" value={email} autoComplete="username" onChange={e => setEmail(e.target.value)} />
            <input style={field} type="password" placeholder="Password (min 6 characters)" value={password} autoComplete="new-password" onChange={e => setPassword(e.target.value)} />
            <button style={primaryBtn({ opacity: !emailOk || password.length < 6 ? 0.6 : 1 })} disabled={!emailOk || password.length < 6} onClick={() => { setErr(""); setStep("plan"); }}>Continue → choose a plan</button>
            {socialProviders.google && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, textAlign: "center", lineHeight: 1.5 }}>Proton has no "sign in with Proton" — just sign up with your Proton email above.</div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.faint }}>
              <button style={ghostBtn} onClick={() => { setErr(""); setStep("login"); }}>I already have an account</button>
              <button style={ghostBtn} onClick={onGuest}>Skip → demo</button>
            </div>
          </>)}

          {/* ---------- PLAN PICKER ---------- */}
          {step === "plan" && (<>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20, textAlign: "center" }}>Choose your plan</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, textAlign: "center", marginTop: -6 }}>You can change or cancel anytime. Paid plans are simulated in this build unless a real checkout appears.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 4 }}>
              {PLANS.map(p => {
                const on = plan === p.id;
                return (
                  <button key={p.id} onClick={() => setPlan(p.id)} style={{ textAlign: "left", cursor: "pointer", background: on ? "#0B0E14" : "transparent", border: `2px solid ${on ? C.amber : C.panelEdge}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
                    {p.featured && <span style={{ position: "absolute", top: -10, right: 12, background: C.amber, color: "#0B0E14", fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>POPULAR</span>}
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15 }}>{p.label}</div>
                    <div style={{ fontFamily: SANS }}><span style={{ fontSize: 24, fontWeight: 800 }}>{p.price}</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}> {p.cadence}</span></div>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>{p.tagline}</div>
                    <div style={{ height: 1, background: C.panelEdge, margin: "2px 0" }} />
                    {p.perks.map((k, i) => <div key={i} style={{ fontFamily: MONO, fontSize: 10.5, color: C.text, display: "flex", gap: 6, lineHeight: 1.5 }}><span style={{ color: C.up }}>✓</span>{k}</div>)}
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
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18 }}>Before you start</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["terms", "privacy"].map(t => (
                <button key={t} onClick={() => setLegalTab(t)} style={{ flex: 1, padding: "7px 0", background: legalTab === t ? C.panelEdge : "transparent", border: `1px solid ${C.panelEdge}`, borderRadius: 7, color: legalTab === t ? C.text : C.faint, fontFamily: MONO, fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>{t === "terms" ? "Terms" : "Privacy"}</button>
              ))}
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", background: "#0B0E14", border: `1px solid ${C.panelEdge}`, borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {(legalTab === "terms" ? LEGAL_TERMS : LEGAL_PRIVACY).map((line, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 11, color: C.muted, lineHeight: 1.6, display: "flex", gap: 8 }}><span style={{ color: C.faint }}>{i + 1}.</span>{line}</div>
              ))}
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 2 }}>Version {LEGAL_VERSION}</div>
            </div>
            {errBox}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", fontFamily: MONO, fontSize: 11.5, color: C.text, lineHeight: 1.5 }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: C.amber, flex: "0 0 auto" }} />
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

// ============================================================
function MarketDashboard({ account, onSignOut, onChangePlan } = {}) {
  const { lang, setLang, t } = useI18n();               // UI translation + AI-answer language
  const [accountMenu, setAccountMenu] = useState(false); // header account dropdown open?
  const [billingCfg, setBillingCfg] = useState(null);    // Stripe availability (Layer 3), probed on demand
  const [billingBusy, setBillingBusy] = useState("");    // plan id mid-checkout, for button state

  // ---- developer / testing mode: bypass ALL plan gates so every premium feature is testable now ----
  // Turn on via ?dev=1 in the URL, or the toggle in settings → ACCOUNT. Persisted per-browser.
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
      style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", color: C.amber, background: "rgba(255,179,0,0.10)", border: `1px solid ${C.amber}`, borderRadius: 3, padding: "1px 6px", cursor: "pointer", whiteSpace: "nowrap" }}>
      🔒 {planFor(feature)}
    </span>
  );

  // mode + Finnhub key persist across reloads, so choosing LIVE once sticks (no re-toggling in settings)
  const FINNHUB_DEFAULT = "d99u7s9r01qh9urlps6gd99u7s9r01qh9urlps70";
  const loadFinnhubKey = () => { try { return window.localStorage.getItem("tape-finnhub-key") || FINNHUB_DEFAULT; } catch { return FINNHUB_DEFAULT; } };
  const [mode, setMode] = useState(() => { try { return window.localStorage.getItem("tape-mode") === "live" ? "live" : "demo"; } catch { return "demo"; } }); // 'demo' | 'live'
  const [apiKey, setApiKey] = useState(loadFinnhubKey);
  const [keyDraft, setKeyDraft] = useState(loadFinnhubKey);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("quick");
  const [justApplied, setJustApplied] = useState(false);
  const [watchlist, setWatchlist] = useState(UNIVERSE.slice(0, 8).map(u => u.sym));
  const [selected, setSelected] = useState("NVDA");
  const [cmd, setCmd] = useState("");
  const [cmdMsg, setCmdMsg] = useState("");
  const [demoMkt, setDemoMkt] = useState(() => buildDemoMarket());
  const [liveQuotes, setLiveQuotes] = useState({});   // sym -> quote
  const [liveTape, setLiveTape] = useState({});       // sym -> [{t, price}]
  const [liveErr, setLiveErr] = useState("");
  const [liveBad, setLiveBad] = useState({});         // sym -> true when Finnhub doesn't recognize it
  const tickRef = useRef(null);
  // remember the DEMO/LIVE choice and the Finnhub key so the app reopens where you left it
  useEffect(() => { try { window.localStorage.setItem("tape-mode", mode); } catch { /* storage blocked */ } }, [mode]);
  useEffect(() => { try { if (apiKey) window.localStorage.setItem("tape-finnhub-key", apiKey); else window.localStorage.removeItem("tape-finnhub-key"); } catch { /* storage blocked */ } }, [apiKey]);

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
    { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", apiKey: "", needsKey: true, enabled: true },
    { id: "claude", label: "Claude", kind: "claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5", apiKey: "", needsKey: true, enabled: false },
    { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "", needsKey: true, enabled: false },
    { id: "gemini", label: "Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash", apiKey: "", needsKey: true, enabled: false },
    { id: "ollama", label: "Ollama (local)", kind: "ollama", baseUrl: "http://localhost:11434", model: "llama3.1", enabled: false },
    { id: "lmstudio", label: "LM Studio (local)", kind: "openai", baseUrl: "http://localhost:1234/v1", model: "local-model", enabled: false },
    // Proton Lumo — privacy-first AI. No official hosted API yet, so this points at a local
    // OpenAI-compatible bridge (proton-cli / pyLumo); localhost baseUrl ⇒ treated as key-less like Ollama.
    { id: "proton", label: "Proton (Lumo)", kind: "openai", baseUrl: "http://localhost:8080/v1", model: "lumo", enabled: false },
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
  const [anthropicApiKey, setAnthropicApiKey] = useState(() =>
    (typeof window !== "undefined" && window.localStorage.getItem("tape-anthropic-key")) || "");
  useEffect(() => {
    if (anthropicApiKey) window.localStorage?.setItem?.("tape-anthropic-key", anthropicApiKey);
    else window.localStorage?.removeItem?.("tape-anthropic-key");
  }, [anthropicApiKey]);
  // when a cloud model (Claude) fails — no credits, bad key, offline — automatically retry on a local model
  const [fallbackLocal, setFallbackLocal] = useState(() =>
    (typeof window === "undefined") ? true : window.localStorage.getItem("tape-fallback-local") !== "off");
  useEffect(() => { window.localStorage?.setItem?.("tape-fallback-local", fallbackLocal ? "on" : "off"); }, [fallbackLocal]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponses, setAiResponses] = useState({}); // id -> {status:'idle'|'running'|'done'|'error', text, ms}
  const [lastAsked, setLastAsked] = useState("");

  const live = mode === "live" && apiKey && planAllows("finnhub"); // plan-gated: live data needs Pro Desk

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
  const pollLive = useCallback(async () => {
    if (!live) return;
    const syms = [...new Set([selected, ...watchlist])];
    for (const s of syms) {
      try {
        const q = await fetchQuote(s, apiKey);
        setLiveQuotes(p => ({ ...p, [s]: q }));
        setLiveTape(p => {
          const arr = [...(p[s] || [])];
          const now = new Date();
          arr.push({ t: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`, i: arr.length, price: q.c });
          return { ...p, [s]: arr.slice(-500) };
        });
        setLiveErr("");
        setLiveBad(p => { if (!p[s]) return p; const n = { ...p }; delete n[s]; return n; });
      } catch (e) {
        setLiveErr(`${s}: ${e.message}`);
        if (/unknown symbol/i.test(e.message)) {
          // Finnhub says it's not a real ticker → drop it from the watchlist and move off it if selected
          setLiveBad(p => (p[s] ? p : { ...p, [s]: true }));
          setWatchlist(w => w.filter(x => x !== s));
          setSelected(sel => (sel === s ? (watchlist.find(x => x !== s) || "SPY") : sel));
        }
        if (e.status === 429) { setLiveErr("live feed rate-limited (HTTP 429) — backing off. Use your own Finnhub key in settings → DATA for higher limits."); break; } // stop hammering this cycle
      }
      await new Promise(r => setTimeout(r, 1100)); // ~1 req/sec keeps the free tier under its limit
    }
  }, [live, apiKey, watchlist, selected]);

  useEffect(() => {
    if (!live) return;
    pollLive();
    const id = setInterval(pollLive, 15000);
    return () => clearInterval(id);
  }, [live, pollLive]);

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

  // ---- panel visibility ----
  const [panels, setPanels] = useState({ tape: true, watchlist: true, movers: true, news: true, calendar: true, portfolio: true });
  const togglePanel = (k) => setPanels(p => ({ ...p, [k]: !p[k] }));

  // ---- tutorial + onboarding system (hub → spotlight tour / auto-demo / missions) ----
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutStep, setTutStep] = useState(0);
  const [tourMode, setTourMode] = useState(null);   // null | "spotlight"
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState(null);   // {x,y,w,h} of the spotlighted element
  const [demoRunning, setDemoRunning] = useState(false);
  const demoAbortRef = useRef(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  // is at least one AI model usable right now? drives the tour/demo when nothing's set up yet
  const aiReady = () => planAllows("ai") && aiModels.some(m => m.enabled && ((m.kind === "ollama" || /localhost|127\.0\.0\.1/.test(m.baseUrl || "")) || (m.kind === "claude" ? !!anthropicApiKey.trim() : !!(m.apiKey || "").trim())));
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
  const getStoredElevenKey = () => {
    const envKey = import.meta?.env?.VITE_ELEVENLABS_KEY || "";
    if (typeof window === "undefined") return envKey;
    return window.localStorage.getItem("tape-eleven-key") || envKey;
  };
  const [elevenKey, setElevenKey] = useState(() => getStoredElevenKey());
  const [elevenKeyDraft, setElevenKeyDraft] = useState(() => getStoredElevenKey());
  const getStoredYouTubeKey = () => {
    const envKey = import.meta?.env?.VITE_YOUTUBE_KEY || "";
    if (typeof window === "undefined") return envKey;
    return window.localStorage.getItem("tape-youtube-key") || envKey;
  };
  const [youtubeKey, setYoutubeKey] = useState(() => getStoredYouTubeKey());
  const [youtubeKeyDraft, setYoutubeKeyDraft] = useState(() => getStoredYouTubeKey());
  // TMDB (free) — powers the in-app streaming catalog: Netflix/Disney+/Hulu libraries + trailers
  const [tmdbKey, setTmdbKey] = useState(() => (typeof window !== "undefined" && window.localStorage.getItem("tape-tmdb-key")) || "");
  useEffect(() => { if (tmdbKey) window.localStorage?.setItem?.("tape-tmdb-key", tmdbKey); else window.localStorage?.removeItem?.("tape-tmdb-key"); }, [tmdbKey]);
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

  const persistElevenKey = useCallback((value) => {
    const cleaned = value.trim();
    setElevenKey(cleaned);
    setElevenKeyDraft(cleaned);
    if (typeof window !== "undefined") {
      if (cleaned) window.localStorage.setItem("tape-eleven-key", cleaned);
      else window.localStorage.removeItem("tape-eleven-key");
    }
  }, []);

  useEffect(() => {
    if (elevenKey) {
      window.localStorage?.setItem?.("tape-eleven-key", elevenKey);
    } else {
      window.localStorage?.removeItem?.("tape-eleven-key");
    }
  }, [elevenKey]);

  useEffect(() => {
    if (youtubeKey) window.localStorage?.setItem?.("tape-youtube-key", youtubeKey);
    else window.localStorage?.removeItem?.("tape-youtube-key");
  }, [youtubeKey]);

  const loadElevenVoices = useCallback(async (key) => {
    if (!key) return;
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
      if (!r.ok) throw new Error(`HTTP ${r.status} — check the key`);
      const data = await r.json();
      const vs = (data.voices || []).map(v => ({ id: v.voice_id, name: v.name }));
      setElevenVoices(vs);
      setElevenVoiceId(prev => prev || vs[0]?.id || "");
      setElevenErr("");
    } catch (e) {
      setElevenErr(String(e.message || e));
      setElevenVoices([]);
    }
  }, []);

  // key tester: distinguishes "bad key" from "this environment blocks external APIs"
  const [keyTests, setKeyTests] = useState({});
  const testKey = useCallback(async (kind) => {
    setKeyTests(p => ({ ...p, [kind]: "testing…" }));
    const fail = (msg) => setKeyTests(p => ({ ...p, [kind]: msg }));
    const ok = () => setKeyTests(p => ({ ...p, [kind]: "✓ key works" }));
    try {
      let r;
      if (kind === "finnhub") {
        const k = (keyDraft || apiKey || "").trim();
        if (!k) return fail("no key entered");
        r = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(k)}`);
      } else if (kind === "eleven") {
        const k = (elevenKeyDraft || elevenKey || "").trim();
        if (!k) return fail("no key entered");
        r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": k } });
      } else if (kind === "youtube") {
        const k = (youtubeKeyDraft || youtubeKey || "").trim();
        if (!k) return fail("no key entered");
        r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=stocks&key=${encodeURIComponent(k)}`);
      } else if (kind === "claude") {
        const k = anthropicApiKey.trim();
        if (!k) return fail("no key entered");
        const base = (aiModels.find(x => x.id === "claude")?.baseUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");
        r = await fetch(`${base}/models`, {
          headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        });
      } else {
        const m = aiModels.find(x => x.id === kind);
        if (!m?.apiKey) return fail("no key entered");
        r = kind === "gemini"
          ? await fetch(`${m.baseUrl.replace(/\/$/, "")}/models?key=${encodeURIComponent(m.apiKey)}`)
          : await fetch(`${m.baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${m.apiKey}` } });
      }
      if (r.ok) return ok();
      fail(r.status === 401 || r.status === 403 ? `✗ key rejected (HTTP ${r.status})` : `✗ HTTP ${r.status}`);
    } catch {
      fail("✗ blocked — this preview can't reach external APIs; works when deployed (see tape-backend.js)");
    }
  }, [keyDraft, apiKey, elevenKeyDraft, elevenKey, youtubeKeyDraft, youtubeKey, anthropicApiKey, aiModels]);
  const TestBtn = ({ kind }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>
      <button onClick={() => testKey(kind)}
        style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "3px 10px", cursor: "pointer" }}>
        test key
      </button>
      {keyTests[kind] && (
        <span style={{ fontFamily: MONO, fontSize: 10, color: keyTests[kind].startsWith("✓") ? C.up : keyTests[kind] === "testing…" ? C.muted : C.down }}>
          {keyTests[kind]}
        </span>
      )}
    </span>
  );

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
    if (!elevenKey || !elevenVoiceId) { setCmdMsg("Add an ElevenLabs key and pick a voice in settings"); return; }
    try {
      setSpeakingId(id);
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}/stream?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
          body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
        }
      );
      if (!r.ok) throw new Error(`ElevenLabs HTTP ${r.status}${r.status === 401 ? " — bad key" : r.status === 429 ? " — quota/rate limit" : ""}`);
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
      setElevenErr(String(e.message || e));
      setCmdMsg(`Voice error: ${e.message}`);
      analyserRef.current = null;
      setSpeakingId(cur => (cur === id ? null : cur));
    }
  }, [elevenKey, elevenVoiceId, speechRate]);

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
  const [spotifyUri, setSpotifyUri] = useState(() =>
    (typeof window !== "undefined" && window.localStorage.getItem("tape-spotify-uri")) ||
    "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn"); // Lofi Beats — a calm default
  useEffect(() => { window.localStorage?.setItem?.("tape-music-source", musicSource); }, [musicSource]);
  useEffect(() => { window.localStorage?.setItem?.("tape-spotify-uri", spotifyUri); }, [spotifyUri]);

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
    } catch (e) { setSpotifyErr(String(e.message || e)); }
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
      } catch (e) { setSpotifyErr(String(e.message || e)); }
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
      } catch (e) { setSpotifyErr(String(e.message || e)); }
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
      if (env === "castle") every(5000, () => { if (Math.random() < 0.5) blip(220, 180, 0.5, 0.05, "sine"); });
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
      drone(58, 0.12); drone(61.5, 0.08); // dissonant low pad
      const wind = noise("lowpass", 400, 0.6, 0.3); lfo(wind.f, "frequency", 0.04, 130, 330); lfo(wind.g, "gain", 0.1, 0.1, 0.24);
      every(6500, () => { if (Math.random() < 0.5) blip(320, 120, 1.4, 0.06, "sine"); }); // distant howl / creak
    } else if (env === "western") {
      const wind = noise("lowpass", 550, 0.6, 0.32); lfo(wind.f, "frequency", 0.05, 120, 400); lfo(wind.g, "gain", 0.1, 0.1, 0.24); // desert wind
      every(5200, () => { if (Math.random() < 0.4) { blip(300, 300, 0.5, 0.05, "triangle"); setTimeout(() => blip(240, 200, 0.7, 0.05, "triangle"), 260); } }); // lonesome coyote / guitar
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

  const chartData = useMemo(() => {
    if (live) return liveTape[selected] || [];
    const st = demoMkt[selected];
    return st ? st.bars.slice(0, st.cursor + 1) : [];
  }, [live, liveTape, demoMkt, selected]);

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
    const validate = async (c) => { if (!(live && apiKey)) return true; try { await fetchQuote(c, apiKey); return true; } catch { return false; } };
    let cand = SYMBOL_ALIASES[upKey] || null;                    // 1. known company name / alias
    if (!cand && tickerish && t === upKey) cand = upKey;         // 2. ALL-CAPS 1-5 letters = a ticker
    if (cand && await validate(cand)) return cand;
    if (apiKey) { const hit = await finnhubSearch(t, apiKey); if (hit && await validate(hit)) return hit; } // 3. name search
    if (!live && tickerish) return upKey;                        // 4. demo: allow a synthesized ticker
    return null;                                                  // unrecognized → reject
  }, [live, apiKey]);

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
    setCmd(""); setCmdMsg(`Looking up “${query}”…`);
    const t = await resolveTyped(query);
    if (!t) { setCmdMsg(`“${query}” isn't a recognized symbol or company — not added.`); return; } // reject, no dead entry
    if (!live && !demoMkt[t]) ensureDemoSymbol(t);
    if (!watchlist.includes(t)) setWatchlist(w => [...w, t]);
    setSelected(t);
    setCmdMsg(isAdd ? `Added ${t} to watchlist` : (live ? "" : `${t} — synthesized demo session (switch to live in settings for real quotes)`));
    completeMission("chart");
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
  const openGames = useCallback(() => { setGameOn(true); setGameMode("menu"); stopSpeak(); setCmdMsg("🎮 Game room — pick a game, the anchor will host."); }, [stopSpeak]);
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
    speak("school", (correct ? "Correct! " : "Not quite. ") + explain);
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
  const [meetStatus, setMeetStatus] = useState(null);   // {zoom:{configured,connected}, google:{...}} or null if backend is down
  const [meetings, setMeetings] = useState([]);         // recently created meeting links
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
    } catch (e) { setCalErr(String(e.message || e)); setCalEvents(null); }
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
    const p = new URLSearchParams({ src: email, mode: "AGENDA", ctz: tz, showTitle: "0", showPrint: "0", showTabs: "0", showCalendars: "0", showTz: "0", bgcolor: "#0B0E14" });
    return `https://calendar.google.com/calendar/embed?${p.toString()}`;
  };
  const [meetBusy, setMeetBusy] = useState("");
  const [meetErr, setMeetErr] = useState("");
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
        setCmdMsg(`${title} can't run embedded (broker security) — opened in a new tab. Use “📈 chart in-app” to stay inside Vantage.`);
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
  const [breakingOn, setBreakingOn] = useState(() => (typeof window === "undefined" ? true : window.localStorage.getItem("tape-breaking") !== "off"));
  useEffect(() => { window.localStorage?.setItem?.("tape-breaking", breakingOn ? "on" : "off"); }, [breakingOn]);
  const [breakingAlert, setBreakingAlert] = useState(null); // { id, text, source }
  const breakingSeenRef = useRef(new Set());
  const breakingTimerRef = useRef(null);
  const pushBreaking = useCallback((text, source) => {
    const id = Date.now();
    setBreakingAlert({ id, text, source });
    playBreakingSfx();
    speak("breaking", `This just in. ${text}.`);
    clearTimeout(breakingTimerRef.current);
    breakingTimerRef.current = setTimeout(() => setBreakingAlert(a => (a && a.id === id ? null : a)), 16000);
  }, [speak, playBreakingSfx]);
  const runBreakingCheck = useCallback(async () => {
    if (!breakingOn) return;
    const { day, mins } = etNow();
    const marketOpen = day >= 1 && day <= 5 && mins >= 570 && mins < 960; // 9:30–16:00 ET weekdays
    if (!live && !marketOpen) return; // only during live trading
    if (live && apiKey) { // real market wire from Finnhub
      try {
        const r = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${apiKey}`);
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
        pushBreaking(`${mover.sym} ${mover.chgPct >= 0 ? "surges" : "slides"} ${Math.abs(mover.chgPct).toFixed(1)}% ${mover.chgPct >= 0 ? "higher" : "lower"} in the session`, live ? "market tape" : "SIM");
      }
    }
  }, [breakingOn, live, apiKey, selected, watchlist, getRow, pushBreaking]);
  useEffect(() => {
    if (!breakingOn) { setBreakingAlert(null); return; }
    const first = setTimeout(runBreakingCheck, 9000);   // one shortly after load
    const iv = setInterval(runBreakingCheck, 85000);     // then periodically
    return () => { clearTimeout(first); clearInterval(iv); clearTimeout(breakingTimerRef.current); };
  }, [breakingOn, runBreakingCheck]);

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
          pushBreaking(`Calendar reminder — ${e.title}${e.time ? ` at ${to12h(e.time)}` : ""}`, "calendar");
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
  }, [priceAlerts, getRow, firePriceAlert]);

  // ---- market events: upcoming earnings dates for your watchlist, merged into the calendar ----
  const [marketEvents, setMarketEvents] = useState([]);
  const fetchMarketEvents = useCallback(async () => {
    const syms = [...new Set([selected, ...watchlist])];
    if (!(live && apiKey)) {
      setResp("nav", { status: "done", nav: true, text: "📊 Live earnings dates need Finnhub — settings → DATA → switch to LIVE. (Ask me about a specific stock any time.)" });
      speak("nav", "Earnings dates need live market data. Switch to live in settings to see the market calendar.");
      return;
    }
    try {
      const f = (d) => d.toISOString().slice(0, 10);
      const from = new Date(), to = new Date(Date.now() + 21 * 864e5);
      const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${f(from)}&to=${f(to)}&token=${apiKey}`);
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
    } catch (e) { setResp("nav", { status: "error", nav: true, text: `Market events failed: ${e.message}` }); }
  }, [live, apiKey, selected, watchlist, speak]);

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
  // shared style for the AI-desk header toolbar buttons — one consistent look, amber when active
  const deskBtn = (active) => ({
    display: "flex", alignItems: "center", gap: 6,
    background: active ? "rgba(255,179,0,0.14)" : "transparent",
    border: `1px solid ${active ? C.amber : C.panelEdge}`,
    color: active ? C.amber : C.muted,
    borderRadius: 5, fontFamily: MONO, fontSize: 10, letterSpacing: "0.04em",
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
  const createMeeting = useCallback(async (provider) => {
    setMeetBusy(provider); setMeetErr("");
    try {
      const r = await fetch(`/api/${provider}/meeting`, { method: "POST", headers: { "Content-Type": "application/json", ...authHdr }, body: JSON.stringify({ topic: `Vantage · ${selected} briefing` }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMeetings(m => [{ ...j, at: new Date().toLocaleTimeString() }, ...m].slice(0, 6));
      if (j.start_url || j.join_url) window.open(j.start_url || j.join_url, "_blank", "noopener");
    } catch (e) { setMeetErr(`${provider}: ${e.message}`); }
    finally { setMeetBusy(""); }
  }, [selected, authHdr]);
  const disconnectMeet = useCallback(async (provider) => {
    try { await fetch(`/api/${provider}/disconnect`, { method: "POST", headers: authHdr }); } catch { /* ignore */ }
    refreshMeetStatus();
  }, [refreshMeetStatus, authHdr]);
  // after the OAuth round-trip the backend bounces back to ?connected=<provider> — open Meetings and refresh
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("connected")) {
      setSettingsTab("meetings"); setShowSettings(true); refreshMeetStatus();
      u.searchParams.delete("connected"); window.history.replaceState({}, "", u.toString());
    }
    // returning from Stripe Checkout (Layer 3): confirm the new plan and show the ACCOUNT tab
    const checkout = u.searchParams.get("checkout"), boughtPlan = u.searchParams.get("plan");
    if (checkout === "success" && boughtPlan) { onChangePlan?.(boughtPlan); setSettingsTab("account"); setShowSettings(true); }
    if (checkout) { u.searchParams.delete("checkout"); u.searchParams.delete("plan"); window.history.replaceState({}, "", u.toString()); }
  }, [refreshMeetStatus, onChangePlan]);
  // load provider status whenever the Meetings tab is opened
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
      } catch { /* fall through to simulated unlock so the demo still works */ }
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
      setExportMsg(`✗ ${fmt.toUpperCase()} failed: ${e.message}`);
    } finally {
      // hold the pose a beat past a fast export so it's actually seen ("presenting the finished deck")
      clearTimeout(presentHoldRef.current);
      presentHoldRef.current = setTimeout(() => setPresenting(false), 2600);
    }
  }, [buildReport]);

  const buildPrompt = (question) =>
    `You are one of several analysts on a trading desk answering the same question side by side. Be concise: 2-4 sentences, no preamble. Never give personalized financial advice; frame observations analytically.${lang !== "en" ? ` Respond entirely in ${LANG_AI[lang]}.` : ""}\n\n` +
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
    const usable = !planAllows("ai") ? [] : aiModels.filter(m => m.enabled && (isLocal(m) || (m.kind === "claude" ? !!anthropicApiKey.trim() : (m.needsKey ? !!(m.apiKey && m.apiKey.trim()) : true))));
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
        } catch (e) { errors.push(`${m.label}: ${e.message}`); }
      }
      throw new Error(errors.join(" · ") || "no model succeeded");
    } catch (e) {
      setExportMsg(`✗ Report failed: ${e.message}`);
      return null;
    } finally {
      setReportBusy(false);
    }
  }, [aiModels, anthropicApiKey, selected, buildMarketContext, getClaudeBaseUrl, getAnthropicHeaders]);

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
    } catch (e) { setExportMsg(`✗ Daily brief failed: ${e.message}`); }
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

  async function askClaude(m, prompt, signal, onToken) {
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
        messages: [{ role: "user", content: prompt }],
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

  async function askOllama(m, prompt, signal, onToken) {
    const r = await fetch(`${m.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m.model, stream: true, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} — is Ollama running with OLLAMA_ORIGINS set?`);
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
          if (j.done) return;
        } catch { /* partial line */ }
      }
    }
  }

  async function askOpenAICompat(m, prompt, signal, onToken) {
    const r = await fetch(`${m.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal,
      headers: {
        "Content-Type": "application/json",
        ...(m.apiKey ? { Authorization: `Bearer ${m.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: m.model, stream: true, messages: [{ role: "user", content: prompt }] }),
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

  async function askGemini(m, prompt, signal, onToken) {
    if (!m.apiKey) throw new Error("Add a Gemini API key in settings (aistudio.google.com/apikey)");
    const r = await fetch(
      `${m.baseUrl.replace(/\/$/, "")}/models/${m.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(m.apiKey)}`,
      {
        method: "POST", signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 400 || r.status === 403 ? " — check the API key" : r.status === 429 ? " — rate limited" : ""}`);
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
  // ---- streaming catalog (TMDB for Netflix/Disney+/Hulu libraries; archive.org for in-desk films) ----
  const [catalog, setCatalog] = useState(null); // {service?, kind?, archive?, popular?, query?, loading, items:[], error?}
  const [catalogPick, setCatalogPick] = useState(null); // an item whose summary is expanded
  const browseCatalog = useCallback(async (svc, kind = "movie") => {
    setCatalogPick(null);
    if (!planAllows("tmdb")) { setCatalog({ service: svc, kind, loading: false, items: [], error: `Streaming catalog is a ${planFor("tmdb")} feature — upgrade in settings → ACCOUNT.` }); return; }
    const key = tmdbKey.trim();
    if (!key) { setCatalog({ service: svc, kind, loading: false, items: [], error: "Add a free TMDB API key in settings → DATA to browse libraries in-app." }); return; }
    setCatalog({ service: svc, kind, loading: true, items: [] });
    try {
      const url = `https://api.themoviedb.org/3/discover/${kind}?api_key=${encodeURIComponent(key)}&with_watch_providers=${svc.tmdb}&watch_region=US&sort_by=popularity.desc&language=en-US&page=1`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 ? " — check the TMDB key" : ""}`);
      const d = await r.json();
      const items = (d.results || []).slice(0, 12).map(m => ({
        id: m.id, kind, title: m.title || m.name, rating: m.vote_average,
        year: String(m.release_date || m.first_air_date || "").slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
        overview: m.overview,
      }));
      setCatalog({ service: svc, kind, loading: false, items });
    } catch (e) { setCatalog({ service: svc, kind, loading: false, items: [], error: String(e.message || e) }); }
  }, [tmdbKey, planAllows]);
  const browsePopular = useCallback(async (kind = "movie") => {
    setCatalogPick(null);
    if (!planAllows("tmdb")) { setCatalog({ popular: true, kind, loading: false, items: [], error: `Streaming catalog is a ${planFor("tmdb")} feature — upgrade in settings → ACCOUNT.` }); return; }
    const key = tmdbKey.trim();
    if (!key) { setCatalog({ popular: true, kind, loading: false, items: [], error: "Add a free TMDB API key in settings → DATA to browse popular titles." }); return; }
    setCatalog({ popular: true, kind, loading: true, items: [] });
    try {
      const url = `https://api.themoviedb.org/3/trending/${kind}/week?api_key=${encodeURIComponent(key)}&language=en-US`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 ? " — check the TMDB key" : ""}`);
      const d = await r.json();
      const items = (d.results || []).slice(0, 12).map(m => ({
        id: m.id, kind, title: m.title || m.name, rating: m.vote_average,
        year: String(m.release_date || m.first_air_date || "").slice(0, 4),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
        overview: m.overview,
      }));
      setCatalog({ popular: true, kind, loading: false, items });
    } catch (e) { setCatalog({ popular: true, kind, loading: false, items: [], error: String(e.message || e) }); }
  }, [tmdbKey, planAllows]);
  const playTrailer = useCallback(async (item, svc) => {
    if (!planAllows("tmdb")) return; // plan-gated: TMDB trailers need Pro Desk
    const key = tmdbKey.trim(); if (!key) return;
    try {
      const r = await fetch(`https://api.themoviedb.org/3/${item.kind}/${item.id}/videos?api_key=${encodeURIComponent(key)}&language=en-US`);
      const d = await r.json();
      const vids = (d.results || []).filter(v => v.site === "YouTube");
      const t = vids.find(v => v.type === "Trailer") || vids.find(v => v.type === "Teaser") || vids[0];
      completeMission("watch");
      if (t) setPlayer({ id: t.key, title: `${item.title} — Trailer`, channel: svc?.name || "Trailer", url: `https://www.youtube.com/watch?v=${t.key}` });
      else setPlayer({ id: null, title: `${item.title} — Trailer`, channel: svc?.name || "", brief: "No trailer on file — use the search link to find it.", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + " trailer")}` });
    } catch { /* trailer is a bonus */ }
  }, [tmdbKey, completeMission]);
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
    } catch (e) { setCatalog({ archive: true, loading: false, items: [], error: String(e.message || e), query }); }
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
    const key = youtubeKey.trim();
    if (!key) return [];
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=${max}&q=${encodeURIComponent(query)}&key=${key}`;
    const r = await fetch(url);
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); if (j.error?.message) msg = j.error.message; } catch { /* keep status */ }
      throw new Error(msg);
    }
    const data = await r.json();
    const decode = (s) => (s || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    return (data.items || []).filter(it => it.id?.videoId).map(it => ({
      id: it.id.videoId,
      title: decode(it.snippet?.title) || query,
      channel: it.snippet?.channelTitle || "YouTube",
      url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
    }));
  }, [youtubeKey, planAllows]);

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

  const fetchNews = useCallback(async () => {
    setNewsBusy(true); setNewsErr("");
    try {
      // pick a fallback model: any enabled/usable model that isn't direct-Claude (which needs the Anthropic key)
      const isLocal = (m) => m.kind === "ollama" || /localhost|127\.0\.0\.1/.test(m.baseUrl || "");
      const usable = (m) => m.id !== "claude" && (isLocal(m) || (m.needsKey ? !!(m.apiKey && m.apiKey.trim()) : true));
      const cand = aiModels.filter(usable);
      const fb = cand.find(m => m.enabled) || cand[0] || null;

      let parsed;
      if (anthropicApiKey.trim()) {
        try { parsed = await newsViaClaude(); }
        catch (e) { if (!fb) throw e; parsed = await newsViaModel(fb); } // Claude failed (401/credits) → other model
      } else if (fb) {
        parsed = await newsViaModel(fb);
      } else {
        throw new Error("Add an Anthropic API key, or enable another model (OpenRouter/OpenAI/local), to load news.");
      }

      // real embeddable videos from the YouTube Data API always win, if a key is set
      if (youtubeKey.trim()) {
        try { const vids = await searchYouTube(`${selected} stock`, 3); if (vids.length) parsed.videos = vids; } catch { /* keep model list */ }
      }
      setNews(parsed); setNewsFor(selected);
    } catch (e) {
      setNewsErr(String(e.message || e));
    } finally {
      setNewsBusy(false);
    }
  }, [selected, youtubeKey, searchYouTube, anthropicApiKey, aiModels, newsViaClaude, newsViaModel]);

  // always hand the browser a valid, openable URL — fall back to a Google search if a model omitted/mangled one
  const newsHref = (n) => (n?.url && /^https?:\/\//.test(n.url)) ? n.url : `https://www.google.com/search?q=${encodeURIComponent(`${newsFor || selected} ${n?.title || ""}`.trim())}`;

  // ---- desk video concierge: find coverage, open the theater, brief on air ----
  const findDeskVideo = useCallback(async (topic) => {
    setResp("nav", { status: "running", nav: true, links: [], videos: [], text: `Searching video coverage of ${topic}…` });
    try {
      // Preferred path: real, embeddable results straight from YouTube — no guessed IDs, no black boxes
      if (youtubeKey.trim()) {
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
      if (!anthropicApiKey.trim()) throw new Error("Add a YouTube Data API key in settings (or an Anthropic key) to enable video search.");
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
      setResp("nav", { status: "error", nav: true, links: [], videos: [], text: String(e.message || e) });
    }
  }, [speak, youtubeKey, searchYouTube]);

  const askDesk = (override) => {
    const q = (typeof override === "string" ? override : aiQuestion).trim();
    if (!q) return;
    setLastAsked(q);
    setAiQuestion("");
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

    // export intent runs first: "download excel", "make a powerpoint", "write a report and export ppt"
    const ex = matchExport(q);
    if (ex) { runExportCmd(ex); return; } // desk-handled — build the file, no model fan-out

    // Games: "play a game", "games" → the menu; "teach me / tutorial / how do stocks work" → straight to Stock School
    if (/\b(games?|play (a )?game|arcade|game room)\b/i.test(q)) { openGames(); return; }
    if (/\b(stock school|teach me|tutorial|how (do|does) stocks?|learn (how|to invest|stocks|the basics))\b/i.test(q)) {
      setGameOn(true); startMode("school");
      return; // desk-handled — the anchor takes over teaching
    }

    // anchor cue: "ring the bell", "eat lunch", "take a break" — the anchor performs it on the desk
    const cueReq = matchAnchorCue(q);
    if (cueReq) {
      triggerAnchor(cueReq.type, cueReq);
      setCmdMsg(
        cueReq.type === "bell" ? `🔔 ${cueReq.label === "CLOSING BELL" ? "Closing" : "Opening"} bell!` :
        cueReq.type === "break" ? "☕ Anchor is taking a quick break." :
        `🍽 Anchor is having ${cueReq.meal}.`
      );
      return; // desk-handled — no model fan-out
    }

    // full chart intent: "open the chart", "tradingview NVDA", "pull up the chart" → in-app TradingView
    if (/\b(trading\s?view|full chart|advanced chart|open (the )?chart|pull up (the )?chart|chart it)\b/i.test(q)) {
      const dollar = q.match(/\$([A-Za-z]{1,5})\b/);
      const caps = (q.match(/\b[A-Z]{1,5}\b/g) || []).find(c => c.length >= 2 && !CAPS_STOP.has(c));
      const aliased = aliasFromText(q);
      openChart(dollar ? resolveSym(dollar[1]) : aliased || (caps ? resolveSym(caps) : selected));
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
      return; // desk-handled
    }

    // catalog pass: browse a service library in-app (TMDB) or public-domain films (archive.org, in-desk)
    const cat = parseCatalogIntent(q);
    if (cat) {
      if (cat.archive) browseArchive(cat.query);
      else if (cat.popular) browsePopular(cat.kind);
      else browseCatalog(cat.svc, cat.kind);
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
    if (!planAllows("ai")) { setCmdMsg(`AI desk answers are a ${planFor("ai")} feature — upgrade in settings → ACCOUNT.`); return; }
    const enabled = aiModels.filter(m => m.enabled);
    if (enabled.length === 0) { setCmdMsg("Enable at least one model in the AI desk config"); return; }
    completeMission("ask");

    // ONE answer box: try enabled models in order; the first that answers wins. If one errors
    // (Claude 401/credits, a dead local server…), it cascades to the next enabled model automatically.
    setAiResponses(p => (p.nav ? { nav: p.nav } : {})); // clear old answers; keep the navigator card
    const dispatch = (m, sig, onToken) =>
      m.kind === "claude" ? askClaude(m, prompt, sig, onToken)
      : m.kind === "ollama" ? askOllama(m, prompt, sig, onToken)
      : m.kind === "gemini" ? askGemini(m, prompt, sig, onToken)
      : askOpenAICompat(m, prompt, sig, onToken);
    const streamVoice = autoSpeak && voiceEngine === "browser" && !!window.speechSynthesis;
    const friendly = (m, e) => {
      let msg = String(e.message || e);
      if (e.name === "AbortError") return "timed out";
      if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
        return m.kind === "ollama" ? "can't reach Ollama (OLLAMA_ORIGINS)"
          : (m.kind === "openai" && !m.needsKey) ? "local server unreachable (CORS?)"
          : "network error";
      }
      return msg;
    };

    (async () => {
      const t0 = performance.now();
      const errors = [];
      for (const m of enabled) {
        const ctrl = new AbortController();
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
          if (autoSpeak && acc) { if (voiceOn) endStreamSpeak(acc); else speak("desk", acc); }
          return; // first success wins — one box, done
        } catch (e) {
          clearTimeout(timeout);
          if (voiceOn) stopSpeak();
          errors.push(`${m.label}: ${friendly(m, e)}`);
          setResp("desk", { status: "running", text: "", ms: null, via: null, tried: errors.slice() }); // reset for the next model
        }
      }
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
  const isLocalModel = (m) => m && (m.kind === "ollama" || (m.baseUrl && /localhost|127\.0\.0\.1/.test(m.baseUrl)));
  const pickLocalModel = () =>
    aiModels.find(m => m.enabled && isLocalModel(m)) || aiModels.find(isLocalModel) || null;

  // run a prompt against a given local model, routing to the right adapter
  const runLocalModel = (lm, prompt, signal, onToken) =>
    lm.kind === "ollama" ? askOllama(lm, prompt, signal, onToken) : askOpenAICompat(lm, prompt, signal, onToken);

  // ---- model selection: one at a time by default, but several can work together if enabled ----
  // soloModel = "use only this one"; the Settings checkboxes add/remove models for working together.
  const soloModel = (id) => setAiModels(ms => ms.map(m => ({ ...m, enabled: m.id === id })));
  const enabledCount = aiModels.filter(m => m.enabled).length;

  const chgUp = selectedRow?.chg > 0;
  const accent = selectedRow?.chg == null ? C.amber : chgUp ? C.up : C.down;

  // ---- ticker tape items (doubled for seamless loop) ----
  const tapeRows = watchlist.map(getRow).filter(Boolean);
  const tape = [...tapeRows, ...tapeRows];

  return (
    <div onClickCapture={handleUiClick} style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Archivo:wght@500;600;800&display=swap');
        @keyframes tapeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .tape-track { animation: tapeScroll 40s linear infinite; }
        .tape-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .tape-track { animation: none; } }
        @keyframes blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
        .cursor { animation: blink 0.9s step-end infinite; color: ${C.amber}; }
        @media (prefers-reduced-motion: reduce) { .cursor { animation: none; } }
        .wl-row:hover { background: #171E2C !important; }
        /* keyboard-only focus ring (mouse clicks no longer draw a hard amber box) */
        input:focus-visible, button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 1px; border-radius: 3px; }
        /* command bar highlights the whole rounded container, not the inner input */
        .cmdbar:focus-within { border-color: ${C.amber} !important; box-shadow: 0 0 0 3px rgba(255,179,0,0.16); }
        .cmdbar input:focus, .cmdbar input:focus-visible { outline: none; }
        ::selection { background: ${C.amberDim}; }
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
        <div className="spotify-dock" style={{ position: "fixed", bottom: 12, right: 12, zIndex: 40, display: "flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 999, padding: "8px 14px", fontFamily: MONO, fontSize: 11, color: C.up, boxShadow: "0 8px 30px rgba(0,0,0,0.5)", animation: spotifyAnim }}>
          <span style={{ color: "#1DB954", fontSize: 13 }}>♫</span> Spotify · playing on Vantage Desk
        </div>
      )}
      {/* not connected (or no Premium) → fall back to the no-login preview embed */}
      {spotifyRender && !spotifyReady && spotifyEmbedUrl(spotifyUri) && (
        <div className="spotify-dock" style={{ position: "fixed", bottom: 12, right: 12, width: 340, maxWidth: "90vw", zIndex: 40, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", border: `1px solid ${C.panelEdge}`, animation: spotifyAnim }}>
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
          <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.8)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setExportDraft(null)}>
            <div id="export-modal" onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.panelEdge}` }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.amber }}>⬇ REVIEW & EDIT — before you export</span>
                <button onClick={() => setExportDraft(null)} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: MONO, fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>DOCUMENT TITLE</label>
                  <input value={exportDraft.title} onChange={e => setExportDraft(d => ({ ...d, title: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px" }} />
                </div>
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>REPORT BODY · edit freely, this goes into the document</label>
                  <textarea value={exportDraft.body} onChange={e => setExportDraft(d => ({ ...d, body: e.target.value }))} rows={13}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 4, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, lineHeight: 1.6, padding: "10px", resize: "vertical" }} />
                  {!writtenReport && <button onClick={async () => { const t = await generateWrittenReport(); if (t) setExportDraft(d => ({ ...d, body: t })); }} disabled={reportBusy}
                    style={{ marginTop: 6, background: "transparent", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>{reportBusy ? "✍ writing…" : "✨ write it for me (AI)"}</button>}
                </div>

                {/* editable snapshot — the Summary sheet / title-slide numbers */}
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>SNAPSHOT · edit any value ({exportDraft.selected?.sym || selected})</label>
                  <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["name", "Name"], ["price", "Price"], ["chgPct", "Change %"], ["chg", "Change"], ["open", "Open"], ["high", "High"], ["low", "Low"], ["prevClose", "Prev Close"]].map(([k, lbl]) => (
                      <label key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, width: 74, flexShrink: 0 }}>{lbl}</span>
                        <input value={exportDraft.selected?.[k] ?? ""} onChange={e => setSel(k, e.target.value)}
                          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px" }} />
                      </label>
                    ))}
                  </div>
                </div>

                {/* editable watchlist grid — per-cell for the Watchlist sheet / slide / table */}
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>WATCHLIST · edit any cell, add or remove rows</label>
                  <div style={{ marginTop: 6, border: `1px solid ${C.panelEdge}`, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: wlCols, background: "#0D121C", borderBottom: `1px solid ${C.panelEdge}` }}>
                      {["Symbol", "Price", "Change", "Change %", ""].map((h, i) => (
                        <span key={i} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", color: C.faint, padding: "6px 8px" }}>{h}</span>
                      ))}
                    </div>
                    {exportDraft.watchlist.map((w, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: wlCols, borderBottom: i < exportDraft.watchlist.length - 1 ? `1px solid ${C.panelEdge}` : "none" }}>
                        {["sym", "price", "chg", "chgPct"].map(k => (
                          <input key={k} value={w[k] ?? ""} onChange={e => setWl(i, k, e.target.value)} aria-label={`${k} row ${i + 1}`}
                            style={{ boxSizing: "border-box", background: "transparent", border: "none", borderRight: `1px solid ${C.panelEdge}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", minWidth: 0 }} />
                        ))}
                        <button onClick={() => delWl(i)} title="Remove row" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                    {!exportDraft.watchlist.length && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, padding: "8px" }}>No rows — add one below.</div>}
                  </div>
                  <button onClick={addWl} style={{ marginTop: 6, background: "transparent", border: `1px dashed ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>+ add row</button>
                </div>

                {/* editable AI-analysis blocks */}
                {exportDraft.analysis.length > 0 && (
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint, cursor: "pointer" }}>
                      <input type="checkbox" checked={inc.analysis !== false} onChange={e => setInc("analysis", e.target.checked)} /> AI ANALYSIS · edit or remove
                    </label>
                    {inc.analysis !== false && exportDraft.analysis.map((a, i) => (
                      <div key={i} style={{ marginTop: 6, border: `1px solid ${C.panelEdge}`, borderRadius: 4, padding: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.amber }}>{a.model}</span>
                          <button onClick={() => delAn(i)} title="Remove" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                        </div>
                        <textarea value={a.text ?? ""} onChange={e => setAn(i, e.target.value)} rows={3}
                          style={{ width: "100%", boxSizing: "border-box", background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, padding: "6px 8px", resize: "vertical" }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* editable news list */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint, cursor: "pointer" }}>
                    <input type="checkbox" checked={inc.news !== false} onChange={e => setInc("news", e.target.checked)} /> NEWS · edit, add or remove
                  </label>
                  {inc.news !== false && (<>
                    {exportDraft.news.map((n, i) => (
                      <div key={i} style={{ marginTop: 6, display: "grid", gridTemplateColumns: "2.4fr 1fr 28px", gap: 6, alignItems: "center" }}>
                        <input value={n.title ?? ""} onChange={e => setNews(i, "title", e.target.value)} placeholder="Headline" aria-label={`news title ${i + 1}`}
                          style={{ boxSizing: "border-box", background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", minWidth: 0 }} />
                        <input value={n.source ?? ""} onChange={e => setNews(i, "source", e.target.value)} placeholder="Source" aria-label={`news source ${i + 1}`}
                          style={{ boxSizing: "border-box", background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", minWidth: 0 }} />
                        <button onClick={() => delNews(i)} title="Remove" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                    {!exportDraft.news.length && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 6 }}>No headlines — add one below.</div>}
                    <button onClick={addNews} style={{ marginTop: 6, background: "transparent", border: `1px dashed ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>+ add headline</button>
                  </>)}
                </div>

                <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, lineHeight: 1.6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={inc.chart !== false} onChange={e => setInc("chart", e.target.checked)} /> include session chart
                  </label>
                  <span>· logo + snapshot always included.</span>
                  {exportMsg && <span style={{ color: exportMsg.startsWith("✗") ? C.down : exportMsg.startsWith("✓") ? C.up : C.muted }}>· {exportMsg}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>FORMAT</span>
                  {["xlsx", "docx", "pptx"].map(f => (
                    <button key={f} onClick={() => setExportDraft(d => ({ ...d, format: f }))}
                      style={{ background: exportDraft.format === f ? "rgba(255,179,0,0.16)" : "transparent", border: `1px solid ${exportDraft.format === f ? C.amber : C.panelEdge}`, color: exportDraft.format === f ? C.amber : C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>{FMT[f]}</button>
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
                    style={{ marginLeft: "auto", background: C.amber, color: "#141414", border: "none", borderRadius: 4, fontFamily: MONO, fontWeight: 700, fontSize: 12, padding: "9px 18px", cursor: "pointer" }}>⬇ Download {FMT[exportDraft.format]}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== in-app browser: opens a broker/site inside Vantage (with a tab fallback for framed-blocked sites) ===== */}
      {embed && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.85)", zIndex: 60, display: "flex", flexDirection: "column", padding: 18 }} onClick={() => setEmbed(null)}>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", flex: 1, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.amber, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🌐 {embed.title}</span>
              <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <a href={embed.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: C.amber, color: "#141414", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 14px", textDecoration: "none" }}>open in new tab ↗</a>
                <button onClick={() => setEmbed(null)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>✕ close</button>
              </span>
            </div>
            <iframe title={embed.title} src={embed.url} style={{ flex: 1, width: "100%", border: "none", background: embed.trusted ? "#0B0E14" : "#fff" }}
              allow="clipboard-write; fullscreen" referrerPolicy="no-referrer-when-downgrade" />
            {!embed.trusted && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", fontFamily: MONO, fontSize: 10, color: C.faint, borderTop: `1px solid ${C.panelEdge}`, lineHeight: 1.5, flexWrap: "wrap" }}>
                <span>Blank? Brokers (Robinhood, Fidelity…) block embedding — use <b style={{ color: C.muted }}>open in new tab ↗</b>, or view the live chart in-app:</span>
                <button onClick={() => openChart(selected)} style={{ background: "rgba(255,179,0,0.12)", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, fontFamily: MONO, fontSize: 10, fontWeight: 600, padding: "5px 10px", cursor: "pointer" }}>📈 {selected} chart (works in-frame)</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ticker tape ===== */}
      {panels.tape && (
      <div id="tour-ticker" style={{ overflow: "hidden", borderBottom: `1px solid ${C.panelEdge}`, background: "#0D111A", whiteSpace: "nowrap" }}>
        <div className="tape-track" style={{ display: "inline-block", padding: "7px 0" }}>
          {tape.map((r, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 12, marginRight: 34 }}>
              <span style={{ color: C.amber, fontWeight: 600 }}>{r.sym}</span>{" "}
              <span style={{ color: C.text }}>{fmt(r.price)}</span>{" "}
              <span style={{ color: dirColor(r.chg) }}>{r.chg > 0 ? "▲" : r.chg < 0 ? "▼" : "•"} {pct(r.chgPct)}</span>
            </span>
          ))}
        </div>
      </div>
      )}

      {/* ===== header + command bar ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: `1px solid ${C.panelEdge}`, flexWrap: "wrap" }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, letterSpacing: "0.14em", color: C.amber }}>
          VANTAGE<span style={{ color: C.faint, fontWeight: 500, fontSize: 11, letterSpacing: "0.08em", marginLeft: 10 }}>MARKET DASHBOARD</span>
        </div>
        <div id="tour-symbol" className="cmdbar" style={{ flex: 1, minWidth: 240, display: "flex", alignItems: "center", background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, padding: "0 10px" }}>
          <span style={{ fontFamily: MONO, color: C.amber, fontSize: 13 }}>&gt;</span>
          <input
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && runCmd()}
            placeholder={t("Type a symbol and press Enter  ·  HELP for commands")}
            aria-label="Command bar"
            style={{ flex: 1, background: "transparent", border: "none", color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 8px" }}
          />
          <button onClick={runCmd} style={{ background: C.amber, color: "#141414", border: "none", borderRadius: 3, fontFamily: MONO, fontWeight: 600, fontSize: 11, padding: "5px 12px", cursor: "pointer" }}>GO</button>
        </div>
        {live && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.up, letterSpacing: "0.1em" }}>● LIVE</span>
        )}
        {liveMeeting && (
          <a href={liveMeeting} target="_blank" rel="noopener noreferrer" title="Rejoin your live meeting"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 11, color: "#fff", background: "rgba(246,70,93,0.18)", border: `1px solid ${C.down}`, borderRadius: 999, padding: "3px 10px", textDecoration: "none" }}>
            <span className="cursor" style={{ color: C.down }}>🔴</span> ON AIR ↗
          </a>
        )}
        {(() => {
          // clock shows the user's chosen timezone; OPEN/CLOSED always tracks NYSE (Eastern) hours
          const timeStr = new Intl.DateTimeFormat("en-US", { timeZone: clockTz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(clockNow);
          const abbr = tzAbbrev(clockTz, clockNow);
          const { day: eDay, mins: eMins } = etNow();
          const open = eDay >= 1 && eDay <= 5 && eMins >= 570 && eMins < 960; // 9:30–16:00 ET, weekdays
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, marginLeft: "auto" }} title={`${TIMEZONES.find(z => z.id === clockTz)?.label || clockTz} · change in settings → DATA`}>
              <select value={lang} onChange={e => setLang(e.target.value)} aria-label={t("Language")} title={t("Language")}
                style={{ background: "#0D121C", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "3px 6px", cursor: "pointer" }}>
                {LANGS.map(l => <option key={l.code} value={l.code} style={{ background: C.panel, color: C.text }}>{l.code === "en" ? "🌐 " + l.label : l.label}</option>)}
              </select>
              <span style={{ fontSize: 14, color: C.text, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{timeStr}</span>
              <span style={{ fontSize: 9, color: C.faint, letterSpacing: "0.08em" }}>{abbr}</span>
              <span title="New York Stock Exchange hours" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, letterSpacing: "0.08em", color: open ? C.up : C.down }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: open ? C.up : C.down, display: "inline-block" }} />
                NYSE {open ? t("OPEN") : t("CLOSED")}
              </span>
            </div>
          );
        })()}
      </div>

      {cmdMsg && (
        <div style={{ padding: "6px 20px", fontFamily: MONO, fontSize: 11, color: C.amber, borderBottom: `1px solid ${C.panelEdge}` }}>{cmdMsg}</div>
      )}
      {breakingAlert && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 20px", background: "linear-gradient(90deg, rgba(246,70,93,0.24), rgba(246,70,93,0.04))", borderBottom: `1px solid ${C.down}` }}>
          <span className="breaking-pulse" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#fff", background: C.down, borderRadius: 3, padding: "3px 8px", whiteSpace: "nowrap" }}>⚡ BREAKING</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, flex: 1, lineHeight: 1.4 }}>{breakingAlert.text}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, whiteSpace: "nowrap" }}>{breakingAlert.source}</span>
          <button onClick={() => speak("breaking", `This just in. ${breakingAlert.text}.`)} title="Read on air"
            style={{ background: "transparent", border: `1px solid ${C.down}`, color: C.down, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>▶ read</button>
          <button onClick={() => setBreakingAlert(null)} aria-label="Dismiss alert"
            style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 13 }}>✕</button>
        </div>
      )}
      {live && liveErr && (
        <div style={{ padding: "6px 20px", fontFamily: MONO, fontSize: 11, color: C.down, borderBottom: `1px solid ${C.panelEdge}` }}>live feed: {liveErr}</div>
      )}

      {/* ===== AI desk ===== */}
      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted }}>
              AI DESK <span style={{ color: C.faint }}>· {enabledCount > 1 ? `${enabledCount} models · falls back on error` : t("one model on the desk")}</span>
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {/* visible export menu (Excel / Word / PowerPoint / report), all generated inside Vantage */}
              <span style={{ position: "relative" }}>
                <button onClick={() => { setShowExportMenu(v => !v); setShowMoreMenu(false); }} aria-label="Export a document"
                  title="Export the current view as Excel, Word, or PowerPoint — built inside Vantage"
                  style={deskBtn(showExportMenu)} {...deskBtnHover(showExportMenu)}>
                  ⬇ {t("Export")} ▾
                </button>
                {showExportMenu && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", minWidth: 150, overflow: "hidden" }}>
                    {exportMsg && <div style={{ fontFamily: MONO, fontSize: 10, color: exportMsg.startsWith("✗") ? C.down : exportMsg.startsWith("✓") ? C.up : C.muted, padding: "6px 10px", borderBottom: `1px solid ${C.panelEdge}` }}>{exportMsg}</div>}
                    {[["xlsx", "📊 Excel (.xlsx)"], ["docx", "📄 Word (.docx)"], ["pptx", "📽 PowerPoint (.pptx)"]].map(([fmt, label]) => (
                      <button key={fmt} onClick={() => { setShowExportMenu(false); openExportPreview(fmt); }}
                        style={{ textAlign: "left", background: "transparent", border: "none", color: C.text, fontFamily: MONO, fontSize: 11, padding: "8px 12px", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#171E2C"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{label}</button>
                    ))}
                    <button onClick={() => { setShowExportMenu(false); generateWrittenReport(); }} disabled={reportBusy}
                      style={{ textAlign: "left", background: "transparent", borderTop: `1px solid ${C.panelEdge}`, borderLeft: "none", borderRight: "none", borderBottom: "none", color: C.amber, fontFamily: MONO, fontSize: 11, padding: "8px 12px", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#171E2C"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{reportBusy ? "✍ writing…" : "📝 write analyst report"}</button>
                  </div>
                )}
              </span>
              {/* consolidated "More" menu: games + ambient + music, so the row stays uncluttered */}
              <span style={{ position: "relative" }}>
                <button onClick={() => { setShowMoreMenu(v => !v); setShowExportMenu(false); }} aria-label="More — games, ambient sound and music"
                  title="Games, ambient sound and music"
                  style={deskBtn(showMoreMenu || gameOn || ambienceOn || musicOn)} {...deskBtnHover(showMoreMenu || gameOn || ambienceOn || musicOn)}>
                  ⋯ {t("More")} ▾
                </button>
                {showMoreMenu && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", minWidth: 210, overflow: "hidden" }}>
                    {[
                      { key: "games", icon: "🎮", label: t("Games"), sub: t("learn how stocks work"), active: gameOn, onClick: () => { setShowMoreMenu(false); gameOn ? closeGame() : openGames(); } },
                      { key: "ambient", icon: "🌊", label: t("Ambient sound"), sub: t("waves, jungle, space hum…"), active: ambienceOn, onClick: () => setAmbienceOn(v => !v) },
                      { key: "music", icon: "♪", label: t("Music"), sub: t("background score"), active: musicOn, onClick: () => toggleMusic(!musicOn) },
                    ].map((it, idx) => (
                      <button key={it.key} onClick={it.onClick} aria-pressed={it.active}
                        style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "transparent", border: "none", borderBottom: idx < 2 ? `1px solid ${C.panelEdge}` : "none", color: C.text, fontFamily: MONO, fontSize: 11, padding: "9px 12px", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#171E2C"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{it.icon}</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: "block", color: it.active ? C.amber : C.text }}>{it.label}</span>
                          <span style={{ display: "block", fontSize: 9, color: C.faint }}>{it.sub}</span>
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", color: it.active ? C.amber : C.faint }}>{it.active ? "● ON" : "○ off"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </span>
              <button id="tour-settings" onClick={() => { setKeyDraft(apiKey); setSettingsTab("quick"); setShowSettings(true); }}
                style={deskBtn(false)} {...deskBtnHover(false)}>
                ⚙ {t("Settings")}
              </button>
              {/* account chip: signed-in users see their plan + a menu; guests get a Sign in shortcut */}
              <div style={{ position: "relative" }}>
                <button onClick={() => { setShowExportMenu(false); setShowMoreMenu(false); account ? setAccountMenu(o => !o) : onSignOut?.(); }}
                  title={account ? `Signed in as ${account.email}` : "Sign in / create account"}
                  style={deskBtn(!!account)} {...deskBtnHover(!!account)}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: account ? C.amber : C.panelEdge, color: "#0B0E14", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 9 }}>
                    {account ? (account.name || account.email || "?").trim().charAt(0).toUpperCase() : "?"}
                  </span>
                  {account ? planLabel(account.plan) : t("sign in")}
                </button>
                {account && accountMenu && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 210, background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
                      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, color: C.text }}>{account.name || account.email.split("@")[0]}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, wordBreak: "break-all" }}>{account.email}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.amber, marginTop: 4 }}>{planLabel(account.plan)} plan{account.backend ? " · server" : " · this device"}</div>
                    </div>
                    <button onClick={() => { setAccountMenu(false); setSettingsTab("account"); setShowSettings(true); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "transparent", border: "none", color: C.text, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>Manage plan</button>
                    <button onClick={() => { setAccountMenu(false); onSignOut?.(); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "transparent", border: "none", color: "#ff8a8a", fontFamily: MONO, fontSize: 11, cursor: "pointer", borderTop: `1px solid ${C.panelEdge}` }}>Sign out</button>
                  </div>
                )}
              </div>
            </span>
          </div>


          {/* anchor + response columns */}
          {(Object.keys(aiResponses).length > 0 || true) && (
            <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* desk anchor */}
              <div id="tour-anchor" style={{ background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "10px 8px", flexShrink: 0 }}>
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
                      aria-label="Previous anchor"
                      style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 12, lineHeight: 1, padding: "5px 8px", cursor: "pointer" }}>‹</button>
                    <select value={characterId} onChange={e => setCharacterId(e.target.value)} aria-label="Anchor"
                      style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "5px 6px", cursor: "pointer" }}>
                      {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      onClick={() => { const i = CHARACTERS.findIndex(c => c.id === characterId); setCharacterId(CHARACTERS[(i + 1) % CHARACTERS.length].id); }}
                      aria-label="Next anchor"
                      style={{ flexShrink: 0, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 12, lineHeight: 1, padding: "5px 8px", cursor: "pointer" }}>›</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint, flexShrink: 0 }}>{t("SET")}</span>
                    <select value={envId} onChange={e => setEnvId(e.target.value)} aria-label="Environment"
                      style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.muted, fontFamily: MONO, fontSize: 11, padding: "5px 6px", cursor: "pointer" }}>
                      {ENVIRONMENTS.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                    </select>
                  </div>
                  {speakingId ? (
                    <button onClick={stopSpeak}
                      style={{ background: "transparent", border: `1px solid ${C.down}`, color: C.down, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "6px 0", cursor: "pointer" }}>
                      ■ {t("stop reading")}
                    </button>
                  ) : (
                    <button onClick={() => { setKeyDraft(apiKey); setSettingsTab("anchor"); setShowSettings(true); }}
                      style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.faint, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "6px 0", cursor: "pointer" }}>
                      {t("voice & anchor settings")}
                    </button>
                  )}
                </div>
              </div>

              {/* ---- Game panel: menu + three beginner games, all hosted by the anchor (fully local) ---- */}
              {gameOn && (() => {
                const primaryBtn = { background: C.amber, color: "#141414", border: "none", borderRadius: 4, fontFamily: MONO, fontWeight: 700, fontSize: 12, padding: "9px 16px", cursor: "pointer" };
                const ghostBtn = { background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "9px 12px", cursor: "pointer" };
                const shell = (title, headerRight, body) => (
                  <div style={{ flex: 1, minWidth: 260, background: "#0D121C", border: `1px solid ${C.amber}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.amber, letterSpacing: "0.08em" }}>{title}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {headerRight}
                        <button onClick={closeGame} aria-label="Close games" style={{ background: "transparent", border: "none", color: C.faint, fontFamily: MONO, fontSize: 13, cursor: "pointer" }}>✕</button>
                      </span>
                    </div>
                    {body}
                  </div>
                );

                // ---- game selection menu ----
                if (gameMode === "menu") {
                  const games = [
                    { id: "school", icon: "🎓", name: "Stock School", desc: "8 quick lessons — what a stock is, why prices move, reading gains & losses. The anchor teaches you." },
                    { id: "bullbear", icon: "📊", name: "Bull or Bear", desc: "Read a headline, predict whether the stock goes up or down. Learn how news moves markets." },
                    { id: "ticker", icon: "🔤", name: "Ticker Match", desc: "Match famous companies to their real stock symbols. AAPL, NVDA, TSLA…" },
                    { id: "cards", icon: "🃏", name: "Market Blackjack", desc: "Play 21 against the dealer with a chip bankroll. Hit, stand, and try not to bust." },
                    { id: "chess", icon: "♟", name: "Bulls vs Bears Chess", desc: "Two-player chess on one screen: green Bulls vs red Bears. Capture the enemy king." },
                    { id: "algowars", icon: "🖥️", name: "Algorithm Wars", desc: "A live trading-floor RTS: deploy automated bots and re-script your army's AI in real time to crush the enemy algorithms." },
                  ];
                  return shell("🎮 GAME ROOM", <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>no account needed</span>,
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      {games.map(g => (
                        <button key={g.id} onClick={() => startMode(g.id)}
                          style={{ textAlign: "left", background: "#111827", border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "10px 12px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <span style={{ fontSize: 20 }}>{g.icon}</span>
                          <span>
                            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.amber }}>{g.name} →</div>
                            <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, color: C.muted, marginTop: 3 }}>{g.desc}</div>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                }

                // ---- board/card games render their own self-contained components ----
                const backBtn = <button onClick={() => { setGameMode("menu"); stopSpeak(); }} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>← games</button>;
                if (gameMode === "cards") {
                  return shell("🃏 MARKET BLACKJACK", backBtn,
                    <BlackjackGame onCheer={() => triggerAnchor("cheer", { label: "WINNER! ✓" })} onWin={() => triggerAnchor("cheer", { label: "BLACKJACK! 🃏" })} />);
                }
                if (gameMode === "chess") {
                  return shell("♟ BULLS vs BEARS", backBtn,
                    <ChessGame onWin={(w) => triggerAnchor("cheer", { label: w === "w" ? "BULLS WIN! 🐂" : "BEARS WIN! 🐻" })} />);
                }
                if (gameMode === "algowars") {
                  return shell("🖥️ ALGORITHM WARS", backBtn,
                    <AlgoWarsGame onWin={(w) => triggerAnchor(w === "you" ? "cheer" : "break", { label: w === "you" ? "MARKET DOMINATED! 🏆" : "OUTGUNNED 💥" })} onCheer={() => {}} />);
                }

                // ---- an active quiz game (school / bullbear / ticker) ----
                const data = gameSet(gameMode), total = data.length, R = data[gameStep] || {};
                const done = gamePhase === "done";
                const meta = gameMode === "school"
                  ? { hdr: "🎓 STOCK SCHOOL", unit: "lesson", title: R.title, question: R.q, choices: R.choices || [], answer: R.answer, explain: R.explain }
                  : gameMode === "bullbear"
                    ? { hdr: "📊 BULL OR BEAR", unit: "round", title: "Will the stock go up or down?", question: R.headline, choices: ["📈 Bullish — likely UP", "📉 Bearish — likely DOWN"], answer: R.bullish ? 0 : 1, explain: R.why }
                    : { hdr: "🔤 TICKER MATCH", unit: "round", title: "Pick the real ticker symbol", question: `Which symbol is ${R.company}?`, choices: R.options || [], answer: R.answer, explain: `${R.company} trades as ${R.options?.[R.answer]}.` };
                const headerRight = (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{done ? `score ${gameScore}/${total}` : `${meta.unit} ${gameStep + 1}/${total} · score ${gameScore}`}</span>
                );
                const body = (
                  <>
                    <div style={{ height: 3, background: C.panelEdge }}>
                      <div style={{ height: "100%", width: `${((done ? total : gameStep) / total) * 100}%`, background: C.amber, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ padding: 14, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 12 }}>
                      {done ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 800, color: C.amber }}>{gameMode === "school" ? "🎓 You graduated!" : "🏁 Round complete!"}</div>
                          <div style={{ fontSize: 12, lineHeight: 1.7, color: C.text }}>
                            You scored <b style={{ color: gameScore > total / 2 ? C.up : C.amber }}>{gameScore} / {total}</b>. {gameMode === "school" ? "You now know the basics of how stocks work." : gameScore === total ? "Perfect run!" : "Play again to beat your score."}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => startMode(gameMode)} style={primaryBtn}>Play again ↻</button>
                            <button onClick={() => { setGameMode("menu"); stopSpeak(); }} style={ghostBtn}>← All games</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{meta.title}</div>
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
                                  const bg = revealed ? (isRight ? "rgba(47,211,122,0.15)" : chosen ? "rgba(246,70,93,0.12)" : "transparent") : "transparent";
                                  const bd = revealed ? (isRight ? C.up : chosen ? C.down : C.panelEdge) : C.panelEdge;
                                  return (
                                    <button key={i} disabled={revealed} onClick={() => gameAnswer(i)}
                                      style={{ textAlign: "left", background: bg, border: `1px solid ${bd}`, color: C.text, borderRadius: 5, fontFamily: MONO, fontSize: 12, padding: "9px 11px", cursor: revealed ? "default" : "pointer" }}>
                                      {gameMode === "school" ? `${String.fromCharCode(65 + i)}. ` : ""}{c}{revealed && isRight ? "  ✓" : revealed && chosen ? "  ✕" : ""}
                                    </button>
                                  );
                                })}
                              </div>
                              {gamePhase === "reveal" && (
                                <>
                                  <div style={{ fontSize: 12, lineHeight: 1.6, color: gameChoice === meta.answer ? C.up : C.muted }}>
                                    {gameChoice === meta.answer ? "✓ Correct — " : "✗ Not quite — "}{meta.explain}
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
              })()}

              {/* response area — ONE box; navigator / desk answer / report / news are sections within it */}
              <div id="tour-response" style={{ flex: 1, minWidth: 260, display: gameOn ? "none" : "flex", flexDirection: "column", background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
                {Object.keys(aiResponses).length === 0 && !writtenReport && !news && !catalog && !deskCalendar && !deskPortfolio && (
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, padding: 12 }}>
                    {t("Ask a question below — answers appear here, and the anchor can read any of them on air.")}
                  </div>
                )}
                {aiResponses.nav && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.amber, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>⌖ NAVIGATOR</span>
                      <button onClick={() => setAiResponses(p => { const { nav, ...rest } = p; return rest; })} aria-label="Dismiss navigator"
                        style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                    </div>
                    <div style={{ padding: 10, fontFamily: MONO, fontSize: 12, lineHeight: 1.65, color: aiResponses.nav.status === "error" ? C.down : C.text }}>
                      {aiResponses.nav.text}
                      {aiResponses.nav.status === "running" && <span className="cursor">▍</span>}
                      {aiResponses.nav.links?.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {aiResponses.nav.links.map(l => (
                            <span key={l.name} style={{ display: "inline-flex", border: `1px solid ${C.amber}`, borderRadius: 4, overflow: "hidden" }}>
                              <button onClick={() => openEmbed(l.href, l.name)} title={`Open ${l.name} inside Vantage`}
                                style={{ background: "rgba(255,179,0,0.12)", border: "none", color: C.amber, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "6px 12px", cursor: "pointer" }}>
                                {l.name}
                              </button>
                              <a href={l.href} target="_blank" rel="noopener noreferrer" title="Open in a new tab instead"
                                style={{ textDecoration: "none", background: "transparent", borderLeft: `1px solid ${C.amber}`, color: C.amber, fontFamily: MONO, fontSize: 11, padding: "6px 8px" }}>↗</a>
                            </span>
                          ))}
                          {!aiResponses.nav.stream && (
                            <button onClick={() => openChart(selected)} title="Interactive chart that actually renders inside Vantage"
                              style={{ background: "rgba(47,211,122,0.12)", border: `1px solid ${C.up}`, color: C.up, borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "6px 12px", cursor: "pointer" }}>
                              📈 {selected} chart in-app
                            </button>
                          )}
                        </div>
                      )}
                      {aiResponses.nav.videos?.map((v, i) => (
                        <div key={i} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.panelEdge}` }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>
                            <span style={{ color: C.down }}>▶</span> {v.title}
                            <span style={{ color: C.faint, fontWeight: 400, marginLeft: 6 }}>{v.channel}</span>
                          </div>
                          {v.brief && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{v.brief}</div>}
                          <button onClick={() => openVideo(v)}
                            style={{ marginTop: 6, background: "rgba(255,179,0,0.12)", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, fontFamily: MONO, fontSize: 10, fontWeight: 600, padding: "5px 10px", cursor: "pointer" }}>
                            play in desk
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {deskCalendar && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: aiResponses.nav ? `1px solid ${C.panelEdge}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.amber }}>
                      <span>📅 CALENDAR</span>
                      <button onClick={() => setDeskCalendar(false)} aria-label="Close calendar" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                    </div>
                    <div style={{ maxWidth: 460, width: "100%" }}>
                      <AppCalendar extra={marketEvents} />
                    </div>
                  </div>
                )}
                {deskPortfolio && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: (aiResponses.nav || deskCalendar) ? `1px solid ${C.panelEdge}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.amber }}>
                      <span>💼 PORTFOLIO {positions.length > 0 && <span style={{ color: dirColor(portTotals.pnl), marginLeft: 6 }}>{portTotals.pnl >= 0 ? "+" : ""}{fmt(portTotals.pnl)} ({portTotals.pnlPct >= 0 ? "+" : ""}{portTotals.pnlPct.toFixed(2)}%)</span>}</span>
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {positions.length > 0 && <button onClick={briefPortfolio} title="Read on air" style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.amber, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>▶ read</button>}
                        <button onClick={() => setDeskPortfolio(false)} aria-label="Close portfolio" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                      </span>
                    </div>
                    <div style={{ padding: "6px 10px" }}>
                      {positions.length === 0 && <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, padding: "6px 0" }}>No holdings yet — add symbol, shares, and your cost per share below.</div>}
                      {portfolioRows.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 4, fontFamily: MONO, fontSize: 9, color: C.faint, padding: "2px 0", borderBottom: `1px solid ${C.grid}` }}>
                          <span>SYMBOL</span><span style={{ textAlign: "right" }}>COST→NOW</span><span style={{ textAlign: "right" }}>VALUE</span><span style={{ textAlign: "right" }}>P&L</span><span />
                        </div>
                      )}
                      {portfolioRows.map(r => (
                        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 4, alignItems: "center", fontFamily: MONO, fontSize: 11, padding: "6px 0", borderBottom: `1px solid ${C.grid}` }}>
                          <button onClick={() => setSelected(r.sym)} style={{ background: "transparent", border: "none", color: C.text, fontFamily: MONO, fontSize: 11, fontWeight: 600, textAlign: "left", cursor: "pointer", padding: 0 }}>{r.sym} <span style={{ color: C.faint, fontWeight: 400, fontSize: 9 }}>×{r.shares}</span></button>
                          <span style={{ textAlign: "right", color: C.muted, fontSize: 10 }}>{fmt(r.cost / r.shares)}→{r.price != null ? fmt(r.price) : "—"}</span>
                          <span style={{ textAlign: "right", color: C.text }}>{r.val != null ? fmt(r.val) : "—"}</span>
                          <span style={{ textAlign: "right", color: dirColor(r.pnl) }}>{r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)}`}{r.pnlPct != null ? <span style={{ fontSize: 9, display: "block", color: dirColor(r.pnl) }}>{r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%</span> : null}</span>
                          <button onClick={() => removePosition(r.id)} aria-label="Remove" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 11 }}>✕</button>
                        </div>
                      ))}
                      {positions.length > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
                          <span style={{ color: C.muted }}>TOTAL · {fmt(portTotals.val)}</span>
                          <span style={{ color: dirColor(portTotals.pnl) }}>{portTotals.pnl >= 0 ? "+" : ""}{fmt(portTotals.pnl)} ({portTotals.pnlPct >= 0 ? "+" : ""}{portTotals.pnlPct.toFixed(2)}%)</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                        <input value={portForm.sym} onChange={e => setPortForm(f => ({ ...f, sym: e.target.value.toUpperCase() }))} placeholder="SYM" aria-label="Symbol"
                          style={{ width: 60, background: "#0B0E14", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "6px 6px" }} />
                        <input value={portForm.shares} onChange={e => setPortForm(f => ({ ...f, shares: e.target.value }))} placeholder="shares" inputMode="decimal" aria-label="Shares"
                          style={{ width: 64, background: "#0B0E14", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "6px 6px" }} />
                        <input value={portForm.cost} onChange={e => setPortForm(f => ({ ...f, cost: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPosition()} placeholder="cost / share" inputMode="decimal" aria-label="Cost basis"
                          style={{ flex: 1, minWidth: 0, background: "#0B0E14", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "6px 6px" }} />
                        <button onClick={addPosition} style={{ background: C.amber, border: "none", color: "#141414", borderRadius: 4, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "0 12px", cursor: "pointer" }}>+ add</button>
                      </div>
                    </div>
                  </div>
                )}
                {catalog && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: Object.keys(aiResponses).length ? `1px solid ${C.panelEdge}` : "none" }}>
                    <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.amber, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <span>🎬 {catalog.archive ? "FREE FILMS · Internet Archive" : `${catalog.popular ? "🔥 POPULAR" : catalog.service?.name?.toUpperCase()} · ${catalog.kind === "tv" ? "SHOWS" : "MOVIES"}`}</span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {!catalog.archive && (
                          <>
                            {["movie", "tv"].map(k => (
                              <button key={k} onClick={() => catalog.popular ? browsePopular(k) : browseCatalog(catalog.service, k)}
                                style={{ background: catalog.kind === k ? "rgba(255,179,0,0.14)" : "transparent", border: `1px solid ${catalog.kind === k ? C.amber : C.panelEdge}`, color: catalog.kind === k ? C.amber : C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>
                                {k === "tv" ? "shows" : "movies"}
                              </button>
                            ))}
                          </>
                        )}
                        <button onClick={() => { setCatalog(null); setCatalogPick(null); }} aria-label="Close catalog" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                      </span>
                    </div>
                    {catalog.loading ? (
                      <div style={{ padding: 12, fontFamily: MONO, fontSize: 11, color: C.faint }}>Loading catalog… <span className="cursor">▍</span></div>
                    ) : catalog.error ? (
                      <div style={{ padding: 12, fontFamily: MONO, fontSize: 11, color: C.down, lineHeight: 1.6 }}>{catalog.error}</div>
                    ) : catalog.items.length === 0 ? (
                      <div style={{ padding: 12, fontFamily: MONO, fontSize: 11, color: C.faint }}>Nothing found. Try another search.</div>
                    ) : (
                      <>
                        {/* summary panel for the picked title */}
                        {catalogPick && !catalog.archive && (
                          <div style={{ display: "flex", gap: 10, padding: 12, borderBottom: `1px solid ${C.panelEdge}`, background: "#0B0E14" }}>
                            {catalogPick.poster && <img src={catalogPick.poster} alt="" style={{ width: 70, height: 105, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{catalogPick.title}{catalogPick.year ? ` (${catalogPick.year})` : ""}{catalogPick.rating > 0 ? <span style={{ color: C.amber, fontWeight: 400 }}>  ★{Number(catalogPick.rating).toFixed(1)}</span> : null}</span>
                                <button onClick={() => setCatalogPick(null)} aria-label="Close summary" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.55, color: C.muted, maxHeight: 96, overflowY: "auto" }}>{catalogPick.overview || "No summary available."}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                                <button onClick={() => playTrailer(catalogPick, catalog.service)} style={{ background: "rgba(255,179,0,0.12)", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 3, fontFamily: MONO, fontSize: 10, fontWeight: 600, padding: "4px 10px", cursor: "pointer" }}>▶ trailer</button>
                                {catalog.service
                                  ? <button onClick={() => openEmbed(catalog.service.search(catalogPick.title), catalog.service.name)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>watch on {catalog.service.name} ↗</button>
                                  : <a href={`https://www.themoviedb.org/${catalogPick.kind}/${catalogPick.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "4px 10px" }}>details ↗</a>}
                              </div>
                            </div>
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, padding: 12 }}>
                          {catalog.items.map((it, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column", background: "#0B0E14", border: `1px solid ${catalogPick && catalogPick.id === it.id && catalogPick.archiveId === it.archiveId ? C.amber : C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
                              <div onClick={() => catalog.archive ? playArchive(it) : setCatalogPick(p => (p && p.id === it.id ? null : it))}
                                title={catalog.archive ? "Play in-desk" : "Show summary"}
                                style={{ position: "relative", width: "100%", paddingTop: "150%", background: "#141821", cursor: "pointer" }}>
                                {it.poster && <img src={it.poster} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                                {it.rating > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.75)", color: C.amber, fontFamily: MONO, fontSize: 9, padding: "1px 5px", borderRadius: 3 }}>★ {Number(it.rating).toFixed(1)}</span>}
                                {!catalog.archive && <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.7)", color: C.faint, fontFamily: MONO, fontSize: 8, padding: "1px 5px", borderRadius: 3 }}>ⓘ summary</span>}
                              </div>
                              <div style={{ padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{it.title}{it.year ? ` (${it.year})` : ""}</span>
                                <span style={{ marginTop: "auto", display: "flex", gap: 4 }}>
                                  {catalog.archive ? (
                                    <>
                                      <button onClick={() => playArchive(it)} title="Play in-desk" style={{ flex: 1, background: "rgba(47,211,122,0.14)", border: `1px solid ${C.up}`, color: C.up, borderRadius: 3, fontFamily: MONO, fontSize: 9, fontWeight: 600, padding: "4px 0", cursor: "pointer" }}>▶ play</button>
                                      <a href={`https://archive.org/details/${it.archiveId}`} target="_blank" rel="noopener noreferrer" title="Open on Archive" style={{ textDecoration: "none", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 9, padding: "4px 7px" }}>↗</a>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={() => playTrailer(it, catalog.service)} title="Play trailer in-desk" style={{ flex: 1, background: "rgba(255,179,0,0.12)", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 3, fontFamily: MONO, fontSize: 9, fontWeight: 600, padding: "4px 0", cursor: "pointer" }}>▶ trailer</button>
                                      {catalog.service
                                        ? <button onClick={() => openEmbed(catalog.service.search(it.title), catalog.service.name)} title={`Watch on ${catalog.service.name}`} style={{ border: `1px solid ${C.panelEdge}`, color: C.muted, background: "transparent", borderRadius: 3, fontFamily: MONO, fontSize: 9, padding: "4px 7px", cursor: "pointer" }}>↗</button>
                                        : <a href={`https://www.themoviedb.org/${it.kind}/${it.id}`} target="_blank" rel="noopener noreferrer" title="Details" style={{ textDecoration: "none", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 9, padding: "4px 7px" }}>↗</a>}
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
                )}
                {news && (news.news?.length > 0 || news.videos?.length > 0) && (
                  <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${C.panelEdge}` }}>
                    <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.amber, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>📰 NEWS — {newsFor}</span>
                      <button onClick={() => setNews(null)} aria-label="Dismiss news"
                        style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                    </div>
                    {news._via && (
                      <div style={{ padding: "6px 10px", fontFamily: MONO, fontSize: 9, color: C.faint, borderBottom: `1px solid ${C.panelEdge}`, lineHeight: 1.5 }}>
                        ⚠ via {news._via} — from AI knowledge, not live web. Links open a search. Add an Anthropic key for live, sourced results.
                      </div>
                    )}
                    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {news.news?.map((n, i) => (
                        <a key={`dn${i}`} href={newsHref(n)} target="_blank" rel="noopener noreferrer"
                          style={{ textDecoration: "none", color: C.text, fontFamily: MONO, fontSize: 11, lineHeight: 1.5 }}>
                          <span style={{ color: C.up }}>▸</span> {n.title} <span style={{ color: C.faint }}>— {n.source} ↗</span>
                        </a>
                      ))}
                      {news.videos?.length > 0 && (
                        <div style={{ borderTop: `1px solid ${C.panelEdge}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {news.videos.map((v, i) => (
                            <button key={`dv${i}`} onClick={() => openVideo(v)}
                              style={{ textAlign: "left", background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.text, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "6px 8px", cursor: "pointer" }}>
                              <span style={{ color: C.down }}>▶</span> {v.title} <span style={{ color: C.faint }}>{v.channel}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {(aiResponses.desk || writtenReport) && (() => {
                  const r = aiResponses.desk;
                  const dot = r ? (r.status === "running" ? C.amber : r.status === "error" ? C.down : C.up) : C.up;
                  const isSpeaking = speakingId === "desk";
                  const fellBack = r && (r.tried?.length || 0) > 0 && r.status !== "error"; // an earlier model failed first
                  return (
                    <div style={{ display: "flex", flexDirection: "column", borderTop: (aiResponses.nav || news) ? `1px solid ${C.panelEdge}` : "none" }}>
                      {/* --- desk answer --- */}
                      {r && (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${C.panelEdge}` }}>
                            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.text }}>
                              <span style={{ color: dot, marginRight: 6 }}>●</span>AI DESK
                              {r.via && <span style={{ color: C.faint, fontWeight: 400, marginLeft: 6 }}>· {r.via}{r.model ? ` (${r.model})` : ""}</span>}
                              {fellBack && <span title={`Skipped: ${r.tried.join(" · ")}`} style={{ color: C.amber, fontWeight: 400, marginLeft: 6, fontSize: 9, letterSpacing: "0.06em" }}>↩ FELL BACK</span>}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{r.status === "running" ? (r.via ? `${r.via}…` : "thinking…") : r.ms != null ? `${r.ms} ms` : ""}</span>
                              {r.status !== "running" && r.text && (
                                <button onClick={() => (isSpeaking ? stopSpeak() : speak("desk", r.text))} aria-label={isSpeaking ? "Stop reading" : "Read the answer aloud"}
                                  style={{ background: "transparent", border: `1px solid ${isSpeaking ? C.amber : C.panelEdge}`, color: isSpeaking ? C.amber : C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>{isSpeaking ? "■" : "▶"}</button>
                              )}
                              <button onClick={() => { if (isSpeaking) stopSpeak(); setAiResponses(p => { const { desk, ...rest } = p; return rest; }); }} aria-label="Dismiss answer"
                                style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                            </span>
                          </div>
                          <div style={{ padding: 10, fontFamily: MONO, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", color: r.status === "error" ? C.down : C.text }}>
                            {r.tried?.length > 0 && r.status !== "error" && r.status !== "done" && (
                              <div style={{ color: C.faint, fontSize: 10, marginBottom: 6 }}>skipped {r.tried.join(" · ")} — trying {r.via}…</div>
                            )}
                            {r.text}
                            {r.status === "running" && <span className="cursor">▍</span>}
                          </div>
                        </>
                      )}
                      {/* --- analyst report, as a section in the SAME box --- */}
                      {writtenReport && (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderTop: r ? `1px solid ${C.panelEdge}` : "none", borderBottom: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.amber }}>
                            <span>📝 ANALYST REPORT — {reportSym || selected}</span>
                            <span style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => (speakingId === "report" ? stopSpeak() : speak("report", writtenReport))}
                                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>{speakingId === "report" ? "■" : "▶ read"}</button>
                              <button onClick={() => setWrittenReport("")} aria-label="Dismiss report" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
                            </span>
                          </div>
                          <div style={{ padding: 12, fontFamily: MONO, fontSize: 12, lineHeight: 1.7, color: C.text, whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto" }}>{writtenReport}</div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          {lastAsked && (
            <div style={{ padding: "0 12px 4px", fontFamily: MONO, fontSize: 10, color: C.faint }}>
              last question: <span style={{ color: C.muted }}>{lastAsked}</span> · every answer sees the current snapshot ({live ? "live" : "simulated"} data)
            </div>
          )}

          {player && (
            <div style={{ margin: "0 12px 12px", border: `1px solid ${C.amber}`, borderRadius: 6, overflow: "hidden", background: "#0D121C" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.text }}>
                  <span style={{ color: C.down }}>▶</span> {player.title}
                  <span style={{ color: C.faint, fontWeight: 400, marginLeft: 8 }}>{player.channel}</span>
                </span>
                <button onClick={() => setPlayer(null)} aria-label="Close embedded player"
                  style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 12, padding: "3px 10px", cursor: "pointer" }}>✕</button>
              </div>
              {player.archive ? (
                <ArchiveFrame id={player.archive} title={player.title} />
              ) : player.id ? (
                <VideoFrame id={player.id} title={player.title} />
              ) : (
                <div style={{ padding: 12, fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                  {player.brief || "This link cannot be embedded directly, but the desk brief is available above."}
                </div>
              )}
              {player.archive ? (
                <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>Public-domain film · playing inside Vantage</span>
                  <a href={`https://archive.org/details/${player.archive}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: MONO, fontSize: 10, color: C.amber, textDecoration: "none", border: `1px solid ${C.amberDim}`, borderRadius: 3, padding: "3px 9px" }}>
                    Open on Archive ↗
                  </a>
                </div>
              ) : (
                <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: C.amber }}>DESK BRIEF</span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a href={ytWatchUrl(player)} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: MONO, fontSize: 10, color: C.amber, textDecoration: "none", border: `1px solid ${C.amberDim}`, borderRadius: 3, padding: "3px 9px" }}>
                        Watch on YouTube ↗
                      </a>
                      {player.brief && (
                        <button onClick={() => speak("brief", player.brief)}
                          style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "3px 9px", cursor: "pointer" }}>
                          ▶ read
                        </button>
                      )}
                    </span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: C.text, marginTop: 6 }}>
                    {player.brief || "Researching what this video covers…"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* question bar — one box for everything: ask, navigate, pull up video, OR export a file */}
          <div id="tour-ask" style={{ display: "flex", alignItems: "center", padding: 12, gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, color: C.amber, fontSize: 13 }}>{reportBusy ? "✍" : "?"}</span>
            <input
              value={aiQuestion}
              onChange={e => setAiQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && askDesk()}
              placeholder={t('Ask about {sym}, "take me to Robinhood", or "download excel" / "make a powerpoint" / "write a report and export ppt"').replace("{sym}", selected)}
              aria-label="Ask the AI desk or request an export"
              style={{ flex: 1, minWidth: 220, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px" }}
            />
            {exportMsg && <span style={{ fontFamily: MONO, fontSize: 10, color: exportMsg.startsWith("✗") ? C.down : exportMsg.startsWith("✓") ? C.up : C.muted }}>{exportMsg}</span>}
            {voiceSupported && (
              <button onClick={toggleVoice} aria-label={listening ? "Stop listening" : "Talk to the desk"} title="Talk to the desk"
                className={listening ? "breaking-pulse" : ""}
                style={{ background: listening ? C.down : "transparent", color: listening ? "#fff" : C.amber, border: `1px solid ${listening ? C.down : C.amber}`, borderRadius: 3, fontFamily: MONO, fontSize: 14, padding: "7px 12px", cursor: "pointer" }}>
                🎙
              </button>
            )}
            <button onClick={askDesk}
              style={{ background: C.amber, color: "#141414", border: "none", borderRadius: 3, fontFamily: MONO, fontWeight: 600, fontSize: 11, padding: "9px 16px", cursor: "pointer" }}>
              {t("ASK ALL")}
            </button>
          </div>
        </div>
      </div>


      {/* ===== main grid ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr 240px", gap: 14, padding: 14, alignItems: "start" }}>

        {/* left rail: watchlist + portfolio */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {/* --- watchlist --- */}
        {panels.watchlist && (
        <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "9px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>{t("WATCHLIST")}</div>
          {watchlist.map(s => {
            const r = getRow(s);
            if (!r) return null;
            const on = s === selected;
            return (
              <button
                key={s}
                className="wl-row"
                onClick={() => setSelected(s)}
                style={{
                  display: "flex", width: "100%", justifyContent: "space-between", alignItems: "baseline",
                  padding: "9px 12px", background: on ? "#171E2C" : "transparent",
                  border: "none", borderLeft: `2px solid ${on ? C.amber : "transparent"}`,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: on ? C.amber : C.text }}>{s}</span>
                <span style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{fmt(r.price)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: dirColor(r.chg) }}>{pct(r.chgPct)}</div>
                </span>
              </button>
            );
          })}
        </div>
        )}

        </div>

        {/* --- chart + stats --- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: "0.04em" }}>{selected}</span>
              {selectedRow?.name && <span style={{ color: C.muted, fontSize: 12 }}>{selectedRow.name}</span>}
              <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: accent }}>{fmt(selectedRow?.price)}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: live && liveBad[selected] ? C.down : dirColor(selectedRow?.chg) }}>
                {selectedRow?.chg != null
                  ? `${selectedRow.chg >= 0 ? "+" : ""}${fmt(selectedRow.chg)} (${pct(selectedRow.chgPct)})`
                  : live && liveBad[selected] ? "unrecognized symbol" : "waiting for data…"}
              </span>
              {liveStale && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.amber, border: `1px solid ${C.amberDim}`, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.08em" }}>
                  MARKET CLOSED
                </span>
              )}
              <button onClick={() => openChart(selected)} title="Open the full interactive TradingView chart inside Vantage"
                style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "5px 12px", cursor: "pointer" }}>
                📈 {t("full chart")}
              </button>
            </div>

            <div style={{ height: 300, marginTop: 10 }}>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: C.faint, fontSize: 10, fontFamily: MONO }} minTickGap={48} axisLine={{ stroke: C.panelEdge }} tickLine={false} />
                    <YAxis domain={yDomain} tick={{ fill: C.faint, fontSize: 10, fontFamily: MONO }} width={56} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                    <Tooltip
                      contentStyle={{ background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, fontFamily: MONO, fontSize: 12 }}
                      labelStyle={{ color: C.muted }} itemStyle={{ color: C.text }}
                      formatter={v => [fmt(v), "price"]}
                    />
                    {selectedRow?.prevClose != null && (
                      <ReferenceLine y={selectedRow.prevClose} stroke={C.faint} strokeDasharray="4 4"
                        label={{ value: `prev ${fmt(selectedRow.prevClose)}`, fill: C.faint, fontSize: 10, fontFamily: MONO, position: "insideTopRight" }} />
                    )}
                    <Area type="monotone" dataKey="price" stroke={accent} strokeWidth={1.8} fill="url(#fillArea)" isAnimationActive={false} dot={false} />
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
                          style={{ fontFamily: MONO, fontSize: 12, color: C.bg, background: C.amber, border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}
                        >
                          Switch to {suggestSym(selected)}
                        </button>
                      )}
                    </>
                  ) : live ? "building session tape from live quotes — first points arrive within seconds" : "no data"}
                </div>
              )}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: liveStale ? C.amber : C.faint, marginTop: 6 }}>
              {live
                ? (liveStale
                    ? `LIVE · market closed — last trade ${liveStale.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}. Price is frozen until the next session; switch to Demo mode to see an animated tape.`
                    : "LIVE · quotes via Finnhub, polled every 15s · chart accumulates this session's polls")
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
              <div key={label} style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: C.muted }}>{label}</div>
                <div style={{
                  fontFamily: MONO, fontSize: 15, fontWeight: 600, marginTop: 3,
                  color: label.startsWith("CHANGE") ? dirColor(val) : C.text,
                }}>
                  {label === "CHANGE %" ? pct(val) : fmt(val)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* right rail: movers + trade */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {/* --- movers --- */}
        {panels.movers && (
        <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "9px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>{t("TOP MOVERS")}</div>
          {movers.length === 0 && <div style={{ padding: 12, fontFamily: MONO, fontSize: 11, color: C.faint }}>waiting for quotes…</div>}
          {movers.map(r => (
            <button key={r.sym} className="wl-row" onClick={() => setSelected(r.sym)}
              style={{ display: "block", width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.text }}>{r.sym}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: dirColor(r.chg) }}>{pct(r.chgPct)}</span>
              </div>
              <div style={{ height: 3, background: C.grid, borderRadius: 2, marginTop: 6 }}>
                <div style={{
                  height: 3, borderRadius: 2, background: dirColor(r.chg),
                  width: `${Math.min(100, Math.abs(r.chgPct) * 22)}%`,
                }} />
              </div>
            </button>
          ))}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
            {t("ranked by |Δ%| across your watchlist")}
          </div>
        </div>
        )}

        {/* --- news & video (right rail) --- */}
        {panels.news && (
        <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted }}>NEWS &amp; VIDEO</span>
            <span style={{ display: "flex", gap: 6 }}>
              {news?.news?.length > 0 && (
                <button
                  onClick={() => {
                    const anchorName = CHARACTERS.find(c => c.id === characterId)?.name || "the desk";
                    const script = `This is ${anchorName} with the ${newsFor} brief. ` +
                      news.news.map((n, i) => `Story ${i + 1}, from ${n.source}: ${n.title}.`).join(" ") +
                      " That's the tape. Back to you.";
                    speak("broadcast", script);
                  }}
                  style={{ background: "rgba(255,179,0,0.12)", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 3, fontFamily: MONO, fontSize: 10, fontWeight: 600, padding: "3px 8px", cursor: "pointer" }}>
                  ● on air
                </button>
              )}
              <button onClick={fetchNews} disabled={newsBusy}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: newsBusy ? C.faint : C.amber, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "3px 8px", cursor: newsBusy ? "default" : "pointer" }}>
                {newsBusy ? "searching…" : news ? "refresh" : `load ${selected}`}
              </button>
            </span>
          </div>
          {newsErr && <div style={{ padding: "8px 12px", fontFamily: MONO, fontSize: 10, color: C.down }}>{newsErr}</div>}
          {!news && !newsBusy && !newsErr && (
            <div style={{ padding: 12, fontFamily: MONO, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
              Live web search for {selected} headlines and YouTube coverage — hit load.
            </div>
          )}
          {news?.news?.map((n, i) => (
            <a key={`n${i}`} href={newsHref(n)} target="_blank" rel="noopener noreferrer" className="wl-row"
              style={{ display: "block", padding: "9px 12px", textDecoration: "none", borderTop: i === 0 ? "none" : `1px solid ${C.panelEdge}` }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.45 }}>{n.title}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 3 }}>{n.source} ↗</div>
            </a>
          ))}
          {news?.videos?.length > 0 && (
            <div style={{ padding: "7px 12px 3px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: C.faint, borderTop: `1px solid ${C.panelEdge}` }}>VIDEO</div>
          )}
          {news?.videos?.map((v, i) => (
            <button key={`v${i}`} onClick={() => openVideo(v)} className="wl-row"
              style={{ display: "block", width: "100%", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.45 }}>
                <span style={{ color: C.down }}>▶</span> {v.title}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 3 }}>{v.channel} · plays in the desk theater</div>
            </button>
          ))}
          {news && newsFor !== selected && (
            <div style={{ padding: "6px 12px 10px", fontFamily: MONO, fontSize: 9, color: C.faint }}>
              showing {newsFor} — refresh for {selected}
            </div>
          )}
        </div>
        )}

        {/* --- Portfolio (right rail) --- */}
        {panels.portfolio && (
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted }}>💼 PORTFOLIO</span>
              {positions.length > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: dirColor(portTotals.pnl) }}>{portTotals.pnl >= 0 ? "+" : ""}{fmt(portTotals.pnl)} ({portTotals.pnlPct >= 0 ? "+" : ""}{portTotals.pnlPct.toFixed(2)}%)</span>
                  <button onClick={briefPortfolio} title="Anchor briefs your portfolio" style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.amber, borderRadius: 3, fontFamily: MONO, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>▶</button>
                </span>
              )}
            </div>
            {portfolioRows.map(r => (
              <button key={r.id} className="wl-row" onClick={() => setSelected(r.sym)}
                style={{ display: "block", width: "100%", padding: "8px 12px", background: "transparent", border: "none", borderTop: `1px solid ${C.grid}`, cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.text }}>{r.sym} <span style={{ color: C.faint, fontWeight: 400, fontSize: 10 }}>×{r.shares}</span></span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: dirColor(r.pnl) }}>{r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)}`}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>@{fmt(r.cost / r.shares)} → {r.price != null ? fmt(r.price) : "—"}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: dirColor(r.pnl) }}>{r.pnlPct == null ? "" : `${r.pnlPct >= 0 ? "+" : ""}${r.pnlPct.toFixed(1)}%`}</span>
                  <span onClick={e => { e.stopPropagation(); removePosition(r.id); }} style={{ fontFamily: MONO, fontSize: 10, color: C.faint, cursor: "pointer" }}>✕</span>
                </div>
              </button>
            ))}
            <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderTop: `1px solid ${C.panelEdge}` }}>
              <input value={portForm.sym} onChange={e => setPortForm(f => ({ ...f, sym: e.target.value.toUpperCase() }))} placeholder="SYM" aria-label="Symbol"
                style={{ width: 52, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 10, padding: "5px 5px" }} />
              <input value={portForm.shares} onChange={e => setPortForm(f => ({ ...f, shares: e.target.value }))} placeholder="qty" inputMode="decimal" aria-label="Shares"
                style={{ width: 44, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 10, padding: "5px 5px" }} />
              <input value={portForm.cost} onChange={e => setPortForm(f => ({ ...f, cost: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPosition()} placeholder="$ cost" inputMode="decimal" aria-label="Cost basis"
                style={{ flex: 1, minWidth: 0, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 10, padding: "5px 5px" }} />
              <button onClick={addPosition} aria-label="Add position" style={{ background: C.amber, border: "none", color: "#141414", borderRadius: 4, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "0 9px", cursor: "pointer" }}>+</button>
            </div>
            {positions.length === 0 && <div style={{ padding: "0 12px 10px", fontFamily: MONO, fontSize: 9, color: C.faint, lineHeight: 1.5 }}>Add a holding: symbol, share count, and your cost per share.</div>}
          </div>
        )}

        {/* --- Price alerts (right rail, only when armed) --- */}
        {priceAlerts.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "9px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, borderBottom: `1px solid ${C.panelEdge}` }}>⏰ PRICE ALERTS</div>
            {priceAlerts.map(a => {
              const row = getRow(a.sym); const cur = row?.price;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.grid}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{a.sym}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: a.op === ">" ? C.up : C.down }}>{a.op === ">" ? "▲ ≥" : "▼ ≤"} {fmt(a.price)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginLeft: "auto" }}>now {cur != null ? fmt(cur) : "—"}</span>
                  <button onClick={() => removeAlert(a.id)} aria-label="Remove alert" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 11 }}>✕</button>
                </div>
              );
            })}
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.panelEdge}`, fontFamily: MONO, fontSize: 9, color: C.faint, lineHeight: 1.5 }}>Say "alert me when {selected} hits {fmt((getRow(selected)?.price || 100) * 1.05, 0)}" to add more.</div>
          </div>
        )}

        {/* --- Vantage Calendar (native, right rail) --- */}
        {panels.calendar && (
          <div id="app-calendar-panel" style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted }}>📅 CALENDAR</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>saved on this device</span>
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
              {r && <rect x={r.x - pad} y={r.y - pad} width={r.w + pad * 2} height={r.h + pad * 2} rx="8" fill="none" stroke={C.amber} strokeWidth="2" />}
            </svg>
            <div style={{ position: "absolute", width: TIPW, left: tip.left, top: tip.top, maxHeight: maxH, overflowY: "auto", background: C.panel, border: `1px solid ${C.amber}`, borderRadius: 8, padding: 16, boxShadow: "0 16px 50px rgba(0,0,0,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: C.faint }}>TOUR · {tourStep + 1}/{TOUR_STEPS.length}</span>
                <button onClick={endSpotlight} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>{t("exit")} ✕</button>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, letterSpacing: "0.04em", color: C.amber, marginTop: 6 }}>{t(step.title)}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.65, color: C.text, marginTop: 8 }}>{t(step.body)}</div>
              <div style={{ display: "flex", gap: 4, margin: "12px 0" }}>
                {TOUR_STEPS.map((_, i) => (
                  <button key={i} onClick={() => setTourStep(i)} aria-label={`Step ${i + 1}`}
                    style={{ flex: 1, height: 3, borderRadius: 2, border: "none", padding: 0, cursor: "pointer", background: i <= tourStep ? C.amber : C.grid }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={endSpotlight} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>{t("skip tour")}</button>
                <div style={{ display: "flex", gap: 6 }}>
                  {tourStep > 0 && (
                    <button onClick={() => setTourStep(s => s - 1)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>{t("Back")}</button>
                  )}
                  <button onClick={() => (last ? endSpotlight() : setTourStep(s => s + 1))} style={{ background: C.amber, border: "none", color: "#141414", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 16px", cursor: "pointer" }}>{last ? t("Done") : t("Next")}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== anchor-led auto demo: a slim banner while the desk drives itself ===== */}
      {demoRunning && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 65, display: "flex", alignItems: "center", gap: 12, background: C.panel, border: `1px solid ${C.amber}`, borderRadius: 999, padding: "7px 8px 7px 16px", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", fontFamily: MONO, fontSize: 12, color: C.text }}>
          <span className="cursor" style={{ color: C.down }}>▶</span> Demo — the anchor is driving
          <button onClick={stopDemo} style={{ background: "rgba(246,70,93,0.14)", border: `1px solid ${C.down}`, color: C.down, borderRadius: 999, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 14px", cursor: "pointer" }}>■ stop</button>
        </div>
      )}

      {/* ===== interactive missions: a docked checklist that ticks off as you use the app ===== */}
      {missionsOpen && (() => {
        const done = MISSIONS.filter(m => missionsDone.has(m.id)).length;
        const allDone = done === MISSIONS.length;
        return (
          <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 55, width: 264, maxWidth: "92vw", background: C.panel, border: `1px solid ${C.amber}`, borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.55)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.panelEdge}` }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.amber, letterSpacing: "0.08em" }}>🎯 GETTING STARTED · {done}/{MISSIONS.length}</span>
              <button onClick={() => setMissionsOpen(false)} aria-label="Close missions" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontFamily: MONO, fontSize: 12 }}>✕</button>
            </div>
            <div style={{ padding: "6px 12px 10px" }}>
              {MISSIONS.map(m => {
                const ok = missionsDone.has(m.id);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: `1px solid ${C.grid}` }}>
                    <span style={{ color: ok ? C.up : C.faint, fontFamily: MONO, fontSize: 13, lineHeight: 1.3 }}>{ok ? "☑" : "☐"}</span>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: ok ? C.faint : C.text, textDecoration: ok ? "line-through" : "none" }}>{m.label}</span>
                      {!ok && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 1 }}>{m.hint}</span>}
                    </span>
                  </div>
                );
              })}
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, borderRadius: 2, background: C.grid, overflow: "hidden" }}>
                  <div style={{ width: `${(done / MISSIONS.length) * 100}%`, height: "100%", background: C.amber, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: allDone ? C.up : C.muted, marginTop: 8, textAlign: "center" }}>
                  {allDone ? "🎉 You've got it — you're a Vantage pro." : "Do these in the app; they check off automatically."}
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
            style={{ width: 520, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.amber}`, borderRadius: 12, padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, letterSpacing: "0.04em", color: C.amber }}>⚙️ SETUP GUIDE</div>
              <button onClick={() => setSetupOpen(false)} style={{ background: "transparent", border: "none", color: C.faint, fontFamily: MONO, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: C.text, marginTop: 10 }}>
              Vantage works right now in <b style={{ color: C.text }}>demo mode with nothing set up</b>. Here's what each key adds and where to get it — <b style={{ color: C.amber }}>only the first is needed</b> for the desk to answer; the rest are optional extras.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {SETUP_STEPS.map((s, i) => (
                <div key={i} style={{ background: "#0D121C", border: `1px solid ${s.req ? C.amber : C.panelEdge}`, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{s.icon}</span>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: C.text }}>{s.name}</span>
                    <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em", color: s.req ? "#141414" : C.faint, background: s.req ? C.amber : "transparent", border: `1px solid ${s.req ? C.amber : C.panelEdge}`, borderRadius: 999, padding: "2px 8px" }}>{s.need.toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.muted, marginTop: 7 }}>{s.what}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.text, marginTop: 5 }}>
                    <span style={{ color: C.faint }}>How: </span>{s.how}{" "}
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{s.link}</a>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button onClick={() => { setSetupOpen(false); setSettingsTab("quick"); setShowSettings(true); }}
                style={{ flex: 1, minWidth: 180, background: C.amber, border: "none", color: "#141414", borderRadius: 5, fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: "10px 0", cursor: "pointer" }}>
                Open Settings → paste the AI key →
              </button>
              <button onClick={() => setSetupOpen(false)}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 5, fontFamily: MONO, fontSize: 12, padding: "10px 18px", cursor: "pointer" }}>
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
          <div style={{ width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.amber}`, borderRadius: 12, padding: 24, boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: "0.1em", color: C.amber }}>
              VANTAGE <span style={{ fontSize: 11, letterSpacing: "0.08em", color: C.faint, fontWeight: 500 }}>· GETTING STARTED</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: C.text, marginTop: 10 }}>
              Your AI market desk — an animated anchor that charts stocks, answers out loud, reads the news, even plays trailers. Pick how you'd like to learn it:
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.6, color: C.muted, marginTop: 8, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "8px 10px" }}>
              💡 <b style={{ color: C.text }}>No setup required to explore.</b> Everything here runs in demo mode. The only key worth adding is for the AI desk — its answers come from external AI models that bill to <i>your</i> account, so they need your key. Everything else (live prices, streaming, video) is optional.
            </div>
            {!aiReady() && (
              <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.6, color: C.down, marginTop: 8, background: "rgba(246,70,93,0.08)", border: `1px solid ${C.down}`, borderRadius: 6, padding: "8px 10px" }}>
                ⚠ <b>No AI key set up yet.</b> Charts, news, games, streaming and the calendar all work — but the desk can't answer questions until you add one.{" "}
                <button onClick={() => { setShowTutorial(false); setSetupOpen(true); }} style={{ background: "transparent", border: "none", color: C.amber, textDecoration: "underline", cursor: "pointer", fontFamily: MONO, fontSize: 10.5, padding: 0 }}>Set it up →</button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              {[
                { icon: "🔦", title: "Take the guided tour", desc: "I'll spotlight each part of the screen and talk you through it, step by step.", cta: "Start tour", on: launchSpotlight },
                { icon: "▶", title: "Watch me demo it", desc: "Sit back — I'll drive: chart a stock, ask a question, open a chart, ring the bell.", cta: "Play demo", on: runDemo },
                { icon: "🎯", title: "Try the missions", desc: "Six hands-on tasks that check off automatically as you do them in the app.", cta: "Show missions", on: launchMissions },
                { icon: "⚙️", title: "Set it up (keys & options)", desc: "What each key does, which are needed, and where to get them — the AI key and the optional extras.", cta: "Setup guide", on: () => { setShowTutorial(false); setSetupOpen(true); } },
              ].map((o, i) => (
                <button key={i} onClick={o.on}
                  style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 14, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.amber} onMouseLeave={e => e.currentTarget.style.borderColor = C.panelEdge}>
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{o.icon}</span>
                  <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: C.text }}>{o.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{o.desc}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.amber, whiteSpace: "nowrap" }}>{o.cta} →</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>Replay anytime from Settings → DATA SOURCE</span>
              <button onClick={() => setShowTutorial(false)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.muted; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.panelEdge; e.currentTarget.style.color = C.muted; }}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 5, fontFamily: MONO, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "8px 16px", whiteSpace: "nowrap", transition: "border-color .12s, color .12s" }}>
                {t("skip — I'll explore on my own")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== settings modal ===== */}
      {showSettings && (
        <div role="dialog" aria-label="Settings"
          style={{ position: "fixed", inset: 0, background: "rgba(5,8,13,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 520, maxWidth: "94vw", maxHeight: "86vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 8 }}>

            {/* tab bar */}
            <div style={{ display: "flex", borderBottom: `1px solid ${C.panelEdge}`, position: "sticky", top: 0, background: C.panel }}>
              {[["account", "ACCOUNT"], ["quick", "START"], ["data", "DATA"], ["models", "AI"], ["anchor", "VOICE"], ["meetings", "MEET"]].map(([id, label]) => (
                <button key={id} onClick={() => setSettingsTab(id)}
                  style={{
                    flex: 1, padding: "12px 0", background: "transparent", cursor: "pointer",
                    border: "none", borderBottom: `2px solid ${settingsTab === id ? C.amber : "transparent"}`,
                    color: settingsTab === id ? C.amber : C.muted,
                    fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                  }}>{t(label)}</button>
              ))}
            </div>

            <div style={{ padding: 18 }}>
              {/* ---- START HERE tab: the easy path — one key + a plain-language status board ---- */}
              {settingsTab === "quick" && (() => {
                const or = aiModels.find(m => m.id === "openrouter") || {};
                const aiReady = planAllows("ai") && aiModels.some(m => m.enabled && (isLocalModel(m) || (m.kind === "claude" ? anthropicApiKey.trim() : (m.apiKey || "").trim())));
                const meetOn = !!(meetStatus?.zoom?.connected || meetStatus?.google?.connected);
                const chips = [
                  { label: t("AI desk"), ready: aiReady, note: aiReady ? t("ready") : t("add key ↑"), tab: "models" },
                  { label: t("Voice"), ready: true, note: elevenKey ? "ElevenLabs" : t("browser"), tab: "anchor" },
                  { label: t("Live quotes"), ready: mode === "live" && !!apiKey, note: (mode === "live" && apiKey) ? t("live") : t("demo"), tab: "data" },
                  { label: t("Real videos"), ready: !!youtubeKey, note: youtubeKey ? t("on") : t("optional"), tab: "data" },
                  { label: t("Streaming"), ready: !!tmdbKey, note: tmdbKey ? t("on") : t("optional"), tab: "data" },
                  { label: t("Calendar"), ready: true, note: t("built-in"), tab: "data" },
                  { label: t("Meetings"), ready: meetOn, note: meetOn ? t("connected") : t("optional"), tab: "meetings" },
                ];
                return (
                  <div style={{ display: "grid", gap: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: C.text, background: "rgba(255,179,0,0.06)", border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "10px 12px" }}>
                      👋 <b style={{ color: C.amber }}>{t("You're already set up.")}</b> {t("Vantage runs right now in demo mode — no keys needed. The one thing worth adding is an AI key so the desk can actually answer you:")}
                    </div>

                    {/* the ONE essential */}
                    <div>
                      <label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", color: aiReady ? C.up : C.amber }}>
                        {aiReady ? `● ${t("AI DESK IS ON")}` : `⚡ ${t("TURN ON THE AI DESK — paste one key")}`}
                      </label>
                      <input value={or.apiKey || ""} onChange={e => updateModel("openrouter", { apiKey: e.target.value.trim() })} type="password"
                        placeholder="OpenRouter API key (sk-or-…)"
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 8, background: "#0D121C", border: `1px solid ${aiReady ? C.up : C.amber}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "10px" }} />
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                        {t("One key unlocks the whole desk — OpenRouter gives you dozens of models (GPT, Llama, more) behind a single key, and it's the primary model.")}{" "}
                        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("get a key")} ↗</a>
                        <br />{t("No AI key? The desk still can't answer, but everything else — charts, news, games, streaming, calendar — works without it.")}
                      </div>
                    </div>

                    {/* status board */}
                    <div>
                      <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("WHAT'S SET UP")} <span style={{ color: C.faint }}>· {t("tap to configure")}</span></label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                        {chips.map(c => (
                          <button key={c.label} onClick={() => setSettingsTab(c.tab)}
                            style={{ display: "flex", alignItems: "center", gap: 7, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 5, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
                            <span style={{ color: c.ready ? C.up : C.faint, fontSize: 12 }}>{c.ready ? "●" : "○"}</span>
                            <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{c.label}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: c.ready ? C.up : C.faint, marginLeft: "auto" }}>{c.note}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* quick actions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => { setShowSettings(false); setTutStep(0); setShowTutorial(true); }}
                        style={{ flex: 1, minWidth: 140, background: "transparent", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "9px 0", cursor: "pointer" }}>
                        ↺ {t("tour · demo · missions")}
                      </button>
                      <button onClick={() => setSettingsTab("anchor")}
                        style={{ flex: 1, minWidth: 140, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "9px 0", cursor: "pointer" }}>
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
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("PANELS")}</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      {[["tape", "ticker tape"], ["watchlist", "watchlist"], ["movers", "top movers"], ["news", "news & video"], ["calendar", "calendar"], ["portfolio", "portfolio"]].map(([k, label]) => (
                        <label key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 11, color: panels[k] ? C.text : C.faint, cursor: "pointer" }}>
                          <input type="checkbox" checked={panels[k]} onChange={() => togglePanel(k)} />
                          {t(label)}
                        </label>
                      ))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontFamily: MONO, fontSize: 11, color: breakingOn ? C.text : C.faint, cursor: "pointer" }}>
                      <input type="checkbox" checked={breakingOn} onChange={() => setBreakingOn(v => !v)} />
                      ⚡ {t("breaking-news alerts during live trading")}
                    </label>
                    <div style={{ marginTop: 14 }}>
                      <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("CLOCK TIMEZONE")}</label>
                      <select value={clockTz} onChange={e => setClockTz(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }}>
                        <optgroup label="Americas">
                          {TIMEZONES.filter(z => z.group === "Americas").map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                        </optgroup>
                        <optgroup label="Europe">
                          {TIMEZONES.filter(z => z.group === "Europe").map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                        </optgroup>
                      </select>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
                        {t("Sets the header clock. The market OPEN/CLOSED badge always tracks NYSE (Eastern) hours.")}
                      </div>
                    </div>
                    <button onClick={() => { setTutStep(0); setShowTutorial(true); setShowSettings(false); }}
                      style={{ marginTop: 12, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, padding: "7px 12px", cursor: "pointer" }}>
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
                        if (mm === "live") {
                          const trimmed = keyDraft.trim();
                          if (trimmed) setApiKey(trimmed);
                        }
                      }}
                        style={{
                          flex: 1, padding: "9px 0", borderRadius: 4, cursor: locked ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: 12, fontWeight: 600,
                          background: mode === mm ? C.amber : "transparent",
                          color: locked ? C.faint : mode === mm ? "#141414" : C.muted,
                          border: `1px solid ${mode === mm ? C.amber : C.panelEdge}`,
                          opacity: locked ? 0.6 : 1,
                        }}>{t(mm.toUpperCase())}{locked ? " 🔒" : ""}</button>
                      );
                    })}
                    {lockChip("finnhub")}
                  </div>
                  {mode === "demo" && (
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                      {t("Demo mode runs a seeded random-walk market engine — a reproducible simulated session, no key or network needed.")}
                    </div>
                  )}
                  {mode === "live" && (
                    <>
                      <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("FINNHUB API KEY (free tier works)")}</label>
                      <input
                        value={keyDraft} onChange={e => {
                          const next = e.target.value;
                          setKeyDraft(next);
                          if (mode === "live") setApiKey(next.trim());
                        }} type="password"
                        placeholder={t("paste key")}
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px" }}
                      />
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                        {t("Key is saved on this device and sent only to finnhub.io.")}{" "}
                        <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("get a free key")} ↗</a>
                      </div>
                      <TestBtn kind="finnhub" />
                    </>
                  )}

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.panelEdge}` }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                      {t("YOUTUBE DATA API KEY")} <span style={{ color: C.faint }}>{t("(optional — real, playable video results)")}</span>
                      {lockChip("youtube")}
                    </label>
                    <input
                      value={youtubeKeyDraft} disabled={!planAllows("youtube")} onChange={e => {
                        const next = e.target.value;
                        setYoutubeKeyDraft(next);
                        setYoutubeKey(next.trim());
                      }} type="password"
                      placeholder={planAllows("youtube") ? t("paste key (AIza…)") : `${t("needs")} ${planFor("youtube")}`}
                      style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px", opacity: planAllows("youtube") ? 1 : 0.5 }}
                    />
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                      {t("Without a key, \"show videos of …\" asks Claude to guess videos (often unembeddable). With one, the desk pulls real embeddable results from YouTube.")}{" "}
                      <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("enable API")} ↗</a>{" · "}
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("get a key")} ↗</a>
                    </div>
                    <TestBtn kind="youtube" />
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.panelEdge}` }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                      {t("TMDB API KEY")} <span style={{ color: C.faint }}>{t("(optional — in-app Netflix / Disney+ / Hulu catalog + trailers)")}</span>
                      {lockChip("tmdb")}
                    </label>
                    <input
                      value={tmdbKey} disabled={!planAllows("tmdb")} onChange={e => setTmdbKey(e.target.value.trim())} type="password"
                      placeholder={planAllows("tmdb") ? t("paste TMDB API key (v3 auth)") : `${t("needs")} ${planFor("tmdb")}`}
                      style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px", opacity: planAllows("tmdb") ? 1 : 0.5 }}
                    />
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                      {t("Powers \"what's on netflix\", \"browse hulu shows\", \"what's on disney+\" — real libraries with posters, ratings & in-desk trailers. Playback still opens on the service (they block embedding); public-domain films play fully in-desk via \"free movies …\" (no key needed).")}{" "}
                      <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("get a free key")} ↗</a>
                    </div>
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.panelEdge}` }}>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("DAILY BRIEF")} <span style={{ color: C.faint }}>{t("(auto-download while the app is open)")}</span></label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{t("at")}</span>
                      <input type="time" value={briefTime} onChange={e => setBriefTime(e.target.value)}
                        style={{ background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px" }} />
                      <select value={briefFormat} onChange={e => setBriefFormat(e.target.value)}
                        style={{ background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px" }}>
                        <option value="pptx">PowerPoint</option>
                        <option value="docx">Word</option>
                        <option value="xlsx">Excel</option>
                      </select>
                      {briefTime && <button onClick={() => setBriefTime("")} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "6px 10px", cursor: "pointer" }}>{t("off")}</button>}
                      <button onClick={runDailyBrief} style={{ background: "transparent", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "6px 10px", cursor: "pointer" }}>{t("run now")}</button>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                      {briefTime
                        ? t("Each day at {time}, the desk writes an analyst report on {sym} and downloads a {fmt} brief automatically. Requires this tab to be open (browsers can't run it closed) and an Anthropic key for the write-up.").replace("{time}", to12h(briefTime)).replace("{sym}", selected).replace("{fmt}", briefFormat.toUpperCase())
                        : t("Set a time to auto-generate and download a branded report each day. Leave blank to disable.")}
                    </div>
                  </div>
                </>
              )}

              {/* ---- MODELS tab ---- */}
              {settingsTab === "models" && (
                <div style={{ display: "grid", gap: 12 }}>
                  {!planAllows("ai") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.amber, background: "rgba(255,179,0,0.08)", border: `1px solid ${C.amber}`, borderRadius: 6, padding: "8px 10px" }}>
                      {lockChip("ai")} {t("AI desk answers need {plan}. Models below are disabled until you upgrade (or turn on developer mode in ACCOUNT).").replace("{plan}", planFor("ai"))}
                    </div>
                  )}
                  <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.muted, background: "rgba(255,179,0,0.06)", border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "8px 10px" }}>
                    <b style={{ color: C.text }}>{enabledCount > 1 ? t("{n} models enabled").replace("{n}", enabledCount) : t("One model at a time")}.</b>{" "}
                    {lang === "en"
                      ? <>Use <span style={{ color: C.amber }}>only this</span> for a single model, or enable several — the desk answers in <b style={{ color: C.text }}>one box</b>, trying them top-to-bottom and <b style={{ color: C.text }}>falling back to the next if one errors</b> (e.g. Claude → OpenRouter).</>
                      : t("Use \"only this\" for a single model, or enable several — the desk answers in one box, trying them top-to-bottom and falling back to the next if one errors (e.g. Claude → OpenRouter).")}
                  </div>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.text, cursor: "pointer", border: `1px solid ${fallbackLocal ? C.amber : C.panelEdge}`, borderRadius: 6, padding: "8px 10px" }}>
                    <input type="checkbox" checked={fallbackLocal} onChange={e => setFallbackLocal(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>
                      <b style={{ color: fallbackLocal ? C.amber : C.text }}>{t("Auto-fallback to a local model.")}</b>{" "}
                      {t("If Claude fails (no credits, bad key, offline), the desk and reports retry on your local model (Ollama or LM Studio) automatically. Configure one below — set its BASE URL and start the local server.")}
                    </span>
                  </label>
                  {aiModels.map(mm => (
                    <div key={mm.id} style={{ border: `1px solid ${mm.enabled ? C.amberDim || C.panelEdge : C.panelEdge}`, borderRadius: 6, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 12, fontWeight: 600, color: mm.enabled ? C.text : C.faint, cursor: "pointer" }}>
                          <input type="checkbox" checked={mm.enabled} disabled={!planAllows("ai")} onChange={e => updateModel(mm.id, { enabled: e.target.checked })} />
                          {mm.label}
                          {mm.enabled && enabledCount === 1 && <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 3, padding: "1px 5px" }}>{t("ACTIVE")}</span>}
                        </label>
                        <button onClick={() => soloModel(mm.id)}
                          disabled={mm.enabled && enabledCount === 1}
                          title={`Turn off every other model and use only ${mm.label}`}
                          style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: (mm.enabled && enabledCount === 1) ? C.faint : C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "3px 9px", cursor: (mm.enabled && enabledCount === 1) ? "default" : "pointer", whiteSpace: "nowrap" }}>
                          {t("use only this")}
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <div style={{ flex: 2, minWidth: 180 }}>
                          <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>{t("BASE URL")}</label>
                          <input value={mm.baseUrl || ""} onChange={e => updateModel(mm.id, { baseUrl: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", marginTop: 3, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 8px" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 110 }}>
                          <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>{t("MODEL")}</label>
                          <input value={mm.model || ""} onChange={e => updateModel(mm.id, { model: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", marginTop: 3, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 8px" }} />
                          {mm.id === "openrouter" && (
                            <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 3, lineHeight: 1.4 }}>
                              {t("format:")} <span style={{ color: C.muted }}>provider/model</span> — {t("e.g.")} openai/gpt-4o-mini, meta-llama/llama-3.3-70b-instruct.{" "}
                              <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("browse models")} ↗</a>
                            </div>
                          )}
                          {mm.id === "proton" && (
                            <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 3, lineHeight: 1.4 }}>
                              {t("Proton Lumo has no official hosted API yet — run a local OpenAI-compatible bridge and point BASE URL at it.")}{" "}
                              <a href="https://github.com/carlostkd/Lumo-Api" target="_blank" rel="noopener noreferrer" style={{ color: C.amber }}>{t("Lumo bridge")} ↗</a>
                            </div>
                          )}
                        </div>
                        {(mm.kind === "claude" || mm.needsKey) && (
                          <div style={{ flexBasis: "100%" }}>
                            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>
                              {t("API KEY")} ·{" "}
                              <a href={mm.kind === "claude" ? "https://console.anthropic.com/settings/keys" : mm.id === "gemini" ? "https://aistudio.google.com/apikey" : mm.id === "openrouter" ? "https://openrouter.ai/keys" : "https://platform.openai.com/api-keys"}
                                target="_blank" rel="noopener noreferrer" style={{ color: C.amber, letterSpacing: "0.04em" }}>
                                {t("get a key")} ↗
                              </a>
                            </label>
                            <input type="password" value={mm.kind === "claude" ? anthropicApiKey : (mm.apiKey || "")}
                              onChange={e => mm.kind === "claude" ? setAnthropicApiKey(e.target.value) : updateModel(mm.id, { apiKey: e.target.value })}
                              placeholder={t("paste key")}
                              style={{ width: "100%", boxSizing: "border-box", marginTop: 3, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 8px" }} />
                            <TestBtn kind={mm.id} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, lineHeight: 1.7 }}>
                    {lang === "en" ? (
                      <>Local endpoints need CORS enabled to accept requests from this page:<br />
                      · Ollama — start with <span style={{ color: C.muted }}>OLLAMA_ORIGINS="https://claude.ai"</span> (or *)<br />
                      · LM Studio — Developer tab → enable server + turn on CORS<br />
                      The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).</>
                    ) : (
                      <>{t("Local endpoints need CORS enabled to accept requests from this page:")}<br />
                      · Ollama — {t("start with")} <span style={{ color: C.muted }}>OLLAMA_ORIGINS="https://claude.ai"</span> ({t("or")} *)<br />
                      · LM Studio — {t("Developer tab → enable server + turn on CORS")}<br />
                      {t("The LM Studio slot works with anything speaking the OpenAI chat format (llama.cpp, vLLM…).")}</>
                    )}
                  </div>
                </div>
              )}

              {/* ---- ANCHOR tab ---- */}
              {settingsTab === "anchor" && (
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("ANCHOR")}</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 8 }}>
                      {CHARACTERS.map(c => (
                        <button key={c.id} onClick={() => setCharacterId(c.id)}
                          style={{
                            padding: "10px 0", borderRadius: 6, cursor: "pointer",
                            fontFamily: MONO, fontSize: 11, fontWeight: 600,
                            background: characterId === c.id ? "rgba(255,179,0,0.12)" : "transparent",
                            color: characterId === c.id ? C.amber : C.muted,
                            border: `1px solid ${characterId === c.id ? C.amber : C.panelEdge}`,
                          }}>{c.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("ENVIRONMENT")}</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 8 }}>
                      {ENVIRONMENTS.map(ev => (
                        <button key={ev.id} onClick={() => setEnvId(ev.id)}
                          style={{
                            padding: "10px 0", borderRadius: 6, cursor: "pointer",
                            fontFamily: MONO, fontSize: 11, fontWeight: 600,
                            background: envId === ev.id ? "rgba(255,179,0,0.12)" : "transparent",
                            color: envId === ev.id ? C.amber : C.muted,
                            border: `1px solid ${envId === ev.id ? C.amber : C.panelEdge}`,
                          }}>{ev.name}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("BACKGROUND CREW")}</label>
                    <select
                      value={crewId} onChange={e => setCrewId(e.target.value)}
                      style={{ width: "100%", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px" }}>
                      <option value="auto">{t("Auto — whoever isn't anchoring")}</option>
                      <option value="off">{t("Off — solo broadcast")}</option>
                      {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("VOICE ENGINE")} {lockChip("elevenlabs")}</label>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {[["browser", t("BROWSER · free")], ["elevenlabs", "ELEVENLABS"]].map(([id, label]) => {
                        const locked = id === "elevenlabs" && !planAllows("elevenlabs"); // studio voice needs Trading Floor
                        return (
                        <button key={id} disabled={locked} onClick={() => { if (locked) { setSettingsTab("account"); return; } setVoiceEngine(id); }}
                          style={{
                            flex: 1, padding: "9px 0", borderRadius: 4, cursor: locked ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: 11, fontWeight: 600,
                            background: voiceEngine === id ? C.amber : "transparent",
                            color: locked ? C.faint : voiceEngine === id ? "#141414" : C.muted,
                            border: `1px solid ${voiceEngine === id ? C.amber : C.panelEdge}`,
                            opacity: locked ? 0.6 : 1,
                          }}>{label}{locked ? " 🔒" : ""}</button>
                        );
                      })}
                    </div>
                  </div>
                  {voiceEngine === "elevenlabs" && (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div>
                        <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                          {t("ELEVENLABS API KEY")}
                          <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: C.amber, letterSpacing: "0.04em" }}>
                            {t("get a key ↗")}
                          </a>
                        </label>
                        <input
                          value={elevenKeyDraft} onChange={e => {
                            const next = e.target.value;
                            setElevenKeyDraft(next);
                            const cleaned = next.trim();
                            setElevenKey(cleaned);
                            if (typeof window !== "undefined") {
                              if (cleaned) window.localStorage.setItem("tape-eleven-key", cleaned);
                              else window.localStorage.removeItem("tape-eleven-key");
                            }
                            if (cleaned) loadElevenVoices(cleaned);
                          }} type="password"
                          placeholder={t("paste key")}
                          style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 13, padding: "9px 10px" }}
                        />
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
                          {t("Held in memory only, sent only to api.elevenlabs.io. Uses eleven_flash_v2_5 for low latency — each read costs quota characters.")}
                        </div>
                        <TestBtn kind="eleven" />
                      </div>
                      {elevenVoices.length > 0 && (
                        <div>
                          <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("ELEVENLABS VOICE")}</label>
                          <select
                            value={elevenVoiceId} onChange={e => setElevenVoiceId(e.target.value)}
                            style={{ width: "100%", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px" }}>
                            {elevenVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                      )}
                      {elevenErr && <div style={{ fontFamily: MONO, fontSize: 10, color: C.down }}>{elevenErr}</div>}
                      {elevenVoices.length === 0 && !elevenErr && (
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{t("Paste a key and hit Apply — voices load automatically.")}</div>
                      )}
                    </div>
                  )}
                  {voiceEngine === "browser" && (
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                      {t("VOICE")} {voices.length > 0 && <span style={{ color: C.faint, letterSpacing: 0 }}>· {voices.length} {t("free")}</span>}
                    </label>
                    <select
                      value={voiceName} onChange={e => setVoiceName(e.target.value)}
                      style={{ width: "100%", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px" }}>
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
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                      {t("READING SPEED")} · {speechRate.toFixed(2)}x
                    </label>
                    <input type="range" min="0.7" max="1.5" step="0.02" value={speechRate}
                      onChange={e => setSpeechRate(+e.target.value)}
                      style={{ width: "100%", marginTop: 6, accentColor: C.amber }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={autoSpeak} onChange={e => setAutoSpeak(e.target.checked)} />
                    {t("auto-read the first answer that finishes")}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={uiSounds} onChange={e => setUiSounds(e.target.checked)} />
                    {t("UI click sounds — terminal blips on every button")}
                  </label>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                      {t("SOUND VOLUME")} · {(soundVolume * 100).toFixed(0)}%
                    </label>
                    <input type="range" min="0" max="1" step="0.01" value={soundVolume}
                      onChange={e => setSoundVolume(+e.target.value)}
                      style={{ width: "100%", marginTop: 6, accentColor: C.amber }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={musicOn} onChange={e => toggleMusic(e.target.checked)} />
                    ♪ {t("ambient music")} — {musicSource === "spotify" ? t("your Spotify playlist, docked bottom-right") : t("generative synth, ducks under the anchor's voice")}
                  </label>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("MUSIC SOURCE")}</label>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[["synth", "Synth"], ["spotify", "Spotify"]].map(([id, label]) => (
                        <button key={id} onClick={() => setMusicSource(id)}
                          style={{ flex: 1, background: musicSource === id ? "rgba(255,179,0,0.14)" : "transparent", border: `1px solid ${musicSource === id ? C.amber : C.panelEdge}`, color: musicSource === id ? C.amber : C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "7px 0", cursor: "pointer" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {musicSource === "spotify" ? (
                    <div>
                      <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>{t("SPOTIFY PLAYLIST / ALBUM / TRACK LINK")}</label>
                      <input
                        value={spotifyUri}
                        onChange={e => setSpotifyUri(e.target.value)}
                        placeholder="https://open.spotify.com/playlist/…"
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${spotifyEmbedUrl(spotifyUri) ? C.panelEdge : C.down}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }}
                      />
                      <div style={{ fontFamily: MONO, fontSize: 10, color: spotifyEmbedUrl(spotifyUri) ? C.faint : C.down, marginTop: 6, lineHeight: 1.6 }}>
                        {spotifyEmbedUrl(spotifyUri)
                          ? t("No login needed — turn on ♪ and the player docks bottom-right. (Spotify's embed plays 30-second previews without an account; full tracks play automatically if you're already signed in to Spotify in this browser.)")
                          : t("Paste a Spotify share link — open Spotify → any playlist/album/track → Share → Copy link.")}
                      </div>

                      {/* Optional full playback via OAuth (Premium) — collapsed so it never demands a login */}
                      <details style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.panelEdge}` }}>
                        <summary style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted, cursor: "pointer" }}>
                          {t("OPTIONAL · CONNECT A PREMIUM ACCOUNT FOR FULL TRACKS")}
                        </summary>
                        <label style={{ display: "block", marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                          {t("FULL PLAYBACK · SPOTIFY PREMIUM")}{" "}
                          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: C.amber, letterSpacing: "0.04em" }}>{t("create an app ↗")}</a>
                          {" "}{lockChip("spotify")}
                        </label>
                        {spotifyReady ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                            <span style={{ fontFamily: MONO, fontSize: 11, color: C.up }}>{t("● connected — full tracks enabled")}</span>
                            <button onClick={disconnectSpotify}
                              style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "5px 10px", cursor: "pointer" }}>{t("disconnect")}</button>
                          </div>
                        ) : (
                          <>
                            <input
                              value={spotifyClientId}
                              onChange={e => setSpotifyClientId(e.target.value)}
                              placeholder={t("Spotify app Client ID")}
                              style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, padding: "8px 10px" }}
                            />
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
                              {lang === "en"
                                ? <>In your Spotify app settings, add this exact <b style={{ color: C.muted }}>Redirect URI</b>:</>
                                : <>{t("In your Spotify app settings, add this exact Redirect URI:")}</>}<br />
                              <code style={{ color: C.amber, wordBreak: "break-all" }}>{spotifyRedirect()}</code>
                              {!/^https:|127\.0\.0\.1/.test(spotifyRedirect()) && (
                                <span style={{ color: C.down }}><br />⚠ {t("Spotify requires https or 127.0.0.1 — open this app at http://127.0.0.1:5173 (not localhost) and register that.")}</span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                              {(() => { const ok = planAllows("spotify") && spotifyClientId.trim(); return (
                              <button onClick={() => { if (!planAllows("spotify")) { setSettingsTab("account"); return; } connectSpotify(); }} disabled={!ok}
                                style={{ background: ok ? "#1DB954" : C.panelEdge, color: ok ? "#0B0E14" : C.faint, border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: ok ? "pointer" : "default" }}>
                                {planAllows("spotify") ? t("Connect Spotify") : `${t("Connect Spotify")} 🔒`}
                              </button>
                              ); })()}
                              {spotifyAuth && !spotifyReady && <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{t("connecting…")}</span>}
                            </div>
                          </>
                        )}
                        {spotifyErr && <div style={{ fontFamily: MONO, fontSize: 10, color: C.down, marginTop: 8 }}>{spotifyErr}</div>}
                      </details>
                    </div>
                  ) : (
                    <div>
                      <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: C.muted }}>
                        {t("MUSIC VOLUME")} · {(musicVolume * 100).toFixed(0)}%
                      </label>
                      <input type="range" min="0" max="1" step="0.01" value={musicVolume}
                        onChange={e => setMusicVolume(+e.target.value)}
                        style={{ width: "100%", marginTop: 6, accentColor: C.amber }} />
                    </div>
                  )}
                  <button
                    onClick={() => speak("preview", `This is ${CHARACTERS.find(c => c.id === characterId)?.name} at the Vantage desk. ${selected} is currently trading at ${fmt(selectedRow?.price)}.`)}
                    style={{ background: "transparent", border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "9px 0", cursor: "pointer" }}>
                    ▶ {t("preview voice")}
                  </button>
                </div>
              )}

              {/* ---- MEETINGS tab ---- */}
              {settingsTab === "meetings" && (
                <div style={{ display: "grid", gap: 12 }}>
                  {/* zero-setup: just open a new meeting in a tab (uses your existing Zoom/Google login, no OAuth app) */}
                  <div style={{ border: `1px solid ${C.amber}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.amber }}>⚡ {t("Go Live — no setup")}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{t("Instantly start a new meeting in a browser tab (uses whatever you're already logged into), then screen-share Vantage. No keys, no OAuth.")}</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => window.open("https://meet.new", "_blank", "noopener")}
                        style={{ background: "#00897B", color: "#fff", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer" }}>{t("New Google Meet")} ↗</button>
                      <button onClick={() => window.open("https://zoom.us/start/videomeeting", "_blank", "noopener")}
                        style={{ background: "#2D8CFF", color: "#fff", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer" }}>{t("New Zoom meeting")} ↗</button>
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
                            <a href={liveMeeting} target="_blank" rel="noopener noreferrer" style={{ background: C.down, color: "#fff", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "6px 16px", cursor: "pointer", textDecoration: "none" }}>{t("Join")} ↗</a>
                            <button onClick={() => navigator.clipboard?.writeText(liveMeeting)} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>{t("copy link")}</button>
                            <button onClick={() => setLiveMeeting("")} style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>{t("end")}</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input value={liveMeetDraft} onChange={e => setLiveMeetDraft(e.target.value)}
                            placeholder={t("paste your meeting link to pin it as LIVE…")}
                            style={{ flex: 1, minWidth: 160, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 11, padding: "7px 9px" }} />
                          <button onClick={() => { const u = liveMeetDraft.trim(); if (/^https?:\/\//.test(u)) { setLiveMeeting(u); setLiveMeetDraft(""); } }}
                            style={{ background: C.amber, color: "#141414", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "7px 14px", cursor: "pointer" }}>{t("Pin")}</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.muted, background: "rgba(255,179,0,0.06)", border: `1px solid ${C.panelEdge}`, borderRadius: 6, padding: "8px 10px" }}>
                    {lang === "en"
                      ? <><b style={{ color: C.text }}>Or</b>, for meetings created & tracked <b style={{ color: C.text }}>inside</b> Vantage (with join links here), connect your own OAuth apps below — see <code style={{ color: C.amber }}>MEETINGS_SETUP.md</code>. This is the part that needs <code style={{ color: C.amber }}>.env</code> credentials.</>
                      : t("Or, for meetings created & tracked inside Vantage (with join links here), connect your own OAuth apps below — see MEETINGS_SETUP.md. This is the part that needs .env credentials.")}
                  </div>

                  {meetStatus === null ? (
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.down, border: `1px solid ${C.down}`, borderRadius: 6, padding: "10px 12px", lineHeight: 1.7 }}>
                      ⚠ {t("Backend not reachable. Start it in the project folder:")}
                      <div style={{ color: C.amber, marginTop: 6, wordBreak: "break-all" }}>node --env-file=.env server/index.js</div>
                      <button onClick={refreshMeetStatus} style={{ marginTop: 8, background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 10, padding: "5px 12px", cursor: "pointer" }}>{t("retry")}</button>
                    </div>
                  ) : (
                    [["zoom", "Zoom", "#2D8CFF", "https://marketplace.zoom.us/develop/create", "Z"], ["google", "Google Meet", "#00897B", "https://console.cloud.google.com/apis/credentials", "M"]].map(([id, name, col, setupUrl, letter]) => {
                      const st = meetStatus[id] || {};
                      const pill = st.connected ? { fg: C.up, label: t("connected") } : st.configured ? { fg: C.muted, label: t("not connected") } : { fg: C.down, label: t("not configured (.env)") };
                      return (
                        <div key={id} style={{ border: `1px solid ${st.connected ? C.amber : C.panelEdge}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 12, background: `linear-gradient(160deg, ${col}14, transparent 55%)` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 30, height: 30, borderRadius: 8, background: col, display: "grid", placeItems: "center", fontFamily: SANS, fontSize: 15, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{letter}</span>
                            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{name}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", color: pill.fg, background: `${pill.fg}1A`, border: `1px solid ${pill.fg}44`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: pill.fg }} />{pill.label}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {!st.connected ? (
                              // connecting stores tokens under your account, so a backend session is required.
                              // no token (guest / local-only account) → bounce to the ACCOUNT tab to sign in.
                              <>
                                <button onClick={() => { if (!account?.token) { setSettingsTab("account"); return; } window.location.href = `/api/${id}/login?token=${encodeURIComponent(account.token)}`; }} disabled={!st.configured}
                                  title={!account?.token ? "Sign in with an account (backend running) to connect your own Zoom/Google" : undefined}
                                  style={{ flex: "1 1 auto", background: st.configured ? C.amber : "transparent", color: st.configured ? "#141414" : C.faint, border: st.configured ? "none" : `1px solid ${C.panelEdge}`, borderRadius: 5, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "9px 16px", cursor: st.configured ? "pointer" : "not-allowed" }}>
                                  {!account?.token ? t("Sign in to connect") : `${t("Connect")} ${name} ↗`}
                                </button>
                                {!st.configured && <a href={setupUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: C.amber, textDecoration: "none", border: `1px solid ${C.amber}55`, borderRadius: 5, padding: "8px 12px", whiteSpace: "nowrap" }}>{t("create app")} ↗</a>}
                              </>
                            ) : (
                              <>
                                <button onClick={() => createMeeting(id)} disabled={meetBusy === id}
                                  style={{ background: C.amber, color: "#141414", border: "none", borderRadius: 5, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "9px 16px", cursor: meetBusy === id ? "default" : "pointer", opacity: meetBusy === id ? 0.6 : 1 }}>
                                  {meetBusy === id ? t("creating…") : `＋ ${t("New meeting")}`}
                                </button>
                                <button onClick={() => disconnectMeet(id)}
                                  style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 5, fontFamily: MONO, fontSize: 11, padding: "9px 12px", cursor: "pointer" }}>{t("disconnect")}</button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {meetErr && <div style={{ fontFamily: MONO, fontSize: 10, color: C.down }}>✗ {meetErr}</div>}

                  {meetings.length > 0 && (
                    <div style={{ borderTop: `1px solid ${C.panelEdge}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>{t("RECENT MEETINGS")}</label>
                      {meetings.map((mt, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontFamily: MONO, fontSize: 11 }}>
                          <span style={{ color: C.muted }}>{mt.provider === "zoom" ? "Zoom" : "Meet"} · {mt.at}</span>
                          <a href={mt.join_url} target="_blank" rel="noopener noreferrer" style={{ color: C.amber, textDecoration: "none" }}>open ↗</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ---- ACCOUNT tab: who's signed in, plan management, sign out (Layers 1 & 3) ---- */}
              {settingsTab === "account" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {!account ? (
                    // guest: no account yet — offer to sign out (which returns to the auth gate)
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: C.text }}>{t("You're exploring as a guest")}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>{t("Create a free account to save your plan across visits. Your watchlist, portfolio and settings already persist on this device either way.")}</div>
                      <button onClick={() => { setShowSettings(false); onSignOut?.(); }}
                        style={{ background: C.amber, color: "#0B0E14", border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 700, fontSize: 13, padding: "10px 18px", cursor: "pointer" }}>{t("Sign in / create account")}</button>
                    </div>
                  ) : (<>
                    {/* identity card */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#0D121C", border: `1px solid ${C.panelEdge}`, borderRadius: 8, padding: 14 }}>
                      <span style={{ width: 40, height: 40, borderRadius: "50%", background: C.amber, color: "#0B0E14", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, fontFamily: SANS, flex: "0 0 auto" }}>
                        {(account.name || account.email).trim().charAt(0).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: C.text }}>{account.name || account.email.split("@")[0]}</div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, wordBreak: "break-all" }}>{account.email}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.up, marginTop: 3 }}>{account.backend ? t("secured on server") : t("stored on this device")}</div>
                      </div>
                    </div>

                    {/* plan chooser */}
                    <div>
                      <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", color: C.faint }}>{t("YOUR PLAN")}</label>
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        {PLANS.map(p => {
                          const on = account.plan === p.id;
                          const paid = p.id !== "free";
                          return (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, border: `1.5px solid ${on ? C.amber : C.panelEdge}`, borderRadius: 8, padding: "10px 12px", background: on ? "rgba(255,179,0,0.06)" : "transparent" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: C.text }}>{p.label} <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, fontWeight: 400 }}>{p.price}{p.cadence === "forever" ? "" : p.cadence}</span></div>
                                <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{p.tagline}</div>
                              </div>
                              {on ? (
                                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.amber, whiteSpace: "nowrap" }}>{t("CURRENT")}</span>
                              ) : (
                                <button onClick={() => startPlanChange(p.id)} disabled={!!billingBusy}
                                  style={{ background: paid ? C.amber : "transparent", color: paid ? "#0B0E14" : C.amber, border: paid ? "none" : `1px solid ${C.amber}`, borderRadius: 5, fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "7px 14px", cursor: billingBusy ? "default" : "pointer", opacity: billingBusy ? 0.6 : 1, whiteSpace: "nowrap" }}>
                                  {billingBusy === p.id ? "…" : paid ? t("Upgrade") : t("Switch")}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* billing honesty: say plainly whether a real charge could happen */}
                      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                        {billingCfg?.enabled
                          ? t("Paid upgrades open Stripe's secure checkout (test mode). Card details are entered on Stripe, never here.")
                          : t("No payment processor is connected, so paid plans are unlocked as a simulation — no card is asked for and nothing is charged.")}
                      </div>
                    </div>

                    <button onClick={() => { setShowSettings(false); onSignOut?.(); }}
                      style={{ alignSelf: "flex-start", background: "transparent", border: `1px solid ${C.panelEdge}`, color: "#ff8a8a", borderRadius: 6, fontFamily: MONO, fontSize: 11, padding: "8px 14px", cursor: "pointer" }}>{t("Sign out")}</button>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, lineHeight: 1.6 }}>{t("Terms & Privacy accepted")} {account.agreedAt ? "· v" + LEGAL_VERSION : ""}. {t("This account UI is a prototype; see the security note in the code.")}</div>
                  </>)}

                  {/* developer / testing mode — bypasses ALL plan gates so every premium feature is testable now */}
                  <div style={{ marginTop: 4, paddingTop: 12, borderTop: `1px solid ${C.panelEdge}` }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.text, cursor: "pointer" }}>
                      <input type="checkbox" checked={devMode} onChange={e => setDevMode(e.target.checked)} style={{ marginTop: 2 }} />
                      <span>
                        <b style={{ color: devMode ? C.amber : C.text }}>{t("Developer mode (testing).")}</b>{" "}
                        {t("Unlocks every premium feature regardless of plan — AI desk, live data, YouTube, TMDB, Spotify and the ElevenLabs voice. You still need each feature's own API key to actually use it. Not for production.")} <span style={{ color: C.faint }}>{lang === "en" ? <>(also toggles with <code style={{ color: C.muted }}>?dev=1</code> in the URL)</> : <>({t("also toggles with ?dev=1 in the URL")})</>}</span>
                      </span>
                    </label>
                    {devMode && <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: C.amber, marginTop: 6 }}>● {t("DEV MODE ON — all plan gates bypassed")}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 18px 18px" }}>
              <button onClick={() => setShowSettings(false)}
                style={{ background: "transparent", border: `1px solid ${C.panelEdge}`, color: C.muted, borderRadius: 4, fontFamily: MONO, fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>{t("Close")}</button>
              <button onClick={() => {
                setApiKey(keyDraft.trim());
                const ek = elevenKeyDraft.trim();
                persistElevenKey(ek);
                if (ek) loadElevenVoices(ek);
                setJustApplied(true);
                setTimeout(() => setJustApplied(false), 1500);
              }}
                style={{ background: justApplied ? C.up : C.amber, border: "none", color: "#141414", borderRadius: 4, fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "8px 14px", cursor: "pointer" }}>
                {justApplied ? `✓ ${t("Applied")}` : t("Apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  App — the default export. Decides between the auth gate and the dashboard.
//  The gate is SKIPPABLE ("Explore in demo mode") so the app keeps its zero-setup
//  identity: guests get the full dashboard, accounts additionally get a saved plan
//  and a header chip. The heavy MarketDashboard only mounts once we're past the gate,
//  so no rules-of-hooks juggling and the demo never runs behind a locked screen.
// ============================================================
export default function App() {
  // account: a signed-in user; guest: chose to skip the gate. Either one lets us in.
  const [account, setAccount] = useState(loadAccount);
  const [guest, setGuest] = useState(false);

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
    saveAccount(null); setAccount(null); setGuest(false);
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
      {(!account && !guest)
        ? <AuthScreen onAuthed={signIn} onGuest={() => setGuest(true)} />
        : <MarketDashboard account={account} onSignOut={signOut} onChangePlan={changePlan} />}
    </I18nContext.Provider>
  );
}