# Match Game Screen to Stage Background Dimensions

## Objective

Update the PixiJS game viewport so the game screen uses the exact aspect ratio of the stage background artwork.

The background must **never be stretched or distorted**.

All three stages should share the same logical game-world dimensions so:

* Physics remain consistent.
* Platforms remain correctly positioned.
* Characters remain correctly scaled.
* Multiplayer clients see the same world.
* Backgrounds can be swapped without changing gameplay coordinates.

---

# Important

This task is primarily about:

```text
GAME VIEWPORT
CAMERA
BACKGROUND SCALING
RESPONSIVE DISPLAY
WORLD COORDINATES
```

Do not change:

* Combat
* Knockback
* Damage
* Player physics
* WebSocket behavior
* Prediction
* Reconciliation
* Interpolation

---

# 1. Inspect the Background Assets

Before changing the renderer, inspect the actual dimensions of the three background images.

Determine:

```ts
backgroundWidth
backgroundHeight
aspectRatio = backgroundWidth / backgroundHeight
```

Do not guess the dimensions.

Use the actual image metadata.

All stage backgrounds should ideally use the same aspect ratio.

---

# 2. Establish a Fixed Logical Game Resolution

The game should have ONE logical world resolution.

Prefer a 16:9 logical canvas if the supplied backgrounds are 16:9.

Recommended:

```ts
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;
export const GAME_ASPECT_RATIO =
  GAME_WIDTH / GAME_HEIGHT;
```

If the supplied backgrounds use another ratio, use that ratio instead.

The important rule is:

```text
BACKGROUND ASPECT RATIO
        =
GAME WORLD ASPECT RATIO
```

---

# 3. Game World vs Browser Size

Separate:

```text
GAME WORLD
```

from:

```text
BROWSER DISPLAY SIZE
```

The simulation should always think the world is:

```text
1920 × 1080
```

or whatever logical resolution is selected.

The browser may display it as:

```text
1280 × 720
960 × 540
1600 × 900
```

but the logical coordinates remain unchanged.

---

# 4. Responsive Scaling

Scale the complete PixiJS game uniformly.

Calculate:

```ts
const scale = Math.min(
  availableWidth / GAME_WIDTH,
  availableHeight / GAME_HEIGHT
);
```

Then:

```ts
displayWidth = GAME_WIDTH * scale;
displayHeight = GAME_HEIGHT * scale;
```

Center the game viewport.

Do NOT independently scale X and Y.

Never do:

```ts
scaleX = availableWidth / GAME_WIDTH;
scaleY = availableHeight / GAME_HEIGHT;
```

if those values are different.

That would distort the artwork.

---

# 5. Letterboxing

If the browser aspect ratio does not match the game:

Use letterboxing.

Example wide browser:

```text
┌────────────────────────────────────────────┐
│                                            │
│      ┌──────────────────────────────┐      │
│      │                              │      │
│      │          GAME                │      │
│      │          16:9                │      │
│      │                              │      │
│      └──────────────────────────────┘      │
│                                            │
└────────────────────────────────────────────┘
```

Do not stretch the game to eliminate the empty space.

Use a dark/neutral outer background.

---

# 6. Background Rendering

The background should cover the logical game viewport exactly.

Conceptually:

```ts
background.width = GAME_WIDTH;
background.height = GAME_HEIGHT;
```

BUT only do this if the source image has the same aspect ratio.

Prefer scale-based sizing:

```ts
const scale = GAME_WIDTH / texture.width;

background.scale.set(scale);
```

Verify resulting height matches `GAME_HEIGHT`.

---

# 7. Do Not Crop Important Void Space

This is extremely important for this game.

The game is based on:

```text
HIT
↓
KNOCKBACK
↓
PLAYER FLIES OFF PLATFORM
↓
PLAYER ATTEMPTS TO RECOVER
↓
BLAST ZONE
```

Therefore do NOT use aggressive:

```text
object-fit: cover
```

style behavior that crops the edges of the background.

We need to see the entire intended arena.

Prefer:

```text
contain
```

behavior.

---

