/**
 * lib/cache.js
 *
 * TTL cache en memoria del proceso, para endpoints públicos de solo lectura
 * (disponibilidad) golpeados muy seguido por GYG (polling) y por visitantes
 * navegando el calendario, sin autenticación ni rate limit.
 *
 * Sin esto cada request dispara queries a Neon y el compute nunca llega a
 * hacer autosuspend entre requests, quemando la cuota mensual de compute
 * hours en días en vez de en el mes entero.
 *
 * Nunca usar para paths de escritura (reserve/book) ni nada que deba ver el
 * estado real al instante — solo para vistas de disponibilidad, donde un
 * desfase de segundos es aceptable.
 */

const store = new Map();

/**
 * Devuelve el valor cacheado para `key`, o ejecuta `fn` y cachea su resultado
 * por `ttlMs`. Las llamadas concurrentes con la misma key comparten la misma
 * promesa en vuelo (evita golpear la DB varias veces por una ráfaga).
 */
export function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const promise = Promise.resolve().then(fn);
  promise.catch(() => store.delete(key)); // no cachear errores
  store.set(key, { promise, expires: now + ttlMs });
  return promise;
}
