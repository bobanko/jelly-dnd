# Jelly & Bones

A dungeon puzzle with three translucent jelly creatures and a movable wooden crate. Version 0.2 replaces the projected Canvas/WebGL scene with a real 3D WebGPU scene and tetrahedral soft-body physics. The visual and physical requirements in jelly-dice.md are adapted to the existing game without dice rolling, dice scoring or table-demo mechanics.

## Run

Run npm start (or node server.js), then open http://localhost:3000 in Chrome or Edge with WebGPU enabled. No runtime packages, CDNs or external fonts are needed. Stone and oak textures are bundled in assets/materials/; their generation prompts and mapping details are documented there. Serve over localhost or HTTPS; opening a local HTML file is not the supported launch path.

If the browser has no WebGPU adapter, an explanation appears instead of a blank scene. A lost GPU device also shows the fallback card. There is no silent return to the old 2D renderer.

## Play

- Hold WASD for Moss, arrow keys for Frost, and I/J/K/L for the red Ember (I forward, J left, K back, L right). Movement is continuous, diagonals are supported, and all three characters can be controlled simultaneously.
- All shortcuts use physical KeyboardEvent.code positions, including on Russian keyboards.
- Q/E rotates either camera by 90 degrees. 1/2/3 changes the followed character. The wheel zooms.
- Open Settings to switch between perspective (default: 55° downward angle, 45° vertical FOV) and orthographic isometry (30°). Pitch adjusts from 25° to 80°; FOV from 25° to 85°, enabled for perspective. FOV adjusts perspective strength with a compensating camera distance, preserving the apparent scale at the followed jelly's centre, including on the upper terrace. The wheel changes zoom independently. Each mode remembers its own pitch during the session. Restarting the puzzle keeps camera settings. Perspective refraction uses per-pixel viewing rays; picking and rendering share the same projection matrix.
- Z undoes a movement gesture or poke, including the complete deformed lattice, falling and death. R restarts.
- Click a cube to poke its actual physical surface. Open the jelly controls to change softness, wobble damping or inspect the tetrahedral lattice.
- In the same panel, the separate level-collider checkbox displays floor/wall boxes, moving lift bounds, spike triggers and portal triggers. This is independent of the creature lattice overlay.
- Sound starts off. It can be enabled with the top-right button.
- Losing focus clears movement and horizontal velocity. Reduced-motion mode removes camera interpolation and ambient material animation; gameplay physics remains active.

Stand on the golden plate to raise the opposite bridge. Moss opens the route for Frost and Ember; Frost's destination plate opens Moss's route. All three must stop on their matching runes. Cubes can push each other over an open edge. The falling creature dies and respawns individually; the others remain playable. Occupied starting positions use a nearby free tile. A powered bridge holds a grounded cube until it leaves; an unpowered bridge is a hole.

Bridges slide horizontally out of the northern bank and retract after the plate is released and the crossing is clear. A critically damped spring smooths starts, stops and reversals in roughly one second. Rendering, shadow geometry, floor support and the debug collider share the same current extension; the unrevealed portion remains a hole. Undo restores extension and movement velocity, while reset closes both bridges. Moving bridge meshes are separate from cached static dungeon geometry.

Pressure plates have a chipped stone mount, a dark metal socket and a red or blue circular stone button. The bevelled button depresses smoothly under a jelly or crate, then rises on release; colour is retained in both states. The surface reuses the bundled stone atlas with a coloured material. Mounts and buttons are cached geometry, and button movement updates only its transform without rebuilding dungeon decorations. The colours are identifiers; any supported body can activate either plate.

## Lifts, hazards and portals

The demonstration level has a gold-framed lift at (5,7) and a 3 by 3 upper terrace at (5..7,8..10), one world unit above the lower floor. A wooden crate starts at (7,9); push it east to drop it onto the lower floor. Stand on the lift and pause briefly to board it. It raises the complete physical lattice and any supported passengers by one unit; walk toward the terrace to step off. An empty lift waits briefly, then returns down automatically.

Short spikes at (3,9) and (9,6) follow a 5.8-second cycle: two seconds raised, a 0.3-second descent, 2.2 seconds fully hidden, one warning beat showing harmless tips, then a 0.3-second full rise. The warning first reveals 30% of the spike over 0.15 seconds, then holds that position until the next beat. The traps are offset by 2.9 seconds. There is no coloured indicator; the visible tips provide the warning. The trap becomes lethal above 35% extension, including when a creature is pushed onto it; hidden and warning stages are safe. Rendering, damage and the debug trigger use the same physical clock and extension. Undo rewinds the trap cycle and reset restarts it. Only the affected creature respawns. Held input for a killed creature is cleared so it cannot repeatedly walk into the trap during respawn.

