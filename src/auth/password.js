// ============================================================
//  Password policy — the rules the email & password flow actually enforces.
//
//  WHY THIS IS ITS OWN MODULE
//  It started life inside React.jsx next to the sign-up form. It is the one piece
//  of that screen with a security consequence, and it is pure data-in/data-out,
//  so it belongs somewhere it can be unit-tested without mounting a 9,000-line
//  component. React.jsx imports it; password.test.js pins its behaviour.
//
//  THE APPROACH
//  Modelled on NIST SP 800-63B rather than the "one capital, one symbol" school.
//  Length and unguessability do the real work; composition rules mostly teach
//  people to write Password1! and then forget it. So the hard gate is short —
//  eight characters, nothing that is literally the user's own email, and nothing
//  off the top of the leak lists. Everything beyond that is advice shown in the
//  strength meter, not a barrier.
//
//  WHY THE GATE MATTERS MORE HERE THAN USUAL
//  On the local (no-backend) path there is no password reset, because there is no
//  server and no mailbox to send from. A forgotten password is a lost account —
//  which is also why signup asks for the password twice rather than trusting a
//  single masked field.
// ============================================================

export const PW_MIN = 8;

// Not a leak dictionary — a short list of the passwords that show up at the very
// top of every published breach corpus, plus the ones this app's own name invites.
// A real check would call a k-anonymity range API; this is the honest offline
// approximation, and it is checked case-insensitively.
export const WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "iloveyou", "admin123", "welcome1", "letmein1",
  "abc12345", "trustno1", "monkey123", "sunshine1", "princess", "football",
  "baseball", "dragon123", "passw0rd", "vantage1", "vantage123", "changeme",
]);

/**
 * Grade a candidate password.
 *
 * @param {string} pw            the candidate
 * @param {{email?: string}} ctx the email being signed up with, so the password
 *                               can be rejected for simply repeating it
 * @returns {{ok: boolean, blocking: string|null, score: number, label: string}}
 *          `blocking` is a sentence to show the user, or null when the password
 *          passes. `score` is 0–4 and is advisory only — it drives the meter,
 *          never the gate.
 */
export function passwordCheck(pw, { email = "" } = {}) {
  pw = typeof pw === "string" ? pw : "";
  const local = String(email).split("@")[0].trim().toLowerCase();
  const lower = pw.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length;
  const distinct = new Set(pw).size;

  // Blocking rules — the only things that actually stop the form.
  let blocking = null;
  if (!pw) blocking = "Choose a password.";
  else if (pw.length < PW_MIN) blocking = `Use at least ${PW_MIN} characters — ${PW_MIN - pw.length} to go.`;
  else if (WEAK_PASSWORDS.has(lower)) blocking = "That is one of the most-guessed passwords. Pick another.";
  else if (local.length >= 3 && lower.includes(local)) blocking = "Don't use your email address as your password.";
  else if (distinct <= 2) blocking = "Too repetitive — vary the characters.";

  // Advisory score, 0–4. Length is weighted hardest because length is what
  // actually costs an attacker time; variety is a tiebreaker, not the point.
  let score = 0;
  if (!blocking) {
    score = 1;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (classes >= 3 && pw.length >= 10) score++;
  }
  score = Math.min(score, 4);

  return { ok: !blocking, blocking, score, label: ["Too weak", "Weak", "Fair", "Good", "Strong"][score] };
}
