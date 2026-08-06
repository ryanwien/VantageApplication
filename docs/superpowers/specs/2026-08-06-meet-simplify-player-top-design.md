# MEET tab without .env + trailer player on top + welcome modal that fits

**Date:** 2026-08-06 · **Status:** approved (Ryan, in-session)

## 1. MEET tab: drop the OAuth/backend section

Ryan: "I do not like this — get rid of .env." Chosen option: remove the OAuth section
entirely (over hide-until-backend-runs and creds-in-settings; the latter would push OAuth
client secrets through the browser).

The MEET tab keeps only the zero-setup surface: the "Go Live" card (New Google Meet / New
Zoom meeting buttons) and the pin-a-link-as-LIVE row. Removed: the "Or, for meetings
created & tracked inside Vantage… needs .env credentials" explainer, the red
"Backend not reachable — node --env-file=.env server/index.js" box, the Zoom/Google
connect cards, and the RECENT MEETINGS list. State/handlers that only served that section
(meetStatus, refreshMeetStatus, createMeeting, disconnectMeet, meetBusy, meetErr,
meetings) go with it, as do i18n keys used nowhere else. The "Real meetings" row in the
keys/features catalog is dropped too. `server/index.js` and `MEETINGS_SETUP.md` stay —
the backend still serves auth/billing/DataHub; the app just stops advertising its
meetings mode.

## 2. Trailer player: dock at the top of the desk

Ryan: "I was hoping it would play on the top, not bottom — I have to scroll down to see
the YouTube video." The embedded player panel currently renders below the response area,
so a trailer opened from a tall catalog grid lands off-screen.

The `{player && …}` panel moves above the anchor + response columns — first thing under
the desk header, full width. Because the user may have scrolled deep into the grid when
they hit ▶ trailer, opening the player also calls `scrollIntoView({behavior: "smooth",
block: "nearest"})` on it, so the video is on screen in both directions. No other player
behavior changes (YouTube, Archive, and brief-only fallback all render as before).

## 3. Welcome modal: fits the window, and shows once

Ryan, on the GETTING STARTED dialog at launch: annotated the top and bottom of its
scrollbar. Chosen: both fixes.

- **Fits.** The modal's content was taller than a typical window, so it scrolled inside its
  own `maxHeight: 92vh` box. Header 24→20px, body copy 12.5→11.5px, the setup note
  trimmed, and the four option cards tightened (padding 14/16→9/12, icon 26→20px, gaps
  10→7) — measured 503px tall in a 636px viewport, no inner scrollbar.
- **Once.** `showTutorial` now initializes from `localStorage["tape-tutorial-seen"]`, and an
  effect sets that flag whenever the modal closes — by skip, by picking a path, or by the
  no-AI-key shortcut. "Replay the welcome" in settings goes through a new `replayTutorial()`
  that clears the flag before reopening, so the replay isn't instantly re-marked seen.

## Testing

Pure-logic tests are unaffected (UI-only change); suite must stay green. Live checks:
MEET tab renders only Go Live + pin row with the backend stopped (no red box, no .env
text, in EN + one translated locale); "free films" catalog → ▶ play shows the player at
the top of the desk and scrolls it into view.
