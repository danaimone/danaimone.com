const SCROLL_SETTLE_MS = 500;

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
    yieldToRestyle() {
      if (!restyled) return false;
      restyled = false;
      return true;
    },
  };
}

export type PageActivity = ReturnType<typeof createPageActivity>;
