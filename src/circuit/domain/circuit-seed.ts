import type { RandomSource } from "@/shared/domain/math";

// No 0/O or 1/I so a seed read aloud or copied by hand is unambiguous.
const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SEED_LENGTH = 6;
const MAX_SEED_LENGTH = 24;

export function randomSeed(random: RandomSource = Math.random): string {
  let seed = "";
  for (let i = 0; i < SEED_LENGTH; i++) seed += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)];
  return seed;
}

/** Seeds are case- and whitespace-insensitive; an empty result is not a valid seed. */
export function normalizeSeed(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase().slice(0, MAX_SEED_LENGTH);
}
