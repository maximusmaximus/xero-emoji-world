import type { City } from "../city/sim";
import { commitWorld, writeWorldFiles, type WorldChange } from "../city/world-files.ts";
import { getSql } from "./db";

export type ChangeInput = { kind: string; summary: string; source: string };

function cityOf(value: unknown): City | null {
  if (!value || typeof value !== "object") return null;
  const city = value as City;
  if (!Array.isArray(city.buildings) || !city.era) return null;
  return city;
}

export async function loadPersistedCity() {
  const sql = await getSql();
  const rows = await sql.query<{ city: unknown; updated_at: string | Date }>("select city, updated_at from world_state where id = 'live'");
  const row = rows[0];
  const city = cityOf(typeof row?.city === "string" ? JSON.parse(row.city) : row?.city);
  if (!row || !city) return null;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
  return { city, updatedAt };
}

export async function persistCity(city: City, change: ChangeInput) {
  const row: WorldChange = {
    kind: change.kind.slice(0, 24),
    summary: change.summary.replace(/\s+/g, " ").trim().slice(0, 240),
    source: change.source.slice(0, 24),
    at: new Date().toISOString(),
  };
  const sql = await getSql();
  await sql.query(
    `insert into world_state (id, city, updated_at) values ('live', $1::jsonb, now())
     on conflict (id) do update set city = excluded.city, updated_at = now()`,
    [JSON.stringify(city)],
  );
  await sql.query("insert into world_changes (kind, summary, source) values ($1, $2, $3)", [row.kind, row.summary, row.source]);
  const mirrored = row.kind === "develop" || row.kind === "story";
  let repo = { committed: false, pushed: false, detail: "skipped" };
  if (mirrored) {
    const root = process.env.WORLD_REPO || "/tmp/xero-emoji-world";
    writeWorldFiles(root, city, row);
    repo = commitWorld(root, `world: ${row.summary} via ${row.source}`);
  }
  return { ok: true as const, at: row.at, repo };
}
