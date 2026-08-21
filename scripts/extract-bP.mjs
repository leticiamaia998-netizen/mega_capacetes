import fs from "node:fs";

const source = fs.readFileSync("public/assets/index-D36WQRm9.js", "utf8");
const idx = source.indexOf("function bP()");
console.log(source.slice(idx, idx + 1500));
