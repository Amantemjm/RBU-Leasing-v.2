<script setup>
// The shared chrome for every public (signed-out) page: skip link, sticky site
// header with the brand lockup and the docked theme switch, the page body, and
// the site footer.
//
// It exists because the public pages had drifted into two unrelated designs —
// the front page was a proper site layout, while login, signup and the two
// inquiry steps were each a standalone deep-green void with a floating card.
// Those had no header, no footer, and did not respond to the theme at all.
// Extracting the front page's shell is what makes them one system.
//
// Slots: `nav-actions` replaces the default Sign in link; `hero` renders a
// full-bleed band above the body; the default slot is the page content.
import { RouterLink } from "vue-router";
import ThemeToggle from "./ThemeToggle.vue";
import logoUrl from "../assets/ortigas-logo.svg";

defineProps({
  // Names the <main> landmark for screen readers.
  mainLabel: { type: String, default: "Main content" },
  skipLabel: { type: String, default: "Skip to main content" },
  // Centres the body in a reading-width column — used by the pages that are a
  // single card (login, signup, inquiry) rather than a full-width listing.
  narrow: { type: Boolean, default: false },
  // Widens the narrow column for pages whose content is a form rather than
  // prose. Ignored unless `narrow` is set.
  width: { type: String, default: "" },
});
</script>

<template>
  <div class="portal">
    <a class="skip" href="#main">{{ skipLabel }}</a>

    <header class="nav" aria-label="Site header">
      <div class="nav__inner">
        <RouterLink to="/" class="brand">
          <img :src="logoUrl" alt="" class="brand__logo" />
          <span class="brand__text">
            <span class="brand__name">Ortigas Land</span>
            <span class="brand__sub">Leasing Portal</span>
          </span>
        </RouterLink>
        <nav class="nav__actions" aria-label="Primary">
          <slot name="nav-actions">
            <RouterLink to="/login" class="nav__signin">Sign in</RouterLink>
          </slot>
          <!-- Docked, not floating: a fixed switch sat on top of "Sign in". -->
          <ThemeToggle inline />
        </nav>
      </div>
    </header>

    <slot name="hero" />

    <main
      id="main"
      class="shell__main"
      :class="{ 'shell__main--narrow': narrow }"
      :style="narrow && width ? { maxWidth: width } : null"
      :aria-label="mainLabel"
    >
      <slot />
    </main>

    <footer class="foot" aria-label="Site footer">
      <div class="foot__grid">
        <div class="foot__col foot__col--brand">
          <img :src="logoUrl" alt="" class="foot__logo" />
          <p class="foot__name">Residential Leasing by Ortigas Land</p>
          <p class="foot__addr">7F Estancia West Wing, Meralco Avenue,<br />Pasig City 1605, Philippines</p>
          <p class="foot__phone">(+632) 8631-1231 · (+63) 917 678 4427</p>
        </div>
        <div class="foot__col">
          <h4>Explore</h4>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">News</a>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">Careers</a>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">Privacy Policy</a>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">Online Payment</a>
        </div>
        <div class="foot__col">
          <h4>Get connected</h4>
          <p class="foot__social-note">Follow Ortigas Land for updates on projects, estates, and malls.</p>
          <RouterLink to="/inquiry?as=LESSEE" class="foot__cta">Make an inquiry</RouterLink>
        </div>
      </div>
      <p class="foot__copy">© Ortigas Land · Residential Leasing</p>
    </footer>
  </div>
</template>

