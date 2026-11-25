/** Colours from packages/ui-tokens/tokens.css (the Sunmarke logo palette), light and dark. */
export const light = {
  bg: "#f7f4ee", surface: "#ffffff", surface2: "#f2eee6", line: "#e6e0d5", lineStrong: "#c2b9a8",
  text: "#1d1b18", text2: "#57514a", text3: "#6b645b",
  accent: "#22397f", onAccent: "#ffffff", accentSoft: "#e7ebf7", sun: "#f8e620",
  ok: "#17703f", okSoft: "#e2f4e8", warn: "#8a5300", warnSoft: "#fcefd6", bad: "#b42318", badSoft: "#fde7e4",
  lab: { quantum: "#0f86bd", carts: "#d0690c", dollarx: "#6a8d10", xreal: "#903088", strike: "#d4237c" } as Record<string, string>,
};
export const dark: typeof light = {
  bg: "#0e1424", surface: "#161e33", surface2: "#1f2840", line: "#2a3552", lineStrong: "#3d4a6b",
  text: "#eef1f8", text2: "#c3cadb", text3: "#a3acc2",
  accent: "#9fb3f0", onAccent: "#0f1c40", accentSoft: "#1f2a4d", sun: "#f8e620",
  ok: "#6fd69a", okSoft: "#173325", warn: "#f0bb62", warnSoft: "#3a2d16", bad: "#ff9a8f", badSoft: "#3e1f1c",
  lab: { quantum: "#4cc3ef", carts: "#f29a45", dollarx: "#b5d34b", xreal: "#d487cc", strike: "#f56aab" },
};
export type Theme = typeof light;
export const labColour = (t: Theme, colour: string) => t.lab[colour] ?? t.accent;
