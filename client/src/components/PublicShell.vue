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
  // Footer size: "full" (columns + copyright), "slim" (copyright line only —
  // for focused form pages), or "none". Defaults to the full site footer.
  footer: { type: String, default: "full" },
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

    <footer v-if="footer !== 'none'" class="foot" :class="{ 'foot--slim': footer === 'slim' }" aria-label="Site footer">
      <div v-if="footer === 'full'" class="foot__grid">
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
  --brand-deep: #1D5532;
  --brand: #1D5532;
  /* The bar is a white slab in both themes, so everything on it is coloured for
     a light ground and must not follow the theme. `--surface`, `--line` and
     `--muted` all flip in dark mode, which would have turned the bar dark and
     the wordmark mint-on-white. */
  --nav-bg: #FFFFFF;
  --nav-line: #E2E2E2;
  --nav-muted: #4A4A4A;

  /* The public pages are a fixed white-and-green brand surface: white header,
     white body, green footer, in both themes. The theme switch still sets the
     preference — it just takes effect in the signed-in app rather than here.
     Re-pinning the light palette on `.portal` is what makes that hold: these
     declarations sit closer than the `:root[data-theme="dark"]` ones, so every
     descendant reads the light value even while dark is on. Any token added to
     the app's dark palette must be pinned here too, or it leaks in — there is a
     test that fails if one is missed. */
  --paper: #FFFFFF;
  --surface: #FFFFFF;
  --line: #E2E2E2;
  --line-strong: #C9C9C9;
  --text: #000000;
  --muted: #4A4A4A;
  --faint: #666666;
  --thead-bg: #F6F7F6;
  --row-hover: #F4F6F4;
  --ink-800: #000000;
  --ink-700: #1A1A1A;
  --ink-600: #4A4A4A;
  --accent: #1D5532;
  --accent-600: #164026;
  --accent-050: #E8F0EB;
  --accent-text: #1D5532;
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
  --brand-600: #164026;
  --brand-tint: #E8F0EB;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  color: var(--text);
  font-family: var(--ui);
  --chrome-bg: #FFFFFF;
  --chrome-text: #000000;
  --chrome-muted: #4A4A4A;
  --chrome-faint: #666666;
  --chrome-line: #E2E2E2;
  --chrome-accent: #1D5532;
  --chrome-hover: #F1F5F2;
  --chrome-logo: brightness(0);
  --panel-bg: #FFFFFF;
  --panel-text: #000000;
  --panel-muted: #4A4A4A;
  --panel-line: #E2E2E2;
  --panel-accent: #1D5532;
  --surface-2: #F6F7F6;
  --on-accent: #FFFFFF;

}

.skip {
  position: absolute; left: 0.75rem; top: -3rem; z-index: 60;
  background: var(--accent); color: var(--on-accent, #fff); text-decoration: none; font-weight: 650;
  font-size: 0.85rem; padding: 0.55rem 0.9rem; border-radius: var(--radius-sm);
  transition: top 0.18s ease;
}
.skip:focus { top: 0.75rem; }

.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-line);
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
/* Same treatment as the footer mark: the bar is dark in both modes, so the
   logo is tinted to the chrome's own text colour rather than left as the
   original green, which had no contrast against the teal. */
.brand__logo { width: 27px; height: 27px; align-self: center; filter: var(--chrome-logo); }
.brand__name { font-family: var(--display, Georgia, serif); font-size: 1.18rem; font-weight: 600; color: var(--chrome-text); }
.brand__sub { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--chrome-muted); font-weight: 700; white-space: nowrap; }
.nav__actions { display: flex; align-items: center; gap: 0.6rem; }
.nav__actions :deep(.themeswitch) { margin-left: 0.15rem; flex-shrink: 0; }
.nav__actions :deep(.nav__signin), .nav__signin { color: var(--chrome-accent); text-decoration: none; font-weight: 600; font-size: 0.86rem; padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); white-space: nowrap; }
.nav__actions :deep(.nav__signin):hover, .nav__signin:hover { background: var(--chrome-hover); }

/* The body takes the space between header and footer so short pages still push
   the footer to the bottom of the window. */
.shell__main { flex: 1 0 auto; }
.shell__main--narrow {
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  padding: clamp(2rem, 5vw, 3.25rem) clamp(1rem, 4vw, 2rem) clamp(2.5rem, 6vw, 4rem);
}

.foot { background: var(--chrome-bg); color: var(--chrome-muted); padding: clamp(1.6rem, 3.2vw, 2.25rem) clamp(1rem, 4vw, 3rem) 1.1rem; }
.foot__grid { max-width: 78rem; margin: 0 auto; display: grid; grid-template-columns: 1.6fr 1fr 1.2fr; gap: 1.5rem; }
.foot__logo { width: 34px; height: 34px; filter: var(--chrome-logo); opacity: 0.92; }
.foot__name { margin: 0.5rem 0 0.4rem; font-family: var(--display, Georgia, serif); font-size: 1.08rem; color: var(--chrome-text); }
.foot__addr { margin: 0 0 0.4rem; font-size: 0.85rem; line-height: 1.5; }
.foot__phone { margin: 0; font-size: 0.85rem; color: var(--chrome-faint); }
.foot__col h4 { margin: 0 0 0.75rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--chrome-faint); font-weight: 700; }
.foot__col a { display: block; color: var(--chrome-muted); text-decoration: none; font-size: 0.88rem; padding: 0.25rem 0; }
.foot__col a:hover { color: var(--chrome-text); }
.foot__social-note { margin: 0 0 0.9rem; font-size: 0.85rem; line-height: 1.5; }
/* `.foot__col a` outranks a bare `.foot__cta`, so the button was taking the pale
   footer-link colour on its own white fill — 1.28:1, effectively invisible.
   Qualify the selector so the button wins on its own ground. */
