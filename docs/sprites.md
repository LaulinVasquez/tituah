# Enhanced Character Rendering, Customization & Pause Menu

## Objective

Upgrade the current platform-fighter presentation using the new enhanced sprite sheet.

This task should:

1. Replace the current sprite atlas with the newer, better-spaced sprite artwork.
2. Improve character rendering and animation quality.
3. Add character color customization.
4. Add optional accessories/cosmetics.
5. Add an in-game pause system.
6. Add a pause menu containing:

   * Resume
   * Customize Character
   * Quit Game
7. Preserve all existing authoritative multiplayer, physics, combat, prediction, reconciliation, and interpolation behavior.

Do **not** redesign the underlying game simulation.

---

# New Sprite Asset

Use the newly supplied sprite sheet as the canonical visual source.

Recommended location:

```text
client/public/assets/characters/fighter-main-spritesheet.png
```

Preserve older sprite assets for now so we can revert if necessary.

Do not overwrite the original source file destructively.

---

# Why This Sprite Sheet Replaces the Previous One

The new sheet intentionally has substantially more spacing between individual frames.

This should solve problems from the old atlas such as:

* Hands overlapping neighboring idle frames.
* Cropping neighboring sprites.
* Difficult rectangular texture extraction.
* Animation frames containing unwanted pieces.
* Aggressive cropping removing parts of the actual fighter.

Rebuild the atlas coordinates against the **new image**.

Do not reuse old coordinates.

---

# Required Animation Groups

Extract clean frames for:

```text
idle
run
jump
fall
land

slapCharge
slapAttack
slapRecovery

hit
ko
```

The new sprite sheet should allow multiple idle frames again.

Use them if they can now be extracted cleanly.

---

# Frame Extraction

Inspect the real image dimensions and define explicit source rectangles.

Do not assume a uniform grid.

Example architecture:

```ts
export interface FighterFrame {
  x: number;
  y: number;
  width: number;
  height: number;

  offsetX?: number;
  offsetY?: number;
  scale?: number;
}
```

And:

```ts
export const fighterAnimations = {
  idle: [],
  run: [],
  jump: [],
  fall: [],
  land: [],
  slapCharge: [],
  slapAttack: [],
  slapRecovery: [],
  hit: [],
  ko: [],
};
```

Use the actual measured coordinates.

---

# Ignore Sheet Labels

Do not render:

```text
IDLE
RUN
JUMP
FALL
LAND
SLAP
HIT
KO
COLOR VARIANTS
FACIAL EXPRESSIONS
ACCESSORIES
```

These are only organizational labels.

Gameplay textures must contain only the relevant artwork.

---

# Frame Spacing

Because the new sheet includes better spacing, favor slightly generous crop rectangles.

Preserve:

* Hands
* Shoes
* Attack trails when relevant
* Dust when intentionally part of a frame

Avoid:

* Neighboring fighters
* Text labels
* Other effects
* Other animation states

---

# Character Rendering Upgrade

Improve the current `FighterSprite` system rather than replacing it with ad-hoc rendering.

The fighter should feel like a polished animated game character.

Preserve:

* Cached textures
* Persistent sprite instances
* Local animation timing
* Horizontal flipping
* Foot-based alignment
* Collider independence
* Respawn flashing

---

# Animation Timing

Tune animation speeds individually.

Suggested starting values:

```text
Idle       5–7 FPS
Run        10–14 FPS
Jump       8–10 FPS
Fall       6–8 FPS
Land       10–12 FPS

Charge     8–10 FPS
Slap       14–18 FPS
Recovery   8–12 FPS

Hit        12–16 FPS
KO         8–10 FPS
```

These are tuning targets, not strict requirements.

Animations should feel responsive.

---

# Animation Priority

Use a clear priority system.

Recommended priority:

```text
KO
↓
Hit
↓
Slap Attack
↓
Slap Charge
↓
Slap Recovery
↓
Land
↓
Jump/Fall
↓
Run
↓
Idle
```

Higher-priority animations should not be interrupted incorrectly by locomotion.

---

# Slap Animation

The slap remains an important gameplay attack.

Synchronize visual states with existing server-controlled combat:

```text
charge state
→ slapCharge

active attack state
→ slapAttack

cooldown/recovery
→ slapRecovery
```

The strongest slap visual should approximately correspond with the authoritative active hit window.

Do not move hit detection to the client.

---

# Additional Visual Effects

The sheet includes reusable effects such as:

```text
dust
impact burst
slap swipe
stars
smoke
spiral
```

Begin using these where appropriate.

Priority:

## Running / Landing

Use small dust effects.

## Successful Slap

Spawn:

```text
impact burst
```

at or near the hit location.

## Strong Slap

Optionally combine:

```text
slap swipe
+
impact burst
```

## High-Knockback Hit

Use:

```text
stars
```

briefly where appropriate.

## KO

Smoke or spiral effects may be used carefully.

Effects must remain cosmetic.

---

# Particle Lifetime

Effects must clean themselves up.

Do not leave abandoned Pixi objects in the scene.

