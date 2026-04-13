const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith(".js")) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, "src"));
let totalReplaced = 0;

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  if (content.includes("ephemeral: true")) {
    const newContent = content.replace(/ephemeral:\s*true/g, "flags: 64");
    if (content !== newContent) {
      fs.writeFileSync(file, newContent, "utf8");
      totalReplaced++;
    }
  }
}

console.log(`Replaced 'ephemeral: true' in ${totalReplaced} files.`);
