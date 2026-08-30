// ============================================================
//  ChunkBoundary — a net under React.lazy.
//
//  WHY THIS EXISTS
//  A dynamic import can fail for reasons that have nothing to do with this app
//  being wrong: a connection dropped mid-fetch, or — the common one in practice
//  — a tab left open across a deploy, asking for a hashed filename that no
//  longer exists on the server.
//
//  An unhandled throw out of a lazy component does not degrade that panel. It
//  takes the WHOLE tree down: React unmounts to a blank white page, and the
//  answer to "the network hiccupped for 200ms" becomes "the product is gone".
//  Suspense handles the WAIT and has nothing to say about the FAILURE, and an
//  error boundary is the only thing in React that can catch this — it cannot be
//  done with hooks.
//
//  WHAT RETRY ACTUALLY DOES
//  Bumping the key remounts the subtree, which is what makes React call the
//  lazy loader again; import() will re-request a module whose fetch rejected.
//  It cannot fix the stale-deploy case — that filename is gone for good — so
//  the copy points at a reload, which can.
//
//  A BOUNDARY CATCHES EVERYTHING, NOT JUST CHUNKS
//  Which is the one real cost: a genuine render bug inside the panel would also
//  arrive here and be dressed up as a loading problem. So in development the
//  error's own message is printed rather than hidden, and it always goes to the
//  console — a bug should stay loud, and only the blank page is worth
//  preventing.
// ============================================================
import React from "react";
import { C, MONO, SANS, R } from "./theme.js";

export default class ChunkBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Always, in every build. The boundary exists to stop a blank page, not to
    // stop anybody finding out what happened.
    console.error("[ChunkBoundary] a lazy panel failed to render", error, info);
  }

  retry() {
    this.setState(s => ({ error: null, attempt: s.attempt + 1 }));
  }

  render() {
    const { error, attempt } = this.state;
    const { children, label = "This panel", minHeight = 380 } = this.props;
    if (!error) {
      // Keyed on the attempt: the remount IS the retry.
      return <React.Fragment key={attempt}>{children}</React.Fragment>;
    }
    const dev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
    return (
      <div role="alert" style={{
        background: C.base, border: `1px solid ${C.edge}`, borderRadius: R.xl,
        minHeight, display: "grid", placeItems: "center", padding: 24, textAlign: "center",
      }}>
        <div style={{ maxWidth: 380 }}>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.text }}>
            {label} didn&#39;t load.
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.55, color: C.muted, marginTop: 8 }}>
            The connection dropped, or this tab has been open since before the last
            update. Try again — and if it keeps failing, reload the page.
          </div>
          {/* The message itself in development, so a real bug in the panel is
              not quietly disguised as a network problem. */}
          {dev && error?.message && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.down, marginTop: 10, wordBreak: "break-word" }}>
              {String(error.message).slice(0, 220)}
            </div>
          )}
          <button onClick={this.retry} className="v-primary" style={{
            marginTop: 16, background: C.accent, color: C.textOnAccent, border: "none",
            borderRadius: R.sm, padding: "9px 20px", fontFamily: SANS, fontSize: 13,
            fontWeight: 700, cursor: "pointer",
          }}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
