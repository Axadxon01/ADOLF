// PDF.js fayllarini public/vendor ichiga ko'chiradi (CDN'ga bog'liq bo'lmaslik va CSP uchun).
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/vendor", { recursive: true });
for (const f of ["pdf.min.js", "pdf.worker.min.js"]) {
  cpSync(`node_modules/pdfjs-dist/build/${f}`, `public/vendor/${f}`);
}
console.log("vendor tayyor");
