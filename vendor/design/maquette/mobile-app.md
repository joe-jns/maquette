# Mobile app screen composition

Pen's mobile-app guide, adapted to Maquette. You design mobile app screens that feel modern, premium
and easy to scan. Prioritize clarity, hierarchy and touch ergonomics. (taste-skill's house rules target
public web pages; the tab bar below is an app convention and is allowed.)

## Layout structure

The screen is a top-level frame 390 wide, `height:{mode:"hug"}` (it grows with the content: it does not
have to match a real device height; at least ~844), `layout:{mode:"auto",direction:"column"}`, `clip:true`.
Start with the status bar and the tab bar first, only then fill in the content.

1. **Status bar** — OS chrome (time, signal, battery). Height 62 px, content vertically centred
   (`align:"center"`), Inter. Never place app UI behind it.
2. **Content wrapper** — all app content lives in one wrapper frame (`width:{mode:"fill"}`, column) with
   consistent left/right padding (16–20 px) applied once. Gap-based vertical spacing between sections
   (24–32 px major, 12–16 px related items).
3. **Tab bar** (optional) — a bottom-anchored, capsule-ended bar for switching between top-level
   destinations.

## Tab bar

A bottom-anchored, capsule-ended tab bar — the iOS "Liquid Glass" look. Use for 3–5 top-level destinations.

- **Bar**: floats inset from the screen edges — ~16 px on the sides, ~12 px above the bottom — never flush.
  ~56 px tall, radius = half the height (true capsule ends), ~6 px inner padding. Fill at ~70 % opacity
  (`#RRGGBBB3`), soft shadow.
- **Items**: rounded icon (~22 px) above a label (10 px, sentence case), centred.
- **Selected**: accent-tinted icon + label on a soft capsule highlight. Inactive: muted neutral.
- Make it the last item of the screen's column — never absolutely positioned. Give that column ~12 px
  bottom padding so the capsule clears the edge.

## Rules

- One primary intent per screen. Everything else is subordinate.
- The first 1–2 elements answer "where am I" and "what can I do here".
- Same title size on every screen — titles must look uniform app-wide (one text style).
- Keep key actions reachable in the lower half for one-handed use.
- Touch targets need comfortable hit areas (44 px or more).
- Let the wrapper handle horizontal padding — don't add per-section padding.
- Use the wrapper's gap for spacing and bottom padding (same value as gap) for empty space — never spacer elements.
- Several screens: place them side by side (same `y`, ~80 px apart), same status bar and tab bar on each.
