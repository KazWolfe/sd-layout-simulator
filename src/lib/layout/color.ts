/**
 * Stream Deck color strings: a named color, a hex value, or a gradient of the
 * form `"{offset}:{color}[,{offset}:{color}…]"`.
 *
 * Stream Deck is a Qt application, so named colors follow the SVG keyword list
 * (case-insensitive) and 8-digit hex is Qt's `#AARRGGBB` rather than CSS's
 * `#RRGGBBAA`. We translate to CSS accordingly.
 */

export const NAMED_COLORS: readonly string[] = (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid ' +
    'mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
    'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple red rosybrown royalblue saddlebrown ' +
    'salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent'
).split(' ');
const NAMED = new Set(NAMED_COLORS);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Converts a single (non-gradient) color to CSS, or returns null if invalid. */
export function colorToCss(color: string): string | null {
  const c = color.trim();
  if (NAMED.has(c.toLowerCase())) return c.toLowerCase();
  if (!HEX.test(c)) return null;
  if (c.length === 9) {
    // Qt #AARRGGBB -> CSS #RRGGBBAA
    return `#${c.slice(3)}${c.slice(1, 3)}`;
  }
  return c;
}

export interface GradientStop {
  offset: number;
  color: string;
}

export function isGradient(value: string): boolean {
  return value.includes(':');
}

/** Parses a gradient string; returns null if any stop is malformed. */
export function parseGradient(value: string): GradientStop[] | null {
  const stops: GradientStop[] = [];
  for (const part of value.split(',')) {
    const idx = part.indexOf(':');
    if (idx < 0) return null;
    const offset = Number(part.slice(0, idx).trim());
    const color = colorToCss(part.slice(idx + 1));
    if (!Number.isFinite(offset) || offset < 0 || offset > 1 || color === null) return null;
    stops.push({ offset, color });
  }
  return stops.length ? stops : null;
}

/**
 * Converts a Stream Deck color or gradient to a CSS `background` value.
 * Gradients run left to right. Returns null for invalid input.
 */
export function paintToCss(value: string | undefined, allowGradient = true): string | null {
  if (value === undefined) return null;
  if (allowGradient && isGradient(value)) {
    const stops = parseGradient(value);
    if (!stops) return null;
    if (stops.length === 1) return stops[0].color;
    return `linear-gradient(to right, ${stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`;
  }
  return colorToCss(value);
}

/** Paint for SVG fills: either a solid color or a list of stops. */
export function paintToSvg(value: string | undefined): { solid: string } | { stops: GradientStop[] } | null {
  if (value === undefined) return null;
  if (isGradient(value)) {
    const stops = parseGradient(value);
    return stops ? { stops } : null;
  }
  const c = colorToCss(value);
  return c ? { solid: c } : null;
}
