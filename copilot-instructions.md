# GitHub Copilot Instructions

## Project: 대전략 시뮬레이션 (Grand Strategy Simulation)

A Korean-language grand strategy game prototype inspired by CK3, HOI4, and Victoria3.
Built with HTML Canvas + Vanilla JavaScript. Target port: Unity C#.

---

## Tech Stack

- **Runtime**: Browser (no build step, no npm, no bundler)
- **Language**: Vanilla JavaScript ES6+ (`"use strict"`, IIFE modules)
- **Rendering**: HTML Canvas 2D API
- **Data**: Pure JS objects (JSON-compatible)
- **UI**: DOM manipulation (no frameworks)

---

## Code Style

### Module Pattern (REQUIRED)
```javascript
"use strict";

const ModuleName = (() => {
  // Private state (no export)
  let _privateVar = 0;

  // Private functions (underscore prefix)
  function _helper() { ... }

  // Public API
  function publicMethod(param) { ... }

  return { publicMethod };
})();
```

### Naming Conventions
- Modules: `PascalCase` — `GameCore`, `ProvinceManager`, `FactionManager`
- Private: `_camelCase` — `_buildPickBuffer`, `_relKey`
- Constants: `UPPER_SNAKE_CASE` — `TICK_MS`, `BASE_INCOME_PER_DEV`
- DOM IDs: `kebab-case` — `#canvas-wrap`, `#sidebar-body`

---

## Architecture

### Module Load Order (CRITICAL - must maintain)
```
1. GameCore          (no deps)
2. ProvinceManager   (no deps)
3. MapRenderer       (← GameCore, ProvinceManager)
4. FactionManager    (← ProvinceManager)
5. CharacterManager  (← ProvinceManager, FactionManager)
6. Notifications     (← DOM only)
7. TimeBar           (← DOM only)
8. UI                (← all managers)
```

### Event Bus
```javascript
GameCore.on('tick',     state => { /* daily */ });
GameCore.on('newMonth', state => { /* monthly */ });
GameCore.on('newYear',  state => { /* yearly */ });
GameCore.emit('customEvent', data);
```

### Key Data Types
```typescript
interface Province {
  id: number; name: string; faction: string; terrain: string;
  resources: string[]; buildings: string[]; population: number;
  development: number; // 1-8
  pickColor: string;   // unique hex for click detection
  poly: [number,number][];
}

interface Character {
  id: number; name: string; faction: string;
  role: 'ruler'|'heir'|'general'|'advisor'|'consort';
  age: number; dynasty: string; traits: string[];
  stats: { martial: number; diplomacy: number; stewardship: number; intrigue: number; };
  married_to: number|null;
}

interface FactionState {
  gold: number; prestige: number; stability: number;
  income: number; expenses: number;
}
```

---

## Key Design Rules

1. **All game code lives in `index.html`** — single file for browser-direct execution
2. **`src/modules/*.js`** — reference copies only, not loaded by browser
3. **No circular dependencies** — follow the load order above
4. **Color picking for map clicks** — offscreen canvas with `pickColor` per province
5. **Dirty flag rendering** — only redraw when `needsRedraw = true`
6. **Economy is automatic** — player cannot directly control economy (GDD rule)
7. **Population = rarest resource** — no natural growth, only from events/conquest

---

## Common API Usage

```javascript
// Province access
ProvinceManager.getById(6)                    // 한성 (Seoul)
ProvinceManager.getFactionProvinces('고려')    // Korea's provinces
ProvinceManager.getFactionPopulation('고려')   // Total population

// Faction economy
FactionManager.getFactionState('고려')         // { gold, prestige, stability... }
FactionManager.getRelation('고려', '남방')      // -100 to +100
FactionManager.modRelation('고려', '남방', 20)  // Modify relation
FactionManager.calcMonthlyIncome('고려')        // { income, expenses }

// Characters
CharacterManager.getRuler('고려')              // Current ruler
CharacterManager.getHeir('고려')               // Heir
CharacterManager.getEffectiveStats(char)        // Stats + trait bonuses
CharacterManager.marry(charId1, charId2)        // Marriage (relation +15 if cross-faction)

// Notifications
Notifications.push('Event text', 'good')       // type: ''|'warn'|'alert'|'good'

// Game state
GameCore.getState()                             // { year, month, day, speed, paused }
GameCore.togglePause()
GameCore.setSpeed(3)                            // 1|2|3|5
```

---

## Next Modules to Implement (Phase 3)

### M06 — Military/Division System
```
Location: index.html, after CharacterManager block
Pattern: const MilitaryManager = (() => { ... })();

Key data:
  - garrison: { provinceId → { infantry, cavalry, archers, siege } }
  - divisions: Array<{ id, factionId, units, locationId, targetId, moving }>

Key functions:
  - createDivision(factionId, provinceId, units)
  - moveDivision(divisionId, targetProvinceId) → calculates travel time
  - getDivisionsAt(provinceId)
  - onTick() → advance movement

Events to emit:
  - GameCore.emit('divisionArrived', { divisionId, provinceId })
  - GameCore.emit('battleStart', { attackDiv, defendDiv, provinceId })
```

### M07 — Combat Engine
```
Location: index.html, after MilitaryManager block
Pattern: const CombatEngine = (() => { ... })();

Formula:
  combatPower = Σ(unit.count × unit.basePower) × terrainMod × leaderMod
  terrainMod from ProvinceManager.getTerrain(id).defMod
  leaderMod from CharacterManager.getEffectiveStats(general).martial / 10

Key functions:
  - resolveBattle(attackerDiv, defenderDiv, province) → { winner, losses }
  - calcCasualties(power, enemyPower) → { attLoss, defLoss }
```

---

## File Map
```
index.html          ← MAIN GAME (edit this for game changes)
editor.html         ← Map editor (standalone)
progress.html       ← Dev progress dashboard
README.md           ← Project overview
CLAUDE.md           ← Claude Code context
docs/ARCHITECTURE.md← Module design doc
src/modules/        ← Reference JS (mirrors index.html modules)
```
