import fs from "node:fs";

const source = fs.readFileSync("public/assets/index-D36WQRm9.js", "utf8");
for (const term of ["isAdmin", "Protected", "admin/login", "xxx/login"]) {
  let count = 0;
  let idx = 0;
  while ((idx = source.indexOf(term, idx)) !== -1 && count < 3) {
    console.log("\n==", term, "==");
    console.log(source.slice(Math.max(0, idx - 120), idx + 180));
    idx += term.length;
    count++;
  }
}
