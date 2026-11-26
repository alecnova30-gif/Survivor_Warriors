export const ITEMS = {
  dirt: { name: 'Terre', icon: '🟤', color: [0.45, 0.34, 0.22], place: true, stack: 64 },
  stone: { name: 'Pierre', icon: '🪨', color: [0.52, 0.52, 0.52], place: true, stack: 64 },
  sand: { name: 'Sable', icon: '🟨', color: [0.85, 0.76, 0.54], place: true, stack: 64 },
  snow: { name: 'Neige', icon: '❄️', color: [0.93, 0.95, 0.97], place: true, stack: 64 },
  wood: { name: 'Bois', icon: '🪵', color: [0.42, 0.3, 0.17], place: true, stack: 64 },
  planks: { name: 'Planches', icon: '🟫', color: [0.62, 0.47, 0.28], place: true, stack: 64 },
  stick: { name: 'Bâton', icon: '🥢', stack: 64 },
  coal: { name: 'Charbon', icon: '⚫', stack: 64 },
  ironOre: { name: 'Minerai de fer', icon: '⛰️', stack: 64 },
  ironIngot: { name: 'Lingot de fer', icon: '⚪', stack: 64 },
  goldOre: { name: "Minerai d'or", icon: '🟡', stack: 64 },
  goldIngot: { name: "Lingot d'or", icon: '🥇', stack: 64 },
  berries: { name: 'Baies', icon: '🫐', food: 3, stack: 64 },
  meat: { name: 'Viande crue', icon: '🍖', food: 4, stack: 64 },
  torch: { name: 'Torche', icon: '🕯️', placed: 'torch', stack: 64 },
  campfire: { name: 'Feu de camp', icon: '🔥', placed: 'campfire', stack: 8 },
  sapling: { name: 'Pousse', icon: '🌱', planted: true, stack: 64 },
  pickW: { name: 'Pioche en bois', icon: '⛏️', tool: 'pick', tier: 1, speed: 2.4, damage: 2, stack: 1 },
  pickS: { name: 'Pioche en pierre', icon: '⛏️', tool: 'pick', tier: 2, speed: 3.6, damage: 3, stack: 1 },
  pickI: { name: 'Pioche en fer', icon: '⛏️', tool: 'pick', tier: 3, speed: 5.2, damage: 4, stack: 1 },
  axeW: { name: 'Hache en bois', icon: '🪓', tool: 'axe', tier: 1, speed: 2.4, damage: 3, stack: 1 },
  axeS: { name: 'Hache en pierre', icon: '🪓', tool: 'axe', tier: 2, speed: 3.6, damage: 4, stack: 1 },
  axeI: { name: 'Hache en fer', icon: '🪓', tool: 'axe', tier: 3, speed: 5.2, damage: 5, stack: 1 },
  shovelW: { name: 'Pelle en bois', icon: '🥄', tool: 'shovel', tier: 1, speed: 2.4, damage: 2, stack: 1 },
  shovelS: { name: 'Pelle en pierre', icon: '🥄', tool: 'shovel', tier: 2, speed: 3.6, damage: 2, stack: 1 },
  shovelI: { name: 'Pelle en fer', icon: '🥄', tool: 'shovel', tier: 3, speed: 5.2, damage: 3, stack: 1 },
  swordW: { name: 'Épée en bois', icon: '🗡️', tool: 'sword', tier: 1, speed: 1, damage: 4, stack: 1 },
  swordS: { name: 'Épée en pierre', icon: '🗡️', tool: 'sword', tier: 2, speed: 1, damage: 6, stack: 1 },
  swordI: { name: 'Épée en fer', icon: '🗡️', tool: 'sword', tier: 3, speed: 1, damage: 9, stack: 1 }
};

export const RECIPES = [
  { out: 'planks', n: 4, needs: { wood: 1 } },
  { out: 'stick', n: 4, needs: { planks: 2 } },
  { out: 'torch', n: 4, needs: { stick: 1, coal: 1 } },
  { out: 'campfire', n: 1, needs: { wood: 3, stone: 3 } },
  { out: 'pickW', n: 1, needs: { planks: 3, stick: 2 } },
  { out: 'axeW', n: 1, needs: { planks: 3, stick: 2 } },
  { out: 'shovelW', n: 1, needs: { planks: 1, stick: 2 } },
  { out: 'swordW', n: 1, needs: { planks: 2, stick: 1 } },
  { out: 'pickS', n: 1, needs: { stone: 3, stick: 2 } },
  { out: 'axeS', n: 1, needs: { stone: 3, stick: 2 } },
  { out: 'shovelS', n: 1, needs: { stone: 1, stick: 2 } },
  { out: 'swordS', n: 1, needs: { stone: 2, stick: 1 } },
  { out: 'ironIngot', n: 1, needs: { ironOre: 1, coal: 1 } },
  { out: 'goldIngot', n: 1, needs: { goldOre: 1, coal: 1 } },
  { out: 'pickI', n: 1, needs: { ironIngot: 3, stick: 2 } },
  { out: 'axeI', n: 1, needs: { ironIngot: 3, stick: 2 } },
  { out: 'shovelI', n: 1, needs: { ironIngot: 1, stick: 2 } },
  { out: 'swordI', n: 1, needs: { ironIngot: 2, stick: 1 } }
];

export function canCraft(inv, recipe) {
  for (const id in recipe.needs) {
    if (inv.count(id) < recipe.needs[id]) return false;
  }
  return true;
}

export class Inventory {
  constructor(size = 36) {
    this.slots = new Array(size).fill(null);
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  add(id, n) {
    const def = ITEMS[id];
    const max = def ? def.stack : 64;
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.count < max) {
        const take = Math.min(n, max - s.count);
        s.count += take;
        n -= take;
      }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(n, max);
        this.slots[i] = { id, count: take };
        n -= take;
      }
    }
    return n;
  }

  remove(id, n) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(n, s.count);
        s.count -= take;
        n -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return n === 0;
  }

  selected() {
    return this.slots[this.sel] || null;
  }

  consumeSelected() {
    const s = this.slots[this.sel];
    if (!s) return;
    s.count--;
    if (s.count <= 0) this.slots[this.sel] = null;
  }

  sel = 0;
}
