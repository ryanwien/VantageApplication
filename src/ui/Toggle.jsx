import React from "react";
import { C } from "./theme.js";

const WRAP = { position: "relative", display: "inline-flex", flexShrink: 0, width: 30, height: 17 };

// The pixels of a switch. Factored out so the interactive Toggle and the
// presentational ToggleGlyph below can never drift into two different switches.
//
// The knob TRAVELS on a transform, where it used to animate `left`. Two reasons,
// and the second is the real one: `left` is a layout property, so every frame of
// every throw re-laid-out the row the switch sits in — and this switch is in
// every settings row in the product. But the throw is also the one gesture in
// this interface that is literally a mechanism, and `left .15s` on the browser's
// default curve eases out of rest at both ends, which is how light moves. A
// switch leaves fast and stops dead. The curve and the squash live in
// global.css under .v-toggleknob; the travel is 13px because the track is 30
// wide, the knob 13, and it is inset 2 on both sides.
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
      <span aria-hidden="true" className="v-toggleknob" style={{
        position: "absolute", top: 2, left: 2, width: 13, height: 13, borderRadius: "50%",
        background: checked ? C.accent : C.faint,
        // The travel is a variable rather than a whole transform, so the press
        // squash in the stylesheet can compose with it instead of replacing it
        // — a bare `transform` in :active would throw the knob back to the left
        // edge for as long as you held the switch down.
        "--tx": checked ? "13px" : "0px",
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
