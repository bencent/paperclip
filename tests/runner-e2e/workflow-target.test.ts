import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

const queuedSha = "a".repeat(40);
const advancedSha = "b".repeat(40);

async function resolveTarget(event: string, cadence: string, branch = "master") {
  const workflow = await readFile(new URL("../../.github/workflows/runner-full-stack-e2e.yml", import.meta.url), "utf8");
  const step = workflow.split("      - name: Resolve requested repository branch to an immutable commit\n")[1]!.split("\n      - name:")[0]!;
  const script = step.split("        run: |\n")[1]!.replace(/^ {10}/gm, "");
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-workflow-target-"));
  try {
    const output = path.join(directory, "output");
    const result = spawnSync("bash", ["-c", `gh() { printf '%s\\n' "$MOCK_BRANCH_SHA"; }\n${script}`], {
      encoding: "utf8", env: { ...process.env, EVENT_NAME: event, EVAL_CADENCE: cadence,
        TARGET_BRANCH: branch, DEFAULT_BRANCH: "master", GITHUB_SHA: queuedSha,
        MOCK_BRANCH_SHA: advancedSha, GITHUB_OUTPUT: output, REPOSITORY: "paperclipai/paperclip" },
    });
    return { status: result.status, stderr: result.stderr,
      output: await readFile(output, "utf8").catch(() => "") };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

describe("paid workflow target authorization", () => {
  it.each([["schedule", "manual"], ["workflow_dispatch", "daily"], ["workflow_dispatch", "weekly"]])(
    "pins %s/%s to the queued revision when the branch advances", async (event, cadence) => {
      const result = await resolveTarget(event, cadence);
      expect(result.status, result.stderr).toBe(0);
      expect(result.output).toContain(`sha=${queuedSha}\n`);
      expect(result.output).not.toContain(advancedSha);
    });

  it("rejects custom bounded targets before emitting a commit", async () => {
    const result = await resolveTarget("workflow_dispatch", "daily", "development");
    expect(result.status).toBe(1);
    expect(result.output).toBe("");
    expect(result.stderr).toContain("default-branch commit");
  });

  it("still resolves explicit manual targets at authorization time", async () => {
    const result = await resolveTarget("workflow_dispatch", "manual", "development");
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain(`sha=${advancedSha}\n`);
    expect(result.output).toContain("ref=refs/heads/development\n");
  });
});


describe("trusted reporting lock restoration", () => {
  it.each(["valid", "foreign-source", "wrong-checkout", "tampered-lock", "extra-file"])(
    "restores only the pinned trusted source and exact artifact: %s", async (variant) => {
      const workflow = await readFile(new URL("../../.github/workflows/runner-full-stack-e2e.yml", import.meta.url), "utf8");
      const step = workflow.split("      - name: Restore trusted report lockfile\n")[1]!.split("\n      - ")[0]!;
      const script = step.split("        run: |\n")[1]!.replace(/^ {10}/gm, "");
      const directory = await mkdtemp(path.join(os.tmpdir(), "eval-report-lock-"));
      try {
        const lockDirectory = path.join(directory, "runner-e2e-report-lock");
        await mkdir(lockDirectory);
        const content = "lockfileVersion: '9.0'\n";
        await writeFile(path.join(directory, "pnpm-lock.yaml"), "original\n");
        await writeFile(path.join(lockDirectory, "pnpm-lock.yaml"), variant === "tampered-lock" ? "modified\n" : content);
        if (variant === "extra-file") await writeFile(path.join(lockDirectory, "unexpected"), "extra");
        const result = spawnSync("bash", ["-c", `git() { printf '%s\\n' "$MOCK_CHECKOUT_SHA"; }\n${script}`], {
          cwd: directory, encoding: "utf8", env: { ...process.env, RUNNER_TEMP: directory,
            GITHUB_SHA: queuedSha, REPORT_LOCK_SOURCE_SHA: variant === "foreign-source" ? advancedSha : queuedSha,
            MOCK_CHECKOUT_SHA: variant === "wrong-checkout" ? advancedSha : queuedSha,
            EXPECTED_LOCK_SHA256: createHash("sha256").update(content).digest("hex") },
        });
        expect(result.status, result.stderr).toBe(variant === "valid" ? 0 : 1);
        expect(await readFile(path.join(directory, "pnpm-lock.yaml"), "utf8")).toBe(variant === "valid" ? content : "original\n");
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
  );
});
