import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { upgradeArtifactKey } from "./upgrade-artifacts.js";
import { runnerE2ETypeScriptProcessArgs } from "./web-server-command.js";

const execute = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

it.each(["invalid-database-url", "postgres://fixture:fixture@127.0.0.1:1/fixture?connect_timeout=1"])(
  "retains failed replacement evidence when database setup rejects %s", async connectionString => {
    let output = "", exitCode: unknown;
    try {
      await execute(process.execPath, runnerE2ETypeScriptProcessArgs(repositoryRoot,
        path.join(import.meta.dirname, "controller-replacement-smoke.ts")), {
        cwd: repositoryRoot, timeout: 20_000,
        env: { ...process.env, PAPERCLIP_TEST_DATABASE_URL: connectionString, [upgradeArtifactKey]: undefined },
      });
    } catch (error) {
      const failure = error as Error & { stdout: string; code: unknown };
      output = failure.stdout; exitCode = failure.code;
    }
    const started = output.split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line))
      .find(value => value.started === true);
    expect(started?.evidence).toEqual(expect.any(String));
    const temporaryRoot = path.dirname(started.evidence);
    expect(path.basename(temporaryRoot)).toMatch(/^paperclip-runner-e2e-/);
    try {
      expect(exitCode).toBe(1);
      const report = JSON.parse(await readFile(started.evidence, "utf8"));
      expect(report).toMatchObject({ schema: "paperclip.e2e.controller-replacement-smoke/v1",
        passed: false, providerTurns: 0, activeAgentContinuityQualified: false,
        databaseCreated: false, wrapperStarted: false, cleanupConfirmed: true,
        error: expect.any(String) });
      expect(report.replacements).toBeUndefined();
      expect(output).toContain('"passed":false');
    } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
  });
