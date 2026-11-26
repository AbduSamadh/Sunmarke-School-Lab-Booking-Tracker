// Builds dist/sunmarke-lab-booking-demo.html: one file, everything inline, opens by double-click.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = (f) => `data:image/png;base64,${readFileSync(join(here, "../web/public/brand", f)).toString("base64")}`;
const js = (await build({ entryPoints: [join(here, "src/main.ts")], bundle: true, write: false, format: "iife", target: "es2020", minify: true, legalComments: "none" })).outputFiles[0].text;
const tokens = readFileSync(join(here, "../../packages/ui-tokens/tokens.css"), "utf8");
const css = readFileSync(join(here, "src/demo.css"), "utf8");
const html = readFileSync(join(here, "src/index.html"), "utf8")
  .replace("__TOKENS__", () => tokens)
  .replace("__CSS__", () => css)
  .replaceAll("__LOGO_DARK__", brand("sunmarke-dark.png"))
  .replaceAll("__LOGO__", brand("sunmarke.png"))
  .replaceAll("__FORTES_DARK__", brand("fortes-dark.png"))
  .replaceAll("__FORTES__", brand("fortes.png"))
  .replaceAll("__MARK__", brand("sunmarke-mark.png"))
  .replace("__JS__", () => js.replace(/<\/script/gi, "<\\/script"));
mkdirSync(join(here, "dist"), { recursive: true });
const out = join(here, "dist/sunmarke-lab-booking-demo.html");
writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
