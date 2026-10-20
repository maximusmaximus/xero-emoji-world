import { CITY_VERSION, type City } from "./sim";

const KEY = "xero-emoji-world";

export function loadCity(): City | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const city = JSON.parse(raw) as City;
    if (city?.version !== CITY_VERSION || !Array.isArray(city.buildings) || !city.era) return null;
    return city;
  } catch {
    return null;
  }
}

export function saveCity(city: City) {
  try {
    localStorage.setItem(KEY, JSON.stringify(city));
  } catch {
    // Private mode or a full disk. The city keeps running in memory.
  }
}