# 8. Stage Must Not Fill the Screen

The playable platforms should occupy only the central portion of the game world.

Example:

```text
┌───────────────────────────────────────────────┐
│                                               │
│                   AIR                         │
│                                               │
│            ┌─────────────┐                    │
│                                               │
│     ┌───────┐       ┌───────┐                │
│                                               │
│          ━━━━━━━━━━━━━━━━                     │
│                                               │
│                                               │
│                    VOID                       │
│                                               │
└───────────────────────────────────────────────┘
```

Do NOT stretch the stage platforms from edge to edge.

---

# 9. Recovery Space

Players need significant room outside the platform layout.

Target approximately:

```text
15–25% horizontal margin
```

between the outermost playable platform and screen edge.

And substantial vertical space:

```text
above stage
below stage
```

This lets knockback remain visible.

Example:

```text
                ↑
          recovery space


      platform     platform

         MAIN PLATFORM


          recovery space
                ↓

             BLAST ZONE
```

---

# 10. Camera

The camera should initially show the complete arena.

Do not tightly follow the local player.

Both fighters should generally remain visible.

The camera should prioritize:

```text
entire stage
+
knockback space
+
both players
```

---

# 11. Dynamic Camera Zoom

If the game already has camera logic, improve it so the camera can zoom out slightly when players separate.

Conceptually:

```text
players close
→ normal camera

players separating
→ slight zoom out

player launched far away
→ more zoom out
```

Set strict limits.

Example:

```ts
const CAMERA_MAX_ZOOM = 1.0;
const CAMERA_MIN_ZOOM = 0.78;
```

Do not allow extreme zoom.

---

# 12. Camera Centering

Camera target should approximately use the midpoint between living players:

```ts
const centerX =
  (player1.x + player2.x) / 2;

const centerY =
  (player1.y + player2.y) / 2;
```

Smoothly interpolate toward the target.

Do not instantly snap the camera.

---

# 13. Background and Camera

The background should NOT move exactly like gameplay platforms if that makes the world feel flat.

Use extremely subtle parallax.

Example:

```text
background     0.05–0.15
stage          1.0
```

But ensure the background never exposes empty/unrendered areas.

If necessary, keep the background fixed to the viewport.

---

# 14. Platform Coordinate System

Platform positions should use the logical game coordinates.

Example:

```ts
{
  x: 960,
  y: 700,
  width: 650,
  height: 80
}
```

NOT browser pixels.

Do not calculate authoritative platform positions using:

```ts
window.innerWidth
window.innerHeight
```

The server and clients must use the same coordinate system.

---

# 15. Stage Layout

Each stage can have different platform geometry while still sharing the same world dimensions.

For example:

## Barnyard Brawl

Platforms should feel like elevated farm/windmill structures.

```text
          SMALL

   SIDE           SIDE

        MAIN

         VOID
```

The farm scenery should appear far behind/below the fighters.

---

## Fridge Frenzy

Use refrigerator shelves as the fighting platforms.

```text
             TOP

       LEFT       RIGHT

            MAIN


          DARK VOID
```

The lower refrigerator area must visually communicate that falling below the fighting shelves means danger.

---

## Sky-High Meadow

Use floating islands.

```text
             TOP

      LEFT         RIGHT

           MAIN


          CLOUDS

           VOID
```

This stage should have the largest feeling of vertical depth.

---

# 16. Background Asset System

Use one background per stage.

Recommended:

```text
client/public/assets/stages/backgrounds/

barnyard-brawl.png
fridge-frenzy.png
sky-high-meadow.png
```

Do not combine all three backgrounds into one runtime image.

Each stage must load its own background.

---

# 17. Stage Configuration

Create or extend stage visual configuration.

Example:

```ts
interface StageVisualConfig {
  id: StageId;

  background: string;

  logicalWidth: number;
  logicalHeight: number;

  platformTheme:
    | "farm"
    | "fridge"
    | "meadow";
}
```

Example:

```ts
barnyard: {
  background:
    "/assets/stages/backgrounds/barnyard-brawl.png",

  logicalWidth: GAME_WIDTH,
  logicalHeight: GAME_HEIGHT,

  platformTheme: "farm"
}
```

