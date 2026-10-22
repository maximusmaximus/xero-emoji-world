
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
const { addVeniceKeys, developCity, testingSpend } = await import("/workspace/xero-emoji-world/src/lib/venice.server.ts");
const { PGlite } = await import("@electric-sql/pglite");
const { writeWorldFiles, commitWorld } = await import("/workspace/xero-emoji-world/src/city/world-files.ts");
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
await db.exec(readFileSync("/workspace/xero-emoji-world/migrations/0001_world.sql", "utf8"));
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
