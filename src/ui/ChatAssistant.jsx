// ============================================================
//  ChatAssistant — a threaded conversation surface for the AI desk.
//
//  WHAT CHANGED AND WHY
//  The dashboard's AI was a one-shot command bar: you asked, one answer replaced
//  the last, and the exchange was gone. That works for "chart NVDA" and fails for
//  anything that builds on the previous turn ("why?", "compare it to AMD").
//  A thread keeps the context visible, which is the difference between a command
//  line and an assistant.
//
//  CONTRACT
//  Presentational and controlled: the host owns `messages` and does the actual
//  model call in `onSend`. This component never talks to a model, so it works
//  identically against a cloud key, a local Ollama, or the server-side brief
//  endpoint — whichever the dashboard has wired up.
//
//  MESSAGE SHAPE
//    { id, role: "user" | "assistant" | "system", text, status?, error?,
//      widget?: ReactNode, sources?: [{title, url}], meta?, kind? }
//  `widget` is the escape hatch that lets a turn render a chart, a calendar or a
//  portfolio table inline instead of only prose. `meta` is a caption line under
//  the bubble — the desk uses it for model provenance ("claude · 820 ms"), which
//  matters in an app that silently falls back between models. `kind: "action"`
//  marks a turn the desk answered itself (an export, a navigation, a game) so it
//  can be styled as a receipt rather than as generated prose.
// ============================================================

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { C, MONO, SANS, TYPE, R, SP, SHADOW, MOTION, button } from "./theme.js";
import RichText from "./RichText.jsx";
import Waveform from "./Waveform.jsx";
import VantageMark from "./VantageMark.jsx";

// Green text, not a filled chip. Three bordered pills under every answer turned
// a ten-turn thread into a wall of controls; as text they sit in the provenance
// line and only the colour says they are live. Underlined on hover and on
// keyboard focus — the part hover-only affordances always forget.
function MsgAction({ label, onClick, active, title }) {
  const [hot, setHot] = useState(false);
  return (
    <button
      onClick={onClick} title={title || label}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)} onBlur={() => setHot(false)}
      style={{
        background: "transparent", border: "none", padding: 0, cursor: "pointer",
        fontFamily: MONO, fontSize: 12,
        color: active ? C.accentText : C.accent,
        textDecoration: hot ? "underline" : "none",
      }}
    >
      {label}
    </button>
  );
}

// ---------- "on air" ----------
// The waveform is driven by whether the anchor is ACTUALLY speaking, never by a
// timer — a fake meter that animates while nothing is playing is worse than no
// meter, because it teaches you to stop believing it. Four bars at fixed
// heights with a staggered delay; .vt-bars (global.css) owns the animation and
// is silenced under prefers-reduced-motion.
function OnAir({ who }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <Waveform height={16} width={3} gap={2.5} />
      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.accentText }}>On air</span>
      <span style={{ fontFamily: SANS, fontSize: 12, color: C.faint }}>
        {who ? `${who} is reading this answer` : "Reading this answer"}
      </span>
    </div>
  );
}

