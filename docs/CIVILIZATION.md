# A civilization being born

The city is not a fixed district that occasionally gains a block. It starts as one fire and becomes a skyline. The clock runs once per frame, about a hundred times the old beat (one social event every 1.6s, then a hard stop at eight buildings). What you see is staged, so a floor, a field, and a road cell still read as work instead of a pop.

The world is saved in the browser (`localStorage`, key `xero-emoji-world`) about every second and a half, and again when the tab closes. A refresh continues the same city. It does not go back to the fire. A save from an older layout is ignored and a new city starts.

## Who is watching

Each open tab sends a short pulse. The header shows how many are live. A tab that goes quiet for about twelve seconds drops off the count.

The city runs one step per frame for a single watcher, and up to four steps when more people are here. Research and new lots speed up with that count. More watchers also raise the cap on each kind of building, and a planned tower is built a few floors taller.

## What Venice builds

About every eight seconds the city asks Venice for the next two buildings, once per era and watcher count. The reply is a name, a kind, an emoji, and one sentence. Those plans are queued. The next lot that matches the era uses the plan instead of a random name. A plan that is too advanced for the era waits until the city can build it.

The call is cached, so a second tab in the same era does not pay again. If the day's dollar is gone, a local plan is used and nothing is charged. Stories still run only when someone taps a glyph, and they are told the era and that people are watching.

## Research

Research climbs on its own, and faster when a scholar finishes a walk or when more people are watching. Crossing a goal changes the era. The header shows the era and the count.

| era | what opens |
|---|---|
| Camp | Huts, a builder, the first path |
| Farm | Fields that sprout from seed to grain, farmhouses, a farmer |
| Roads | The path pushes outward. A street may cut a field. Carts, bikes, and a bus use the paved cells |
| Town | Houses and courts, several floors, people already in the windows |
| City | An existing block is promoted into a tower and keeps rising |
| Skyline | That tower, or a new lot, becomes a spire. Stars, planets, the moon, and the sun are already overhead |

The land does not stop at the district. Wild emoji keep appearing on open ground, and they grow while they are watched. Roads, fields, and buildings have high caps so the settlement can keep going. The sky adds another body as the tick climbs.

## Who is working

Crews are emoji with a job, walking from where they are to where the work is.

- **Builder.** Raises one floor per trip. The roof shows a crane until the building opens.
- **Road crew.** Paves the next cell on the frontier. A road cell is itself an emoji: a road, a stop, or a crossing. If the road is walled in by fields, the street takes the field and the field is replanted later.
- **Farmer.** Walks to a plot. The crop grows while they are gone and jumps when they arrive. A harvest carries grain into a farmhouse.
- **Visitor.** A resident walks to another building and leaves bread, a book, a basket, or flowers. The gift stays in the rooms.
- **Scholar.** Studies at the first camp and writes the discovery that pushes research.
- **Hauler.** A porter, and later a truck, carries one emoji at a time: timber, grain, brick, steel, glass, or tools. The load rides with them. A floor does not go up until the stock can pay for it.

## Works and infrastructure

The city keeps a stockpile. Yards, mills, kilns, factories, and tool shops sit off the road and feed it.

| works | opens | makes |
|---|---|---|
| Timber yard | Camp | Timber, from the land |
| Grain mill | Farm | Grain |
| Brick kiln | Roads | Brick, and glass on the other firing. Burns timber |
| Tool shop | Town | Tools. Uses steel |
| Steel works | City | Steel. Uses brick |

A well is there from the start. Street lamps line the roads in town. A water main and a power shed arrive with the city. Haulers walk the new material to the site that is short, so you see the load move before the next floor.

Lots are staked on open ground beside a road, with a timber pile and a flag before the first floor exists. People, pets, and things move in as each floor is finished.

## Where a glyph stands

The blocks are orthographic isometric. The emoji are not smeared onto those faces, and people are not tilted to match a wall. Each one stands upright, feet on the surface it actually uses. Any of them can be tapped for a detail: a person, a field, a road, a star.

- A person stands in a window, feet on the sill, sized to that opening. A pet stands in the same room, off to one side. A kept thing sits on the sill.
- The glass is the lit opening. It follows the wall. The face in it does not.
- A door stands at the ground-floor entrance. A crane stands on the roof while the building is still rising.
- Trees, crops, and wild emoji stand in the ground. Their size grows with how long they have been watched.
- Carts follow the emoji road, wheels down.
- Stars, planets, the moon, and the sun sit in the sky and grow in as the city is watched.

## Looking around

One finger turns the city. Pull around the center and the view follows that direction. Two fingers do the rest: pinch to zoom, and drag to move. On a desktop the wheel still zooms, and the mouse turns the view the same way one finger does. Tap any emoji for the detail.

## More Venice keys

Click the Venice badge. Paste extra keys, one per line. They are written only to the host secret file, never to the repo. Each key has its own dollar for the day. When one is spent, the next one is used.
