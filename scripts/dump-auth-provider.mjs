import fs from "node:fs";

const source = fs.readFileSync("public/assets/index-D36WQRm9.js", "utf8");
const idx = source.indexOf("hy.Provider");
console.log(source.slice(idx - 800, idx + 500));
