// Frases cortas de Mimi según su personalidad y su estado. Puro y determinista
// (recibe la fuente de azar) para poder probarlo.

import { lowestNeed, moodOf, type GameState, type NeedKey, type PersonalityId } from './model';

export type VoiceEvent = 'pet' | 'feed' | 'clean' | 'sleep' | 'wake' | 'levelup' | 'idle' | 'move' | 'moveDone' | 'claim' | 'buy';

type Lines = Partial<Record<VoiceEvent, string[]>>;

const COMMON: Record<VoiceEvent, string[]> = {
  pet: ['¡Qué gustito!', 'Más, más…', '¡Jiji, cosquillas!'],
  feed: ['¡Ñam, ñam!', 'Gelatina de fresa, mi favorita.', '¡Qué rico!'],
  clean: ['¡Burbujitas!', 'Brillo como nueva.', '¡Splash!'],
  sleep: ['Zzz… buenas noches.', 'Solo cinco minutitos…'],
  wake: ['¡Buenos días!', '¡Lista para jugar!'],
  levelup: ['¡Somos aún más amigas!', '¡Nuestro vínculo crece!'],
  idle: ['¿Jugamos?', 'Hoy es un buen día.', '¡Hola!'],
  move: ['¡Vamos a movernos juntas!', 'A tu ritmo, sin prisa.', 'Estírate como una gelatina.'],
  moveDone: ['¡Qué bien sienta moverse!', '¡Bien hecho!'],
  claim: ['¡Misión cumplida!', '¡Lo hemos logrado!'],
  buy: ['¿Me queda bien?', '¡Me encanta!'],
};

const BY_PERSONALITY: Record<PersonalityId, Lines> = {
  juguetona: {
    pet: ['¡Otra vez, otra vez!', '¡Achuchón de gelatina!'],
    idle: ['¿Saltamos un ratito en MIMI HOP?', '¡Me aburro! ¿Jugamos?'],
    levelup: ['¡Bieeen! ¡Fiesta de saltos!'],
    move: ['¡Bailamos? ¡Bailamos!'],
  },
  dormilona: {
    sleep: ['Por fin… mi almohada…', 'Zzz… sueño con nubes de azúcar.'],
    idle: ['*bostezo* Qué tranquilo está todo.', 'Una siesta no vendría mal…'],
    wake: ['Mmm… ¿ya es de día?'],
    move: ['Estiramos despacito, ¿vale?'],
  },
  glotona: {
    feed: ['¡Más gelatina, por favor!', '¿Hay postre después del postre?'],
    idle: ['¿Huele a fresa?', 'Estoy pensando en tartas…'],
    levelup: ['¡Esto merece una tarta!'],
    move: ['Moverse da hambre… ¡pero me encanta!'],
  },
};

const NEED_LINES: Record<NeedKey, string> = {
  hunger: 'Tengo un poquito de hambre…',
  hygiene: 'Me siento pegajosa. ¿Un baño?',
  energy: 'Estoy cansadita…',
  affection: '¿Me das un mimo?',
};

export function mimiLine(state: GameState, event: VoiceEvent, rand: () => number = Math.random): string {
  if (event === 'idle') {
    if (state.sleeping) return 'Zzz…';
    const low = lowestNeed(state.needs);
    if (state.needs[low] < 35) return NEED_LINES[low];
    if (moodOf(state.needs) === 'feliz' && rand() < 0.3) return '¡Me siento genial!';
  }
  const own = state.personality ? (BY_PERSONALITY[state.personality][event] ?? []) : [];
  const pool = [...own, ...own, ...COMMON[event]]; // las propias de la personalidad pesan el doble
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
