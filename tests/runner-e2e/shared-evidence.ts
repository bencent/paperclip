import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runnerE2EServerControlPaths } from "./harness-env.js";
import { sanitizeJson } from "./redaction.js";

export async function copySharedEvidence(privateRoot: string, casePrivateDir: string,
  temporaryRoot: string, secrets: readonly string[]) {
  for (const relative of [
    "server.log",
    "playwright.log",
    "junit.xml",
    "html-report",
    "blob-report",
    "playwright-output",
  ]) {
    await cp(
      path.join(privateRoot, relative),
      path.join(casePrivateDir, relative),
      { recursive: true, force: true },
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  // The supervisor records each phase before it can fail. Copy its receipts
  // independently of the successful-restart acknowledgement before cleanup.
  const { controlDirectory } = runnerE2EServerControlPaths(temporaryRoot);
  const entries = await readdir(controlDirectory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    if (!entry.isFile() || !/^controller-outage-[A-Za-z0-9._:-]{1,200}\.json$/.test(entry.name)) continue;
    const receipt = JSON.parse(await readFile(path.join(controlDirectory, entry.name), "utf8"));
    const snapshots = path.join(casePrivateDir, "snapshots", "controller-outages");
    await mkdir(snapshots, { recursive: true });
    await writeFile(path.join(snapshots, entry.name), `${JSON.stringify(sanitizeJson(receipt, secrets), null, 2)}\n`, { mode: 0o600 });
  }
}

