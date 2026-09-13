// ============================================================
//  Picker — one of many, when showing them all would be a wall.
//
//  WHY THIS EXISTS INSTEAD OF A <select>
//  A native select opens a list the BROWSER draws, in its own window, at a
//  height the operating system chooses. Fine for eight timezones and wrong for
//  forty-odd studio voices: the list runs off the bottom of the settings panel
//  and past the window, there is no way to search it, and no amount of CSS can
//  cap it — the popup is not part of the document, so max-height never reaches
//  it. The colours could be fixed from the stylesheet. The shape could not.
//
//  So this is the same control the command palette already is: a search field
//  over a scrolling listbox, capped, with arrow keys and Enter. Deliberately
//  built in that idiom rather than as a second one — AppShell's palette is
//  where the keyboard behaviour was worked out (a kbdRef so a moving mouse does
//  not fight the arrow keys, an activeRef to keep the cursor in view), and a
//  product with two dropdowns that behave differently has a bug either way.
//
//  WHAT IT IS NOT
//  Not a combobox you can type free text into. Every value comes from the list
//  and the search only filters it, which is what the select it replaces
//  promised — so nothing downstream has to handle a value that was never on
//  offer.
// ============================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, SANS, TYPE, R, SHADOW, Z, field as fieldRecipe } from "./theme.js";

// Where the panel goes. FIXED rather than absolute because this opens inside a
// scrolling settings pane, and an absolutely-positioned child of an
// overflow:auto box is clipped by it — the list would be cut off by the very
// panel it is trying to escape.
function panelBox(rect, rows, hasSearch) {
  const GAP = 6, MARGIN = 12, ROW = 34;
  const wanted = Math.min(340, rows * ROW + (hasSearch ? 46 : 0) + 12);
  const below = window.innerHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  // Flip up only when below genuinely cannot hold it AND above is roomier. A
  // list that changes sides on every open is worse than one that scrolls.
  const up = below < Math.min(wanted, 200) && above > below;
  const maxHeight = Math.max(140, Math.min(wanted, up ? above : below));
  const width = Math.max(rect.width, 260);
  // Kept on screen horizontally: these sit at the right edge of a settings row.
  const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN);
  return up
    ? { left, bottom: window.innerHeight - rect.top + GAP, width, maxHeight }
    : { left, top: rect.bottom + GAP, width, maxHeight };
}

