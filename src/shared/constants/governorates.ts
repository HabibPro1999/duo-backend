/**
 * Tunisia Governorates Constants
 * Complete list of 24 Tunisian governorates with French names
 * Source: https://en.wikipedia.org/wiki/Governorates_of_Tunisia
 */

export interface Governorate {
  value: string;
  label: string;
}

/**
 * Complete list of Tunisia's 24 governorates in alphabetical order
 * Values are URL-safe slugs, labels are official French names
 */
export const TUNISIA_GOVERNORATES: readonly Governorate[] = [
  { value: 'ariana', label: 'Ariana' },
  { value: 'beja', label: 'Béja' },
  { value: 'ben-arous', label: 'Ben Arous' },
  { value: 'bizerte', label: 'Bizerte' },
  { value: 'gabes', label: 'Gabès' },
  { value: 'gafsa', label: 'Gafsa' },
  { value: 'jendouba', label: 'Jendouba' },
  { value: 'kairouan', label: 'Kairouan' },
  { value: 'kasserine', label: 'Kasserine' },
  { value: 'kebili', label: 'Kébili' },
  { value: 'kef', label: 'Le Kef' },
  { value: 'mahdia', label: 'Mahdia' },
  { value: 'manouba', label: 'Manouba' },
  { value: 'medenine', label: 'Médenine' },
  { value: 'monastir', label: 'Monastir' },
  { value: 'nabeul', label: 'Nabeul' },
  { value: 'sfax', label: 'Sfax' },
  { value: 'sidi-bouzid', label: 'Sidi Bouzid' },
  { value: 'siliana', label: 'Siliana' },
  { value: 'sousse', label: 'Sousse' },
  { value: 'tataouine', label: 'Tataouine' },
  { value: 'tozeur', label: 'Tozeur' },
  { value: 'tunis', label: 'Tunis' },
  { value: 'zaghouan', label: 'Zaghouan' },
] as const;

/**
 * Get governorate label by value
 */
export function getGovernorateLabel(value: string): string | undefined {
  return TUNISIA_GOVERNORATES.find((g) => g.value === value)?.label;
}

/**
 * Validate if a value is a valid governorate code
 */
export function isValidGovernorate(value: string): boolean {
  return TUNISIA_GOVERNORATES.some((g) => g.value === value);
}
