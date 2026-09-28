import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  buildDevServerInvocation,
  buildDevTreeCleanupInvocation,
} from "../scripts/dev-server.mjs";

test("local dev starts through the repository-owned launcher", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: { dev: string };
  };

  assert.equal(packageJson.scripts.dev, "node scripts/dev-server.mjs");
});

test("dev launcher keeps Next rooted at this repository when called from another directory", () => {
  const projectRoot = path.resolve(".");

  const invocation = buildDevServerInvocation({
    projectRoot,
    nodeExecutable: "node",
  });

  assert.equal(invocation.command, "node");
  assert.deepEqual(invocation.args, [
    path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
    "dev",
  ]);
  assert.equal(invocation.options.cwd, projectRoot);
});

test("Windows shutdown terminates the complete Next process tree", () => {
  const invocation = buildDevTreeCleanupInvocation(4321, "win32");

  assert.deepEqual(invocation, {
    command: "taskkill.exe",
    args: ["/PID", "4321", "/T", "/F"],
  });
});
