import { open } from 'node:fs/promises';
import { getStore } from '@netlify/blobs';
import type { HotelSuggestion } from '../src/shared/types';
import { ProviderError } from './providers';

export interface HotelSuggestionsResult {
  hotels: HotelSuggestion[];
  /** True only when a searchable, verified Booking catalog is available. */
  configured: boolean;
  message?: string;
}

const SOURCE_ENDPOINT = 'https://demandapi.booking.com/3.1/accommodations/details';
const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
const MAX_CATALOG_HOTELS = 20_000;
const RESULT_LIMIT = 10;
type Json = Record<string, unknown>;
const object = (value: unknown): Json | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const searchKey = (value: string): string => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();

interface Catalog {
  hotels: HotelSuggestion[];
  importedAt: string;
}

let cached: { path: string; size: number; mtime: number; catalog: Catalog } | undefined;

function validateCatalog(raw: unknown): Catalog {
  const data = object(raw);
  if (!data || data.version !== 1 || data.source !== 'booking' || data.sourceEndpoint !== SOURCE_ENDPOINT || !text(data.importedAt, 40)) throw new Error('Invalid catalog metadata');
  const importedAt = Date.parse(data.importedAt);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(data.importedAt) || !Number.isFinite(importedAt) || importedAt > Date.now() + 300_000 || !Array.isArray(data.hotels) || data.hotels.length > MAX_CATALOG_HOTELS) throw new Error('Invalid catalog content');
  const ids = new Set<string>();
  const hotels = data.hotels.map((rawHotel): HotelSuggestion => {
    const hotel = object(rawHotel);
    if (!hotel || typeof hotel.id !== 'string' || !/^[1-9]\d{0,14}$/.test(hotel.id) || !Number.isSafeInteger(Number(hotel.id)) || ids.has(hotel.id) || !text(hotel.name, 200) || !text(hotel.location, 250) || hotel.source !== 'booking' || hotel.verified !== true) throw new Error('Invalid catalog hotel');
    ids.add(hotel.id);
    const result: HotelSuggestion = { id: hotel.id, name: hotel.name.trim(), location: hotel.location.trim(), source: 'booking', verified: true };
    if (hotel.lat !== undefined || hotel.lon !== undefined) {
      if (typeof hotel.lat !== 'number' || !Number.isFinite(hotel.lat) || Math.abs(hotel.lat) > 90 || typeof hotel.lon !== 'number' || !Number.isFinite(hotel.lon) || Math.abs(hotel.lon) > 180) throw new Error('Invalid catalog coordinates');
      result.lat = hotel.lat;
      result.lon = hotel.lon;
    }
    if (hotel.url !== undefined) {
      if (!text(hotel.url, 2000)) throw new Error('Invalid catalog URL');
      const url = new URL(hotel.url);
      if (url.protocol !== 'https:' || !/(^|\.)booking\.com$/i.test(url.hostname) || url.username || url.password || [...url.searchParams.keys()].some((key) => /token|secret|api.?key/i.test(key))) throw new Error('Invalid catalog URL');
      result.url = url.toString();
    }
    return result;
  });
  return { hotels, importedAt: new Date(importedAt).toISOString() };
}

async function loadCatalog(path: string): Promise<Catalog> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size === 0 || info.size > MAX_CATALOG_BYTES) throw new Error('Invalid catalog file');
    if (cached?.path === path && cached.size === info.size && cached.mtime === info.mtimeMs) return cached.catalog;
    // Bound the read even if an operator replaces or grows the file concurrently.
    const buffer = Buffer.alloc(MAX_CATALOG_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_CATALOG_BYTES) throw new Error('Oversized catalog file');
    const catalog = validateCatalog(JSON.parse(buffer.subarray(0, length).toString('utf8')));
    cached = { path, size: info.size, mtime: info.mtimeMs, catalog };
    return catalog;
  } finally {
    await file.close();
  }
}

async function loadStoredCatalog(): Promise<Catalog | null> {
  // This store is private to the Netlify site. It is populated by a licensed
  // catalog import, never by accepting arbitrary hotel names from the browser.
  if (!process.env.NETLIFY_BLOBS_CONTEXT && !process.env.AWS_LAMBDA_FUNCTION_NAME) return null;
  const store = getStore({ name: 'viagem-booking-catalog', consistency: 'strong' });
  const raw = await store.get('index.json', { type: 'text' });
  if (raw === null) return null;
  if (Buffer.byteLength(raw, 'utf8') > MAX_CATALOG_BYTES) throw new Error('Oversized catalog');
  return validateCatalog(JSON.parse(raw));
}

/**
 * Booking Demand 3.1 exposes a geographic accommodation catalog, not a
 * free-text hotel autocomplete endpoint. A searchable index has to be built
 * from that catalog before a name can be verified. Do not equate configured
 * credentials, a familiar property name, or typed text with a catalog match.
 * See docs/HOTEIS.md for the verified API contract and remaining prerequisite.
 */
export async function suggestHotels(query: string, location?: string): Promise<HotelSuggestionsResult> {
  if (typeof query !== 'string' || query.length > 120 || (location !== undefined && (typeof location !== 'string' || location.length > 120))) {
    throw new ProviderError('INVALID_QUERY', 'Use até 120 caracteres para pesquisar um hotel.', 400);
  }

  const catalogPath = process.env.BOOKING_HOTEL_CATALOG_PATH;
  // There is deliberately no upstream request here: neither /details nor
  // /search accepts a hotel-name parameter in the official OpenAPI contract.
  // Sending each keystroke as a geographic catalog scan would also misstate
  // the coverage and consume partner quota without a suitable search index.
  let catalog: Catalog | null;
  try { catalog = catalogPath ? await loadCatalog(catalogPath) : await loadStoredCatalog(); }
  catch {
    return { hotels: [], configured: false, message: 'Não foi possível consultar o catálogo de hotéis da Booking agora. O nome digitado ainda não foi validado.' };
  }
  if (!catalog) return {
    hotels: [], configured: false,
    message: 'A pesquisa de hotéis ainda não está conectada à Booking. O nome digitado ainda não foi validado.',
  };

  const key = searchKey(query);
  if (key.length < 2) return { hotels: [], configured: true, message: 'Digite pelo menos duas letras para pesquisar um hotel.' };
  const words = key.split(/\s+/);
  const locationKey = location ? searchKey(location) : '';
  const hotels = catalog.hotels.filter((hotel) => {
    const fullName = searchKey(`${hotel.name} ${hotel.location}`);
    return words.every((word) => fullName.includes(word)) && (!locationKey || searchKey(hotel.location).includes(locationKey));
  }).sort((a, b) => {
    const rank = (hotel: HotelSuggestion): number => searchKey(hotel.name) === key ? 0 : searchKey(hotel.name).startsWith(key) ? 1 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR') || a.location.localeCompare(b.location, 'pt-BR');
  }).slice(0, RESULT_LIMIT);

  // Copy records so callers cannot mutate the in-memory verified catalog.
  return { hotels: hotels.map((hotel) => ({ ...hotel })), configured: true,
    message: hotels.length ? 'Selecione o hotel e confira a cidade. Disponibilidade e preços são consultados separadamente.' : 'Nenhum hotel encontrado no catálogo conectado. Isso não significa que ele não exista na Booking.' };
}
