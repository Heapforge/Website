/**
 * Scroll-snap carousel enhancement. The markup already scrolls on its own;
 * this adds prev/next buttons, pagination dots and arrow keys,
 * and keeps them in sync with the scroll position (so touch swipes work too).
 */
export function initCarousels(root = document) {
  root.querySelectorAll('[data-carousel]').forEach(setup);
}

function setup(carousel) {
  const track = carousel.querySelector('[data-carousel-track]');
  const slides = Array.from(carousel.querySelectorAll('[data-slide]'));
  if (!track || !slides.length) return;

  const prev = carousel.querySelector('[data-carousel-prev]');
  const next = carousel.querySelector('[data-carousel-next]');
  const dots = Array.from(carousel.querySelectorAll('[data-carousel-dot]'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;

  const padStart = () => parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
  const maxScroll = () => track.scrollWidth - track.clientWidth;

  // Scroll offset that snaps slide i to the start edge.
  const offsetOf = (i) => {
    const slideBox = slides[i].getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    return Math.min(maxScroll(), Math.max(0, slideBox.left - trackBox.left + track.scrollLeft - padStart()));
  };

  const goTo = (i) => {
    const index = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: offsetOf(index), behavior: reduced.matches ? 'auto' : 'smooth' });
  };

  const update = () => {
    const atEnd = track.scrollLeft >= maxScroll() - 2;
    // `current` is the first slide snapped at this position (so "previous"
    // always moves); at the end, where several slides share the final
    // position, the dots show the last one.
    let index = 0;
    let best = Infinity;
    slides.forEach((_, i) => {
      const d = Math.abs(offsetOf(i) - track.scrollLeft);
      if (d < best - 1) { best = d; index = i; }
    });
    current = index;
    const shown = atEnd ? slides.length - 1 : index;
    dots.forEach((dot, i) => {
      if (i === shown) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = atEnd;
  };

  let frame = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener('resize', update);

  if (prev) prev.addEventListener('click', () => goTo(current - 1));
  if (next) next.addEventListener('click', () => goTo(current + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  carousel.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const keys = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    goTo(keys[e.key]);
  });

  update();
}
