# MOOSIC gallery redesign

The maintained Vercel source is `Frontend/MOOSIC-visual-refresh-final/MOOSIC-visual-refresh/artifacts/moodsic`. The root `vercel.json` points to its Vite output and supplies SPA rewrites for direct mood URLs. The root historical App.tsx and legacy backend are not the deployment entry points.

## Structure

- `/`: five physical mood CDs, neighboring disc preview, pointer tilt/reflection, horizontal drag/swipe, wheel accumulation, arrow buttons and keyboard region controls.
- `/mood/happy`, `/mood/sad`, `/mood/neutral`, `/mood/angry`, `/mood/exhausted`: compact editorial heroes, actual catalogue tracks and durations, favorites and playback controls.
- After the complete song list, each page has a native sticky next-mood section: 240vh of desktop scroll travel (180vh on mobile) and an explicit next-mood button. Progress directly controls rise, counterclockwise rotation, perspective, scale, separating title bands and contracting divider lines; stopping holds the frame and reverse scrolling reverses it. Navigation commits once at 99.5%, after user scroll intent. History restoration cannot trigger a commit. Reduced motion shows static artwork and the button. The configurable finite order lives in `src/lib/mood-navigation.ts`. Exhausted does not wrap.
- Existing authentication, library, search, discovery, premium, downloads, profile, and full player routes remain in place.

Framer Motion was already installed. Nested layers separate scroll transforms, pointer tilt and playback rotation. Playback is owned by the same persistent HomePage/MediaPlayer instance; mood browsing never submits a playback request. A request from a track row contains the selected track and the whole mood queue. The shared favorite state uses the existing Supabase endpoints.

All track information comes from the existing catalogue fetch; no new fake song database or schema migrations were added. Missing durations are explicitly represented as an incomplete total (`95+ min`) or unavailable. YouTube sources retain a visible operable embedded player as requested in the new brief. It is inline between the compact hero and tracklist (below the gallery on the homepage), never a floating popup. Native audio has no video surface. The single iframe stays mounted during route changes.

## Validation performed

- 31 frontend tests passed: source handling, playback engine, payments, spring motion, scroll accumulation/reversal/cooldown, sustained momentum lock, swipe direction, finite mood routing, duration metadata, normalized scroll hold/reversal and completion threshold.
- TypeScript and Vite production build passed. The pre-existing large-bundle warning remains (main bundle approximately 689 kB, 208 kB gzip with Motion).
- Browser: Happy CD opens its own route; Sad is reachable using mobile controls. All five mood routes load directly with their own song rows. Exhausted offers a return to all moods rather than an unexpected loop.
- Browser: selecting Shake It Off from Happy plays that track; music continues through a mood-route transition with exactly one YouTube iframe.
- Browser: favorite Hello, verify saved, then unfavorite and verify restored.
- Browser: keyboard arrows select a mood and Enter opens its page; back and forward restore the mood route; 390x844 layout has no horizontal overflow; narrow track metadata and controls inspected; no app console errors observed in the checked flow.
- Updated transition: all four forward mood transitions completed through browser wheel input; destination artwork and top-of-page arrival verified. Exhausted has no next disc or automatic wrap.
- Mid-transition at scrollY 3276, disc transform remained identical across separate observations; reversing to 2988 reversed rise, rotation and tilt. Sticky stage stayed at viewport top.
- Blinding Lights continued through multiple mood transitions, with one iframe and increasing playback time. The video wrapper was verified as relative inside a static inline section.
- Homepage drag left/right and horizontal wheel navigation verified without accidental route entry. Dragging now captures the pointer and starts from the current rendered position, preventing interrupted-motion jumps.
- Browser Back initially exposed an unwanted recommit. Added manual restoration, layout-time top reset and passive user-intent guard, then verified Back/Forward and another complete scroll transition plus Back.
- Updated layouts checked at 1280x720, 820x1180 and 390x844; no horizontal overflow. Mobile next button works. No app console errors observed. Physical phone swipes and hardware-specific trackpad feel still require user review. Reduced-motion hooks/CSS are implemented; OS preference switching was not performed. No dedicated heap profiling was performed.

The user approved pushing to GitHub and updating the production Vercel site on 9 October 2026. The earlier preview-only approval block is superseded by this explicit publication request.

## Recording comparison (9 October refinement)

The supplied recording was sampled every half second across its first 15 seconds (31 frames). The main transition occurs in roughly seconds 0–5: a centered disc crown rises and widens as perspective flattens, the printed face rotates counterclockwise, two large title bands separate, and divider lines retract. The destination page arrives around seconds 5–7; the remaining interval is mostly that page and browser UI.

MOOSIC maps those stages to normalized native scroll position, not elapsed time. Keyframes live in `src/lib/next-mood-motion.ts`; there is no 15-second playback or idle progress reset. A native View Transition keeps the destination disc visually connected to the compact destination hero. Browsers without that API change routes directly. Existing pointer reflections and the nested playback spin use separate transform layers.

Visible differences are intentional MOOSIC artwork, dark backgrounds and mood titles; approximate perspective/rotation rather than a pixel-identical copy; and a shared-disc handoff instead of the reference's brief blank-page interval. The final handoff is a short route animation only after the visitor completes the scroll or presses the explicit button.
