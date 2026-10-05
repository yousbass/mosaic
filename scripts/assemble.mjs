// Assemble the published artifact page (and a local test page) from the Vite build.
import { readFileSync, writeFileSync } from "node:fs";
const js = readFileSync("dist/app.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync("dist/app.css", "utf8");
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">';
const body = (react, dom) => `<title>Mosaic</title>\n${fonts}\n<style>${css}</style>\n<div id="root"></div>\n<script src="${react}"></script>\n<script src="${dom}"></script>\n<script>${js}</script>\n`;
writeFileSync("dist/mosaic.html", body(
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"));
const localFonts = ["plus-jakarta-sans/400.css", "plus-jakarta-sans/500.css", "plus-jakarta-sans/600.css", "plus-jakarta-sans/700.css", "plus-jakarta-sans/800.css",
  "ibm-plex-sans-arabic/400.css", "ibm-plex-sans-arabic/600.css", "ibm-plex-mono/400.css"].map((f) => `<link rel="stylesheet" href="../node_modules/@fontsource/${f}">`).join("");
writeFileSync("dist/test.html", '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + localFonts + '</head><body>' +
  body("../node_modules/react/umd/react.production.min.js", "../node_modules/react-dom/umd/react-dom.production.min.js") + "</body></html>");
console.log("mosaic.html", (body("", "").length / 1024).toFixed(0) + " KB");
