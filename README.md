# Braun of Duty — *Reasumpcja: do skutku*

A complete, playable first-person 3D browser game built with HTML5, JavaScript and
[Three.js](https://threejs.org/). You play a "director" armed with a red fire extinguisher
in a parliamentary chamber modelled after the Polish Sejm. A politician in a dark suit and
red tie has run off with the voting cards; chase him up the red-carpeted stairs and aisles,
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
textures are generated procedurally, and the sound effects are synthesised with the Web
Audio API. No build step, no external assets.

## Controls

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
* The foam stream highlights the politician in red, knocks him back and shows his health bar.
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
js/textures.js      canvas-generated textures (carpet, wood, flags, emblem, smoke sprite)
js/player.js        first-person controller
js/weapon.js        extinguisher + hands viewmodel
js/particles.js     foam particle system with floor/NPC collision
js/npc.js           fleeing politician AI, knockback physics, voting card pickup
js/hud.js           HUD, floating combat text, hit markers, health bar
js/audio.js         Web Audio sound effects
vendor/three/       Three.js r170 (MIT)
```

Append `?debug=1` to the URL to start without pointer lock; `window.__game` exposes the
game state for scripted testing.
