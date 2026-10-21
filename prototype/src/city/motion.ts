/**
 * Motion language. Nothing travels unless this file says it may.
 *
 * self     walks or drives on its own (a person, an animal, a vehicle, the sky)
 * carried  changes place only while a person is holding it
 * dragged  changes place only while a vehicle is pulling it
 * still    never travels (furniture, signs, plants, buildings)
 */
export type Motion = "self" | "carried" | "dragged" | "still";
export type Mover = "self" | "person" | "vehicle";

const SELF = new Set(
  "🚶 🧍‍♀️ 🧍 🧑 👩 👨 🧒 👶 👵 👴 👷 👮 🧙 🐶 🐕 🐈 🐄 🐖 🐓 🐑 🐎 🐝 🦋 🐦 🦆 🚗 🚙 🚕 🚌 🚎 🚐 🚚 🚛 🚜 🚲 🛴 🚑 🚒 🚓 🏎️ 🏍️ ☁️ 🌙 ☀️ ⭐ ✨ 🌟 🪐 ☄️ 🌠".split(
    " ",
  ),
);
const CARRIED = new Set("🍞 🧋 📚 ✏️ 🎒 🍎 🩺 💊 💼 💻 📞 ☕ 🧁 🧃 🥚 🥛 💉 🧳 🛍️ 🎁 🧺 🔑 📱".split(" "));
const DRAGGED = new Set("🪵 🧱 📦 🛢️ 🛒 🏗️ 🌾 ⚙️ 🪟 🔧".split(" "));

function bare(emoji: string) {
  return emoji.replace(/\uFE0F/g, "");
}

export function motionOf(emoji: string): Motion {
  const key = bare(emoji);
  if (SELF.has(emoji) || SELF.has(key) || /[🚶🧍🧑👩👨🧒👶👵👴👷👮🧙🐶🐕🐈🐄🐖🐓🐑🐎]/u.test(emoji)) return "self";
  if (CARRIED.has(emoji) || CARRIED.has(key)) return "carried";
  if (DRAGGED.has(emoji) || DRAGGED.has(key)) return "dragged";
  return "still";
}

/** True only when this holder is allowed to change the emoji's place. */
export function mayMove(emoji: string, by: Mover): boolean {
  const motion = motionOf(emoji);
  if (motion === "still") return false;
  if (motion === "self") return by === "self";
  if (motion === "carried") return by === "person";
  return by === "vehicle" || by === "person";
}

export type FloorBand = { story: number; t0: number; t1: number };

/** Stacked window bands. t = 0 is the street, t = 1 is the roof. Gaps between bands are the floor spacers. */
export function floorBands(stories: number, doorTop: number): FloorBand[] {
  const count = Math.max(1, Math.min(4, Math.floor(stories)));
  const spacer = count > 1 ? 0.05 : 0;
  const top = 0.92;
  const span = Math.max(0.08, top - doorTop - spacer * (count - 1));
  const band = span / count;
  return Array.from({ length: count }, (_, story) => {
    const t0 = doorTop + story * (band + spacer);
    return { story, t0, t1: t0 + band };
  });
}

export function storyCount(kind: string, apartments: number) {
  const built = Math.max(1, apartments);
  if (built >= 2) return Math.min(4, built);
  return kind === "hut" ? 1 : 2;
}

export type Room = {
  still: { emoji: string; u: number }[];
  actor: string;
  carried?: string;
};

const ROOMS: Record<string, Room[]> = {
  home: [
    { still: [{ emoji: "🍽️", u: 0.22 }, { emoji: "🪴", u: 0.84 }], actor: "🧑‍🍳", carried: "🍞" },
    { still: [{ emoji: "📺", u: 0.2 }, { emoji: "🛋️", u: 0.78 }], actor: "👩" },
    { still: [{ emoji: "🛏️", u: 0.24 }, { emoji: "🪞", u: 0.8 }], actor: "🧒" },
    { still: [{ emoji: "📚", u: 0.18 }, { emoji: "🪴", u: 0.82 }], actor: "🧑", carried: "☕" },
  ],
  shop: [
    { still: [{ emoji: "🧁", u: 0.22 }, { emoji: "🧋", u: 0.78 }], actor: "🧑", carried: "🛍️" },
    { still: [{ emoji: "💳", u: 0.2 }, { emoji: "🧺", u: 0.76 }], actor: "👩", carried: "🍞" },
    { still: [{ emoji: "🪞", u: 0.24 }, { emoji: "🪴", u: 0.8 }], actor: "🧒" },
  ],
  gas: [
    { still: [{ emoji: "🧃", u: 0.22 }, { emoji: "🔧", u: 0.78 }], actor: "👷" },
    { still: [{ emoji: "☕", u: 0.24 }, { emoji: "🗺️", u: 0.76 }], actor: "🧑", carried: "🔑" },
  ],
  school: [
    { still: [{ emoji: "📚", u: 0.2 }, { emoji: "🪑", u: 0.78 }], actor: "🧒", carried: "✏️" },
    { still: [{ emoji: "🍎", u: 0.22 }, { emoji: "🪑", u: 0.8 }], actor: "👩" },
    { still: [{ emoji: "🧪", u: 0.2 }, { emoji: "📚", u: 0.76 }], actor: "🧑‍🏫" },
  ],
  hospital: [
    { still: [{ emoji: "🛏️", u: 0.24 }, { emoji: "💊", u: 0.78 }], actor: "👩‍⚕️", carried: "🩺" },
    { still: [{ emoji: "💉", u: 0.2 }, { emoji: "🛏️", u: 0.8 }], actor: "🧑" },
  ],
  barn: [
    { still: [{ emoji: "🌾", u: 0.22 }, { emoji: "🪣", u: 0.8 }], actor: "🐄" },
    { still: [{ emoji: "🥚", u: 0.2 }, { emoji: "🥛", u: 0.72 }], actor: "🧑‍🌾", carried: "🧺" },
  ],
  tower: [
    { still: [{ emoji: "💻", u: 0.22 }, { emoji: "🪴", u: 0.82 }], actor: "🧑‍💼", carried: "💼" },
    { still: [{ emoji: "📞", u: 0.2 }, { emoji: "☕", u: 0.74 }], actor: "👩" },
    { still: [{ emoji: "📊", u: 0.18 }, { emoji: "🪴", u: 0.8 }], actor: "🧑", carried: "📱" },
    { still: [{ emoji: "💡", u: 0.24 }, { emoji: "📚", u: 0.78 }], actor: "🧙" },
  ],
};

export function roomFor(facade: string, story: number, resident?: string): Room {
  const list = ROOMS[facade] ?? ROOMS.home!;
  const room = list[story % list.length]!;
  const actor = resident && motionOf(resident) === "self" ? resident : room.actor;
  return { ...room, actor, still: room.still.filter((item) => motionOf(item.emoji) !== "self") };
}
