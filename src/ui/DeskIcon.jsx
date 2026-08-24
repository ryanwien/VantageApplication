// ============================================================
//  DeskIcon — the marks the desk uses for the things it can put on itself.
//
//  WHY THESE ARE NOT EMOJI
//  They were. Three problems, in order of how much they matter:
//
//   1. An emoji renders as a different picture on every platform, so the desk
//      was a different desk on a Mac and a PC, and neither matched the design.
//   2. An emoji cannot take a colour. The old markup set `color: accentText`
//      on one and precisely nothing happened — the glyph carries its own
//      palette, which is also why it can never invert on an accent tile.
//   3. At 15px beside 13px sans they read as decoration stuck to the label
//      rather than as the icon a card is built around.
//
//  Strokes in currentColor, so the tile decides the colour and an accent tile
//  actually inverts. Drawing conventions match the composer's mic, which was
//  already an SVG: a 24 grid, 2px strokes, round caps and joins.
//
//  ONE SET, ONE MEANING
//  The same name is used by the verb card that opens a thing and by the header
//  of the card that opens — click a briefcase, get a briefcase. Two marks for
//  one idea is how an interface stops being learnable.
// ============================================================

import React from "react";

export default function DeskIcon({ name, size = 18 }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": true, focusable: "false",
  };
  switch (name) {
    case "news":
      return (
        <svg {...p}>
          <path d="M4 5h13v14H5a1 1 0 0 1-1-1V5Z" />
          <path d="M17 9h3v9a1 1 0 0 1-1 1h-2" />
          <path d="M7.5 8.5h6M7.5 12h6M7.5 15.5h3" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...p}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "report":
      return (
        <svg {...p}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
          <path d="M14 3v5h5" />
          <path d="M8.5 13h7M8.5 16.5h4" />
        </svg>
      );
    // The navigator answers "take me to X", so: a destination, not a document.
    case "navigator":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    // ---- story card verbs ----
    case "external":
      return (
        <svg {...p}>
          <path d="M13.5 4.5H19.5V10.5" />
          <path d="M19.5 4.5 11 13" />
          <path d="M18 14.2v4.3a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4.3" />
        </svg>
      );
    // A globe: the ring, the equator, and ONE meridian drawn as an ellipse.
    // Two meridians is the conventional drawing and it is one too many here —
    // at 15px the three curves close up into a filled blob. The ellipse is
    // also what stops the circle-plus-line reading as a no-entry sign.
    case "globe":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <ellipse cx="12" cy="12" rx="4.2" ry="9" />
        </svg>
      );
    // Reading a story out loud is sound leaving the desk, so: a speaker.
    case "speaker":
      return (
        <svg {...p}>
          <path d="M11.5 4.5 6.5 9H3.2v6h3.3l5 4.5V4.5Z" />
          <path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.4 6.4a8 8 0 0 1 0 11.2" />
        </svg>
      );
    case "stop":
      return <svg {...p}><rect x="5.5" y="5.5" width="13" height="13" rx="2" /></svg>;

    // ---- navigation and menus ----
    // These replace box-drawing characters — ◈ ▤ ▧ ◧ ▦ for the five nav
    // destinations, ◆ and ⚙ in the account menu. At 13px on a dark bar those
    // are five slightly different grey rectangles: they occupy the space an
    // icon would and carry none of the meaning, which is worse than no icon
    // at all, because the eye stops to read them.

    // The product is a broadcast desk, so the desk is a signal: a source with
    // two pairs of arcs coming off it. Not a monitor — every other mark in
    // this set that could be a monitor already is one.
    case "desk":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="2.2" />
          <path d="M7.9 8.1a5.6 5.6 0 0 0 0 7.8M16.1 8.1a5.6 5.6 0 0 1 0 7.8" />
          <path d="M5 5.2a9.8 9.8 0 0 0 0 13.6M19 5.2a9.8 9.8 0 0 1 0 13.6" />
        </svg>
      );
    case "plan":
      return (
        <svg {...p}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19M6.5 14.8h4" />
        </svg>
      );
    case "sheet":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9.4h18M3 14.8h18M9.6 9.4V20" />
        </svg>
      );
    case "deck":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="11" rx="2" />
          <path d="M12 15v3.2M8.4 20.6 12 18.2l3.6 2.4" />
        </svg>
      );
    case "pen":
      return (
        <svg {...p}>
          <path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L8 18.2l-4 1 1-4L16.6 3.6Z" />
          <path d="M14.6 5.6l3 3" />
        </svg>
      );
    case "download":
      return (
        <svg {...p}>
          <path d="M12 3.6v10.8M7.6 10.6 12 15l4.4-4.4" />
          <path d="M4 16.8v2.2a1.4 1.4 0 0 0 1.4 1.4h13.2a1.4 1.4 0 0 0 1.4-1.4v-2.2" />
        </svg>
      );
    case "headphones":
      return (
        <svg {...p}>
          <path d="M4.2 14.6v-2.4a7.8 7.8 0 0 1 15.6 0v2.4" />
          <rect x="2.4" y="13.6" width="4.4" height="7" rx="2.2" />
          <rect x="17.2" y="13.6" width="4.4" height="7" rx="2.2" />
        </svg>
      );
    case "music":
      return (
        <svg {...p}>
          <path d="M9 17.6V5.6l10-2v12" />
          <circle cx="6.5" cy="17.6" r="2.5" />
          <circle cx="16.5" cy="15.6" r="2.5" />
        </svg>
      );
    case "check":
      return <svg {...p}><path d="M4.5 12.4 9.4 17.3 19.5 6.7" /></svg>;
    // A door with an arrow leaving it, not a power symbol. ⏻ means "turn the
    // machine off", which is a bigger promise than this button keeps.
    case "signout":
      return (
        <svg {...p}>
          <path d="M14.5 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v11.6a1.7 1.7 0 0 0 1.7 1.7h8.3" />
          <path d="M15 15.5 19.5 12 15 8.5M19.5 12h-9" />
        </svg>
      );

    // ---- getting started ----
    // The handoff's welcome screen sets these as Unicode in mono tiles (▶, ⚙)
    // and as numbers ("01", "6"). Its README says of exactly that: "If the
    // codebase has an icon set, substitute equivalents rather than shipping
    // Unicode." This is that set. The numbers go too — a column mixing digits
    // and glyphs reads as four unrelated things, and both counts are already
    // stated in the rows' own copy.
    // A lamp, its beam, and the pool of light it lands in. The pool is
    // load-bearing: the first draft was a lamp over an open cone with a
    // crossbar through it, which at 20px is the letter A.
    case "spotlight":
      return (
        <svg {...p}>
          <path d="M9.6 3h4.8l1 4.6H8.6L9.6 3Z" />
          <path d="M8.7 7.6 5.2 16M15.3 7.6 18.8 16" />
          <ellipse cx="12" cy="17.4" rx="6.8" ry="2.6" />
        </svg>
      );
    case "play":
      return <svg {...p}><path d="M6.5 4.6 19 12 6.5 19.4V4.6Z" /></svg>;
    case "missions":
      return (
        <svg {...p}>
          <path d="M3.5 6.6 5.3 8.4 8.5 5" />
          <path d="M3.5 12.6 5.3 14.4 8.5 11" />
          <path d="M3.5 18.6 5.3 20.4 8.5 17" />
          <path d="M12 6.7h8.5M12 12.7h8.5M12 18.7h8.5" />
        </svg>
      );
    // Two sliders, not a cog. At 20px a cog's teeth close up into a blob,
    // and "keys & options" is a row of settings anyway.
    case "settings":
      return (
        <svg {...p}>
          <path d="M3.5 7.5h17M3.5 16.5h17" />
          <circle cx="9" cy="7.5" r="2.6" />
          <circle cx="15" cy="16.5" r="2.6" />
        </svg>
      );

    // ---- the game room ----
    // Games are things the desk puts on itself too, so they live in the same
    // set: the card in the menu and the header of the game it opens wear the
    // same mark, which is what stops a menu from being a list of strangers.
    case "games":
      return (
        <svg {...p}>
          <rect x="2" y="7" width="20" height="11" rx="4" />
          <path d="M7 10.5v4M5 12.5h4" />
          <path d="M16 11.5h.01M18.5 14h.01" />
        </svg>
      );
    case "school":
      return (
        <svg {...p}>
          <path d="M12 4 2.5 8.8 12 13.6l9.5-4.8L12 4Z" />
          <path d="M6.6 11v4.6c0 1.4 2.4 2.5 5.4 2.5s5.4-1.1 5.4-2.5V11" />
        </svg>
      );
    // Up or down, forking from one point — which is the whole question the
    // game asks on every round.
    case "bullbear":
      return (
        <svg {...p}>
          <path d="M13.5 5H19v5.5M19 5l-6.5 6.5" />
          <path d="M13.5 19H19v-5.5M19 19l-6.5-6.5" />
          <path d="M11 12H4" />
        </svg>
      );
    case "ticker":
      return (
        <svg {...p}>
          <path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1-.6-1.4V4.5A1.5 1.5 0 0 1 4.5 3H13a2 2 0 0 1 1.4.6l6.2 6.2a2 2 0 0 1 0 2.8Z" />
          <path d="M7.5 7.5h.01" />
        </svg>
      );
    case "cards":
      return (
        <svg {...p}>
          <rect x="9" y="3" width="12" height="16" rx="2" />
          <path d="M6 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" />
        </svg>
      );
    case "chess":
      return (
        <svg {...p}>
          <circle cx="12" cy="6" r="3" />
          <path d="M9.6 8.9c.2 2-1 3.4-2.1 4.9h9c-1.1-1.5-2.3-2.9-2.1-4.9" />
          <path d="M7.5 13.8 6 20h12l-1.5-6.2" />
          <path d="M4.5 20h15" />
        </svg>
      );
    // Two racks. The object of the game is a server, so the mark is the thing
    // you are trying to take down.
    case "algowars":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="7" rx="2" />
          <rect x="3" y="13" width="18" height="7" rx="2" />
          <path d="M7 7.5h.01M7 16.5h.01" />
        </svg>
      );
    case "chart":
    default:
      return (
        <svg {...p}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M7.5 15l3.5-4 3 2.5L20 7" />
        </svg>
      );
  }
}
