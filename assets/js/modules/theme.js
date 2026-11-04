/**
 * Light/dark theme. The inline head script has already set data-theme; this
 * wires the header toggle, persists an explicit choice in localStorage and,
 * until the visitor picks one, follows changes to the system preference.
 * Every change fires a `themechange` event on the document.
 */
const KEY = 'theme';

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch (e) {
    return null;
  }
}

function store(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch (e) {
    /* Storage blocked: the choice simply lasts for this page view. */
  }
}

function apply(theme) {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme) return;
  root.setAttribute('data-theme', theme);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

function label(button) {
  const current = document.documentElement.getAttribute('data-theme');
  button.setAttribute('aria-label', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

export function initTheme() {
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  buttons.forEach((button) => {
    label(button);
    button.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      store(next);
      apply(next);
      buttons.forEach(label);
    });
  });

  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (!media) return;
  const onSystemChange = (e) => {
    if (stored()) return;
    apply(e.matches ? 'dark' : 'light');
    buttons.forEach(label);
  };
  if (media.addEventListener) media.addEventListener('change', onSystemChange);
  else if (media.addListener) media.addListener(onSystemChange);
}
