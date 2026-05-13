import type { Noble } from '../state';

export const NOBLES: Noble[] = [
  { id: 'noble_01', prestige: 3, cost: { diamond: 4, sapphire: 4 } },
  { id: 'noble_02', prestige: 3, cost: { sapphire: 4, emerald: 4 } },
  { id: 'noble_03', prestige: 3, cost: { emerald: 4, ruby: 4 } },
  { id: 'noble_04', prestige: 3, cost: { ruby: 4, onyx: 4 } },
  { id: 'noble_05', prestige: 3, cost: { onyx: 4, diamond: 4 } },
  {
    id: 'noble_06',
    prestige: 3,
    cost: { diamond: 3, sapphire: 3, emerald: 3 },
  },
  { id: 'noble_07', prestige: 3, cost: { sapphire: 3, emerald: 3, ruby: 3 } },
  { id: 'noble_08', prestige: 3, cost: { emerald: 3, ruby: 3, onyx: 3 } },
  { id: 'noble_09', prestige: 3, cost: { ruby: 3, onyx: 3, diamond: 3 } },
  { id: 'noble_10', prestige: 3, cost: { onyx: 3, diamond: 3, sapphire: 3 } },
];
