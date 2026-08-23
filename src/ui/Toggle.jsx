import React from "react";
import { C } from "./theme.js";

const WRAP = { position: "relative", display: "inline-flex", flexShrink: 0, width: 30, height: 17 };

// The pixels of a switch. Factored out so the interactive Toggle and the
// presentational ToggleGlyph below can never drift into two different switches.
function pixels(checked, disabled) {
  return (
    <>
      <span aria-hidden="true" style={{
        width: "100%", height: "100%", borderRadius: 999, boxSizing: "border-box",
        background: checked ? C.accentGlow : C.surfaceRaised,
        border: `1px solid ${checked ? C.accent : C.panelEdge}`,
        transition: "background .15s, border-color .15s",
        opacity: disabled ? 0.45 : 1,
      }} />
      <span aria-hidden="true" style={{
        position: "absolute", top: 2, left: checked ? 15 : 2, width: 13, height: 13, borderRadius: "50%",
        background: checked ? C.accent : C.faint,
        transition: "left .15s, background .15s",
        opacity: disabled ? 0.45 : 1,
      }} />
    </>
  );
}

// A switch, for settings that are truly on/off. The real control is a hidden
// checkbox, so a wrapping <label> keeps its native click-to-toggle and the
// keyboard/AT story stays the browser's — only the pixels are ours.
export default function Toggle({ checked, onChange, disabled = false }) {
  return (
    <span className="v-toggle" style={WRAP}>
      <input
        type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: disabled ? "default" : "pointer" }}
      />
      {pixels(checked, disabled)}
    </span>
  );
}

// The same switch with no control inside it, for a row that is ALREADY one
// button carrying aria-pressed. Nesting a checkbox inside a button is invalid
// HTML and hands assistive tech two controls where the user sees one — but the
// row still needs to look like the switch it behaves as, rather than printing
// its state as text. Purely decorative: the button it sits in owns the state.
export function ToggleGlyph({ checked, disabled = false }) {
  return <span aria-hidden="true" className="v-toggle" style={WRAP}>{pixels(checked, disabled)}</span>;
}