Implement something reusable such as:

```ts
spawnEffect(type, x, y, facing);
```

Supported initial types might include:

```text
dust
impact
slapSwipe
stars
smoke
```

---

# Player Colors

The sheet includes:

```text
orange
red
blue
green
yellow
purple
```

Use these as the game's initial character-color options.

The user should be able to select a preferred fighter color.

---

# Character Customization

Create a lightweight character customization screen.

Do not build a large cosmetics system yet.

Initial options:

## Body Color

```text
Orange
Red
Blue
Green
Yellow
Purple
```

## Accessories

The sprite sheet includes examples such as:

```text
Sunglasses
Crown
Red Bandana
Black Cap
Blue Bandana
Top Hat
Gold Chain
```

Implement accessories only if they can be cleanly extracted and layered over the character.

If layering them reliably requires substantial additional architecture, complete color customization first and document accessories as the next step.

---

# Customization Architecture

Create a small visual configuration model.

Example:

```ts
export type FighterColor =
  | "orange"
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "purple";

export type FighterAccessory =
  | "none"
  | "sunglasses"
  | "crown"
  | "red-bandana"
  | "black-cap"
  | "blue-bandana"
  | "top-hat"
  | "gold-chain";

export interface FighterAppearance {
  color: FighterColor;
  accessory: FighterAccessory;
}
```

Keep appearance separate from gameplay state.

---

# Important Multiplayer Rule

Customization is cosmetic.

It must **not** influence:

```text
hitbox size
movement speed
jump height
damage
knockback
lives
attack size
physics
```

---

# Multiplayer Appearance Synchronization

Other players must be able to see the selected appearance.

Unlike animation frames, appearance selection is valid network state.

Synchronize only:

```text
color
accessory
```

Do not synchronize:

```text
current sprite frame
animation timer
render position
visual effect frame
```

Clients should still determine animations locally from authoritative gameplay state.

---

# Character Selection UI

Create a visually clean character customization interface.

Suggested layout:

```text
CUSTOMIZE FIGHTER

        [ Character Preview ]

COLOR

🟠  🔴  🔵  🟢  🟡  🟣

ACCESSORY

None
Sunglasses
Crown
Bandana
Cap
Top Hat
Gold Chain

[ APPLY ]
```

Display the actual animated fighter as the preview if practical.

Idle animation would be ideal.

---

# Current Player Identification

Once customization exists, do not rely exclusively on color to identify the local player.

Add a subtle local-player indicator.

Example:

```text
▼
YOU
```

above the local fighter.

Do not make it visually distracting.

---

# Damage UI

Retain the improved damage percentage badge.

Continue showing damage close enough to identify the player without covering the fighter.

Improve styling if necessary.

Damage intensity can scale visually.

Example:

```text
0–49%
normal

50–99%
warning

100%+
danger
```

Do not overdo animations.

---

# Pause System

Add a real pause menu.

The menu should contain:

```text
PAUSED

RESUME

CUSTOMIZE CHARACTER

QUIT GAME
```

---

# Pause Controls

Preferred control:

```text
SPACE
```

However:

Before assigning Space to pause, inspect the existing control scheme.

### If Space is currently unused

Use:

```text
SPACE = Pause / Resume
```

### If Space currently performs an important action

Do **not** break that action.

Use:

```text
ESC = Pause / Resume
```

Optionally also support:

```text
P
```

The UI should display the actual configured pause key.

---

# Multiplayer Pause Behavior

This requires special care.

One player must **not freeze the authoritative server simulation for everyone** merely by opening a local menu.

Therefore distinguish between:

## Local Pause Menu

Opening the pause overlay should:

* Stop local gameplay input.
* Display the pause UI.
* Keep receiving server snapshots.
* Keep the network connection alive.
* Avoid freezing the remote player's game.
* Avoid pausing the authoritative server simulation.

This is effectively a local menu state.

The match continues unless a future synchronized-pause system is explicitly implemented.

---

# While Local Pause Menu Is Open

The client should not send active movement/attack inputs.

Immediately send or transition to neutral input:

```ts
{
  left: false,
  right: false,
  jump: false,
  attack: false
}
```

This prevents the player's previous input from remaining stuck.

---

# Resume

Selecting:

```text
RESUME
```

should:

* Close the menu.
* Restore gameplay input.
* Keep the same match connection.
* Require no reconnect.

---

# Customize Character From Pause Menu

Selecting:

```text
CUSTOMIZE CHARACTER
```

opens the customization UI.

Allow the player to:

* Preview colors.
* Preview accessories.
* Apply appearance.

Then allow:

```text
BACK TO PAUSE
```

or:

```text
APPLY & RETURN
```

The match should remain connected.

---

# Appearance Changes During Match

For the prototype, appearance may be changed during an active match.

When Apply is selected:

1. Save local appearance selection.
2. Notify server of appearance state if necessary.
3. Broadcast appearance to opponent.
4. Update the local fighter.
5. Return to pause menu.

Do not respawn or reset gameplay state when appearance changes.

