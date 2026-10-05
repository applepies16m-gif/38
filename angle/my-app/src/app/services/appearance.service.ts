import { Injectable } from '@angular/core';

// A user's own look for the site, chosen with the sliders on My
// Profile and saved on their account.
export interface Appearance {
  textScale: number;  // size of the whole interface, as a percentage (100 = normal)
  hue: number;        // the site's main colour as a position on the colour wheel, 0 to 360
}

// The standard look. 221 is the hue of the site's own blue.
export const DEFAULT_APPEARANCE: Appearance = { textScale: 100, hue: 221 };

// The limits of the two sliders. The server enforces the same ones.
export const APPEARANCE_LIMITS = {
  textScale: { min: 90, max: 140, step: 5 },
  hue: { min: 0, max: 360, step: 1 }
};

// The CSS variables that hold the site's main colour, each with
// the saturation and lightness of its standard shade. Keeping
// those two and changing only the hue gives the same set of
// shades in a different colour.
const COLOUR_SHADES: { variable: string; saturation: number; lightness: number }[] = [
  { variable: '--chrome-blue', saturation: 44, lightness: 41 },
  { variable: '--chrome-blue-dark', saturation: 44, lightness: 31 },
  { variable: '--chrome-blue-light', saturation: 40, lightness: 48 },
  { variable: '--chrome-blue-lighter', saturation: 33, lightness: 52 },
  { variable: '--chrome-blue-mid', saturation: 34, lightness: 46 },
  { variable: '--panel-border', saturation: 38, lightness: 79 }
];

// White text sits on the main colour (the top bar, primary
// buttons). 4.5 to 1 is the standard minimum contrast for text to
// be readable.
const MIN_CONTRAST_WITH_WHITE = 4.5;

// How bright a colour looks, from 0 (black) to 1 (white), using
// the standard formula for contrast. Yellow and green look far
// brighter than blue at the same lightness, which is why some
// hues need darkening.
function relativeLuminance(hue: number, saturation: number, lightness: number): number {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  // Converts the colour to red, green and blue, each 0 to 1.
  const channel = (n: number): number => {
    const k = (n + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const linear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return 0.2126 * linear(channel(0)) + 0.7152 * linear(channel(8)) + 0.0722 * linear(channel(4));
}

// How many lightness points to take off every shade of a hue so
// that white text on the main colour stays readable. It is 0 for
// the standard blue and for most hues.
export function darkeningForHue(hue: number): number {
  const main = COLOUR_SHADES[0];
  let darkening = 0;
  while (darkening < main.lightness &&
         1.05 / (relativeLuminance(hue, main.saturation, main.lightness - darkening) + 0.05) < MIN_CONTRAST_WITH_WHITE) {
    darkening = darkening + 1;
  }
  return darkening;
}

// Applies a user's appearance to the page. It works by setting CSS
// variables on the root element: every stylesheet in the app reads
// its colours from those variables, so changing them here recolours
// every page at once without touching any component.
@Injectable({
  providedIn: 'root'
})
export class AppearanceService {

  // Applies the given appearance, or puts the standard look back
  // if there is none (nobody logged in, or nothing chosen yet).
  apply(appearance?: Partial<Appearance> | null): void {
    const root = document.documentElement;
    const chosen = this.clean(appearance);

    // Colour: at the standard hue the overrides are removed, so
    // the exact colours written in styles.css are used. For any
    // other hue each shade is rebuilt in that colour, darkened a
    // little where needed so white text on it stays readable. The
    // pale border shade has dark text beside it, so it is left as
    // it is.
    const darkening = darkeningForHue(chosen.hue);
    for (const shade of COLOUR_SHADES) {
      if (chosen.hue === DEFAULT_APPEARANCE.hue) {
        root.style.removeProperty(shade.variable);
      } else {
        const lightness = shade.variable === '--panel-border' ? shade.lightness : shade.lightness - darkening;
        root.style.setProperty(shade.variable, `hsl(${chosen.hue}, ${shade.saturation}%, ${lightness}%)`);
      }
    }

    // Size: zoom scales text and layout together, like the
    // browser's own zoom, so nothing overlaps at larger sizes.
    document.body.style.setProperty('zoom', chosen.textScale === 100 ? '' : String(chosen.textScale / 100));
  }

  // Returns a complete, in-range appearance from whatever was
  // stored. Anything missing or out of range falls back to the
  // standard value, so bad data can never break the page.
  clean(appearance?: Partial<Appearance> | null): Appearance {
    const inRange = (value: unknown, limits: { min: number; max: number }, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) && value >= limits.min && value <= limits.max
        ? Math.round(value)
        : fallback;
    return {
      textScale: inRange(appearance?.textScale, APPEARANCE_LIMITS.textScale, DEFAULT_APPEARANCE.textScale),
      hue: inRange(appearance?.hue, APPEARANCE_LIMITS.hue, DEFAULT_APPEARANCE.hue)
    };
  }
}
