# Ant Colony – prototype

Plain HTML5 canvas + JS, portrait and touch-first (mouse works too). Play: https://2leggedanimal.github.io/ant-colony-prototype/

- `index.html` – layout/HUD, `game.js` – game, **`config.js` – every tunable** (lifespans, lay rate, food cost, dig speed, food yield, forage loss chance, eat rate, hatch time…).
- **Ants**: tap an ant / drag a box / *All*. With ants selected tap a tunnel (move), a ⛏ marked cell (dig it), the grass (forage) or a 💀 body (haul to the pit). *Auto* hands them back to automatic jobs.
- **Dig** marks soil, ants dig it over time. **Fill** fills tunnels instantly (or unmarks). **Egg** paints egg-chamber space (on soil it becomes an egg-room dig job).
- Queen lays eggs (costs food) into egg chambers; eggs hatch into workers. Ants eat from the store and starve when it runs dry. Foragers leave via the surface; some never come back.
- *1x/4x* speed toggle.