<style scoped>
.portal {
  /* Two distinct roles that used to share one token. `--brand` is a text and
     accent colour, so dark mode lifts it to a mint to keep it legible on dark
     surfaces. `--brand-deep` is a *fill* — the footer slab and the skip link —
     and must stay the deep green in both themes, or that lift turns the footer
     into a bright mint block with pale text on it. Never override it in a dark
     block. */
  --brand-deep: #0D3A2F;
  --brand: #0D3A2F;
  /* The bar is a white slab in both themes, so everything on it is coloured for
     a light ground and must not follow the theme. `--surface`, `--line` and
     `--muted` all flip in dark mode, which would have turned the bar dark and
     the wordmark mint-on-white. */
  --nav-bg: #FFFFFF;
  --nav-line: #D6F0E9;
  --nav-muted: #3F6055;

  /* The public pages are a fixed white-and-green brand surface: white header,
     white body, green footer, in both themes. The theme switch still sets the
     preference — it just takes effect in the signed-in app rather than here.
     Re-pinning the light palette on `.portal` is what makes that hold: these
     declarations sit closer than the `:root[data-theme="dark"]` ones, so every
     descendant reads the light value even while dark is on. Any token added to
     the app's dark palette must be pinned here too, or it leaks in — there is a
     test that fails if one is missed. */
  --paper: #EAF6F3;
  --surface: #FFFFFF;
  --line: #D6F0E9;
  --line-strong: #B7E1D7;
  --text: #082A21;
  --muted: #3F6055;
  --faint: #4F7264;
  --thead-bg: #F4FBF9;
  --row-hover: #F4FBF9;
  --ink-800: #13493B;
  --ink-700: #1A5B4B;
  --ink-600: #257460;
  --accent: #257460;
  --accent-600: #1A5B4B;
  --accent-050: #D6F0E9;
  --accent-text: #257460;
  --good: #12783D;
  --warn: #845412;
  --danger: #B23A31;
  --on-danger: #FFFFFF;
  --good-050: #e7f3ec;
  --warn-050: #f6efe0;
  --danger-050: #f8e9e7;
  --shadow-sm: 0 1px 2px rgba(9, 30, 22, 0.06), 0 1px 3px rgba(9, 30, 22, 0.05);
  --shadow-md: 0 6px 20px rgba(9, 30, 22, 0.10);
  --shadow-lg: 0 18px 40px -18px rgba(9, 30, 22, 0.30), 0 6px 16px -8px rgba(9, 30, 22, 0.14);
  --brand-600: #1A5B4B;
  --brand-tint: #D6F0E9;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  color: var(--text);
  font-family: var(--ui);
}

.skip {
  position: absolute; left: 0.75rem; top: -3rem; z-index: 60;
  background: var(--brand-deep); color: #fff; text-decoration: none; font-weight: 650;
  font-size: 0.85rem; padding: 0.55rem 0.9rem; border-radius: var(--radius-sm);
  transition: top 0.18s ease;
}
.skip:focus { top: 0.75rem; }

