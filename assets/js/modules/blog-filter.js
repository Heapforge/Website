/**
 * Year and category filters on the blog index (layouts/blog/section.html).
 *
 * The form ships `hidden`, so without JS every post is listed. Here it is
 * revealed, seeded from `?year=&category=`, and each change hides the posts
 * that don't match, updates the live count and rewrites the query string so
 * a filtered view can be shared or reloaded.
 */
const FIELDS = ['year', 'category'];

export function initBlogFilter() {
  document.querySelectorAll('[data-blog-filter]').forEach((form) => {
    const list = document.querySelector('[data-blog-list]');
    if (!list) return;

    const items = Array.from(list.querySelectorAll('[data-year][data-category]'));
    const count = form.querySelector('[data-blog-count]');
    const empty = document.querySelector('[data-blog-empty]');
    const reset = form.querySelector('[data-blog-reset]');

    // Only values that exist as options are honoured; anything else in the
    // URL falls back to "All".
    const select = (name, value) => {
      const radio = Array.from(form.elements[name]).find((r) => r.value === value)
        || Array.from(form.elements[name]).find((r) => r.value === '');
      radio.checked = true;
    };

    const current = () => {
      const state = {};
      FIELDS.forEach((name) => { state[name] = form.elements[name].value; });
      return state;
    };

    const formatCount = (n) => {
      if (!count) return '';
      const template = n === 1 ? count.dataset.singular : count.dataset.plural;
      return template.replace('{count}', String(n));
    };

    const apply = ({ updateUrl }) => {
      const state = current();
      let shown = 0;

      items.forEach((item) => {
        const match = (!state.year || item.dataset.year === state.year)
          && (!state.category || item.dataset.category === state.category);
        item.hidden = !match;
        if (match) shown += 1;
      });

      if (count) count.textContent = formatCount(shown);
      if (empty) empty.hidden = shown > 0;
      if (reset) reset.disabled = !state.year && !state.category;

      if (updateUrl) {
        const url = new URL(window.location.href);
        FIELDS.forEach((name) => {
          if (state[name]) url.searchParams.set(name, state[name]);
          else url.searchParams.delete(name);
        });
        window.history.replaceState(null, '', url);
      }
    };

    const params = new URLSearchParams(window.location.search);
    FIELDS.forEach((name) => select(name, params.get(name) || ''));

    form.hidden = false;
    apply({ updateUrl: false });

    form.addEventListener('change', () => apply({ updateUrl: true }));
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('reset', (e) => {
      e.preventDefault();
      FIELDS.forEach((name) => select(name, ''));
      apply({ updateUrl: true });
    });
  });
}
