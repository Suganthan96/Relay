import "react";

/**
 * Framer's inline styles use two things React's `CSSProperties` does not model:
 *
 *   - 24 CSS custom properties (`--framer-font-size`, `--border-color`, ...)
 *     that its stylesheet reads back with `var()`.
 *   - `corner-shape` (267 occurrences), a CSS Borders Level 4 property that has
 *     not landed in the csstype definitions yet.
 *
 * React applies both correctly at runtime; only the type needs widening. This
 * keeps the generated components free of a cast on every style object.
 */
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
    cornerShape?: string;
  }
}
