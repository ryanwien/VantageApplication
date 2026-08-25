// ============================================================
//  useSpeechProgress — how far through a read the desk is.
//
//  WHY IT IS A POLL AND NOT STATE
//  The desk keeps its position in a REF, updated on every word boundary (or
//  every audio timeupdate) — several times a second. Holding that in React
//  state would re-render the dashboard on every word. So the ref is the
//  channel and each readout polls it at 4Hz, which means a ticking clock
//  re-renders the small component showing it and nothing else. It is the same
//  arrangement the anchor's lip sync already uses for its analyser.
//
//  WHAT `frac` MEANS
//  Two different real things, depending on who is talking. On the studio voice
//  it is the audio playhead against a real duration. On browser speech
//  synthesis there is no playhead and no duration, so it is charIndex over the
//  script's length — how far through the WORDS the synth has read, which is a
//  fact of the same kind. `totalSec` is null on browser TTS because a total is
//  the one thing that engine genuinely cannot tell us, and a caller that
//  prints a denominator has to check for it.
//
//  Written for the News desk's on-air block; Stock School's narration player
//  needs precisely the same reading, so it lives here rather than twice.
// ============================================================

import { useState, useEffect } from "react";

export default function useSpeechProgress(progressRef, key) {
  const [p, setP] = useState({ frac: 0, elapsedSec: 0, totalSec: null });
  useEffect(() => {
    if (!progressRef) return undefined;
    const read = () => {
      const c = progressRef.current;
      const next = c && c.id === key
        ? {
          frac: Math.max(0, Math.min(1, c.frac || 0)),
          elapsedSec: Math.floor((c.elapsedMs || 0) / 1000),
          totalSec: c.totalMs ? Math.round(c.totalMs / 1000) : null,
        }
        : { frac: 0, elapsedSec: 0, totalSec: null };
      // Only when a rendered value actually moved — otherwise this is four
      // re-renders a second that draw the identical pixels.
      setP(prev => (
        prev.elapsedSec === next.elapsedSec
        && prev.totalSec === next.totalSec
        && Math.abs(prev.frac - next.frac) < 0.005
          ? prev
          : next
      ));
    };
    read();
    const iv = setInterval(read, 250);
    return () => clearInterval(iv);
  }, [progressRef, key]);
  return p;
}
