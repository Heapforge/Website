/**
 * Language picker dropdown in the header.
 * Opens/closes via button click, closes on outside click or Escape, and
 * supports Up/Down/Home/End keyboard navigation across language options.
 */
export function initLangPicker() {
  const pickers = document.querySelectorAll('[data-lang-picker]');
  pickers.forEach((picker) => {
    const toggle = picker.querySelector('[data-lang-toggle]');
    const menu = picker.querySelector('[data-lang-menu]');
    if (!toggle || !menu) return;

    const options = Array.from(menu.querySelectorAll('a'));

    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      if (open) {
        menu.setAttribute('data-open', '');
      } else {
        menu.removeAttribute('data-open');
      }
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen()) setOpen(true);
        const target = e.key === 'ArrowUp' ? options[options.length - 1] : options[0];
        if (target) target.focus();
      }
    });

    menu.addEventListener('keydown', (e) => {
      const idx = options.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = options[(idx + 1) % options.length];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = options[(idx - 1 + options.length) % options.length];
        if (prev) prev.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (options[0]) options[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        if (options[options.length - 1]) options[options.length - 1].focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (isOpen() && !picker.contains(e.target)) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
  });
}