Spike traps have a segmented chipped-stone border, nine dark inset tiles and nine circular iron sockets. Bevelled pyramid spikes retract into those sockets and retain their short maximum height. Mounts reuse the stone atlas and cached geometry; the animated spikes update only their vertical translation.

Spike deaths and falls into the void scatter the same glossy jelly scraps from the actual deformed lattice. They fall, bounce on surfaces crossed from above and fade before respawn. Fragments below the level keep falling instead of snapping to the floor above them. Portal traversal emits matching expanding rings, a brief flash and rising sparks at both endpoints, including their floor heights. These bounded, transient visual particles do not participate in character collisions; reset and undo clear them. Reduced-motion settings shorten the effects and remove portal sparks.

Violet floor portals link (3,6) and the upper terrace at (6,9). Amber portals link (9,9) and (7,2). Any creature can use either colour. A portal transfers the whole deformed lattice and skull, adjusts floor height and clears momentum. The destination remains locked until the creature leaves it, preventing repeated back-and-forth teleporting. An occupied exit waits instead of overlapping characters.

The portal swirl and rim brighten smoothly as a living creature's footprint moves over the opening, with a matching coloured glow on the surrounding floor. After arrival, the occupied exit becomes dim grey, its swirl stops and its rising rings and floor glow disappear. It remains inactive even when the arrival only partly overlaps the portal slab; normal colour and effects return after the jelly fully clears it. The distant matching portal keeps its colour. Three translucent rings rise, expand and dissolve above active portals. Their mesh is cached once and instanced; the GPU animates height, radius and opacity. The glow and rings share the final jelly render pass instead of adding another full-screen resolve. Reduced-motion mode keeps the ambient rings stationary. Cubes on another floor and crates do not charge portals.

A skeleton archer stands at (10,5), facing south along the x=10 grid lane. It fires every 2.4 seconds and draws its bowstring during the last 0.65 seconds before each shot. Arrows travel on a single cardinal axis without tracking targets. Swept segment collisions stop them at the nearest wall, raised terrain, crate, shield or creature, including during fast frames. An unprotected hit shatters and respawns the jelly. The skeleton has a solid level collider visible in the collider overlay.

An oak shield lies at (8,8), and an iron sword at (8,7). A living jelly with a free equipment slot automatically picks up either item by approaching on the same floor. Equipment and a small bone arm attach to the front face, turning to the last movement direction in world space, including after camera rotation. Facing persists while stationary; equal diagonal inputs retain a compatible current face.

The shield blocks three frontal arrows. Each hit scores the wood; the third hit is still blocked but breaks the shield into fading wooden splinters. A fourth arrow can then kill the unprotected jelly. Side and rear hits bypass the shield. Block sounds combine a low wooden thud with short filtered noise cracks; the former block tone now plays when the skeleton fires. A broken shield stays destroyed until reset or undo. An intact shield returns to its pickup when its owner falls or dies, retaining its remaining durability.

Pushing another jelly with the shield launches it in a physical arc over one intervening cell, travelling roughly two cells on level ground. The flight uses gravity and normal terrain/body collisions, so it can cross a one-cell hole, strike a wall or land on another surface. Movement input cannot steer the passenger during the throw; its equipment stays attached. Releasing controls or changing the camera does not cancel the flight.

The sword automatically swings at a skeleton directly in front within reach, on the same floor and with no intervening wall. The skeleton collapses into bone fragments, loses its collider and stops firing for five seconds. During the final 0.7 seconds its bones gather back into place, then its body and firing cycle return. Surviving arrows already in flight remain dangerous. A sword dropped on death returns to its pickup. Undo restores durability, inventory, facing, pickup ownership, arrows, throws and the skeleton recovery timer; reset restores both items and the living archer. Equipment and mob meshes are cached and reuse the existing opaque pass.

Z restores the complete movement gesture: all three creatures, crate position and state, deformations, death state, portal locks and lift height/target/timers. Reset returns the crate to its terrace and lifts to their lower position. Physics uses one exposed floor height per column; this level does not have walkable tunnels beneath raised terraces. Stepping down onto a lower supported surface lands safely, while a fall into a true hole still kills and respawns the creature.

