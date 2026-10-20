# A civilization being born

The city is not a fixed district that occasionally gains a block. It starts as one fire and becomes a skyline. The clock runs once per frame, about a hundred times the old beat (one social event every 1.6s, then a hard stop at eight buildings). What you see is staged, so a floor, a field, and a road cell still read as work instead of a pop.

The world is saved in the browser (`localStorage`, key `xero-emoji-world`) about every second and a half, and again when the tab closes. A refresh continues the same city. It does not go back to the fire. A save from an older layout is ignored and a new city starts.

## Research

Research climbs on its own, and faster when a scholar finishes a walk. Crossing a goal changes the era. The header shows the era and the count.

| era | what opens |
|---|---|
| Camp | Huts, a builder, the first path |
| Farm | Fields that sprout from seed to grain, farmhouses, a farmer |
| Roads | The path pushes outward. A street may cut a field. Carts, bikes, and a bus use the paved cells |
| Town | Houses and courts, several floors, people already in the windows |
| City | An existing block is promoted into a tower and keeps rising |
| Skyline | That tower, or a new lot, becomes a spire. A helicopter and a plane cross once the era is open |

Caps keep the picture readable: four camps, four farms, five houses, four courts, four towers, four spires, about a hundred road cells, and a handful of fields. After the caps, the same crews keep the place alive.

## Who is working

Crews are emoji with a job, walking from where they are to where the work is.

- **Builder.** Raises one floor per trip. The roof shows a crane until the building opens.
- **Road crew.** Paves the next cell on the frontier. If the road is walled in by fields, the street takes the field and the field is replanted later.
- **Farmer.** Walks to a plot. The crop grows while they are gone and jumps when they arrive. A harvest carries grain into a farmhouse.
- **Visitor.** A resident walks to another building and leaves bread, a book, a basket, or flowers. The gift stays in the rooms.
- **Scholar.** Studies at the first camp and writes the discovery that pushes research.

Lots are staked on open ground beside a road, with a timber pile and a flag before the first floor exists. People, pets, and things move in as each floor is finished.

## Where a glyph stands

The blocks are orthographic isometric. The emoji are not smeared onto those faces, and people are not tilted to match a wall. Each one stands upright, feet on the surface it actually uses.

- A person stands in a window, feet on the sill, sized to that opening. A pet stands in the same room, off to one side. A kept thing sits on the sill.
- The glass is the lit opening. It follows the wall. The face in it does not.
- A door stands at the ground-floor entrance. A crane stands on the roof while the building is still rising.
- Trees and crops stand in the ground, feet in the dirt. Farmers and builders stand on the road or the lot, and only turn to face the way they are walking.
- Carts, bikes, and aircraft follow the diagonal they are traveling, wheels (or wings) down. They are the glyphs that are allowed to rotate.

Name plates stay on farms, towers, spires, and anything still under construction.
