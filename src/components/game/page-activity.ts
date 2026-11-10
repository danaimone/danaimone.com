const SCROLL_SETTLE_MS = 500;

// What the page is doing around the walk: whether it is scrolling, and whether
// something restyled it this frame. Heavy paints are kept clear of both.
export function createPageActivity() {
  let restyled = false;
  let scrolling = false;
  let scrolledFrom = 0;
  let scrolledAt = -Infinity;
  let lastScrollY = window.scrollY;

  return {
    observe(now: number) {
      if (window.scrollY !== lastScrollY) {
        lastScrollY = window.scrollY;
        if (!scrolling) scrolledFrom = now / 1000;
        scrolledAt = now;
      }
      scrolling = now - scrolledAt < SCROLL_SETTLE_MS;
    },
    scrolling: () => scrolling,
    scrollBeganAt: () => scrolledFrom,
    markRestyled() {
      restyled = true;
    },
    restyled: () => restyled,
    // A paint that would share a task with a restyle waits a frame instead.
    yieldToRestyle() {
      if (!restyled) return false;
      restyled = false;
      return true;
    },
  };
}

export type PageActivity = ReturnType<typeof createPageActivity>;
