/**
 * Light/dark theme. The inline head script has already set data-theme; this
 * wires the header toggle and persists an explicit choice in localStorage.
 * Dark is the default regardless of the system preference. Every change
 * fires a `themechange` event on the document.
 */
const KEY = 'theme';

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
  const lightLabel = button.getAttribute('data-label-light') || 'Switch to light theme';
  const darkLabel = button.getAttribute('data-label-dark') || 'Switch to dark theme';
  button.setAttribute('aria-label', current === 'dark' ? lightLabel : darkLabel);
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
}
