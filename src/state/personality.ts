import type { NeedKey, PersonalityId } from './model';

export interface Personality {
  id: PersonalityId;
  name: string;
  emoji: string;
  description: string;
  /** Efectos concretos, mostrados tal cual en la interfaz. */
  effects: string[];
  /** Multiplicador del desgaste de cada necesidad (1 = normal). */
  decay: Record<NeedKey, number>;
  /** Multiplicador de lo que suben las necesidades con cada cuidado. */
  feedBoost: number;
  petBoost: number;
  sleepBoost: number;
  /** Cariño extra al comer. */
  feedAffection: number;
  /** Multiplicador de monedas de MIMI HOP. */
  hopCoinBoost: number;
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  juguetona: {
    id: 'juguetona',
    name: 'Juguetona',
    emoji: '🎈',
    description: 'Siempre quiere mimos y saltar.',
    effects: ['Pide cariño un 40 % más rápido', 'Las caricias dan un 50 % más', 'MIMI HOP da un 25 % más de monedas'],
    decay: { hunger: 1, hygiene: 1, energy: 1.1, affection: 1.4 },
    feedBoost: 1,
    petBoost: 1.5,
    sleepBoost: 1,
    feedAffection: 0,
    hopCoinBoost: 1.25,
  },
  dormilona: {
    id: 'dormilona',
    name: 'Dormilona',
    emoji: '🌙',
    description: 'Le encantan las siestas largas.',
    effects: ['Se cansa un 40 % más rápido', 'Dormir recupera un 60 % más de energía', 'Se ensucia un 20 % más despacio'],
    decay: { hunger: 1, hygiene: 0.8, energy: 1.4, affection: 1 },
    feedBoost: 1,
    petBoost: 1,
    sleepBoost: 1.6,
    feedAffection: 0,
    hopCoinBoost: 1,
  },
  glotona: {
    id: 'glotona',
    name: 'Glotona',
    emoji: '🍓',
    description: 'Piensa en postres todo el día.',
    effects: ['Le entra hambre un 40 % más rápido', 'Comer sacia un 30 % más', 'Comer también le da cariño'],
    decay: { hunger: 1.4, hygiene: 1, energy: 1, affection: 1 },
    feedBoost: 1.3,
    petBoost: 1,
    sleepBoost: 1,
    feedAffection: 8,
    hopCoinBoost: 1,
  },
};

const NEUTRAL: Personality = {
  ...PERSONALITIES.juguetona,
  decay: { hunger: 1, hygiene: 1, energy: 1, affection: 1 },
  petBoost: 1,
  hopCoinBoost: 1,
};

export function personalityOf(id: PersonalityId | null): Personality {
  return id ? PERSONALITIES[id] : NEUTRAL;
}