// ---------- one message ----------
function Bubble({ msg, onRetry, onSpeak, speaking, anchorName }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    // Clipboard access can be refused (insecure origin, denied permission). A
    // silent no-op would look like a broken button, so the label reports it.
    const done = (ok) => { setCopied(ok ? "Copied" : "Can't copy"); setTimeout(() => setCopied(false), 1400); };
    try {
      navigator.clipboard.writeText(msg.text || "").then(() => done(true), () => done(false));
    } catch { done(false); }
  }, [msg.text]);

  if (isSystem) {
    return (
      <div style={{ textAlign: "center", padding: "6px 0" }}>
        <span style={{ ...TYPE.eyebrowSm, color: C.faint }}>{msg.text}</span>
      </div>
    );
  }

  // A desk-handled turn is a receipt for something the app just did, not a
  // generated answer. Giving it its own quieter treatment stops the thread from
  // implying a model was consulted when none was.
  const isAction = msg.kind === "action";
  const done = msg.status !== "running";
  const canSpeak = onSpeak && msg.text && done && !isUser && !isAction;
  const canCopy = !isUser && msg.text && done;
  const canRetry = !isUser && msg.error && onRetry;
  const showActions = canSpeak || canCopy || canRetry || msg.meta;

  // ---------- the question ----------
  // Right-aligned, tight-cornered on the side it came from, and capped at 60%
  // so a long question cannot pass itself off as an answer. No avatar: a chip
  // reading "you" beside your own words is a label for something already
  // unambiguous, and it cost every answer 36px of gutter to stay aligned with.
  if (isUser) {
    return (
      <div className="v-rise" style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{
          maxWidth: "60%", minWidth: 0,
          background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`, color: C.text,
          borderRadius: `${R.xl - 2}px ${R.xl - 2}px 4px ${R.xl - 2}px`,
          padding: "13px 20px",
          fontFamily: SANS, fontSize: 15.5, lineHeight: 1.5,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div className="v-rise" style={{ minWidth: 0 }}>
      <div
        style={{
          background: isAction ? "transparent" : C.surface,
          // Four longhands, not `border` plus a `borderLeft` override. React
          // warns about mixing the two for good reason: when a turn switches
          // between action and answer, the shorthand and the longhand are
          // applied in an order React does not guarantee, so the left edge can
          // keep a width from the previous render.
          borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
          borderLeftWidth: isAction ? 2 : 1,
          borderStyle: "solid",
          borderColor: msg.error ? C.dangerEdge : isAction ? "transparent" : C.edge,
          borderLeftColor: isAction ? C.edgeStrong : msg.error ? C.dangerEdge : C.edge,
          borderRadius: isAction ? 0 : R.lg,
          padding: isAction ? "4px 0 4px 14px" : "22px 26px",
          color: msg.error ? C.down : isAction ? C.muted : C.text,
          fontFamily: SANS, fontSize: isAction ? 13.5 : 15.5, lineHeight: 1.65,
          wordBreak: "break-word",
        }}
      >
        {/* Only while audio is genuinely playing this turn. */}
        {speaking && !isAction ? <OnAir who={anchorName} /> : null}

        {msg.status === "running" && !msg.text
          ? <TypingDots />
          : isAction
            ? <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
            : <RichText text={msg.text} />}

        {/* Streaming cursor: only while text is still arriving. */}
        {msg.status === "running" && msg.text ? (
          <span className="v-pulse" style={{ color: C.accentText, marginLeft: 2 }}>▋</span>
        ) : null}

        {/* Sources, when the turn came from a web/news lookup. */}
        {msg.sources?.length ? (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {msg.sources.map((s, i) => (
              <a
                key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{
                  fontFamily: SANS, fontSize: 11.5, textDecoration: "none",
                  color: C.muted, border: `1px solid ${C.edge}`,
                  background: C.surfaceAlt, borderRadius: R.lg, padding: "3px 9px",
                  maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {s.title || safeHost(s.url)} ↗
              </a>
            ))}
          </div>
        ) : null}

        {/* Footer: provenance plus the per-message actions, hairlined off the
            answer rather than floating under it. This app routes between several
            models and silently falls back on failure, so which one answered —
            and how long it took — is real information, not decoration.
            The actions are green TEXT, not filled chips: three buttons under
            every answer in a ten-turn thread is a wall of controls. */}
        {showActions && !isAction ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.edge}`,
          }}>
            {msg.meta && <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>{msg.meta}</span>}
            {canCopy && <MsgAction label={copied || "Copy"} onClick={copy} title="Copy this answer" />}
            {canSpeak && (
              <MsgAction
                label={speaking ? "Stop" : "Read aloud"} active={speaking}
                onClick={() => onSpeak(msg)}
                title={speaking ? "Stop reading" : "Read this answer aloud"}
              />
            )}
            {canRetry && <MsgAction label="Try again" onClick={() => onRetry(msg)} title="Ask again" />}
          </div>
        ) : null}
      </div>

      {/* Inline widget — a chart, table or calendar rendered by the host. */}
      {msg.widget ? <div style={{ marginTop: 8 }}>{msg.widget}</div> : null}
    </div>
  );
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Three dots, staggered. Communicates "thinking" before any token has arrived.
function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 0" }} aria-label="Assistant is typing">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: "50%", background: C.accent,
            animation: `v-pulse 1.1s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

// A suggestion is either a plain string, or {label, value} when the text worth
// sending to the model is longer than the text worth putting on a chip
// ("Summarize AMD today" on the chip; "…— price action and why" to the model).
const sugLabel = (s) => (typeof s === "string" ? s : s.label);
const sugValue = (s) => (typeof s === "string" ? s : (s.value ?? s.label));

// ---------- empty state ----------
// An assistant with a blank thread has to teach itself. Suggestions do that
// better than a paragraph of instructions.
function EmptyState({ suggestions, onPick, subject }) {
  return (
    <div style={{ padding: `${SP[8]}px ${SP[4]}px`, textAlign: "center" }}>
      <div style={{ display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <VantageMark size={46} radius={11} />
      </div>
      <div style={{ ...TYPE.title, fontSize: 16, marginBottom: 6 }}>Ask the desk</div>
      <div style={{ ...TYPE.bodySm, color: C.muted, maxWidth: 340, margin: "0 auto 18px" }}>
        {subject ? `I have ${subject} on screen. ` : ""}Ask about a stock, request a report, or tell me where to go.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
        {suggestions.map(s => (
          <button
            key={sugLabel(s)} onClick={() => onPick(sugValue(s))} className="v-interactive"
            style={{
              ...button("ghost", "sm"),
              borderRadius: R.pill, color: C.muted, maxWidth: "100%",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {sugLabel(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- the assistant ----------
export default function ChatAssistant({
  messages = [],
  onSend,
  onRetry,
  onClear,
  onStop,           // abort an answer in flight; the stop control only appears if given
  onSpeak,          // read a turn aloud; the desk wires this to its TTS engine
  speakingId,       // id of the message currently being spoken, if any
  anchorName,       // who is presenting — named in the "on air" line while speaking
  toolbar,          // extra controls beside the composer (e.g. the mic button)
  // ---- optional: let the host own the input ----
  // Given together, these turn the composer into a controlled input the host
  // drives. The desk uses them to hang a symbol typeahead off this box, which
  // is what let it retire its separate command bar.
  value,            // controlled draft text; omit and the composer keeps its own
  onChange,         // (text) => void, required when `value` is given
  onKeyDown,        // first refusal on keys; call preventDefault to take one over
  onFocus, onBlur,  // the host needs these to know when to show its typeahead
  overlay,          // positioned node inside the composer box (the typeahead)
  status,           // a quiet line in the composer row (market open/closed)
  attachments,      // desk results that belong to the conversation — the streaming
                    // catalog, the games menu. Rendered at the TAIL of the thread,
                    // because a result arrives as the answer to something asked,
                    // and it should appear where that answer appeared rather than
                    // in a panel somewhere above the question.
  busy = false,
  disabled = false,
  disabledReason,
  subject,                       // e.g. the selected symbol, shown in the header
  suggestions = [],
  placeholder = "Ask anything, or type a command…",
  placeholderShort,   // shown once the composer is too narrow for the long one.
                      // Not an abbreviation of it — a phone has no HELP command
                      // worth advertising, so the short line drops that clause
                      // rather than truncating the sentence that carries it.
  height = 460,
  header = true,
  embedded = false,   // rendered inside a host panel: the host owns the chrome,
                      // so the section drops its own border/background/shadow
  compact = false,    // just the composer bar until a conversation exists — no
                      // header, no empty-state hero; the transcript grows above
                      // the bar once there are messages. For hosts (the AI desk)
                      // that already say what this input is.
  roomy = false,      // an attachment that is a whole surface rather than a
                      // result — a game. Drops the transcript cap; see below.
}) {
  // The draft is normally ours. It becomes the caller's when `value` is given,
  // which is how the desk merged its command bar into this composer: the
  // typeahead needs the text to rank symbols against, and two components
  // holding two copies of one input's text is how they drift apart.
  const [ownDraft, setOwnDraft] = useState("");
  const controlled = value !== undefined;
  const draft = controlled ? value : ownDraft;
  const setDraft = controlled ? (onChange || (() => {})) : setOwnDraft;
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const pinnedRef = useRef(true);   // is the view stuck to the bottom?
  const countRef = useRef(messages.length);

  const scrollToEnd = useCallback((smooth) => {
    const el = scrollRef.current;
    if (!el) return;
    try { el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" }); }
    catch { el.scrollTop = el.scrollHeight; }
    pinnedRef.current = true;
    setAtBottom(true); setUnread(false);
  }, []);

  // Only auto-scroll when the user is already at the bottom. Yanking the view down
  // while someone is reading back through the thread is the classic chat-UI sin —
  // but silently swallowing the new answer is the other one, so anything that
  // arrives while scrolled away raises the jump-to-latest pill instead.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    else if (messages.length > countRef.current) setUnread(true);
    countRef.current = messages.length;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    pinnedRef.current = pinned;
    setAtBottom(pinned);
    if (pinned) setUnread(false);
  }, []);

  // ---- how much room the composer row actually has ----
  //
  // Measured at 375px: the row is 297px wide and the text field gets 98 of it.
  // The other 199 are 18px of left padding, three 12px gaps, and 135px of
  // controls — two thirds of the row is chrome, and the placeholder needs 367px
  // of type it will never see. It wrapped inside a one-line box and scrolled.
  //
  // No amount of trimming fixes it: handed the whole 271px the row can spare,
  // the long placeholder still wraps. So below the threshold the row wraps too
  // — field on its own line, controls beneath at full size — and the label
  // drops to its short form. Both move on ONE number, because two numbers that
  // have to agree are two numbers that eventually will not.
  const TIGHT = 460;
  const composerRef = useRef(null);
  const [tight, setTight] = useState(false);

  // Grow the composer with its content, up to a ceiling, then scroll inside it.
  //
  // The PLACEHOLDER counts toward scrollHeight — an empty box is as tall as its
  // label wraps. That is not obvious and it is the other half of the phone bug:
  // at 98px wide the placeholder wrapped to five lines, so an untouched
  // composer measured 174px, clipped itself to the 132 ceiling, and scrolled.
  // The box looked broken because it was honestly reporting a label that did
  // not fit.
  //
  // Which means height depends on WIDTH, so this has to re-run when the width
  // moves — on the wrap (`tight`), and on any resize that did not cross it.
  const autosize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
  }, []);
  useEffect(autosize, [draft, autosize, tight]);

  // Watch the row's own width — a ResizeObserver rather than a media query,
  // because this box is a column in a flex row. It is cramped at 400px inside a
  // 1200px window just as surely as it is on a phone, and only the box knows.
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      // The wrap changes the row's HEIGHT, not its width, so this cannot
      // oscillate — but an 8px dead band either side of the threshold keeps a
      // drag-resize from setting state on every frame it spends near it.
      setTight(prev => (w < TIGHT - (prev ? 0 : 8) ? true : w > TIGHT + (prev ? 8 : 0) ? false : prev));
      autosize();   // height follows width; see above
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autosize]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft("");
    // Reset the box height immediately; waiting for the effect leaves it tall
    // for a frame after send, which reads as lag.
    requestAnimationFrame(autosize);
    scrollToEnd();
    onSend?.(text);
  }, [draft, busy, disabled, onSend, autosize, scrollToEnd]);

  const pick = useCallback((text) => {
    if (busy || disabled) return;
    scrollToEnd();
    onSend?.(text);
  }, [busy, disabled, onSend, scrollToEnd]);

  const canSend = !!draft.trim() && !busy && !disabled;
  const showStop = busy && !!onStop;

  return (
    <section
      aria-label="AI chat assistant"
      style={{
        display: "flex", flexDirection: "column",
        height: compact ? "auto" : height, minHeight: 0,
        background: embedded ? "transparent" : C.surface,
        border: embedded ? "none" : `1px solid ${C.edge}`,
        borderRadius: embedded ? 0 : R.lg,
        overflow: "hidden",
        boxShadow: embedded ? "none" : SHADOW.sm,
      }}
    >
      {header && !compact && (
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "11px 14px", borderBottom: `1px solid ${C.edge}`,
          background: C.surfaceSunken, flexShrink: 0,
        }}>
          <VantageMark size={20} radius={6} />
          <span style={{ ...TYPE.eyebrow, color: C.muted }}>AI Assistant</span>
          {subject && (
            <span style={{ ...TYPE.num, fontSize: 12, color: C.accentSoft, background: C.accentGlow, border: `1px solid ${C.accentEdge}`, borderRadius: R.pill, padding: "2px 9px" }}>
              {subject}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {busy && <span style={{ ...TYPE.eyebrowSm, color: C.accentText }} className="v-pulse">THINKING</span>}
          {messages.length > 0 && onClear && (
            <button onClick={onClear} title="Clear conversation"
              style={{ ...button("quiet", "sm"), padding: "4px 8px", fontSize: 11 }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* thread.
          aria-live="polite" so a screen reader hears the answer arrive. It is
          NOT "assertive": answers stream token by token, and an assertive region
          would interrupt itself on every chunk. */}
      {/* Viewport-relative cap: a fixed pixel height either wastes space on a tall
          window or pushes the composer past the fold on a short one, so the cap is
          a share of the viewport with a floor and a ceiling. It is sized to hold a
          full answer — an answer that arrives already scrolled is an answer whose
          first line you have to go looking for.

          EXCEPT when the attachment is a whole surface. A game is not an answer
          you skim; it is a screen you sit in front of, and the reference designs
          run past 1000px tall. Inside the cap it got a nested scroller with the
          composer parked over its bottom edge, so the controls you were reaching
          for were the half that was cut off. Roomy drops the cap entirely and
          lets the PAGE scroll — one scrollbar instead of two, and the game is as
          tall as it is. */}
      {(!compact || messages.length > 0 || attachments) && (
      <div style={{ position: "relative", flex: compact ? "0 1 auto" : 1, minHeight: 0, display: "flex", maxHeight: compact ? (roomy ? "none" : "clamp(280px, 62vh, 760px)") : undefined }}>
        <div
          ref={scrollRef} onScroll={onScroll}
          role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation"
          style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: SP[4], display: "flex", flexDirection: "column", gap: SP[4] }}
        >
          {messages.length === 0 && !attachments
            ? <EmptyState suggestions={suggestions} onPick={pick} subject={subject} />
            : messages.map(m => (
                <Bubble
                  key={m.id} msg={m} onRetry={onRetry} anchorName={anchorName}
                  onSpeak={onSpeak} speaking={speakingId === m.id}
                />
              ))}
          {attachments}
        </div>

        {/* Jump to latest. Only while scrolled away, and it says whether it is
            catching you up on something new or just returning you to the end. */}
        {!atBottom && messages.length > 0 && (
          <button
            onClick={() => scrollToEnd(true)}
            style={{
              position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)",
              ...button(unread ? "primary" : "solid", "sm"),
              ...(unread ? {} : { background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}` }),
              borderRadius: R.pill, boxShadow: SHADOW.xl, whiteSpace: "nowrap",
            }}
          >
            {unread ? "↓ New answer" : "↓ Latest"}
          </button>
        )}
      </div>
      )}

      {/* composer */}
      <div ref={composerRef} style={{ padding: SP[3], borderTop: `1px solid ${C.edge}`, background: C.surfaceSunken, flexShrink: 0 }}>
        {disabled && disabledReason && (
          <div style={{ ...TYPE.bodySm, fontSize: 12, color: C.faint, padding: "0 2px 8px" }}>{disabledReason}</div>
        )}
        {/* Tight is a WRAP, not a squeeze. flex-wrap alone does nothing here:
            the field's basis is 0, so it never claims enough width to push
            anything onto a second line — all four items "fit" on one and the
            field is left with whatever the controls did not take. Giving it a
            100% basis is what actually breaks the row.

            justify-content only bites on the second line, since the field fills
            the first on its own. The controls land right — where a send button
            belongs — and Clear is pushed back to the left by its own auto
            margin, away from Ask. */}
        <div
          className="cmdbar"
          style={{
            position: "relative",
            display: "flex", alignItems: "flex-end", gap: tight ? 8 : 12,
            background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`,
            borderRadius: R.lg, padding: tight ? "8px" : "8px 8px 8px 18px",
            ...(tight && { flexWrap: "wrap", justifyContent: "flex-end" }),
            transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
          }}
        >
          {overlay}
          <textarea
            ref={taRef}
            rows={1}
            value={draft}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={e => {
              // The host goes first. It owns the typeahead, so ArrowDown and
              // Enter mean something to it before they mean anything here.
              onKeyDown?.(e);
              if (e.defaultPrevented) return;
              // Enter sends, Shift+Enter makes a newline — the convention every
              // chat UI has settled on.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              // Escape stops a run in flight, matching the stop button.
              else if (e.key === "Escape" && showStop) { e.preventDefault(); onStop(); }
            }}
            placeholder={disabled ? "Unavailable" : (tight && placeholderShort) || placeholder}
            aria-label="Message the AI assistant"
            style={{
              flex: tight ? "1 1 100%" : 1, minWidth: 0, resize: "none", background: "transparent",
              border: "none", outline: "none", color: C.text,
              fontFamily: SANS, fontSize: 15, lineHeight: 1.5, padding: "8px 0", maxHeight: 132,
            }}
          />
          {/* Compact mode has no header for Clear to live in, so it rides the
              composer row — quiet, and only once there is something to clear.

              v-tap, because this measured 19 by 26 on a touch screen — not
              cramped, untappable — on the one row where the mic beside it
              already honours HIT. That was true at every width, not just the
              narrow ones, so it takes the house's real-box rule rather than
              anything conditional: 44 square on a coarse pointer, unchanged on
              a mouse, which does not need it and would only lose field width
              to it. It was v-taprow's shape of problem and not its fix — that
              pseudo pins left/right to 0 and grows height alone, and height
              was never what failed here.

              The auto margin is layout, not targeting: once the row wraps,
              Clear belongs at the far end of the control line, away from Ask. */}
          {compact && messages.length > 0 && onClear && (
            <button onClick={onClear} aria-label="Clear conversation" title="Clear conversation" className="v-tap"
              style={{
                background: "transparent", border: "none", color: C.faint, cursor: "pointer",
                fontSize: 14, padding: "6px 4px", flexShrink: 0,
                ...(tight && { marginRight: "auto" }),
              }}>
              ↺
            </button>
          )}
          {status}
          {toolbar}
          {/* While an answer is in flight the send button becomes stop. Waiting
              out a wrong answer with no way to cancel is the thing that makes an
              assistant feel like it is not listening. */}
          {showStop ? (
            <button
              onClick={onStop} aria-label="Stop generating"
              style={{ ...button("live", "sm"), padding: "8px 12px", flexShrink: 0 }}>
              ■ Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="v-taprow"
              style={{
                ...button(canSend ? "primary" : "solid", "sm"),
                padding: "10px 22px", borderRadius: 9, flexShrink: 0,
                fontSize: 14, fontWeight: 700,
                opacity: canSend ? 1 : 0.5,
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              {busy ? <span className="v-spin" style={{ display: "inline-block" }}>◌</span> : "Ask"}
            </button>
          )}
        </div>

        {/* Quick chips teach the command vocabulary. In compact mode they are the
            ONLY teaching surface — EmptyState never renders there — so they show
            before the first message too, and the full set is offered while the
            thread is empty. */}
        {(messages.length > 0 || compact) && suggestions.length > 0 && !busy && (
          <div className="v-chiprow" style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 2 }}>
            {suggestions.slice(0, messages.length === 0 ? 5 : 4).map(s => (
              <button key={sugLabel(s)} onClick={() => pick(sugValue(s))} className="v-taprow"
                style={{ ...button("quiet", "sm"), fontSize: 11, borderRadius: R.pill, border: `1px solid ${C.edge}`, color: C.faint, whiteSpace: "nowrap", flexShrink: 0 }}>
                {sugLabel(s)}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
