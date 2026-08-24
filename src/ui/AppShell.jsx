// ============================================================
//  AppShell — the application chrome: brand bar, primary navigation,
//  live status, account menu, and a command palette.
//
//  WHAT PROBLEM THIS SOLVES
//  Vantage previously had no navigation at all. Every surface — charts, news,
//  portfolio, the AI desk, games, settings — lived in one long scroll of
//  toggleable panels, discoverable only by scrolling or by already knowing it
//  was there. This shell gives the app a spine: a persistent place that says
//  what exists, what is live, and who you are signed in as.
//
//  DESIGN
//  Slim sticky header, logo left / sections centre / status + account right —
//  the pattern the reference sites converge on. Blurred translucent background
//  so content scrolling under it stays legible without a hard edge.
//
//  CONTRACT
//  Purely presentational: it renders chrome and calls back. It owns no market,
//  auth or AI state, which is what keeps it safe to drop over the existing
//  dashboard without touching how that dashboard works.
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { C, SANS, DISPLAY, TYPE, R, SP, SHADOW, Z, MOTION, button, chip } from "./theme.js";
import VantageMark from "./VantageMark.jsx";
// `icon` on a nav section, a command or a menu item is a DeskIcon NAME, not a
// glyph. It used to be a box-drawing character (◈ ▤ ▧ ◧ ▦ ◆ ⚙) rendered as
// text, which at 13px on a dark bar is five slightly different grey
// rectangles — the cost of an icon with none of the benefit.
import DeskIcon from "./DeskIcon.jsx";

const HEADER_H = 56;

// ---------- brand ----------
export function BrandMark({ compact = false, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Vantage — go to the desk"
      className="v-tap"
      style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      {/* The mark: a V drawn as a price line, dot at the terminus — see
          VantageMark for what it is meant to say. 26px is all a header logo
          ever gets, so 26px is the size it has to survive. */}
      <VantageMark size={26} />
      {!compact && (
        <span className="v-grad-text" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, letterSpacing: "-0.025em" }}>
          VANTAGE
        </span>
      )}
    </button>
  );
}

// ---------- market status ----------
// THE single status line for the whole app. The old UI said the same thing four
// times over — a LIVE DATA chip here, an OPEN/CLOSED badge beside it, a MARKET
// CLOSED · LAST TRADE chip on the desk head, and a LIVE chip on the command row
// — so a glance cost four reads and still left you unsure which one was
// authoritative. One derived value, said once, in a sentence.
//
// It is deliberately not a bordered chip: a box around a permanent fixture of
// the header reads as something you can act on. Green dot when the session is
// open, grey when it is not; the label carries the detail.
export function LiveBadge({ open, label, clock }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>
        <span
          className={open ? "v-pulse" : undefined}
          style={{ width: 7, height: 7, borderRadius: "50%", background: open ? C.up : C.faint, flexShrink: 0 }}
        />
        {label || (open ? "Market open" : "Market closed")}
      </span>
      {clock && (
        <span style={{ ...TYPE.num, fontSize: 12, color: C.muted, letterSpacing: "-0.013em" }}>{clock}</span>
      )}
    </div>
  );
}

// ---------- primary navigation ----------
// The active item is a filled tile. The underline this replaced was drawn in the
// accent gradient, which put green on the tab bar AND on the one primary action
// of every screen — the exact "nothing reads as primary" problem the redesign
// exists to fix. A neutral inset tile says "you are here" without spending the
// accent to say it.
function NavItem({ item, active, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onSelect(item)}
      aria-current={active ? "page" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "7px 14px", borderRadius: R.xs,
        background: active ? C.surfaceRaised : "transparent",
        border: "none",
        color: active ? C.text : hover ? C.text : C.muted,
        fontFamily: SANS, fontSize: 14, fontWeight: 500,
        cursor: "pointer", whiteSpace: "nowrap",
        transition: `color ${MOTION.fast} ${MOTION.ease}, background ${MOTION.fast} ${MOTION.ease}`,
      }}
    >
      {item.icon && (
        <span aria-hidden="true" style={{ display: "grid", placeItems: "center", opacity: active ? 1 : 0.75 }}>
          <DeskIcon name={item.icon} size={16} />
        </span>
      )}
      {item.label}
      {item.badge ? (
        <span style={{
          marginLeft: 2, padding: "1px 6px", borderRadius: R.pill,
          background: C.accentGlow, border: `1px solid ${C.accentEdge}`,
          ...TYPE.eyebrowSm, color: C.accentSoft,
        }}>{item.badge}</span>
      ) : null}
    </button>
  );
}

