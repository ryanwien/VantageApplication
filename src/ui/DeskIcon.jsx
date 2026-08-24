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
