import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type WorldChange = { kind: string; summary: string; source: string; at: string };

const author = {
  GIT_AUTHOR_NAME: "maximusmaximus",
  GIT_AUTHOR_EMAIL: "maximusmaximus@users.noreply.github.com",
  GIT_COMMITTER_NAME: "maximusmaximus",
  GIT_COMMITTER_EMAIL: "maximusmaximus@users.noreply.github.com",
};

let lastCommit = 0;

export function writeWorldFiles(root: string, city: unknown, change: WorldChange) {
  const dir = join(root, "world");
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({ updatedAt: change.at, source: change.source, city });
  if (body.includes("VENICE_INFERENCE_KEY_")) throw new Error("refusing to store a Venice key in the repo");
  writeFileSync(join(dir, "state.json"), `${body}\n`);
  appendFileSync(join(dir, "changes.jsonl"), `${JSON.stringify(change)}\n`);
}

export function commitWorld(root: string, message: string) {
  if (process.env.WORLD_COMMIT_EVERY !== "1" && Date.now() - lastCommit < 30_000) {
    return { committed: false, pushed: false, detail: "debounced" };
  }
  const env = { ...process.env, ...author };
  const add = spawnSync("git", ["add", "world/state.json", "world/changes.jsonl"], { cwd: root, env, encoding: "utf8" });
  if (add.status !== 0) return { committed: false, pushed: false, detail: (add.stderr || "add failed").slice(0, 180) };
  const commit = spawnSync("git", ["commit", "-m", message.slice(0, 180)], { cwd: root, env, encoding: "utf8" });
  const commitOut = `${commit.stdout || ""}${commit.stderr || ""}`;
  if (commit.status !== 0) {
    return { committed: false, pushed: false, detail: commitOut.includes("nothing to commit") ? "clean" : commitOut.slice(0, 180) };
  }
  lastCommit = Date.now();
  const push = spawnSync("git", ["push", "origin", "HEAD"], { cwd: root, env, encoding: "utf8" });
  return {
    committed: true,
    pushed: push.status === 0,
    detail: push.status === 0 ? "pushed" : `${push.stderr || push.stdout || "push failed"}`.slice(0, 180),
  };
}