// ---------- account menu ----------
function AccountMenu({ account, plan, onSignIn, onSignOut, onOpenSettings, onOpenPlans }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click and on Escape. Both are required for a menu to feel
  // native; only handling the click leaves keyboard users stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!account) {
    return (
      <button onClick={onSignIn} style={button("primary", "sm")}>
        Sign in
      </button>
    );
  }

  const name = account.name || account.email || "Account";
  const initial = (name[0] || "?").toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* A 30px initial, and nothing else. The name and caret this replaced put
          a third block of text in a header whose job is now one status line —
          and the account name is the one thing on screen the user already knows.
          The full name still leads the menu it opens, and aria-label carries it
          for anyone who cannot see the initial. */}
      <button
        id="tour-settings"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu" aria-expanded={open}
        aria-label={`Account — ${name}`}
        title={name}
        style={{
          width: 30, height: 30, borderRadius: "50%",
          display: "grid", placeItems: "center", padding: 0,
          background: C.surfaceRaised,
          border: `1px solid ${open ? C.accentEdge : C.edgeStrong}`,
          fontFamily: SANS, fontSize: 12, fontWeight: 600, color: C.text,
          cursor: "pointer", flexShrink: 0,
          transition: `border-color ${MOTION.fast} ${MOTION.ease}`,
        }}
      >
        {initial}
      </button>

      {open && (
        <div role="menu" className="v-rise" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: 232,
          background: C.surface, border: `1px solid ${C.edgeStrong}`,
          borderRadius: R.lg, boxShadow: SHADOW.lg, overflow: "hidden", zIndex: Z.overlay,
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.edge}` }}>
            <div style={{ ...TYPE.bodySm, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            {account.email && (
              <div style={{ ...TYPE.code, fontSize: 12, color: C.faint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{account.email}</div>
            )}
            <div style={{ marginTop: 8 }}>
              <span style={chip(plan && plan !== "free" ? "accent" : "neutral")}>{(plan || "free").toUpperCase()} PLAN</span>
            </div>
          </div>
          {[
            { label: "Plans & billing", icon: "plan", onClick: onOpenPlans },
            { label: "Settings", icon: "settings", onClick: onOpenSettings },
          ].filter(i => i.onClick).map(i => (
            <button key={i.label} role="menuitem" className="v-row"
              onClick={() => { setOpen(false); i.onClick(); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: C.muted, fontFamily: SANS, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
              <span aria-hidden="true" style={{ display: "grid", placeItems: "center", color: C.faint }}><DeskIcon name={i.icon} size={16} /></span>{i.label}
            </button>
          ))}
          <button role="menuitem" className="v-row"
            onClick={() => { setOpen(false); onSignOut?.(); }}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderTop: `1px solid ${C.edge}`, color: C.down, fontFamily: SANS, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center" }}><DeskIcon name="signout" size={16} /></span>Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- command palette ----------
// Fuzzy-ish substring match over whatever commands the host passes
// in, so the dashboard decides what is searchable and this only renders it.
export function CommandPalette({ open, onClose, commands = [], fallback, placeholder = "Search sections, symbols and commands…" }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const activeRef = useRef(null);
  // True while the keyboard is driving. Arrowing scrolls the list, which slides
  // a row under a stationary pointer and fires mouseenter — without this flag
  // that phantom hover yanks the cursor back to wherever the mouse happens to be.
  const kbdRef = useRef(false);

  useEffect(() => { if (open) { setQ(""); setCursor(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      // Cold open shows what you actually use: recents first, resolved by id so
      // commands that no longer exist (toggled panels, one-off symbols) drop out.
      let recentIds = [];
      try { recentIds = JSON.parse(localStorage.getItem("vantage-palette-recents") || "[]"); } catch { /* private mode */ }
      const byId = new Map(commands.map(c => [c.id, c]));
      const recent = recentIds.map(id => byId.get(id)).filter(Boolean).map(c => ({ ...c, group: "Recent" }));
      const seen = new Set(recent.map(c => c.id));
      return [...recent, ...commands.filter(c => !seen.has(c.id))].slice(0, 12);
    }
    const matched = commands
      .map(c => {
        const hay = `${c.label} ${c.group || ""} ${(c.keywords || []).join(" ")}`.toLowerCase();
        const at = hay.indexOf(needle);
        return at === -1 ? null : { ...c, score: at };   // earlier match ranks higher
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12);
    // A search box that can only say "nothing matches" is a dead end; the host
    // may offer a last-resort command built from the raw query (e.g. chart it).
    if (matched.length === 0 && fallback) {
      const fb = fallback(q.trim());
      if (fb) return [fb];
    }
    return matched;
  }, [q, commands, fallback]);

  // Keep the cursor inside the (shrinking) result list as the query narrows.
  useEffect(() => { setCursor(c => Math.min(c, Math.max(0, results.length - 1))); }, [results.length]);

  // Let the scroll container follow the cursor. The list caps at 44vh and holds
  // up to twelve results, so without this the highlight simply walks off-screen.
  useEffect(() => { if (open) activeRef.current?.scrollIntoView({ block: "nearest" }); }, [cursor, open]);

  const run = useCallback((cmd) => {
    onClose();
    if (cmd?.id) {
      try {
        const cur = JSON.parse(localStorage.getItem("vantage-palette-recents") || "[]").filter(x => x !== cmd.id);
        localStorage.setItem("vantage-palette-recents", JSON.stringify([cmd.id, ...cur].slice(0, 5)));
      } catch { /* private mode */ }
    }
    cmd?.run?.();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: Z.modal, background: "rgba(4,5,9,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 20px 20px" }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Command palette"
        onClick={e => e.stopPropagation()}
        className="v-rise"
        style={{ width: 560, maxWidth: "100%", background: C.surface, border: `1px solid ${C.edgeStrong}`, borderRadius: R.xl, boxShadow: SHADOW.xl, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.edge}` }}>
          <span aria-hidden="true" style={{ color: C.accentText, fontSize: 14 }}>⌘</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); kbdRef.current = true; setCursor(c => Math.min(c + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); kbdRef.current = true; setCursor(c => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(results[cursor]); }
              else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
            placeholder={placeholder}
            aria-label="Command palette search"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"
            aria-activedescendant={results[cursor] ? `palette-opt-${cursor}` : undefined}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: SANS, fontSize: 15 }}
          />
          <kbd style={{ ...TYPE.eyebrowSm, color: C.faint, border: `1px solid ${C.edge}`, borderRadius: R.xs, padding: "2px 6px" }}>ESC</kbd>
        </div>

        <div id="palette-list" role="listbox" aria-label="Results"
          onMouseMove={() => { kbdRef.current = false; }}
          style={{ maxHeight: "44vh", overflowY: "auto", padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: "28px 16px", textAlign: "center", ...TYPE.bodySm, color: C.faint }}>
              Nothing matches “{q}”.
            </div>
          )}
          {results.map((cmd, i) => (
            <button
              key={cmd.id || cmd.label}
              id={`palette-opt-${i}`}
              role="option" aria-selected={i === cursor}
              ref={i === cursor ? activeRef : undefined}
              onClick={() => run(cmd)}
              onMouseEnter={() => { if (!kbdRef.current) setCursor(i); }}
              style={{
                display: "flex", alignItems: "center", gap: 11, width: "100%",
                padding: "10px 12px", borderRadius: R.md, border: "none", textAlign: "left", cursor: "pointer",
                background: i === cursor ? C.surfaceRaised : "transparent",
                color: i === cursor ? C.text : C.muted,
                fontFamily: SANS, fontSize: 14,
              }}
            >
              <span aria-hidden="true" style={{ width: 18, display: "grid", placeItems: "center", color: i === cursor ? C.accentText : C.faint }}>
                {cmd.icon ? <DeskIcon name={cmd.icon} size={16} /> : "›"}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmd.label}</span>
              {cmd.group && <span style={{ ...TYPE.eyebrowSm, color: C.faint }}>{cmd.group}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- the shell ----------
export default function AppShell({
  sections = [],
  activeSection,
  onNavigate,
  account,
  plan,
  onSignIn,
  onSignOut,
  onOpenSettings,
  onOpenPlans,
  marketOpen = false,
  marketLabel,
  clock,
  commands = [],
  paletteFallback, // optional (query) => command | null, offered when no command matches
  status,          // optional node rendered in the header (e.g. data-source chip)
  searchRef,       // optional ref; receives an opener so the host can put the palette trigger wherever it wants
  children,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  // The drawer dismisses like every other transient surface: Escape closes it.
  useEffect(() => {
    if (!mobileNav) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setMobileNav(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNav]);

  // Cmd/Ctrl + K opens the palette.
  //
  // The composer has advertised "⌘K" on a chip since the command bar merged,
  // and nothing was ever listening — the palette could only be opened by
  // clicking that chip. Both modifiers are accepted rather than branching on
  // the platform: a Mac user pressing Ctrl+K means the same thing, and this is
  // the one shortcut every app in this category shares.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if ((e.key || "").toLowerCase() !== "k") return;
      e.preventDefault();          // Firefox aims Ctrl+K at its own search bar
      setPaletteOpen(v => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The palette trigger lives in the host's command bar, not this header — but
  // the palette itself stays here where the commands are.
  useEffect(() => {
    if (!searchRef) return;
    searchRef.current = () => setPaletteOpen(true);
    return () => { searchRef.current = null; };
  }, [searchRef]);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 760);

  // Whether the full nav row fits is MEASURED, never guessed from a breakpoint:
  // the answer depends on how many sections the host passes, the labels' locale,
  // and how wide the right-hand cluster happens to be. A fixed 900px switch left
  // a band of widths where none of that fit and the nav clipped mid-word
  // ("Port…") behind its own scrollbar. The row stays mounted but invisible
  // while it doesn't fit, so it can always be re-measured — which is what lets
  // the header expand again on its own when space returns.
  const [cramped, setCramped] = useState(false);
  const navWrapRef = useRef(null);
  useEffect(() => {
    const measure = () => {
      setNarrow(window.innerWidth < 760);
      const wrap = navWrapRef.current;
      if (wrap) setCramped(wrap.scrollWidth > wrap.clientWidth + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    let ro;
    if (typeof ResizeObserver !== "undefined" && navWrapRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(navWrapRef.current);
    }
    return () => { window.removeEventListener("resize", measure); ro?.disconnect(); };
  }, [sections]);
  const collapsed = narrow || cramped;

  const go = useCallback((item) => {
    setMobileNav(false);
    onNavigate?.(item);
  }, [onNavigate]);

  // Sections are commands too — so the palette can reach every destination without the
  // host having to restate them.
  const allCommands = useMemo(() => [
    ...sections.map(s => ({ id: `nav:${s.id}`, label: s.label, icon: s.icon, group: "Go to", keywords: s.keywords, run: () => go(s) })),
    ...commands,
  ], [sections, commands, go]);

  return (
    // Transparent, not C.base: the body already paints the base colour (global.css),
    // and an opaque background here would hide the aurora layer below.
    <div style={{ position: "relative", minHeight: "100vh", background: "transparent", color: C.text, fontFamily: SANS }}>
      {/* Decorative colour field across the top of the page. Deliberately a
          sibling of the content rather than a wrapper: .v-aurora clips to its own
          box, and wrapping the dashboard would cut off the desk's absolutely
          positioned dropdowns. Fixed + pointer-events:none so it never intercepts
          a click and never scrolls out of alignment with the header. */}
      <div
        className="v-aurora v-aurora-subtle"
        aria-hidden="true"
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: 460, zIndex: 0, pointerEvents: "none" }}
      />

      <a href="#vantage-main" className="v-skip-link">Skip to content</a>

      <header
        style={{
          position: "sticky", top: 0, zIndex: Z.header,
          height: HEADER_H,
          display: "flex", alignItems: "center", gap: SP[4],
          padding: `0 ${SP[4]}px`,
          // Translucent + blur keeps content visible under the bar; the solid
          // fallback colour matters for browsers without backdrop-filter.
          background: "rgba(7,8,12,0.78)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          borderBottom: `1px solid ${C.edge}`,
        }}
      >
        <BrandMark compact={narrow} onClick={() => go(sections[0])} />

        {/* Always mounted so the measuring effect above can compare its content
            width against the space available; overflow:hidden means the moments
            before a collapse can never show a clipped label or a scrollbar. */}
        <div ref={navWrapRef} style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", alignItems: "center" }}>
          <nav
            aria-label="Primary"
            aria-hidden={collapsed || undefined}
            style={{ display: "inline-flex", alignItems: "center", gap: 2, whiteSpace: "nowrap", visibility: collapsed ? "hidden" : "visible" }}
          >
            {sections.map(s => (
              <NavItem key={s.id} item={s} active={s.id === activeSection} onSelect={go} />
            ))}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: SP[3], flexShrink: 0 }}>
          {!narrow && status}
          {!narrow && <LiveBadge open={marketOpen} label={marketLabel} clock={clock} />}

          <AccountMenu
            account={account} plan={plan}
            onSignIn={onSignIn} onSignOut={onSignOut}
            onOpenSettings={onOpenSettings} onOpenPlans={onOpenPlans}
          />

          {collapsed && (
            <button onClick={() => setMobileNav(o => !o)} aria-label="Menu" className="v-tap" aria-expanded={mobileNav}
              style={{ ...button("ghost", "sm"), padding: "7px 10px" }}>
              {mobileNav ? "✕" : "☰"}
            </button>
          )}
        </div>
      </header>

      {/* Collapsed drawer: the same sections, stacked, as a sheet under the header. */}
      {collapsed && mobileNav && (
        <nav aria-label="Primary" className="v-rise" style={{
          position: "sticky", top: HEADER_H, zIndex: Z.header - 1,
          background: C.surface, borderBottom: `1px solid ${C.edge}`,
          padding: SP[2], display: "grid", gap: 2, boxShadow: SHADOW.lg,
        }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => go(s)} className="v-row"
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "11px 12px", borderRadius: R.md, border: "none", cursor: "pointer", textAlign: "left",
                background: s.id === activeSection ? C.accentGlow : "transparent",
                color: s.id === activeSection ? C.text : C.muted,
                fontFamily: SANS, fontSize: 14, fontWeight: s.id === activeSection ? 600 : 500,
              }}>
              <span aria-hidden="true" style={{ width: 18, display: "grid", placeItems: "center" }}><DeskIcon name={s.icon} size={17} /></span>
              {s.label}
            </button>
          ))}
          {/* Only on true phone widths — at cramped desktop widths the badge is
              already in the header, and the drawer would duplicate it. */}
          {narrow && (
            <div style={{ padding: "8px 12px 4px", borderTop: `1px solid ${C.edge}`, marginTop: 4 }}>
              <LiveBadge open={marketOpen} label={marketLabel} clock={clock} />
            </div>
          )}
        </nav>
      )}

      {/* Positioned so the content sits above the aurora layer rather than under it. */}
      {/* No z-index here on purpose. A positioned element WITH one opens a
          stacking context, and that trapped every overlay the app renders
          inside <main> — the settings modal could ask for z-index 51 and still
          lose to the header, because main itself was competing at 1 against 50.
          Left as auto, main still paints over the aurora (z-index 0) simply by
          coming later in the tree, and modals reach the top layer as intended. */}
      <main id="vantage-main" style={{ position: "relative" }}>{children}</main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={allCommands} fallback={paletteFallback} />
    </div>
  );
}
