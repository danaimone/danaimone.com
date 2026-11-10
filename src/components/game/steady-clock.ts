const LOCK_MS = 1.5;
const FOLLOW = 0.1;
const LEARN = 0.02;
const SANE_PERIOD_MS = { least: 4, most: 40 };

// Safari reports frame and touch times in whole milliseconds, so a steady 16.67 ms
// beat reads as 16, 17, 17. Anything placed by those times lands up to half a
// millisecond off, which at swipe speed is a visible wobble. This follows the beat
// behind the rounding: a time that falls on the beat is moved onto it, and one
// that does not (a dropped frame's remainder, a finger that paused) is kept as is.
export function createSteadyClock() {
  let period = 1000 / 60;
  let last: number | null = null;
  return (raw: number) => {
    if (last === null) return (last = raw);
    if (raw <= last) return last;
    const gap = raw - last;
    const beats = Math.max(1, Math.round(gap / period));
    const onBeat = last + beats * period;
    const beat = gap / beats;
    if (beat >= SANE_PERIOD_MS.least && beat <= SANE_PERIOD_MS.most) period += LEARN * (beat - period);
    last = Math.abs(raw - onBeat) <= LOCK_MS ? onBeat + FOLLOW * (raw - onBeat) : raw;
    return last;
  };
}
