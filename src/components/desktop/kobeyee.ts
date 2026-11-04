// Pure sizing/positioning logic shared by the Kobeyee cat and window
// components, kept dependency-free of either so neither has to import the
// other.
import type { WindowRect } from "@/components/ui/window";
import { MENU_BAR_HEIGHT } from "@/components/desktop/menu-bar";

export const CAT_IMAGE_SRC = "/kobeyee-cat.png";

// cat.png (public/kobeyee-cat.png) has no clean pixel grid. It only stays
// crisp at exact fractions of its natural size, rendered with
// image-rendering: pixelated.
const CAT_NATURAL_WIDTH = 301;
const CAT_NATURAL_HEIGHT = 320;
export const CAT_CORNER_WIDTH = Math.round(CAT_NATURAL_WIDTH / 3);
export const CAT_CORNER_HEIGHT = Math.round(CAT_NATURAL_HEIGHT / 3);
const CAT_PERCH_WIDTH = Math.round(CAT_NATURAL_WIDTH / 4);
const CAT_PERCH_HEIGHT = Math.round(CAT_NATURAL_HEIGHT / 4);

// The idle cat's desktop corner spot (above the Dock either way), shared by
// the corner button itself (kobeyee-cat.tsx) and by other windows' default
// rects, which need to stay clear of it directly instead of relying on
// z-index to hide an overlap.
export const CORNER_RIGHT = 44;
export const CORNER_BOTTOM = 112;
// The clickable spot is slightly wider than the sprite alone.
export const CORNER_RESERVE_WIDTH = CAT_CORNER_WIDTH + 8;

// Where the perched cat sits on its window. Its horizontal center is this
// far in from the window's right edge, with its feet dipping this far
// below the window's top edge, so it reads as standing on the title bar.
const PERCH_RIGHT_INSET = 90;
const PERCH_FEET_DROP = 10;

export interface CatBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Computes where the cat sits while the Kobeyee window is open, as a pure
// function of the window's current rect rather than separate state, so it
// always agrees with wherever the window is, including after a drag
// commits a new rect.
export function perchPosition(rect: WindowRect): CatBox {
  const centerX = rect.x + rect.width - PERCH_RIGHT_INSET;
  return {
    left: centerX - CAT_PERCH_WIDTH / 2,
    top: rect.y + PERCH_FEET_DROP - CAT_PERCH_HEIGHT,
    width: CAT_PERCH_WIDTH,
    height: CAT_PERCH_HEIGHT,
  };
}

// The perch's head room is how far above the window's own top edge the
// cat's top edge sits (CAT_PERCH_HEIGHT minus how far its feet dip below
// the window top). The window can never be positioned so high that this
// pokes above the menu bar.
const PERCH_HEAD_ROOM = CAT_PERCH_HEIGHT - PERCH_FEET_DROP;

// The highest the Kobeyee window's top edge may sit, below the menu bar by
// enough room for the perched cat's head. Used both as the drag limit
// (Window's `topInset`) and as the floor for the default rect's `y`, so the
// two can never disagree.
export const KOBEYEE_TOP_INSET = MENU_BAR_HEIGHT + PERCH_HEAD_ROOM;

// Chat-only, so much narrower than the bookings window's 640px floor.
export const KOBEYEE_MIN_WIDTH = 360;
export const KOBEYEE_MIN_HEIGHT = 420;
const KOBEYEE_DEFAULT_WIDTH = 440;
const KOBEYEE_DEFAULT_HEIGHT = 696;
const WINDOW_MARGIN = 16;
// Dock height (70px) plus its own bottom offset and a little breathing room,
// same clearance the bookings window uses.
const DOCK_CLEARANCE = 96;

// Bottom-right anchored, clear of the menu bar and the Dock. Unlike
// defaultBookingsRect, this doesn't fill the viewport. The window keeps
// its chat-only proportions and just sits as high as the available height
// allows.
export function defaultKobeyeeRect(): WindowRect {
  const width = KOBEYEE_DEFAULT_WIDTH;
  const maxHeight = window.innerHeight - KOBEYEE_TOP_INSET - DOCK_CLEARANCE;
  const height = Math.max(KOBEYEE_MIN_HEIGHT, Math.min(KOBEYEE_DEFAULT_HEIGHT, maxHeight));
  return {
    x: window.innerWidth - width - WINDOW_MARGIN,
    y: Math.max(KOBEYEE_TOP_INSET, window.innerHeight - DOCK_CLEARANCE - height),
    width,
    height,
  };
}
