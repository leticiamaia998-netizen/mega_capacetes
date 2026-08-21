import fs from "node:fs";

const source = fs.readFileSync("public/assets/index-D36WQRm9.js", "utf8");
for (const term of ["createHashRouter", "createBrowserRouter", "HashRouter", "BrowserRouter", "basename:"]) {
  console.log(term, source.includes(term));
}
const idx = source.indexOf("basename");
console.log(source.slice(idx - 100, idx + 300));
