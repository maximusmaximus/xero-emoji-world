import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function hostKey() {
  const text = readFileSync(join(appRoot, ".env"), "utf8");
  const line = text.split(/\n/).find((item) => item.startsWith("VENICE_INFERENCE_KEY="));
  const key = line?.slice("VENICE_INFERENCE_KEY=".length).trim().replace(/^["']|["']$/g, "") ?? "";
  if (!key.startsWith("VENICE_INFERENCE_KEY_") || key.length < 40) fail("host env is missing VENICE_INFERENCE_KEY");
  return key;
}

function assertHostKey(key) {
  const file = readFileSync(join(appRoot, ".secrets/venice.key"), "utf8");
  if (!file.includes(key)) fail("secrets file does not store the host key");
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `const key = process.argv[1];
       fetch("https://api.venice.ai/api/v1/models", { headers: { authorization: "Bearer " + key } })
         .then(async (res) => {
           const body = await res.json();
           const ids = new Set((body.data || []).map((model) => model.id));
           if (!res.ok || !ids.has("grok-4-20")) process.exit(2);
         })
         .catch(() => process.exit(3));`,
      key,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) fail(`host key was not accepted (${probe.status})`);
  pass("host key is stored and accepted");
}

function assertPasteStores() {
  const dir = mkdtempSync(join(tmpdir(), "venice-smoke-"));
  const keyPath = join(dir, "keys");
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "-e",
      `import { readFileSync } from "node:fs";
       import { addVeniceKeys, readVeniceKeys } from ${JSON.stringify(join(appRoot, "src/lib/venice.server.ts"))};
       const pasted = "VENICE_INFERENCE_KEY_smoke-paste-0000000000000001";
       const saved = addVeniceKeys(pasted);
       const keys = readVeniceKeys();
       const file = readFileSync(process.env.VENICE_KEY_PATH, "utf8");
       if (!saved.persisted || saved.added !== 1 || !keys.includes(pasted) || !file.includes(pasted)) process.exit(2);
       console.log("stored");`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        VENICE_KEY_PATH: keyPath,
        VENICE_BUDGET_PATH: join(dir, "budget.json"),
      },
    },
  );
  rmSync(dir, { recursive: true, force: true });
  if (child.status !== 0 || !child.stdout.includes("stored")) fail(`pasted key was not stored (${child.status})`);
  pass("pasted key is stored without the repo");
}

function parseEval(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  let raw = trimmed.slice(start, end + 1);
  if (raw.includes('\\"')) raw = raw.replace(/\\"/g, '"');
  return JSON.parse(raw);
}

function browser(args) {
  const result = spawnSync("agent-browser", args, { encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || result.stdout || args.join(" "));
  return result.stdout;
}

function assertBrowserPaste(key) {
  browser(["open", "http://127.0.0.1:8080/"]);
  browser(["wait", "2000"]);
  const opened = browser([
    "eval",
    `(() => {
      const button = document.querySelector('[data-testid="venice-keys"]');
      if (!button) return "missing-badge";
      button.click();
      return button.textContent || "";
    })()`,
  ]);
  if (!opened.includes("Venice")) fail(`badge missing (${opened.trim()})`);
  browser(["wait", "300"]);
  const filled = browser([
    "eval",
    `(() => {
      const key = ${JSON.stringify(key)};
      const field = document.querySelector('[data-testid="venice-key-input"]');
      if (!field) return "missing-field";
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      set.call(field, key);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return field.value.startsWith("VENICE_INFERENCE_KEY_") ? "filled" : "empty";
    })()`,
  ]);
  if (!filled.includes("filled")) fail(`key field did not take the paste (${filled.trim()})`);
  browser(["eval", `document.querySelector('[data-testid="venice-key-submit"]').click()`]);
  browser(["wait", "1500"]);
  const result = browser([
    "eval",
    `(() => {
      const key = ${JSON.stringify(key)};
      const stored = localStorage.getItem("xero-venice-keys") || "";
      const note = document.querySelector('[data-testid="venice-key-note"]')?.textContent || "";
      const badge = document.querySelector('[data-testid="venice-keys"]')?.textContent || "";
      return JSON.stringify({
        stored: stored.split(/\\s+/).includes(key),
        note,
        live: badge.includes("Venice live"),
        failed: note.includes("Could not save"),
      });
    })()`,
  ]);
  const parsed = parseEval(result);
  if (!parsed.stored || parsed.failed || !parsed.live) fail(`browser paste failed ${JSON.stringify(parsed)}`);
  if (!/Saved|Added/.test(parsed.note)) fail(`save note missing (${parsed.note})`);
  pass("browser paste saved the key and Venice stayed live");
}

const key = hostKey();
assertHostKey(key);
assertPasteStores();
assertBrowserPaste(key);
pass("venice key smoke");