## Physics

soft-body.js uses a rounded 4 by 4 by 4 node lattice per creature: 64 shared nodes, 27 cells and 162 tetrahedra. It runs at a fixed 120 Hz. Cell and tet co-rotational shape matching supplies elasticity; XPBD signed-volume constraints resist compression and recover inversion; edge strain projections bound extension. Softness changes elastic stiffness instead of scaling a shader wobble.

Gravity, platform contact, static/kinetic friction, wall contact and symmetric node-to-oriented-rounded-body contacts deform the nodes themselves. Opposite contact corrections transfer motion to the neighbouring solid, with tangential contact friction. Internal damping separates center-of-mass and angular velocity from elastic motion; floor angular resistance is handled separately. Calm bodies sleep without node jitter and wake for controls, pokes, approaching moving neighbours or lost support. Heavy landings dissipate deformation rather than applying a rubber restitution impulse.

This remains a small CPU XPBD solver with finite iterations. Creature-to-creature collision uses fitted rounded OBB proxies, not an exact deforming triangle-to-triangle narrow phase. The controller drives the centroid velocity. level-features.js supplies shared height-aware surfaces, solid floor sides, moving-platform carry, lethal triggers, portal pairs and snapshots. Falling bodies can contact lower floors and land; death occurs only after descending into the void or touching spikes.

Body contacts remain active in the falling state. Vertical contacts use a consistent upward normal and separation of the lattice bounds to prevent embedded bodies. Supported bodies become grounded on other dynamic bodies. Carrier motion is applied once, from the bottom of a stack upward, while passenger input remains relative to its carrier. Jelly and crates can each support the other; passengers can walk off and fall independently. Crates share the contact/gravity solver with a global rigid shape projection, allowing contact torque, tipping and airborne rotation while retaining their shape. Their angular motion is damped more strongly on the ground than in the air, and grounding follows actual node contact rather than a fixed upright height. Rendering transforms both positions and normals by the fitted physical orientation. Undo restores that orientation immediately and reset returns the crate upright. Crates do not trigger portals or spike deaths.

physics.js retains the original rigid solver as an independently tested baseline; the running game attaches the soft-body System and delegates all physical stepping to it.

## Graphics

The HUD has a single speaker icon toggle, compact character rows and keyboard shortcut legends. Permanent gameplay explanations have been removed; live state announcements remain available to screen readers. Elevator slabs retain their lit trim without side guide posts.

webgpu-renderer.js is a raw WebGPU/WGSL renderer with no Three.js:

- The entire dungeon, characters, skulls, bubbles, plates and walls are 3D geometry with a depth buffer.
- Stone boxes sample one of sixteen chipped, cracked slab textures; wood boards and diagonal crate braces use oak grain fixed to local UVs. The crate has metal corner plates and raised rivets on all six faces. Both sRGB textures and their mipmaps are uploaded once; the existing cached geometry and prop upload buffer are reused during movement and tumbling.
- Only lattice node positions are uploaded for deforming jelly. A GPU compute pass embeds a smooth rounded surface in the lattice and transforms normals with the cofactor of its deformation Jacobian.
- Per-creature back-face passes supply exit positions and material thickness. Front-face passes bend the view ray and sample the previously rendered layer. Rendering the farther creature first gives three screen-space refraction layers, sorted in full 3D so stacked creatures retain the correct order.
- Beer-Lambert absorption deepens the core colour; thin regions transmit more light. Fresnel skin, a warm overhead key, a back strip and cool fill give crisp candy highlights. Skull motion has its own slower internal spring.
- Ivory dice pips are anchored to the lattice's rest coordinates and stretch with the body. Each creature carries all six values: top/bottom 1/6, +Z/-Z 2/5 and +X/-X 3/4, with opposite faces adding to seven. The front and refracted far faces share the same pip function; far-face marks are attenuated through the jelly. The pips do not represent game scores. Crossed bones sit underneath the internal skull.
- Torch point lights warm nearby stone, while the creatures cast a subtle coloured light pool on their supporting platform.
- Each jelly has a separate finish tile: green at (3,2), blue at (8,3), red at (9,2). Their distinct rune glyphs are a branching staff, a crossed diamond and a lightning zigzag. The glyphs are cached 3D strokes; each glows with its own tile and rim. The bridge button at (8,2) remains independent. A matching jelly approaching its tile smoothly illuminates the tile; leaving fades that light. Vertical beams appear only when all three finish, continuing to brighten and widen while gameplay is paused by victory. Tile lighting uses cached geometry and uniform updates; the ground halos and victory beams reuse instanced quads without extra render passes.
- An activated finish also emits small glowing rune particles in its own colour and glyph. They rise from the tile edges, sway and fade over roughly two seconds. Leaving stops emission while existing runes finish fading; the streams keep animating during victory. Symbols share the tile glyph paths and use one instanced draw in the existing effects pass, capped at 32 particles across all three finishes. Reset and undo clear them; reduced-motion mode keeps the illuminated tile without the floating stream.
- Opaque geometry casts PCF shadow-map shadows. Additional height-dependent coloured contact shadows approximate transmission through jelly. These contact shadows are analytic, not a separate top-down height-map solver.
- HDR intermediate buffers, Khronos PBR Neutral tone mapping, 4x MSAA and final dithering.
- The mesh overlay draws the actual tetrahedral edges rather than a decorative grid.
- Skull, bone, bubble, crate, lift and spike geometry is built once in local coordinates. Frames reuse these meshes and one typed upload array, updating only transforms and bubble offsets. Camera rotation, physical skull motion and animated hazards keep the same appearance without rebuilding their triangles on the CPU.

