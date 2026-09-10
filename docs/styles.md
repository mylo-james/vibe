# Styling Vibe

Keep the styles as plain CSS. The shared values are CSS custom properties in `public/stylesheets/base.css`; change a color, font or spacing value there instead of copying a new literal across pages.

| File | Responsibility |
| --- | --- |
| `base.css` | Reset, fonts, color/spacing variables, text, buttons, fields, focus rings, header/footer |
| `landing.css` | Landing layout and CSS record artwork |
| `auth.css` | Login and signup forms |
| `music.css` | Music shell, header, sidebar navigation, player, dialogs and shell-responsive behavior |
| `catalog.css` | Shared track rows and actions, artwork, Discover, album and catalog-responsive layouts |
| `library.css` | Collection tabs, saved-list treatment and sorting |
| `credits.css` | Music and contributor credits |
| `motion.css` | Waveform tracing and landing/player disk rotation |

The head template loads `base.css` and the page stylesheet. Use a class for styling and an ID for a unique control referenced by JavaScript. Keep selectors local to a component; avoid selectors that change every `div` or hide document overflow to mask layout bugs. Conditional UI uses `hidden`, `aria-current`, `aria-pressed` or a small `data-*` state.

Create markup with the existing `field`, `brand` and `icon` Pug mixins when applicable. Interactive controls are buttons and links with visible or accessible names. For dynamic text, use `textContent`; do not interpolate user strings into `innerHTML`.

The music shell uses a three-row desktop grid and a four-row phone grid. The main music pane and playlist navigation scroll independently. Below 700px, the phone header is 60px, the primary navigation is 44px above the content, and the mini-player takes its content height plus the safe-area inset. The player keeps play, next and seek visible; shuffle, previous and repeat expand from the More playback controls button. Keep `aria-expanded` synchronized with that panel, move focus into it when opened, and restore focus to the trigger when Escape closes it. Preserve keyboard focus, browser zoom and native dialog behavior.

Run `npm run format` to expand and normalize the CSS and JavaScript. Add a new shared primitive only when multiple existing components need it. A framework or preprocessor is unnecessary for this size of app.

## Catalog and motion ownership

Load order is base, page shell, catalog, Library, then motion. `base.css` owns tokens, fonts and primitives. `music.css` owns the header, sidebar, player and dialogs. `catalog.css` owns track rows/actions, artwork, Discover and album layouts. `library.css` owns collection tabs, saved-list treatment and sorting. `motion.css` owns SVG tracing and disk rotation; the landing wrapper handles entrance movement while its child disk rotates and its needle stays stationary. `motion.js` uses CSS animation-play-state so pausing a disk retains its angle. System reduced motion is always respected; Vibe has no separate motion button.

## Discover catalog behavior

Discover is album-led: show the featured release and album shelf before filters and track tools. On phones, only the Discover album shelf becomes a horizontal, scroll-snapping carousel; Albums and Library retain their grids. Album shelves use six columns on desktop, three at tablet widths, and two columns on other phone screens.

Load the featured album and initial track selection first, then hydrate the remaining albums in small batches before the rest of the track catalog. Use settled results for independent catalog requests: a failed provider detail must show the retry/local-collection notice without preventing already loaded music from rendering.
