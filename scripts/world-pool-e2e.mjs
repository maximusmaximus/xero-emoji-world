import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const dir = mkdtempSync(join(tmpdir(), "xero-pool-"));
const repo = join(dir, "repo");
const localKey = "VENICE_INFERENCE_KEY_local-pool-000000000000000001";
const giftKey = "VENICE_INFERENCE_KEY_contrib-pool-0000000000000002";

const child = `
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
globalThis.fetch = async (_url, init) => {
  const auth = init?.headers?.authorization || "";
  console.log("AUTH " + auth);
  const body = JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      focus: "store",
      notes: { store: "Open the awning and start a line." },
      developments: [{ name: "Gift Market", kind: "store", emoji: "🏪", note: "A stall paid for by a contributed key." }]
    }) } }],
    usage: { prompt_tokens: 30, completion_tokens: 40 }
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
};
const { addVeniceKeys, developCity, testingSpend } = await import(${JSON.stringify(join(root, "src/lib/venice.server.ts"))});
const { PGlite } = await import("@electric-sql/pglite");
const { writeWorldFiles, commitWorld } = await import(${JSON.stringify(join(root, "src/city/world-files.ts"))});
const local = process.env.VENICE_INFERENCE_KEY;
addVeniceKeys(process.env.GIFT_KEY);
const first = await developCity({ era: "town", watchers: 2, have: ["store:0"] });
if (!first.live || first.source !== "local" || first.developments[0]?.name !== "Gift Market") {
  console.error("first", first.source, first.live, first.developments?.[0]?.name);
  process.exit(2);
}
testingSpend(local, 1);
const second = await developCity({ era: "city", watchers: 3, have: ["store:1"] });
if (!second.live || second.source !== "contributed") {
  console.error("second", second.source, second.live);
  process.exit(3);
}
const db = new PGlite();
await db.exec(readFileSync(${JSON.stringify(join(root, "migrations/0001_world.sql"))}, "utf8"));
const city = { version: 2, era: "town", buildings: [{ id: "gift", name: "Gift Market", kind: "store" }], beats: [] };
await db.query(
  "insert into world_state (id, city, updated_at) values ('live', $1::jsonb, now())",
  [JSON.stringify(city)],
);
await db.query("insert into world_changes (kind, summary, source) values ($1, $2, $3)", ["develop", "Gift Market", "contributed"]);
const rows = await db.query("select city->>'era' as era from world_state where id = 'live'");
const changes = await db.query("select source, summary from world_changes");
if (rows.rows?.[0]?.era !== "town" && rows[0]?.era !== "town") {
  console.error("db", JSON.stringify(rows).slice(0, 300));
  process.exit(4);
}
const source = changes.rows?.[0]?.source ?? changes[0]?.source;
if (source !== "contributed") {
  console.error("change", JSON.stringify(changes).slice(0, 300));
  process.exit(5);
}
const repo = process.env.WORLD_REPO;
writeWorldFiles(repo, city, { kind: "develop", summary: "Gift Market", source: "contributed", at: new Date().toISOString() });
process.env.WORLD_COMMIT_EVERY = "1";
const committed = commitWorld(repo, "world: Gift Market via contributed");
if (!committed.committed) {
  console.error("commit", committed.detail);
  process.exit(6);
}
console.log("POOL_OK");
`;

writeFileSync(join(root, "scripts/.pool-run.mjs"), child);
execFileSync("git", ["init", repo], { stdio: "ignore" });
execFileSync("git", ["-C", repo, "config", "user.email", "maximusmaximus@users.noreply.github.com"]);
execFileSync("git", ["-C", repo, "config", "user.name", "maximusmaximus"]);
writeFileSync(join(repo, "README.md"), "pool\n");
execFileSync("git", ["-C", repo, "add", "README.md"]);
execFileSync("git", ["-C", repo, "commit", "-m", "init"], {
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: "maximusmaximus",
    GIT_AUTHOR_EMAIL: "maximusmaximus@users.noreply.github.com",
    GIT_COMMITTER_NAME: "maximusmaximus",
    GIT_COMMITTER_EMAIL: "maximusmaximus@users.noreply.github.com",
  },
});

try {
  const out = execFileSync(process.execPath, ["--experimental-strip-types", join(root, "scripts/.pool-run.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      VENICE_ISOLATED: "1",
      VENICE_INFERENCE_KEY: localKey,
      VENICE_API_KEY: "",
      GIFT_KEY: giftKey,
      VENICE_KEY_PATH: join(dir, "keys"),
      VENICE_BUDGET_PATH: join(dir, "budget.json"),
      VENICE_ENV_PATH: join(dir, "empty.env"),
      WORLD_REPO: repo,
    },
  });
  if (!out.includes("AUTH Bearer " + localKey) || !out.includes("AUTH Bearer " + giftKey)) {
    fail(`both keys were not used\n${out}`);
  }
  if (!out.includes("POOL_OK")) fail(out);
  const state = readFileSync(join(repo, "world/state.json"), "utf8");
  if (!state.includes("Gift Market") || state.includes("VENICE_INFERENCE_KEY_")) fail("world file is wrong");
  const log = execFileSync("git", ["-C", repo, "log", "-1", "--oneline"], { encoding: "utf8" });
  if (!log.includes("Gift Market")) fail(`git log missing change (${log.trim()})`);
  pass("host key, then contributed key, database row, and repo commit");
} catch (err) {
  const error = err;
  fail(error.stdout || error.stderr || error.message);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(root, "scripts/.pool-run.mjs"), { force: true });
}