.foot__col a.foot__cta { display: inline-block; background: var(--chrome-text); color: var(--chrome-bg); text-decoration: none; font-weight: 650; font-size: 0.85rem; padding: 0.5rem 1rem; border-radius: var(--radius-sm); }
.foot__col a.foot__cta:hover { background: var(--chrome-muted); color: var(--chrome-bg); }
.foot__copy { max-width: 78rem; margin: 1.35rem auto 0; padding-top: 1rem; border-top: 1px solid var(--chrome-line); font-size: 0.78rem; color: var(--chrome-faint); }
/* Slim footer for focused form pages: just the copyright line, no top rule. */
.foot--slim { padding-top: 0.85rem; padding-bottom: 0.85rem; }
.foot--slim .foot__copy { margin: 0; padding-top: 0; border-top: none; }

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


/* The public pages carry the same two designed modes as the app: a deep
   #040D12 ground in dark, a soft off-white in light, with #183D3D navigation in
   both. Not an inversion — each mode has its own surface ladder and its own
   accent fill, because #5C8374 carries dark text well and white text poorly.
   Emitted twice from one source; keep the two identical. */
:root[data-theme="dark"] .portal,
:root.is-dark .portal {
  --paper: #121212;
  --surface: #1E1E1E;
  --surface-2: #262626;
  --line: #2F2F2F;
  --line-strong: #454545;
  --text: #EDEDED;
  --muted: #A8A8A8;
  --faint: #8A8A8A;
  --thead-bg: #242424;
  --row-hover: #1A1A1A;
  --ink-800: #EDEDED;
  --ink-700: #DADADA;
  --ink-600: #A8A8A8;
  --accent: #4FA96B;
  --accent-600: #6FBF87;
  --accent-050: rgba(79, 169, 107, 0.16);
  --accent-text: #6FBF87;
  --on-accent: #000000;
  --good: #5FD69C;
  --warn: #E8BA66;
  --danger: #F08C82;
  --on-danger: #2A0F0C;
  --chrome-bg: #1E1E1E;
  --chrome-text: #EDEDED;
  --chrome-muted: #A8A8A8;
  --chrome-faint: #8A8A8A;
  --chrome-line: #2F2F2F;
  --chrome-accent: #6FBF87;
  --chrome-hover: rgba(255, 255, 255, 0.06);
  --chrome-logo: brightness(0) invert(1);
  --panel-bg: #1E1E1E;
  --panel-text: #EDEDED;
  --panel-muted: #A8A8A8;
  --panel-line: #2F2F2F;
  --panel-accent: #6FBF87;
  --brand-deep: #1E1E1E;
  --brand: #6FBF87;
  --brand-600: #4FA96B;
  --brand-tint: rgba(79, 169, 107, 0.16);
  --nav-bg: #1E1E1E;
  --nav-line: #2F2F2F;
  --nav-muted: #A8A8A8;
  --good-050: rgba(95, 214, 156, 0.16);
  --warn-050: rgba(232, 186, 102, 0.16);
  --danger-050: rgba(240, 140, 130, 0.16);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.44), 0 1px 3px rgba(0, 0, 0, 0.32);
  --shadow-md: 0 6px 18px -6px rgba(0, 0, 0, 0.60), 0 2px 8px -3px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 22px 48px -22px rgba(0, 0, 0, 0.76), 0 8px 20px -10px rgba(0, 0, 0, 0.55);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .portal {
    --paper: #121212;
    --surface: #1E1E1E;
    --surface-2: #262626;
    --line: #2F2F2F;
    --line-strong: #454545;
    --text: #EDEDED;
    --muted: #A8A8A8;
    --faint: #8A8A8A;
    --thead-bg: #242424;
    --row-hover: #1A1A1A;
    --ink-800: #EDEDED;
    --ink-700: #DADADA;
    --ink-600: #A8A8A8;
    --accent: #4FA96B;
    --accent-600: #6FBF87;
    --accent-050: rgba(79, 169, 107, 0.16);
    --accent-text: #6FBF87;
    --on-accent: #000000;
    --good: #5FD69C;
    --warn: #E8BA66;
    --danger: #F08C82;
    --on-danger: #2A0F0C;
    --chrome-bg: #1E1E1E;
    --chrome-text: #EDEDED;
    --chrome-muted: #A8A8A8;
    --chrome-faint: #8A8A8A;
    --chrome-line: #2F2F2F;
    --chrome-accent: #6FBF87;
    --chrome-hover: rgba(255, 255, 255, 0.06);
    --chrome-logo: brightness(0) invert(1);
    --panel-bg: #1E1E1E;
    --panel-text: #EDEDED;
    --panel-muted: #A8A8A8;
    --panel-line: #2F2F2F;
    --panel-accent: #6FBF87;
    --brand-deep: #1E1E1E;
    --brand: #6FBF87;
    --brand-600: #4FA96B;
    --brand-tint: rgba(79, 169, 107, 0.16);
    --nav-bg: #1E1E1E;
    --nav-line: #2F2F2F;
    --nav-muted: #A8A8A8;
    --good-050: rgba(95, 214, 156, 0.16);
    --warn-050: rgba(232, 186, 102, 0.16);
    --danger-050: rgba(240, 140, 130, 0.16);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.44), 0 1px 3px rgba(0, 0, 0, 0.32);
    --shadow-md: 0 6px 18px -6px rgba(0, 0, 0, 0.60), 0 2px 8px -3px rgba(0, 0, 0, 0.45);
    --shadow-lg: 0 22px 48px -22px rgba(0, 0, 0, 0.76), 0 8px 20px -10px rgba(0, 0, 0, 0.55);
  }
}
</style>
