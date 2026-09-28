import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, "..");

export function buildDevServerInvocation({
  projectRoot = defaultProjectRoot,
  nodeExecutable = process.execPath,
} = {}) {
  return {
    command: nodeExecutable,
    args: [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev"],
    options: {
      cwd: projectRoot,
      stdio: "inherit",
    },
  };
}

export function buildDevTreeCleanupInvocation(processId, platform = process.platform) {
  if (platform !== "win32") return null;

  return {
    command: "taskkill.exe",
    args: ["/PID", String(processId), "/T", "/F"],
  };
}

export function runDevServer({
  projectRoot = defaultProjectRoot,
  nodeExecutable = process.execPath,
  platform = process.platform,
  spawnProcess = spawn,
  processRef = process,
} = {}) {
  const invocation = buildDevServerInvocation({ projectRoot, nodeExecutable });
  const child = spawnProcess(invocation.command, invocation.args, invocation.options);
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown || child.exitCode !== null) return;
    shuttingDown = true;

    const cleanup = buildDevTreeCleanupInvocation(child.pid, platform);
    if (cleanup) {
      spawnProcess(cleanup.command, cleanup.args, {
        stdio: "inherit",
        windowsHide: true,
      });
      return;
    }

    child.kill(signal);
  };

  processRef.once("SIGINT", () => shutdown("SIGINT"));
  processRef.once("SIGTERM", () => shutdown("SIGTERM"));
  child.once("exit", (code) => {
    processRef.exitCode = code ?? 1;
  });

  return child;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDevServer();
}