---

# 18. PixiJS Renderer

Create a root world container.

Recommended structure:

```text
Pixi Application
│
└── viewportContainer
    │
    ├── backgroundLayer
    │
    ├── stageLayer
    │
    ├── playerLayer
    │
    ├── effectsLayer
    │
    └── hudLayer
```

The complete viewport should respect the logical game resolution.

---

# 19. HUD

HUD should remain inside the safe game area.

For example:

```text
P1                                         P2
★★★                                       ★★★
34%                                       72%
```

Do not position HUD based directly on arbitrary browser dimensions.

Use game-world/safe-area coordinates.

---

# 20. Resize Handling

Listen for browser resize.

On resize:

```text
recalculate display scale
↓
center viewport
↓
keep logical world unchanged
```

Do not recreate:

* game state
* players
* sprites
* WebSocket connection
* stage

when resizing.

Only update rendering scale/layout.

---

# 21. High-DPI Rendering

PixiJS should render cleanly on Retina/high-DPI displays.

Use the existing PixiJS resolution configuration if available.

If not, configure appropriate device-pixel-ratio handling while keeping logical coordinates unchanged.

Avoid unnecessarily huge render buffers.

---

# 22. Fullscreen-Like Presentation

The game should feel like a proper browser game.

The surrounding page should be minimal.

Conceptually:

```text
██████████████████████████████████████

        GAME VIEWPORT — 16:9

██████████████████████████████████████
```

Center the game.

Remove unnecessary page scrolling while actively playing.

---

# 23. Critical Multiplayer Requirement

Screen size must NEVER affect gameplay.

Example:

```text
Player A
2560×1440 monitor

Player B
1920×1080 monitor

Player C
1366×768 laptop
```

All players must still have:

```text
same world dimensions
same platform coordinates
same blast zones
same player coordinates
same physics
```

Only rendering scale differs.

---

# 24. Background Loading

Preload the selected stage background before starting the match.

Do not begin gameplay with a blank canvas while the image downloads.

Flow:

```text
stage selected
↓
load background
↓
load platform textures
↓
textures ready
↓
start/render match
```

Show a short loading state if necessary.

---

# 25. Verify Background Quality

Make sure the renderer does not:

* Blur the background excessively.
* Stretch it.
* Crop important edges.
* Distort it.
* Render at the wrong ratio.
* Leave white/transparent gaps.
* Cause visible seams.

---

# 26. Testing

Test at:

```text
1920×1080
1600×900
1440×900
1366×768
1280×720
```

Also resize the browser manually.

Verify:

* Background aspect ratio remains correct.
* No stretching.
* Platforms remain aligned.
* Players remain aligned.
* HUD remains readable.
* Void remains visible.
* Blast-zone travel is visible.
* No gameplay coordinates change.
* Multiplayer stays synchronized.

---

# Expected Result

The final presentation should feel like:

```text
              BACKGROUND WORLD

     ← large recovery / knockback space →

              [ platform ]

       [ platform ]   [ platform ]

           [ MAIN STAGE ]


              ↓ VOID ↓


             BLAST ZONE
```

The background defines the visual dimensions of the game screen.

The stage exists **inside** that world instead of filling the screen.

When a character gets hit hard, we should visibly watch them fly away from the stage and attempt to recover before reaching the blast zone.

That visual space is essential to the game.

---

# Verification

Run:

```bash
npm run typecheck
npm run build
```

Both must pass.

Test with two networked players to ensure different browser/window sizes do not affect authoritative gameplay.

---

# Completion Report

Report:

1. Actual background image dimensions discovered.
2. Logical game resolution selected.
3. Aspect ratio.
4. Scaling strategy.
5. Letterboxing behavior.
6. Camera behavior.
7. Recovery-space margins.
8. Platform coordinate changes, if any.
9. Resize behavior.
10. Multiplayer consistency.
11. Files modified.
12. Typecheck result.
13. Build result.

Do not implement additional gameplay mechanics during this task.
