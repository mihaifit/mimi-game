import type { PersonalityId, StatKey } from './types';

export interface Personality {
  id: PersonalityId;
  name: string;
  emoji: string;
  description: string;
  /** Multiplicador del desgaste por hora de cada necesidad (despierta). */
  decay: Record<StatKey, number>;
  /** Multiplicadores de acciones. */
  foodMul: number;
  petMul: number;
  sleepRegenMul: number;
  /** Multiplicador de monedas en MIMI HOP. */
  hopCoinMul: number;
  /** Multiplicador de la velocidad de los obstáculos en MIMI HOP. */
  hopSpeedMul: number;
  /** Velocidad de animación (respiración, rebotes). */
  animSpeed: number;
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  juguetona: {
    id: 'juguetona',
    name: 'Juguetona',
    emoji: '🎈',
    description: 'Se aburre antes, adora las caricias (+50 %) y gana +25 % de monedas en MIMI HOP.',
    decay: { hunger: 1, clean: 1, energy: 1.1, happiness: 1.4 },
    foodMul: 1,
    petMul: 1.5,
    sleepRegenMul: 1,
    hopCoinMul: 1.25,
    hopSpeedMul: 1.05,
    animSpeed: 1.25,
  },
  glotona: {
    id: 'glotona',
    name: 'Glotona',
    emoji: '🍓',
    description: 'Le entra hambre antes, pero cada bocado la llena un 50 % más y la hace más feliz.',
    decay: { hunger: 1.4, clean: 1.1, energy: 1, happiness: 1 },
    foodMul: 1.5,
    petMul: 1,
    sleepRegenMul: 1,
    hopCoinMul: 1,
    hopSpeedMul: 1,
    animSpeed: 1,
  },
  dormilona: {
    id: 'dormilona',
    name: 'Dormilona',
    emoji: '🌙',
    description: 'Se cansa antes, recupera energía un 60 % más rápido y en MIMI HOP todo va un 10 % más lento.',
    decay: { hunger: 0.9, clean: 1, energy: 1.35, happiness: 0.9 },
    foodMul: 1,
    petMul: 1,
    sleepRegenMul: 1.6,
    hopCoinMul: 1,
    hopSpeedMul: 0.9,
    animSpeed: 0.8,
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

export function isPersonalityId(v: unknown): v is PersonalityId {
  return typeof v === 'string' && v in PERSONALITIES;
}