.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--nav-bg);
  border-bottom: 1px solid var(--nav-line);
}
.nav__inner {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem clamp(1rem, 2.5vw, 1.75rem);
}
.brand { display: inline-flex; align-items: baseline; gap: 0.5rem; text-decoration: none; }
.brand__text { display: inline-flex; align-items: baseline; gap: 0.45rem; }
.brand__logo { width: 27px; height: 27px; align-self: center; }
.brand__name { font-family: var(--display, Georgia, serif); font-size: 1.18rem; font-weight: 600; color: var(--brand-deep); }
.brand__sub { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--nav-muted); font-weight: 700; white-space: nowrap; }
.nav__actions { display: flex; align-items: center; gap: 0.6rem; }
.nav__actions :deep(.themeswitch) { margin-left: 0.15rem; flex-shrink: 0; }
.nav__actions :deep(.nav__signin), .nav__signin { color: var(--brand-deep); text-decoration: none; font-weight: 600; font-size: 0.86rem; padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); white-space: nowrap; }
.nav__actions :deep(.nav__signin):hover, .nav__signin:hover { background: #e7efec; }

/* The body takes the space between header and footer so short pages still push
   the footer to the bottom of the window. */
.shell__main { flex: 1 0 auto; }
.shell__main--narrow {
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  padding: clamp(2rem, 5vw, 3.25rem) clamp(1rem, 4vw, 2rem) clamp(2.5rem, 6vw, 4rem);
}

.foot { background: var(--brand-deep); color: #d7e7e0; padding: clamp(2.5rem, 5vw, 3.5rem) clamp(1rem, 4vw, 3rem) 1.5rem; }
.foot__grid { max-width: 78rem; margin: 0 auto; display: grid; grid-template-columns: 1.6fr 1fr 1.2fr; gap: 2rem; }
.foot__logo { width: 34px; height: 34px; filter: brightness(0) invert(1); opacity: 0.92; }
.foot__name { margin: 0.6rem 0 0.5rem; font-family: var(--display, Georgia, serif); font-size: 1.15rem; color: #fff; }
.foot__addr { margin: 0 0 0.4rem; font-size: 0.85rem; line-height: 1.5; }
.foot__phone { margin: 0; font-size: 0.85rem; color: #a9cfc2; }
.foot__col h4 { margin: 0 0 0.75rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: #8fbcae; font-weight: 700; }
.foot__col a { display: block; color: #d7e7e0; text-decoration: none; font-size: 0.88rem; padding: 0.25rem 0; }
.foot__col a:hover { color: #fff; }
.foot__social-note { margin: 0 0 0.9rem; font-size: 0.85rem; line-height: 1.5; }
/* `.foot__col a` outranks a bare `.foot__cta`, so the button was taking the pale
   footer-link colour on its own white fill — 1.28:1, effectively invisible.
   Qualify the selector so the button wins on its own ground. */
.foot__col a.foot__cta { display: inline-block; background: #fff; color: var(--brand-deep); text-decoration: none; font-weight: 650; font-size: 0.85rem; padding: 0.5rem 1rem; border-radius: var(--radius-sm); }
.foot__col a.foot__cta:hover { background: #eaf3ee; color: var(--brand-deep); }
.foot__copy { max-width: 78rem; margin: 2rem auto 0; padding-top: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.14); font-size: 0.78rem; color: #a9cfc2; }

@media (max-width: 720px) {
  .foot__grid { grid-template-columns: 1fr; gap: 1.5rem; }
  /* Sign in used to be hidden at this width, leaving portal users with no way
     in on a phone. Tighten the bar instead of dropping the link. */
  .nav__inner { gap: 0.5rem; padding-left: 1rem; padding-right: 1rem; }
  .nav__actions { gap: 0.35rem; }
  .nav__signin { padding: 0.45rem 0.5rem; font-size: 0.82rem; }
  .brand__sub { display: none; }
}
@media (max-width: 430px) {
  .brand__name { display: none; }
  .brand__logo { width: 30px; height: 30px; }
}


/* Toggling the switch turns the public pages green. Every value is a step on
   the one hue-165 ramp, so these greens are the light theme's greens at a
   different lightness rather than a second, hand-picked palette.
   `--nav-bg`, `--nav-line`, `--nav-muted` and `--brand-deep` are deliberately
   absent: those are the frame, and it does not move. Emitted twice from one
   source, for the explicit choice and the OS preference; keep them identical. */
:root[data-theme="dark"] .portal,
:root.is-dark .portal {
  --paper: #07271F;
  --surface: #13493B;
  --line: #1A5B4B;
  --line-strong: #257460;
  --thead-bg: #0D3A2F;
  --row-hover: #1A5B4B;
  --text: #E9F6F0;
  --muted: #A6C8BA;
  --faint: #9BC0B1;
  --ink-800: #FFFFFF;
  --ink-700: #D9EFE7;
  --ink-600: #B7E1D7;
  --brand: #8DCEBE;
  --brand-600: #B7E1D7;
  --brand-tint: rgba(141, 206, 190, 0.14);
  --accent: #60BEA6;
  --accent-600: #8DCEBE;
  --accent-050: rgba(141, 206, 190, 0.18);
  --accent-text: #8DCEBE;
  --good: #5FD69C;
  --warn: #E8BA66;
  --danger: #F59C92;
  --on-danger: #2A0F0C;
  --good-050: rgba(95, 214, 156, 0.18);
  --warn-050: rgba(232, 186, 102, 0.18);
  --danger-050: rgba(245, 156, 146, 0.18);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.24);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.38);
  --shadow-lg: 0 22px 48px -18px rgba(0, 0, 0, 0.55), 0 8px 20px -10px rgba(0, 0, 0, 0.4);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .portal {
    --paper: #07271F;
    --surface: #13493B;
    --line: #1A5B4B;
    --line-strong: #257460;
    --thead-bg: #0D3A2F;
    --row-hover: #1A5B4B;
    --text: #E9F6F0;
    --muted: #A6C8BA;
    --faint: #9BC0B1;
    --ink-800: #FFFFFF;
    --ink-700: #D9EFE7;
    --ink-600: #B7E1D7;
    --brand: #8DCEBE;
    --brand-600: #B7E1D7;
    --brand-tint: rgba(141, 206, 190, 0.14);
    --accent: #60BEA6;
    --accent-600: #8DCEBE;
    --accent-050: rgba(141, 206, 190, 0.18);
    --accent-text: #8DCEBE;
    --good: #5FD69C;
    --warn: #E8BA66;
    --danger: #F59C92;
    --on-danger: #2A0F0C;
    --good-050: rgba(95, 214, 156, 0.18);
    --warn-050: rgba(232, 186, 102, 0.18);
    --danger-050: rgba(245, 156, 146, 0.18);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.24);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.38);
    --shadow-lg: 0 22px 48px -18px rgba(0, 0, 0, 0.55), 0 8px 20px -10px rgba(0, 0, 0, 0.4);
  }
}
</style>
