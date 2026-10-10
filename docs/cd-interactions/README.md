# CD interactions — approved release, 10 October 2026

## Reference observations

Inspected the user's 11.84-second recording, `Screen Recording 2026-10-10 at 8.48.43 AM.mov`, from the Desktop. Sampled the whole recording every half-second and the click at 8.0–9.1 seconds every 100 ms. Also viewed the live A24 reference. No artwork or implementation code was copied from that site.

- 0–4.5 seconds: the front disc gently rocks with the pointer. Its print, metal and hole stay aligned; there is no obvious surface mesh deformation. The thin contour is offset, imperfect and trails the disc, sometimes crossing behind the rim.
- 5–7.5 seconds: the gallery browses through neighbours; only the hovered disc gains the loose outline.
- Around 8.1–8.4 seconds: neighbours retreat, the selected disc recentres and gets smaller, keeping its existing orientation at initiation.
- Around 8.5–8.8 seconds: the disc turns more edge-on and recedes while the editorial heading reveals. By 9 seconds the destination dominates.

MOOSIC follows that staging in a one-second entrance: 430 ms to isolate/recentre, then 570 ms to turn in depth and resolve into its existing playlist-header disc. The final handoff intentionally retains MOOSIC's header CD rather than making the disc vanish as it does in the reference. This is a reference-informed recreation, not a pixel-identical copy.

## Implementation

- `components/cd/interactive-cd.tsx`: pointer-driven spring motion and a separate delayed outline layer. Cached pointer bounds, no React updates per frame, frame loop stops after settling; listeners and frames clean up. Keyboard focus activates the same clear contour. Touch does not need hover.
- `components/cd/cd-motion.ts`: stable substepped spring and smooth irregular SVG contour.
- `components/cd/use-cd-entry.ts`: snapshots the exact hover pose, runs the entrance across the existing client-side route boundary, then hands the disc to the real header. Duplicate clicks are locked out; browser history, resize, Escape and navigation links cancel safely. Temporary clones and animations are removed.
- The global player stays mounted. The existing bottom scroll system remains independent and unchanged, including its next-mood artwork.
- Reduced-motion preference bypasses the entrance and spring loop, with a static outline. The CSS and preference branches were reviewed; system-level reduced-motion emulation was not available in the browser test tool.
- Real-photo artwork remains shared across every CD. The user approved publishing this version to GitHub and Vercel on 10 October 2026.

## Validation

- `pnpm test`: 34 tests passed, including new spring interruption/settling, suspended-frame stability and outline continuity tests.
- `pnpm build`: TypeScript and production build passed. Vite retains the existing large-bundle advisory.
- Browser: all five mood entries; keyboard navigation; browser Back; rapid double-click; no remaining transition clones; no console errors.
- 390×844 mobile-width entry into Exhausted completed and retained the page layout. This is a responsive viewport check, not a physical-device performance benchmark.
- Playback continuity: Hello by Adele advanced from 0:34 to 0:36 while returning to the gallery and entering Neutral. Playback was paused after the check.
- Bottom Angry → Exhausted section held its exact transform while idle, reversed when scrolling up, and navigated correctly when scrolling completed.

Working preview: http://localhost:5173/
