import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Info, History, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { drawCity, defaultCamera, panBy, pullBy, zoomAt, type Camera, type Hit } from "@/city/draw";
import { cityAt, loadLocalMilestones, makeMilestone, mergeMilestones, recordMilestone, saveLocalMilestones, stopIndex, stopsFor, type Milestone } from "@/city/history";
import { needsReplay } from "@/city/replay";
import { loadCity, saveCity } from "@/city/save";
import { CITY_VERSION, createCity, eraLabel, growthOf, personFacts, queuePlans, stepCity, type City } from "@/city/sim";
import { splitXero, xeroUrl, XERO_REPO } from "@/city/xero-emoji";
import { addVeniceKeys, developCity, loadMilestones, loadWorld, narrateLife, pulseWatch, saveMilestone, saveWorld, searchLife, veniceStatus } from "@/lib/world-api";

const PARADE = ["🏃", "🚶", "💃", "🐄", "🚌", "🌻", "🏗️", "🚗", "🐈", "🌙", "🐢", "🛵", "🐓", "🛸", "🐐", "🧱"];

function CityLoading({ title }: { title: string }) {
  return (
    <div data-testid="city-loading" className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-x-0 top-[34%] h-36">
        {PARADE.map((emoji, index) => (
          <img
            key={emoji}
            src={xeroUrl(emoji)}
            alt=""
            className={`parade-emoji absolute ${index % 2 ? "back" : ""}`}
            style={{
              top: `${(index % 4) * 28}px`,
              width: index % 3 === 0 ? 64 : 44,
              animationDelay: `${index * -0.35}s`,
              animationDuration: `${5.2 + (index % 4) * 0.7}s`,
            }}
          />
        ))}
      </div>
      <p className="relative z-10 mt-44 font-display text-3xl text-cream">{title}</p>
      <p className="relative mt-2 text-sm text-mute">The street is clearing for the city you asked to see.</p>
    </div>
  );
}

export const Route = createFileRoute("/")({
  loader: () => veniceStatus({ data: { keys: "" } }),
  component: Home,
});

const KEY_STORE = "xero-venice-keys";

function storedKeys() {
  try {
    return localStorage.getItem(KEY_STORE) || "";
  } catch {
    return "";
  }
}

function rememberLocal(raw: string) {
  const next = new Set(
    storedKeys()
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 20),
  );
  let added = 0;
  for (const part of raw.split(/[\s,]+/)) {
    const trimmed = part.trim();
    if (trimmed.length < 20 || trimmed.length > 200 || next.has(trimmed)) continue;
    next.add(trimmed);
    added += 1;
  }
  const text = [...next].join("\n");
  try {
    localStorage.setItem(KEY_STORE, text);
  } catch {
    /* private mode still sends the draft */
  }
  return { added, text, count: next.size };
}

