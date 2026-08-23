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
import { C, GRAD, MONO, SANS, TYPE, R, SP, SHADOW, MOTION, button } from "./theme.js";
import RichText from "./RichText.jsx";
import VantageMark from "./VantageMark.jsx";

// A small text button used for the per-message actions. Low contrast at rest so
// a thread of ten answers is not a wall of controls, full contrast on hover and
// on keyboard focus — which is the part hover-only affordances always forget.
function MsgAction({ label, onClick, active, title }) {
  const [hot, setHot] = useState(false);
  return (
    <button
      onClick={onClick} title={title || label}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)} onBlur={() => setHot(false)}
      style={{
        ...button("quiet", "sm"),
        padding: "2px 7px", fontSize: 11, borderRadius: R.pill,
        border: `1px solid ${active ? C.liveDim : hot ? C.edgeStrong : "transparent"}`,
        color: active ? C.live : hot ? C.text : C.faint,
      }}
    >
      {label}
    </button>
  );
}

// ---------- one message ----------
function Bubble({ msg, onRetry, onSpeak, speaking }) {
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

  return (
    <div className="v-rise" style={{ display: "flex", gap: 10, flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start" }}>
      {/* Avatar. The assistant gets the brand gradient; the user gets a flat chip,
          so the eye can separate the two without reading a word. */}
      {isUser || isAction ? (
        <span
          aria-hidden="true"
          style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginTop: 2,
            display: "grid", placeItems: "center",
            background: C.surfaceRaised, border: `1px solid ${C.edgeStrong}`,
            fontFamily: SANS, fontSize: 11, fontWeight: 510,
            color: isUser ? C.muted : C.accentText,
          }}
        >
          {isUser ? "you" : "⚙"}
        </span>
      ) : (
        <span aria-hidden="true" style={{ marginTop: 2 }}><VantageMark size={26} radius={16} /></span>
      )}

      <div style={{ maxWidth: "82%", minWidth: 0 }}>
        <div
          style={{
            background: isUser ? C.surfaceRaised : isAction ? "transparent" : C.surface,
            border: `1px solid ${msg.error ? "rgba(235,87,87,0.4)" : isUser ? C.edgeStrong : C.edge}`,
            // Tail-side corner tightened so the bubble points at its own avatar.
            borderRadius: isUser ? `${R.lg}px ${R.sm}px ${R.lg}px ${R.lg}px` : `${R.sm}px ${R.lg}px ${R.lg}px ${R.lg}px`,
            padding: "10px 13px",
            color: msg.error ? C.down : isAction ? C.muted : C.text,
            ...TYPE.bodySm,
            wordBreak: "break-word",
          }}
        >
          {msg.status === "running" && !msg.text
            ? <TypingDots />
            /* User text is never parsed as Markdown: someone typing "what does
               **this** mean" should see their own asterisks, not have them eaten. */
            : isUser || isAction
              ? <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
              : <RichText text={msg.text} />}

          {/* Streaming cursor: only while text is still arriving. */}
          {msg.status === "running" && msg.text ? (
            <span className="v-pulse" style={{ color: C.accentText, marginLeft: 2 }}>▋</span>
          ) : null}
        </div>

        {/* Inline widget — a chart, table or calendar rendered by the host. */}
        {msg.widget ? <div style={{ marginTop: 8 }}>{msg.widget}</div> : null}

        {/* Sources, when the turn came from a web/news lookup. */}
        {msg.sources?.length ? (
          <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {msg.sources.map((s, i) => (
              <a
                key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{
                  ...TYPE.eyebrowSm, textDecoration: "none",
                  color: C.accentSoft, border: `1px solid ${C.accentEdge}`,
                  background: C.accentGlow, borderRadius: R.pill, padding: "3px 9px",
                  maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                ↗ {s.title || safeHost(s.url)}
              </a>
            ))}
          </div>
        ) : null}

        {/* Footer: provenance plus the per-message actions. This app routes between
            several models and silently falls back on failure, so which one actually
            answered — and how long it took — is real information, not decoration. */}
        {showActions ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {msg.meta && <span style={{ ...TYPE.eyebrowSm, color: C.faint, marginRight: 4 }}>{msg.meta}</span>}
            {canCopy && <MsgAction label={copied || "Copy"} onClick={copy} title="Copy this answer" />}
            {canSpeak && (
              <MsgAction
                label={speaking ? "■ Stop" : "▶ Read"} active={speaking}
                onClick={() => onSpeak(msg)}
                title={speaking ? "Stop reading" : "Read this answer aloud"}
              />
            )}
            {canRetry && <MsgAction label="↻ Try again" onClick={() => onRetry(msg)} title="Ask again" />}
          </div>
        ) : null}
      </div>
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
  toolbar,          // extra controls beside the composer (e.g. the mic button)
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
  height = 460,
  header = true,
  embedded = false,   // rendered inside a host panel: the host owns the chrome,
                      // so the section drops its own border/background/shadow
  compact = false,    // just the composer bar until a conversation exists — no
                      // header, no empty-state hero; the transcript grows above
                      // the bar once there are messages. For hosts (the AI desk)
                      // that already say what this input is.
}) {
  const [draft, setDraft] = useState("");
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

  // Grow the composer with its content, up to a ceiling, then scroll inside it.
  const autosize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
  }, []);
  useEffect(autosize, [draft, autosize]);

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
          first line you have to go looking for. */}
      {(!compact || messages.length > 0 || attachments) && (
      <div style={{ position: "relative", flex: compact ? "0 1 auto" : 1, minHeight: 0, display: "flex", maxHeight: compact ? "clamp(280px, 62vh, 760px)" : undefined }}>
        <div
          ref={scrollRef} onScroll={onScroll}
          role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation"
          style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: SP[4], display: "flex", flexDirection: "column", gap: SP[4] }}
        >
          {messages.length === 0 && !attachments
            ? <EmptyState suggestions={suggestions} onPick={pick} subject={subject} />
            : messages.map(m => (
                <Bubble
                  key={m.id} msg={m} onRetry={onRetry}
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
      <div style={{ padding: SP[3], borderTop: `1px solid ${C.edge}`, background: C.surfaceSunken, flexShrink: 0 }}>
        {disabled && disabledReason && (
          <div style={{ ...TYPE.bodySm, fontSize: 12, color: C.faint, padding: "0 2px 8px" }}>{disabledReason}</div>
        )}
        <div
          className="cmdbar"
          style={{
            display: "flex", alignItems: "flex-end", gap: 8,
            background: C.inputBg, border: `1px solid ${C.edge}`,
            borderRadius: R.md, padding: "7px 7px 7px 12px",
            transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
          }}
        >
          <textarea
            ref={taRef}
            rows={1}
            value={draft}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              // Enter sends, Shift+Enter makes a newline — the convention every
              // chat UI has settled on.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              // Escape stops a run in flight, matching the stop button.
              else if (e.key === "Escape" && showStop) { e.preventDefault(); onStop(); }
            }}
            placeholder={disabled ? "Unavailable" : placeholder}
            aria-label="Message the AI assistant"
            style={{
              flex: 1, minWidth: 0, resize: "none", background: "transparent",
              border: "none", outline: "none", color: C.text,
              ...TYPE.bodySm, lineHeight: 1.5, padding: "5px 0", maxHeight: 132,
            }}
          />
          {/* Compact mode has no header for Clear to live in, so it rides the
              composer row — quiet, and only once there is something to clear. */}
          {compact && messages.length > 0 && onClear && (
            <button onClick={onClear} aria-label="Clear conversation" title="Clear conversation"
              style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 14, padding: "6px 4px", flexShrink: 0 }}>
              ↺
            </button>
          )}
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
              style={{
                ...button(canSend ? "primary" : "solid", "sm"),
                padding: "8px 12px", flexShrink: 0,
                opacity: canSend ? 1 : 0.5,
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              {busy ? <span className="v-spin" style={{ display: "inline-block" }}>◌</span> : "Send →"}
            </button>
          )}
        </div>

        {/* Quick chips teach the command vocabulary. In compact mode they are the
            ONLY teaching surface — EmptyState never renders there — so they show
            before the first message too, and the full set is offered while the
            thread is empty. */}
        {(messages.length > 0 || compact) && suggestions.length > 0 && !busy && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 2 }}>
            {suggestions.slice(0, messages.length === 0 ? 5 : 4).map(s => (
              <button key={sugLabel(s)} onClick={() => pick(sugValue(s))}
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
