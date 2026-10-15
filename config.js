// ===== Ant Colony – ALL gameplay tunables live here (times are in game-seconds; 4x speed = 4 game-s per real s) =====
window.CONFIG = {
  grid:   { cols: 20, rows: 32, surfaceRows: 3 },      // rows 0..2 are outside; row 2 is the walkable surface
  speeds: [1, 4],                                       // speed-toggle options
  ant:    { walkSpeed: 3.2,                             // cells per second
            lifespanMin: 60, lifespanMax: 120,          // random life expectancy per ant
            maxPopulation: 60 },                        // ants + eggs cap
  queen:  { layInterval: 8,                             // seconds between eggs (when food + egg room available)
            firstLayDelay: 2,                           // first egg of a new game
            eggFoodCost: 2 },                           // food consumed per egg laid
  egg:    { hatchTime: 15 },                            // seconds from egg to worker ant
  dig:    { digTime: 3 },                               // seconds for one ant to dig one marked cell
  food:   { startStock: 30,
            yieldPerTrip: 6,                            // food brought back by one forager
            tripTimeOutside: 8,                         // seconds spent off-screen gathering
            forageLossChance: 0.10,                     // chance a forager never comes back
            targetStock: 40,                            // ants auto-forage while stock is below this
            forageShare: 0.5 },                         // max fraction of the colony auto-assigned to foraging
  hunger: { eatInterval: 30,                            // each ant eats this often...
            eatAmount: 1,                               // ...this much food from the store
            starveTime: 20 },                           // seconds an ant survives with nothing to eat
  ai:     { autoJobs: true,                             // idle ants pick dig / forage / haul jobs by themselves
            autoHaul: true,                             // idle ants also carry corpses to the pit
            decisionInterval: 0.5,
            wanderMin: 1.5, wanderMax: 5, wanderRadius: 7 },
};
