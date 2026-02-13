import fs from "node:fs";

const path = new URL("../dist/cli.js", import.meta.url);
const filename = path.pathname;

if (!fs.existsSync(filename)) {
  process.exit(0);
}

const content = fs.readFileSync(filename, "utf8");
if (content.startsWith("#!/usr/bin/env node\n")) {
  process.exit(0);
}

fs.writeFileSync(filename, `#!/usr/bin/env node\n${content}`, "utf8");