The dungeon setting stays in place rather than becoming the reference's paper studio or frosted-glass dice plate. Green, saturated blue and red jelly have separate absorption colours. Refraction is screen-space: it cannot recover off-screen geometry and is an approximation for complicated overlapping surfaces, not a ray-traced global illumination solution.

The PBR Neutral formula follows the Khronos reference: https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral .

## Verify

npm run check
npm test

For real GPU/browser checks, install development dependencies with npm install, keep the local server running, then run npm run test:browser. The script uses the installed Windows Chrome executable; CHROME_PATH can select another compatible Chromium executable. It launches an isolated headless browser with WebGPU enabled, never a personal browser profile.

npm run test:combat:browser additionally checks item pickup, inventory undo/reset, camera-relative equipment facing, frontal blocks, three-hit shield cracks/destruction, wood impact audio and the firing tone, physical shield bashes, sword strikes, and skeleton collapse/reassembly on the real GPU. Combat unit tests cover all four firing directions, swept collisions, walls, crates, floor heights, nearest-hit ordering, bounded projectile lifetime, throwing across a hole, blocked flight, durability and the five-second recovery clock.

npm run test:dice renders the production pip shader onto all six faces, counts the separate dots from a GPU readback and checks the 1–6 values and opposite-face sums. It also captures the three actual jelly creatures at four camera rotations. Audit images are saved in artifacts/.

Node tests exercise gameplay, all three physical keyboard layouts, three-rune puzzle completion, pushing, terrain, gravity and respawn, plus real lattice deformation, volume preservation, inversion recovery, strain bounds, heavy landing, sleeping, wall contacts, rigid-motion preservation and full-state undo. Stacking tests cover high-speed landings, jelly/crate support in either order, a three-body moving stack, independent passenger movement, crate drops and lift passengers.

The browser suite compiles WGSL on an actual WebGPU device, checks GPU validation errors, exercises all camera angles, movement, pushing, poking, lattice display, layered refraction, fall/respawn, stacked jelly carrying, lift boarding/upper exit/empty return, crate pushing/drop/undo, spike death and scraps, height-changing portal traversal and effects, the collider toggle, separate finish tiles, matching tile illumination/fade, rising rune streams and victory beams. It also checks the speaker icon toggle, compact HUD, narrow-screen layout and the no-WebGPU card. Screenshots are saved to artifacts/. npm run profile:browser records a separate CPU/frame profile. FPS depends on the adapter, viewport, browser and number of awake solids; 60 FPS was observed at rest in an earlier development headless run.

npm run profile:compare compares three creatures with two visible creatures, disables prop generation and simulation separately, and samples one awake jelly. It records per-frame CPU physics, prop preparation and total render submission time, plus a Chrome CPU sample profile, in artifacts/performance-current.json. PERF_LABEL changes the output suffix. The prop-cache change reduced measured idle prop preparation from about 34 ms to about 5 ms per frame at 1440 by 1000 in the development headless browser. Headless frame pacing and GPU/driver limits mean its FPS is not directly interchangeable with an interactive browser's FPS.
