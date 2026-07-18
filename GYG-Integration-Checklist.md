# GetYourGuide Integration — Checklist

## Estado general
- [x] Endpoint API implementado (`/reserve/`, `/book/`, `/cancel-reservation/`, `/cancel-booking/`, `/get-availabilities/`)
- [x] Auth Basic Auth funcionando (`validateGYGAuth`)
- [x] Sync bidireccional por API (sin email) — GYG→nosotros vía webhooks de reserva, nosotros→GYG vía `notifyGYGAvailability`
- [ ] Confirmar con GYG en qué paso está cada producto (email enviado — pendiente respuesta)
- [ ] Desactivar `AppScript-PROD-GYG.js` (parser de email) una vez confirmado que la API cubre todo, para evitar duplicados

## Bugs a corregir en código propio
- [x] `TEST_MAX_PARTICIPANTS` hardcodeado en 2 → corregido a `cfg.maxPax` (book-1h)
- [ ] `notifyGYGAvailability` calcula vacancies con `maxPax - booked` en vez de respetar `maxGroups` (modelo exclusivo) — puede reportar cupo disponible cuando el slot ya está tomado
- [ ] Confirmar `GYG_GYG_USER` / `GYG_GYG_PASS` seteadas en Vercel (si faltan, el push a GYG se salta en silencio)
- [ ] Agregar chequeo de solapamiento de horario antes de crear reservas (`handleCreateBooking`, `handleCreateCalendarOnly`, `handleConfirmHoldEvent`) — hoy solo dedupan por ID, no por slot
- [ ] Corregir bug de medianoche en `handleGetAvailability` / `handleGetMonthlyAvailability` (eventos que cruzan las 00:00 no bloquean el slot)
- [ ] Revisar timezone en `handleGetAvailability` (`new Date(dateStr)` sin forzar Europe/Copenhagen)

## Por producto (Option ID) — pendiente de confirmar con GYG
| Tour interno | Option ID | Capacidad (maxPax) | Estado testing GYG | Precio sincronizado | Horarios sincronizados |
|---|---|---|---|---|---|
| book-1h / book-winter-captain / book-1h-2h | 1288168 | 6 | En testing (Olivia) — bug de participantes corregido, pendiente re-test | 2499 DKK | 09–18h, c/1h |
| book-10p / book-10p-2h | 1919949 | 10 | ❓ sin confirmar | 2999 DKK | 09–18h, c/1h |
| book-reffen / book-winter / book-winter-hygge / book-christmas | 1288188 | 6 | ❓ sin confirmar | 4299 DKK | 09–18h, c/1h |
| book-land | 1825099 | 6 | ❓ sin confirmar | 8999 DKK | 09–14h, c/2h |
| book-malmo | 1935449 | 10 | ❓ sin confirmar | 13000 DKK | Solo 10:00h |
| book-wine | 1826872 | 6 | ❓ sin confirmar | 4999 DKK | 09–18h, c/1h |
| book-premium (Sea Fortress) | — | — | No conectado a GYG (sin Option ID) | — | — |

## Features opcionales del portal ("Test additional features")
- [ ] NOTIFICATION_WEBHOOK — evaluar si aplica más allá del push que ya hacemos
- [ ] PRICE_CATEGORIES_OVER_API — no aplica (precio único por grupo)
- [ ] ADDONS_OVER_API — no aplica (sin add-ons vendidos vía GYG)
- [ ] AVAILABILITY_BY_TICKET_CATEGORY — no aplica (solo categoría GROUP)
- [ ] PRODUCT_LIST_OVER_API — no aplica (productos fijos, sin listado dinámico)

## Próximos pasos
1. Enviar email a GYG pidiendo estado de cada Option ID (✅ ya redactado).
2. Con la respuesta, completar la tabla de arriba.
3. Corregir bugs de código listados.
4. Re-testear con Olivia el flujo de `book-1h`.
5. Repetir activación/testing para cada Option ID restante.
6. Decidir si conectar book-premium a GYG.
