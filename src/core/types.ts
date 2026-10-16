export type StatKey = 'hunger' | 'clean' | 'energy' | 'happiness';

export type Stats = Record<StatKey, number>;

export type PersonalityId = 'juguetona' | 'glotona' | 'dormilona';

export type Slot = 'head' | 'face' | 'neck';

export type Equipped = Partial<Record<Slot, string>>;

export interface HopProgress {
  /** Mejor puntuación local (no hay clasificación online). */
  best: number;
  /** Número de partidas iniciadas; cada partida tiene id = contador tras iniciarse. */
  runsStarted: number;
  /** Id de la última partida que ya cobró recompensa. Evita cobrar dos veces. */
  lastRewardedRun: number;
  totalCoinsEarned: number;
}

export interface SaveData {
  version: number;
  personality: PersonalityId;
  onboarded: boolean;
  stats: Stats;
  sleeping: boolean;
  /** Marca de tiempo (ms) del último cálculo de necesidades. */
  lastUpdate: number;
  coins: number;
  owned: string[];
  equipped: Equipped;
  hop: HopProgress;
}

export type Mood = 'happy' | 'neutral' | 'sad' | 'sleeping';