export default function Picker({
  id,
  value,
  onChange,
  options = [],        // [{ value, label, group?, note? }]
  label,               // accessible name; the visible one is the settings row's
  placeholder = "Search…",
  searchFrom = 8,      // below this many rows, a search field is just clutter
  empty = "Nothing matches that.",
  maxWidth = 240,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [box, setBox] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const activeRef = useRef(null);
  const kbdRef = useRef(false);   // a moving mouse must not steal the cursor mid-arrow-key

  const current = options.find(o => o.value === value);
  const hasSearch = options.length >= searchFrom;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(o =>
      String(o.label).toLowerCase().includes(needle) ||
      String(o.group || "").toLowerCase().includes(needle));
  }, [options, q]);

  // Opening lands the cursor on what is already chosen, not on row zero.
  // Arrowing away from somebody else's voice is how you pick the wrong one.
  const openNow = useCallback(() => {
    if (disabled) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setBox(panelBox(rect, Math.min(options.length, 10), options.length >= searchFrom));
    setQ("");
    setCursor(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  }, [disabled, options, value, searchFrom]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  const pick = useCallback((opt) => {
    if (!opt) return;
    onChange?.(opt.value);
    close();
  }, [onChange, close]);

  // Focus the search on open. With no search there is nothing to type into and
  // the arrow keys are already on the trigger, which keeps its focus.
  useEffect(() => { if (open && hasSearch) inputRef.current?.focus(); }, [open, hasSearch]);
  // Keep the cursor row in view as the arrows move it.
  useEffect(() => { if (open) activeRef.current?.scrollIntoView({ block: "nearest" }); }, [open, cursor]);
  // A scroll or a resize moves the row this is pinned to. Closing is cheaper
  // and less surprising than following it, and both are rare while open.
  //
  // The listener has to CAPTURE, because a scroll inside some other
  // overflow:auto box does not bubble to window — and capturing means it also
  // sees this panel's OWN list scrolling. That is not a reason to close: it is
  // the user reading. Worse, the cursor effect above calls scrollIntoView on
  // open, so with anything but the first row selected the panel scrolled itself
  // shut the instant it appeared. Anything originating inside the panel is
  // therefore ignored.
  useEffect(() => {
    if (!open) return;
    const shut = (e) => {
      if (e && e.target && panelRef.current && panelRef.current.contains(e.target)) return;
      close(false);
    };
    const onResize = () => close(false);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", shut, true);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("scroll", shut, true); };
  }, [open, close]);
  // Filtering can leave the cursor past the end of what is left.
  useEffect(() => { setCursor(c => Math.min(c, Math.max(0, shown.length - 1))); }, [shown.length]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); kbdRef.current = true; setCursor(c => Math.min(c + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); kbdRef.current = true; setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); kbdRef.current = true; setCursor(0); }
    else if (e.key === "End") { e.preventDefault(); kbdRef.current = true; setCursor(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") { close(false); }
  };

  const trigger = {
    ...fieldRecipe({ size: "sm" }),
    width: "auto", maxWidth, minWidth: 0,
    display: "flex", alignItems: "center", gap: 8,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    textAlign: "left",
  };

  let lastGroup = null;

  return (
    <>
      <button
        ref={btnRef} id={id} type="button" disabled={disabled}
        onClick={() => (open ? close() : openNow())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); openNow(); }
          else if (open) onKeyDown(e);
        }}
        role="combobox" aria-expanded={open} aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined} aria-label={label}
        style={trigger}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? current.label : "—"}
        </span>
        <span aria-hidden="true" style={{ color: C.faint, fontSize: 10, flex: "0 0 auto" }}>▾</span>
      </button>

      {open && box && (
        <>
          {/* Catches the click that closes. Transparent on purpose: this is a
              settings row, not a modal, and dimming the page behind a dropdown
              overstates what is happening. */}
          <div onMouseDown={() => close(false)} style={{ position: "fixed", inset: 0, zIndex: Z.modal }} />
          <div
            ref={panelRef}
            id={`${id}-list`} role="listbox" aria-label={label}
            aria-activedescendant={shown[cursor] ? `${id}-opt-${cursor}` : undefined}
            onKeyDown={onKeyDown}
            onMouseMove={() => { kbdRef.current = false; }}
            style={{
              position: "fixed", zIndex: Z.modal + 1,
              left: box.left, top: box.top, bottom: box.bottom, width: box.width,
              maxHeight: box.maxHeight, display: "flex", flexDirection: "column",
              background: C.surface, border: `1px solid ${C.edgeStrong}`,
              borderRadius: R.md, boxShadow: SHADOW.xl, overflow: "hidden",
            }}
          >
            {hasSearch && (
              <div style={{ padding: 8, borderBottom: `1px solid ${C.edge}`, flex: "0 0 auto" }}>
                <input
                  ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setCursor(0); }}
                  placeholder={placeholder} aria-label={`${label} — search`}
                  style={{
                    width: "100%", boxSizing: "border-box", background: C.surfaceRaised,
                    border: `1px solid ${C.edge}`, borderRadius: R.sm, outline: "none",
                    color: C.text, fontFamily: SANS, fontSize: 13.5, padding: "7px 10px",
                  }}
                />
              </div>
            )}

            <div style={{ overflowY: "auto", padding: 5, flex: "1 1 auto" }}>
              {shown.length === 0 && (
                <div style={{ padding: "22px 14px", textAlign: "center", ...TYPE.bodySm, color: C.faint }}>{empty}</div>
              )}
              {shown.map((o, i) => {
                const head = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group || lastGroup;
                const on = i === cursor;
                const chosen = o.value === value;
                return (
                  <React.Fragment key={o.value}>
                    {head && (
                      <div style={{ ...TYPE.eyebrowSm, color: C.faint, padding: "9px 10px 4px" }}>{head}</div>
                    )}
                    <button
                      id={`${id}-opt-${i}`} type="button"
                      role="option" aria-selected={chosen}
                      ref={on ? activeRef : undefined}
                      onClick={() => pick(o)}
                      onMouseEnter={() => { if (!kbdRef.current) setCursor(i); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "8px 10px", borderRadius: R.sm, border: "none", textAlign: "left",
                        cursor: "pointer", background: on ? C.surfaceRaised : "transparent",
                        color: on || chosen ? C.text : C.muted,
                        fontFamily: SANS, fontSize: 14,
                      }}
                    >
                      {/* The tick, not the highlight, is what says "this is the
                          one you have". The highlight belongs to the cursor, and
                          one colour cannot honestly mean both. */}
                      <span aria-hidden="true" style={{ width: 14, flex: "0 0 auto", color: C.accentText, fontSize: 12 }}>
                        {chosen ? "✓" : ""}
                      </span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                      {o.note && <span style={{ ...TYPE.eyebrowSm, color: C.faint, flex: "0 0 auto" }}>{o.note}</span>}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
