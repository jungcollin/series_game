#!/usr/bin/env node

const path = require("path");
const { checkRegistrySync, syncRegistry } = require("./stage_metadata");

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    result[token.slice(2)] = true;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");

  if (args.check) {
    const status = checkRegistrySync(repoRoot);
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: status.ok,
          registryPath: path.relative(repoRoot, status.registryPath),
        },
        null,
        2
      )}\n`
    );
    process.exit(status.ok ? 0 : 1);
  }

  const source = syncRegistry(repoRoot);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        registryPath: "community-stages/registry.js",
        entries: (source.match(/\bid:/g) || []).length,
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