function countdownLabel(resetsAt: string, now: number) {
  const ms = Math.max(0, new Date(resetsAt).getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

function censusOf(city: City) {
  const counts = new Map<string, number>();
  for (const building of city.buildings) counts.set(building.kind, (counts.get(building.kind) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(",");
}

function XeroLine({ text }: { text: string }) {
  return (
    <>
      {splitXero(text).map((part, index) =>
        part.emoji ? (
          <img
            key={index}
            src={xeroUrl(part.value)}
            alt={part.value}
            className="mx-px inline-block h-[1.2em] w-[1.2em] align-[-0.25em]"
          />
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </>
  );
}

function Home() {
  const initialStatus = Route.useLoaderData();
  const narrate = useServerFn(narrateLife);
  const search = useServerFn(searchLife);
  const pullStatus = useServerFn(veniceStatus);
  const saveKeys = useServerFn(addVeniceKeys);
  const remember = useServerFn(saveWorld);
  const recall = useServerFn(loadWorld);
  const recallMarks = useServerFn(loadMilestones);
  const storeMark = useServerFn(saveMilestone);
  const pulse = useServerFn(pulseWatch);
  const develop = useServerFn(developCity);
  const [status, setStatus] = useState(initialStatus);
  const [city, setCity] = useState<City>(() => createCity("xero-emoji-world"));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("who bought pizza");
  const [hits, setHits] = useState<{ id: string; score: number; text: string }[]>([]);
  const [searchNote, setSearchNote] = useState("");
  const [busy, setBusy] = useState<"search" | "story" | null>(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<Hit | null>(null);
  const [story, setStory] = useState("");
  const [storyNote, setStoryNote] = useState("");
  const [keysOpen, setKeysOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyNote, setKeyNote] = useState("");
  const [watchers, setWatchers] = useState(1);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [scrub, setScrub] = useState<number | null>(null);
  const [liveTick, setLiveTick] = useState(city.tick);
  const [travelOpen, setTravelOpen] = useState(false);
  const [cover, setCover] = useState({ on: true, title: "The city is waking up" });
  const [credit, setCredit] = useState(true);
  const [budget, setBudget] = useState(initialStatus.budget);
  const [clock, setClock] = useState(Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<Hit[]>([]);
  const camRef = useRef<Camera>(defaultCamera());
  const focusRef = useRef<string | null>(null);
  const cityRef = useRef(city);
  const liveRef = useRef(city);
  const historyRef = useRef<Milestone[]>([]);
  const scrubRef = useRef<number | null>(null);
  const coverRef = useRef(true);
  const coverGen = useRef(0);
  const revealRef = useRef(0);
  const openedAt = useRef(Date.now());
  const dockRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef<(tick: number | null) => void>(() => undefined);
  const keepRef = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef({
    mode: "none" as "none" | "pull" | "turn" | "pinch",
    lastX: 0,
    lastY: 0,
    lastDist: 0,
    lastMidX: 0,
    lastMidY: 0,
    moved: false,
  });
  const watchersRef = useRef(1);
  const planKey = useRef("");
  const storeMarkRef = useRef(storeMark);
  storeMarkRef.current = storeMark;
  focusRef.current = focus?.id ?? null;

  useEffect(() => {
    let stop = false;
    recall({ data: {} })
      .then((row) => {
        if (stop) return;
        const stored = row?.city?.version === CITY_VERSION ? row.city : loadCity();
        if (stored) {
          liveRef.current = stored;
          cityRef.current = stored;
          setCity(stored);
          setLiveTick(stored.tick);
        }
      })
      .catch(() => {
        const stored = loadCity();
        if (!stop && stored) {
          liveRef.current = stored;
          cityRef.current = stored;
          setCity(stored);
          setLiveTick(stored.tick);
        }
      })
      .finally(() => {
        keepRef.current = true;
        const live = liveRef.current;
        if (needsReplay(historyRef.current, live)) {
          const seed = live.seed || "xero-emoji-world";
          let replay = createCity(seed);
          historyRef.current = mergeMilestones([historyRef.current, [makeMilestone(replay, "Founding")]]);
          setMilestones([...historyRef.current]);
          let left = Math.min(2400, Math.max(0, live.tick));
          const pump = () => {
            const batch: Milestone[] = [];
            const start = performance.now();
            while (left > 0 && performance.now() - start < 12) {
              const era = replay.era;
              replay = stepCity(replay);
              left -= 1;
              if (replay.era !== era) batch.push(makeMilestone(replay, `Became ${replay.era}`));
              else if (replay.tick % 120 === 0) batch.push(makeMilestone(replay, `Tick ${replay.tick}`));
            }
            if (batch.length) {
              historyRef.current = mergeMilestones([historyRef.current, batch]);
              setMilestones([...historyRef.current]);
            }
            if (left > 0) window.setTimeout(pump, 32);
            else saveLocalMilestones(historyRef.current);
          };
          window.setTimeout(pump, 40);
        }
        const wait = Math.max(700, 1200 - (Date.now() - openedAt.current));
        window.setTimeout(() => {
          if (coverGen.current !== 0) return;
          coverRef.current = false;
          setCover((prev) => ({ ...prev, on: false }));
        }, wait);
      });
    const flush = () => saveCity(cityRef.current);
    window.addEventListener("pagehide", flush);
    return () => {
      stop = true;
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, [recall]);

  useEffect(() => {
    const local = loadLocalMilestones();
    historyRef.current = local;
    setMilestones(local);
    let stop = false;
    recallMarks({ data: {} })
      .then((remote) => {
        if (stop || !Array.isArray(remote)) return;
        const merged = mergeMilestones([historyRef.current, remote]);
        historyRef.current = merged;
        setMilestones(merged);
        saveLocalMilestones(merged);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [recallMarks]);

  useEffect(() => {
    if (!status.infra?.localCapped) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status.infra?.localCapped]);

  useEffect(() => {
    if (status.infra?.localCapped && !status.infra.contributedReady) setKeysOpen(true);
  }, [status.infra?.localCapped, status.infra?.contributedReady]);

  useEffect(() => {
    let stop = false;
    const pull = () => {
      pullStatus({ data: { keys: storedKeys() } })
        .then((next) => {
          if (stop || !next) return;
          setStatus(next);
          setBudget((prev) => (next.budget.spentUsd >= prev.spentUsd ? next.budget : prev));
        })
        .catch((err) => {
          setStatus((prev) => ({
            ...prev,
            live: false,
            detail: err instanceof Error ? err.message.slice(0, 72) : "status failed",
          }));
        });
    };
    pull();
    const timer = window.setInterval(pull, 20000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [pullStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let raf = 0;
    const paint = (phase: number) => {
      const parent = canvas.parentElement;
      if (!parent) return;
      if (cityRef.current.version !== CITY_VERSION) {
        const next = createCity(cityRef.current.seed || "xero-emoji-world");
        cityRef.current = next;
        setCity(next);
      }
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (coverRef.current) {
        ctx.fillStyle = "#12100c";
        ctx.fillRect(0, 0, width, height);
        hitsRef.current = [];
        return;
      }
      hitsRef.current = drawCity(ctx, cityRef.current, width, height, camRef.current, phase, focusRef.current);
    };
    const loop = () => {
      frame += 1;
      if (cityRef.current.version === CITY_VERSION && keepRef.current && scrubRef.current == null) {
        const pace = Math.min(4, Math.max(1, watchersRef.current));
        let next = liveRef.current.version === CITY_VERSION ? liveRef.current : cityRef.current;
        for (let step = 0; step < pace; step += 1) next = stepCity(next);
        liveRef.current = next;
        const recorded = recordMilestone(historyRef.current, next);
        if (recorded !== historyRef.current) {
          const added = recorded.find((item) => !historyRef.current.some((prev) => prev.id === item.id));
          historyRef.current = recorded;
          saveLocalMilestones(recorded);
          setMilestones(recorded);
          if (added) void storeMarkRef.current({ data: added }).catch(() => undefined);
        }
        cityRef.current = next;
        if (frame % 10 === 0) {
          setCity(next);
          setLiveTick(next.tick);
        }
        if (keepRef.current && frame % 600 === 0) {
          saveCity(cityRef.current);
          void remember({
            data: {
              city: cityRef.current,
              kind: "snapshot",
              summary: `${cityRef.current.era} · ${cityRef.current.buildings.length} buildings`,
              source: "sim",
            },
          }).catch(() => undefined);
        }
      } else if (scrubRef.current != null && keepRef.current) {
        cityRef.current = cityAt(historyRef.current, scrubRef.current) ?? liveRef.current;
        if (frame % 10 === 0) setCity(cityRef.current);
      }
      paint(frame);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const next = camRef.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08);
      camRef.current = zoomAt(
        cityRef.current,
        canvas.clientWidth,
        canvas.clientHeight,
        camRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        next,
      );
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  useEffect(() => {
    const id = sessionStorage.getItem("xero-watch") || crypto.randomUUID();
    sessionStorage.setItem("xero-watch", id);
    let stop = false;
    const beat = () => {
      pulse({ data: { id } })
        .then(async (res) => {
          if (stop) return;
          const count = res.watchers;
          watchersRef.current = count;
          setWatchers(count);
          cityRef.current = { ...cityRef.current, watchers: count };
          const census = censusOf(cityRef.current);
          const key = `${cityRef.current.era}:${Math.min(8, count)}:${census}`;
          if (planKey.current === key) return;
          const plan = await develop({
            data: {
              era: cityRef.current.era,
              watchers: count,
              have: censusOf(cityRef.current).split(",").filter(Boolean),
              keys: storedKeys(),
            },
          });
          if (stop) return;
          planKey.current = key;
          cityRef.current = queuePlans(cityRef.current, plan.developments, plan.focus);
          setCity(cityRef.current);
          setBudget((prev) => (plan.budget.spentUsd >= prev.spentUsd ? plan.budget : prev));
          if (plan.live) {
            setStatus((prev) => ({ ...prev, live: true, detail: plan.model, infra: { ...prev.infra, source: plan.source } }));
            void remember({
              data: {
                city: cityRef.current,
                kind: "develop",
                summary: plan.developments.map((item) => item.name).join(", ") || plan.focus.note,
                source: plan.source,
              },
            }).catch(() => undefined);
          }
        })
        .catch((err) => {
          setStatus((prev) => ({
            ...prev,
            detail: err instanceof Error ? err.message.slice(0, 72) : "voice failed",
          }));
        });
    };
    beat();
    const timer = window.setInterval(beat, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [develop, pulse, remember]);

  function fingerPair() {
    const pts = [...pointers.current.values()];
    const a = pts[0];
    const b = pts[1];
    if (!a || !b) return null;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  function armPull(x: number, y: number) {
    gesture.current.mode = "pull";
    gesture.current.lastX = x;
    gesture.current.lastY = y;
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    const g = gesture.current;
    g.moved = false;
    const pair = fingerPair();
    if (pair) {
      g.mode = "pinch";
      g.lastDist = pair.dist;
      g.lastMidX = pair.midX;
      g.lastMidY = pair.midY;
      return;
    }
    if (event.button === 2 || event.altKey || event.shiftKey) {
      g.mode = "turn";
      g.lastX = event.clientX;
      g.lastY = event.clientY;
      return;
    }
    armPull(event.clientX, event.clientY);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    if (Math.hypot(event.clientX - prev.x, event.clientY - prev.y) > 2) gesture.current.moved = true;
    const canvas = event.currentTarget;
    const g = gesture.current;
    if (g.mode === "pinch") {
      const pair = fingerPair();
      if (!pair) return;
      const rect = canvas.getBoundingClientRect();
      camRef.current = panBy(camRef.current, pair.midX - g.lastMidX, pair.midY - g.lastMidY);
      camRef.current = zoomAt(
        cityRef.current,
        canvas.clientWidth,
        canvas.clientHeight,
        camRef.current,
        pair.midX - rect.left,
        pair.midY - rect.top,
        camRef.current.zoom * (pair.dist / (g.lastDist || pair.dist)),
      );
      g.lastDist = pair.dist;
      g.lastMidX = pair.midX;
      g.lastMidY = pair.midY;
      return;
    }
    const dx = event.clientX - g.lastX;
    const dy = event.clientY - g.lastY;
    g.lastX = event.clientX;
    g.lastY = event.clientY;
    if (g.mode === "pull" || g.mode === "turn") {
      const rect = canvas.getBoundingClientRect();
      camRef.current = pullBy(
        cityRef.current,
        canvas.clientWidth,
        canvas.clientHeight,
        camRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        dx,
        dy,
        g.mode === "turn" ? 0.005 : 0.0016,
      );
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g.moved && pointers.current.size === 0 && event.button !== 2) {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = [...hitsRef.current]
        .reverse()
        .find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
      if (hit) void openStory(hit);
    }
    if (pointers.current.size === 1) {
      const left = [...pointers.current.values()][0];
      if (left) armPull(left.x, left.y);
    }
    if (pointers.current.size === 0) g.mode = "none";
  }

  async function openStory(hit: Hit) {
    setFocus(hit);
    setOpen(true);
    setStory("");
    setStoryNote("");
    setError("");
    setBusy("story");
    try {
      const result = await narrate({
        data: {
          name: hit.name,
          emoji: hit.emoji,
          role: hit.role,
          place: `${hit.place}${hit.floor ? `, floor ${hit.floor}` : ""}`,
          facts: personFacts(cityRef.current, hit.id) || hit.detail,
          era: cityRef.current.era,
          research: cityRef.current.research,
          tick: cityRef.current.tick,
          keys: storedKeys(),
        },
      });
      setStory(result.text);
      setBudget(result.budget);
      setStoryNote(result.cached ? "Replay, no charge" : result.live ? "Charged to today's dollar" : "Local line, no charge");
      if (result.live) {
        void remember({
          data: { city: cityRef.current, kind: "story", summary: result.text, source: result.source },
        }).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The city could not speak");
    } finally {
      setBusy(null);
    }
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    setBusy("search");
    setError("");
    try {
      const result = await search({
        data: {
          query,
          beats: cityRef.current.beats.map((beat) => ({ id: beat.id, text: beat.text })),
          keys: storedKeys(),
        },
      });
      setHits(result.hits);
      setBudget(result.budget);
      setSearchNote(result.live ? `Memory · ${result.model}` : "Local memory, no charge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const dir = event.deltaY > 0 ? -1 : 1;
      const marks = stopsFor(historyRef.current, liveRef.current.tick);
      const at = stopIndex(marks, scrubRef.current);
      const next = Math.min(marks.length - 1, Math.max(0, at + dir));
      if (next === at) return;
      const stop = marks[next];
      if (!stop || next >= marks.length - 1) travelRef.current(null);
      else travelRef.current(stop.tick);
    };
    dock.addEventListener("wheel", onWheel, { passive: false });
    return () => dock.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setCredit(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status.needsKey) setKeysOpen(true);
  }, [status.needsKey]);

  function travelTo(tick: number | null) {
    const live = liveRef.current;
    const past = tick == null ? null : cityAt(historyRef.current, tick) ?? historyRef.current[0]?.city ?? null;
    const shown = past ?? live;
    const mark = past ? historyRef.current.filter((item) => item.tick <= (tick ?? 0)).at(-1) : null;
    scrubRef.current = past ? tick : null;
    setScrub(past ? tick : null);
    camRef.current = defaultCamera();
    cityRef.current = shown;
    setCity(shown);
    const gen = ++coverGen.current;
    coverRef.current = true;
    setCover({ on: true, title: past ? `Opening ${mark?.title ?? "an earlier city"}` : "Returning to now" });
    window.clearTimeout(revealRef.current);
    revealRef.current = window.setTimeout(() => {
      if (coverGen.current !== gen) return;
      coverRef.current = false;
      setCover((prev) => ({ ...prev, on: false }));
    }, 800);
  }
  travelRef.current = travelTo;

  const latest = city.beats[0];
  const stops = stopsFor(milestones, liveTick);
  const index = stopIndex(stops, scrub);
  const viewing = scrub == null ? null : milestones.filter((item) => item.tick <= scrub).at(-1);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-cream">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      />
      {cover.on && <CityLoading title={cover.title} />}
      <div ref={dockRef} className="pointer-events-auto absolute inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:right-56">
        {travelOpen && (
          <div data-testid="milestones" className="flex gap-2 overflow-x-auto rounded-card border border-line bg-panel/95 p-2">
            {milestones.length === 0 ? (
              <p className="px-2 py-3 text-xs text-mute">The first snapshot is kept as soon as the city has a moment worth keeping.</p>
            ) : (
              milestones.map((mark) => {
                const selected = viewing?.id === mark.id;
                return (
                  <button
                    key={mark.id}
                    type="button"
                    data-testid="milestone"
                    className={`w-40 shrink-0 rounded-lg border px-2 py-2 text-left ${selected ? "border-amber bg-ink" : "border-line"}`}
                    onClick={() => travelTo(mark.tick >= liveTick ? null : mark.tick)}
                  >
                    <span className="block text-xs text-cream">{mark.title}</span>
                    <span className="mt-1 block text-[11px] text-mute">
                      tick {mark.tick} · {mark.era}
                    </span>
                    <span className="mt-1 block text-[11px] text-mute">{mark.summary}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border border-line bg-panel/95 px-3 py-2">
          <button
            type="button"
            data-testid="time-travel"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-amber"
            aria-expanded={travelOpen}
            aria-label="Time travel"
            onClick={() => setTravelOpen((open) => !open)}
          >
            <History className="size-4" />
          </button>
          <input
            data-testid="time-scrub"
            className="min-w-0 flex-1 accent-amber"
            type="range"
            min={0}
            max={Math.max(0, stops.length - 1)}
            step={1}
            value={index}
            aria-label="City time"
            aria-valuetext={stops[index]?.title ?? "Now"}
            onChange={(event) => {
              const at = Number(event.target.value);
              const stop = stops[at];
              if (!stop || at >= stops.length - 1) travelTo(null);
              else travelTo(stop.tick);
            }}
          />
          <span data-testid="time-label" className="w-28 shrink-0 truncate text-right text-[11px] text-mute">
            {scrub == null ? "" : stops[index]?.title ?? ""}
          </span>
          <button
            type="button"
            data-testid="time-now"
            aria-pressed={scrub == null}
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide ${scrub == null ? "bg-amber text-ink" : "border border-line text-mute"}`}
            onClick={() => travelTo(null)}
          >
            NOW
          </button>
        </div>
      </div>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto flex items-start gap-3">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-line bg-panel text-amber"
            aria-expanded={open}
            aria-label="Life story"
            onClick={() => setOpen((v) => !v)}
          >
            <Info className="size-5" />
          </button>
          <div>
            <p className="font-display text-2xl leading-none text-cream">Xero</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber">
              {city.alchemy?.eraName ?? eraLabel(city.era ?? "camp")} · knowledge {city.alchemy?.knowledge ?? 0} · ×{growthOf(city.alchemy).toFixed(2)}
            </p>
            <p data-testid="watch-note" className="mt-1 max-w-xs text-sm text-cream">
              {watchers} watching. It only grows while someone is watching. More people, faster.
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-mute">
              {city.cols}×{city.rows} and past the frame
            </p>
            {city.alchemy?.prophecy ? <p className="mt-1 max-w-xs text-sm text-cream">{city.alchemy.prophecy}</p> : null}
            {city.focus?.note ? (
              <p className="mt-1 max-w-xs text-sm text-cream">
                {city.focus.kind}: {city.focus.note}
              </p>
            ) : null}
            <p className="mt-1 max-w-xs text-sm text-mute">{latest ? <XeroLine text={latest.text} /> : null}</p>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-col items-end">
          <Link
            to="/book"
            data-testid="buy-the-book"
            className="rounded-full bg-amber px-4 py-2 text-xs font-semibold tracking-[0.14em] text-ink"
          >
            BUY THE BOOK
          </Link>
          <div className="relative mt-2">
          <button
            type="button"
            data-testid="venice-keys"
            className="max-w-[16rem] rounded-full border border-line bg-panel px-3 py-2 text-left text-xs text-mute sm:max-w-none"
            aria-expanded={keysOpen}
            aria-label="Venice keys"
            onClick={() => setKeysOpen((open) => !open)}
          >
            {status.infra?.localCapped && status.infra.contributedReady && status.live
              ? "Venice live · contributed"
              : status.infra?.localCapped
                ? "Venice paused"
                : status.needsKey
                  ? "Venice needs a key"
                  : status.live
                    ? "Venice live"
                    : "Venice offline"}
            {status.detail ? ` · ${status.detail}` : ""}
            {status.keyCount > 1 ? ` · ${status.keyCount} keys` : ""} · {budget.spentUsd.toFixed(3)} of $1
          </button>
          {status.infra?.localCapped && (
            <p data-testid="venice-countdown" className="mt-1 text-right text-[11px] text-amber">
              Local inference returns in {countdownLabel(status.infra.resetsAt, clock)}
            </p>
          )}
          {keysOpen && (
            <form
              className="absolute right-0 top-12 w-72 rounded-card border border-line bg-panel p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const local = rememberLocal(keyDraft);
                const keys = local.text || keyDraft;
                saveKeys({ data: { keys } })
                  .then(async (result) => {
                    setKeyNote(
                      result.added
                        ? `Added ${result.added}. ${result.keyCount} ready.`
                        : `Saved. ${result.keyCount || local.count} ready.`,
                    );
                    setKeyDraft("");
                    const next = await pullStatus({ data: { keys: storedKeys() || keys } }).catch(() => null);
                    if (!next) return;
                    setStatus(next);
                    setBudget((prev) => (next.budget.spentUsd >= prev.spentUsd ? next.budget : prev));
                    if (next.live) setKeysOpen(false);
                  })
                  .catch(() => {
                    if (local.count > 0) {
                      setKeyNote("Saved in this browser. Paste it again if a new device needs it.");
                      setKeyDraft("");
                      return;
                    }
                    setKeyNote("Could not save the keys.");
                  });
              }}
            >
              <p className="text-xs text-mute">
                {status.infra?.localCapped
                  ? "The host dollar is spent for today. Paste a Venice key to keep the city growing until it resets. Keys stay in this browser and on this host, not in the repo."
                  : status.needsKey
                    ? "This Venice key is used up. Paste another to keep stories, search, and new buildings running. Extra keys stay in this browser and are not written to the repo."
                    : "Paste more Venice keys, one per line. They stay in this browser and on this host, not in the repo."}
              </p>
              <textarea
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                rows={4}
                data-testid="venice-key-input"
                aria-label="Venice key"
                className="mt-2 w-full rounded-lg border border-line bg-ink p-2 text-xs text-cream outline-none"
                placeholder="VENICE_INFERENCE_KEY_…"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" data-testid="venice-key-submit" className="mt-2 rounded-full border border-line px-3 py-2 text-xs text-amber">
                Add keys
              </button>
            </form>
          )}
          {keyNote && (
            <p data-testid="venice-key-note" className="mt-1 text-right text-[11px] text-mute">
              {keyNote}
            </p>
          )}
          </div>
        </div>
      </header>
      {credit && (
        <a
          href={XERO_REPO}
          target="_blank"
          rel="noreferrer"
          className="credit-pop pointer-events-auto absolute bottom-14 left-1/2 z-30 flex max-w-[min(92vw,36rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel/95 px-3 py-2 text-[13px] text-cream shadow-lg"
        >
          <span className="flex shrink-0" aria-hidden>
            {["🏙️", "🚗", "🌻", "🌙", "👩", "🌳", "🚌", "🪐"].map((emoji, index) => (
              <img
                key={emoji + index}
                src={xeroUrl(emoji)}
                alt=""
                className="credit-glyph size-5"
                style={{ animationDelay: `${index * 70}ms` }}
              />
            ))}
          </span>
          <span className="leading-tight">With Licensing Support from XeroEmoji</span>
        </a>
      )}
      <a
        href="https://github.com/maximusmaximus/xero-emoji-world"
        target="_blank"
        rel="noreferrer"
        data-testid="world-repo"
        aria-label="Xero Emoji World on GitHub"
        title="github.com/maximusmaximus/xero-emoji-world"
        className="absolute bottom-3 right-3 z-50 grid size-12 place-items-center rounded-full border border-line bg-panel"
      >
        <img src={xeroUrl("🤓")} alt="" className="size-8" />
      </a>
      {open && (
        <aside className="panel-in absolute inset-x-3 bottom-3 top-20 z-20 flex max-w-md flex-col gap-4 overflow-hidden rounded-card border border-line bg-panel p-4 sm:inset-y-4 sm:right-auto sm:w-[22rem]">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl">Life story</h1>
            <button type="button" className="grid size-11 place-items-center text-mute" aria-label="Close" onClick={() => setOpen(false)}>
              <X className="size-5" />
            </button>
          </div>
          {focus && (
            <p className="text-sm text-cream">
              <XeroLine text={`${focus.emoji} ${focus.name}`} />
              <span className="text-mute"> · {focus.place}, floor {focus.floor}</span>
            </p>
          )}
          <p className="text-sm text-cream">{busy === "story" ? "Asking the city…" : story ? <XeroLine text={story} /> : "Tap a life in a window."}</p>
          {storyNote && <p className="text-xs text-mute">{storyNote}</p>}
          <form className="flex gap-2" onSubmit={runSearch}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 rounded-full border border-line bg-ink px-3 py-2 text-sm text-cream outline-none"
              aria-label="Search the city"
            />
            <button type="submit" className="grid size-11 place-items-center rounded-full border border-line text-amber" aria-label="Search">
              <Search className="size-5" />
            </button>
          </form>
          {searchNote && <p className="text-xs text-mute">{searchNote}</p>}
          {error && <p className="text-xs text-amber">{error}</p>}
          <ul className="flex flex-col gap-2 overflow-auto text-sm">
            {hits.map((hit) => (
              <li key={hit.id} className="text-cream">
                <span className="mr-2 text-xs text-mute">{hit.score.toFixed(2)}</span>
                <XeroLine text={hit.text} />
              </li>
            ))}
            {city.beats.map((beat) => (
              <li key={beat.id} className="text-mute">
                <XeroLine text={beat.text} />
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
