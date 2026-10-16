import { PERSONALITIES } from './personalities';
import { clamp } from './needs';
import type { SaveData } from './types';

export type ActionResult = { ok: boolean; save: SaveData; message: string };

const fail = (save: SaveData, message: string): ActionResult => ({ ok: false, save, message });

export const MIN_ENERGY_TO_PLAY = 15;

export function feed(save: SaveData): ActionResult {
  if (save.sleeping) return fail(save, 'Shh… MIMI está durmiendo.');
  if (save.stats.hunger >= 98) return fail(save, 'MIMI está llena. ¡No le cabe ni una fresa!');
  const p = PERSONALITIES[save.personality];
  const joy = save.personality === 'glotona' ? 8 : 3;
  return {
    ok: true,
    message: '¡Ñam! Una fresa jugosa.',
    save: {
      ...save,
      stats: {
        ...save.stats,
        hunger: clamp(save.stats.hunger + 25 * p.foodMul),
        clean: clamp(save.stats.clean - 4),
        happiness: clamp(save.stats.happiness + joy),
      },
    },
  };
}

export function wash(save: SaveData): ActionResult {
  if (save.sleeping) return fail(save, 'Shh… mejor la bañamos cuando despierte.');
  if (save.stats.clean >= 98) return fail(save, 'MIMI ya brilla de limpia ✨');
  return {
    ok: true,
    message: '¡Burbujas! MIMI queda reluciente.',
    save: {
      ...save,
      stats: {
        ...save.stats,
        clean: clamp(save.stats.clean + 40),
        happiness: clamp(save.stats.happiness + 3),
      },
    },
  };
}

export function toggleSleep(save: SaveData): ActionResult {
  if (save.sleeping) {
    return { ok: true, message: '¡Buenos días, MIMI!', save: { ...save, sleeping: false } };
  }
  if (save.stats.energy >= 95) return fail(save, 'MIMI no tiene nada de sueño todavía.');
  return { ok: true, message: 'Buenas noches, MIMI… 🌙', save: { ...save, sleeping: true } };
}

export function pet(save: SaveData): ActionResult {
  if (save.sleeping) return fail(save, 'MIMI sonríe en sueños.');
  const p = PERSONALITIES[save.personality];
  return {
    ok: true,
    message: '¡A MIMI le encantan los mimos! 💜',
    save: { ...save, stats: { ...save.stats, happiness: clamp(save.stats.happiness + 6 * p.petMul) } },
  };
}

export function canPlay(save: SaveData): { ok: boolean; message: string } {
  if (save.sleeping) return { ok: false, message: 'Despierta a MIMI antes de jugar.' };
  if (save.stats.energy < MIN_ENERGY_TO_PLAY) {
    return { ok: false, message: 'MIMI está agotada. Necesita dormir un poco.' };
  }
  return { ok: true, message: '' };
}
