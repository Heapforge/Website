/**
 * Replaces the text of every `[data-current-year]` element with the current
 * year, so the footer copyright range never goes stale.
 */
export function renderCurrentYear(root = document) {
  const year = String(new Date().getFullYear());

  root.querySelectorAll('[data-current-year]').forEach((el) => {
    el.textContent = year;
    if (el.tagName === 'TIME') {
      el.setAttribute('datetime', year);
    }
  });
}
