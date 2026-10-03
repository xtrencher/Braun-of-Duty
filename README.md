# Braun of Duty — *Reasumpcja: do skutku*

A complete, playable first-person 3D browser game built with HTML5, JavaScript and
[Three.js](https://threejs.org/). You play a "director" armed with a red fire extinguisher
in a recreation of the Polish Sejm plenary chamber: teal carpet and upholstery, mahogany
benches in concentric arcs, travertine walls with the colonnaded gallery, the vertical
white-and-red banner with the eagle behind the Marshal's platform, the horseshoe
stenographers' desk with the rostrum, and the ribbed glass dome overhead. A politician in a
navy suit and red tie has run off with the voting cards; chase him up the stairs and aisles,
blast him with foam, and recover all three cards before the Marshal calls a *reasumpcja*.

## Play

* **Online:** enable GitHub Pages for this repository (Settings → Pages → Source: *GitHub Actions*)
  and the included workflow publishes the game on every push to `main`.
* **Locally:** the game uses ES modules, so serve the folder over HTTP rather than opening
  `index.html` from disk:

  ```bash
  python3 -m http.server 8000
  # then open http://localhost:8000/
  ```

Everything is self-contained: Three.js is vendored in `vendor/three/`, all geometry and
textures are generated procedurally (colour, normal and roughness maps for wood, stone,
carpet, leather and cloth are painted at load time), and the sound effects are synthesised
with the Web Audio API. No build step, no external assets.

## Graphics

The start screen has a **GRAFIKA** setting (remembered between visits; the default is *Niska*, which already carries the full detail and lighting and is tuned for laptops and integrated graphics):

| Setting | What it enables |
| --- | --- |
| Wysoka | 4096 px shadow maps, 4x MSAA, ground-truth ambient occlusion (GTAO), bloom, film grade (vignette, grain, lens aberration) |
| Średnia | 2048 px shadows, 4x MSAA, bloom, film grade |
| Niska | 1024 px shadows, pixel ratio capped at 1.25, no post-processing |

If the first seconds of play run below about 28 fps the game steps the setting down by itself
and shows a notice. All static chamber geometry is merged per material into a few dozen draw
calls, and every shader is compiled on the start screen so nothing stalls during play. The politician is a skinned character with blended joint weights, a painted
suit (lapels, shirt, tie, pockets, cloth weave) and a sculpted head with a painted face.

## Controls

On phones and tablets the game switches to touch controls automatically: a virtual joystick on the
lower-left (push to the edge to sprint), drag anywhere else to look, hold **GAŚ!** to spray, **BIEG**
toggles sprint, **II** pauses. It goes fullscreen and asks for landscape on start.

Desktop:


| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move |
| Mouse | Look (pointer lock) |
| Left mouse button | Spray the extinguisher |
| `Shift` | Sprint |
| `Esc` | Pause |

## Rules

* Each **AKT** gives you 90 seconds to knock the politician down and pick up the dropped
  **KARTA**. Three cards win the game (*Zaginiona większość* — "the missing majority").
* The extinguisher throws a dense cloud that hangs in the air for seconds and leaves white foam
  on the carpet, the stairs and the politician himself. The stream highlights him in red, knocks
  him back and shows his health bar.
  Keep the stream on him for a **HIT** streak and **COMBO!** multipliers.
* **ENERGIA** is the extinguisher's charge. It drains while spraying and refills when you let go;
  run it dry and the tank must recover before it sprays again. When the HUD reads
  *ENERGIA — MAŁO!* it is time to ease off.
* If the clock runs out, the Marshal orders a *reasumpcja*: the politician is restored and you
  vote again, until it works (*do skutku*).

## Project layout

```
index.html          page, HUD markup and start/pause overlay
css/style.css       HUD styling (beige panels, comic popups)
js/main.js          game loop, state machine, scoring
js/chamber.js       chamber layout math: height field, collision, navigation graph
js/world.js         procedural Sejm chamber (tiers, seats, balcony, flags, lights)
js/geo.js           ring-sector geometry helper
js/textures.js      canvas-generated PBR texture sets (wood, travertine, carpet, leather, banner, smoke)
js/player.js        first-person controller (mouse, keyboard and touch input)
js/touch.js         virtual joystick, drag-to-look and on-screen buttons
js/weapon.js        extinguisher + hands viewmodel
js/particles.js     foam particle system with floor/NPC collision
js/npc.js           fleeing politician AI, knockback physics, voting card pickup
js/human.js         procedural skinned humanoid: skeleton, suit and face textures
js/hud.js           HUD, floating combat text, hit markers, health bar
js/audio.js         Web Audio sound effects
vendor/three/       Three.js r170 and the post-processing / geometry addons used (MIT)
```

Append `?debug=1` to the URL to start without pointer lock; `window.__game` exposes the
game state for scripted testing.