---

# Quit Game

Selecting:

```text
QUIT GAME
```

must not immediately destroy the session accidentally.

Show confirmation:

```text
QUIT CURRENT MATCH?

Your opponent will be notified.

CANCEL
QUIT MATCH
```

If confirmed:

1. Tell the server that the player is leaving.
2. Disconnect/leave the current match correctly.
3. Clean up local game state.
4. Return to the main menu.
5. Ensure no stale animation loops or Pixi objects remain.

---

# Opponent Quit

If the remote player quits:

Display something similar to:

```text
OPPONENT LEFT THE MATCH
```

Provide:

```text
RETURN TO MENU
```

Do not leave the remaining user inside a broken match.

---

# Pause Menu Styling

Improve the presentation significantly.

The pause screen should feel like part of the game rather than a plain HTML modal.

Direction:

```text
dark translucent overlay
large animated fighter preview
bold arcade typography
rounded controls
subtle motion
clear selected states
```

Keep it readable.

Do not obscure whether the match is continuing in the background.

A small message should say:

```text
Online match continues while this menu is open.
```

---

# Menu Animation

Use restrained transitions.

Examples:

```text
fade overlay
slight menu scale-in
button state transitions
fighter idle preview
```

Avoid long animations.

Opening/closing the pause menu should feel immediate.

---

# Rendering Polish

Improve overall Pixi rendering presentation.

Review:

* Sprite scaling
* Texture filtering
* Anchor consistency
* Fighter alignment
* Damage badge positioning
* Character flipping
* Effect depth/layer order
* Platform/fighter overlap
* Hit feedback

The new sprite should look crisp.

If pixel smoothing creates poor results for this illustration style, test PixiJS texture scaling modes and choose the one that looks best.

---

# Renderer Layer Organization

Keep sensible render layers such as:

```text
Background
Stage
Stage Effects
Characters
Character Effects
Projectiles / Attacks
Foreground Effects
HUD
Menus
```

Avoid inserting everything directly into one container if the current renderer would benefit from clearer grouping.

Do not unnecessarily rewrite working renderer architecture.

---

# Camera / Impact Polish

If the current renderer already supports camera movement or impact feedback, improve it carefully.

If not, a very small hit shake may be added.

Example:

```text
normal slap hit
→ tiny shake

high knockback slap
→ stronger shake
```

This remains client-side visual feedback.

Never alter server physics.

---

# Asset Caching

All extracted textures should remain cached.

Do not rebuild source textures every animation frame.

Recommended lifecycle:

```text
load sheet
↓
create atlas textures once
↓
cache textures
↓
reuse AnimatedSprite / Sprite objects
```

---

# Existing Systems That Must Remain Intact

Do not break:

```text
authoritative server simulation
60 Hz simulation
20 Hz snapshots
client movement prediction
server reconciliation
remote interpolation
platform collision
damage percentage
knockback
blast zones
lives
respawns
match winner selection
WebSocket protocol
```

Only extend networking where required for cosmetic appearance selection and clean player-leave handling.

---

# Testing

Verify all of the following.

## Sprites

* New sprite sheet loads.
* No old atlas coordinates remain accidentally.
* Idle frames are clean.
* Run frames are clean.
* Jump works.
* Fall works.
* Land works.
* Slap charge works.
* Slap attack works.
* Slap recovery works.
* Hit works.
* KO works.
* No neighboring frames appear.
* No sheet labels appear.

## Rendering

* Sprite remains aligned at the feet.
* Animation switching does not make character jump visually.
* Facing flip works.
* No frame stretching.
* Player collider remains unchanged.
* Effects clean themselves up.

## Customization

* Player can open customization.
* All working body colors preview correctly.
* Selected color applies.
* Opponent sees selected color.
* Accessories work if implemented.
* Appearance changes do not affect gameplay.

## Pause

* Pause key opens menu.
* Gameplay input becomes neutral.
* Remote network updates continue.
* Resume works.
* Customize Character works.
* Quit shows confirmation.
* Quit cleanly leaves match.
* Opponent receives disconnect/leave state.
* Returning to menu does not leave stale objects/listeners.

## Multiplayer

Test with two clients.

Confirm:

```text
Player A customizes
→ Player B sees appearance

Player A pauses
→ Player B continues playing

Player A resumes
→ synchronization remains correct

Player A quits
→ Player B is notified
```

---

# Build Verification

Run:

```bash
npm run typecheck
npm run build
```

Both must pass.

Also run the game manually with two clients.

---

# Completion Report

When complete, provide:

1. Files created.
2. Files modified.
3. New sprite-sheet path.
4. Atlas coordinates/animation groups implemented.
5. Animation timing changes.
6. Rendering improvements.
7. Character customization options implemented.
8. Accessories implemented or deferred.
9. Appearance synchronization approach.
10. Pause key selected and why.
11. Pause behavior in multiplayer.
12. Quit-match flow.
13. Known limitations.
14. Typecheck result.
15. Production build result.

Do not redesign the game or add new combat mechanics during this task.
