# Styling Vibe

Keep the styles as plain CSS. The shared values are CSS custom properties in `public/stylesheets/base.css`; change a color, font or spacing value there instead of copying a new literal across pages.

| File | Responsibility |
| --- | --- |
| `base.css` | Reset, fonts, color/spacing variables, text, buttons, fields, focus rings, header/footer |
| `landing.css` | Landing layout and CSS record artwork |
| `auth.css` | Login and signup forms |
| `music.css` | App grid, navigation, tracks, player, dialogs, responsive behavior |
| `credits.css` | Music and contributor credits |

The head template loads `base.css` and the page stylesheet. Use a class for styling and an ID for a unique control referenced by JavaScript. Keep selectors local to a component; avoid selectors that change every `div` or hide document overflow to mask layout bugs. Conditional UI uses `hidden`, `aria-current`, `aria-pressed` or a small `data-*` state.

Create markup with the existing `field`, `brand` and `icon` Pug mixins when applicable. Interactive controls are buttons and links with visible or accessible names. For dynamic text, use `textContent`; do not interpolate user strings into `innerHTML`.

The music shell uses a three-row desktop grid and four-row phone grid. Only the main music pane and playlist navigation scroll independently. Below 700px, the primary navigation moves above the content and track rows drop the optional genre column. Use browser tests at 1440px and 390px, and check intermediate widths when changing shell geometry. Preserve keyboard focus, browser zoom and native dialog behavior.

Run `npm run format` to expand and normalize the CSS and JavaScript. Add a new shared primitive only when multiple existing components need it. A framework or preprocessor is unnecessary for this size of app.

## Catalog and motion ownership

Load order is base, page shell, catalog, Library, then motion. `base.css` owns tokens, fonts and primitives. `music.css` owns the header, sidebar, player and dialogs. `catalog.css` owns track rows/actions, artwork, Discover and album layouts. `library.css` owns collection tabs, saved-list treatment and sorting. `motion.css` owns SVG tracing and disk rotation; the landing wrapper handles entrance movement while its child disk rotates and its needle stays stationary. `motion.js` uses CSS animation-play-state so pausing a disk retains its angle. System reduced motion is always respected; Vibe has no separate motion button.
