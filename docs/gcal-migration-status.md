# Migración: dejar de depender de Google Calendar

Objetivo original: Postgres pasa a ser la única fuente de disponibilidad
(hoy la web pública todavía lee Google Calendar vía GAS, y eso permite huecos
fantasma cuando cancelar/borrar/editar no toca el evento de Calendar).

## Estado: Fase 0 y Fase 1 completas. Fase 2 y 3 NO empezadas a propósito.

Decisión del 2026-08-07: seguimos leyendo Google Calendar en la web pública
por ahora. Este documento es el punto de partida para retomarlo más adelante.

---

## Hecho

### Fase 0 — Auditoría (solo lectura)
- `scripts/audit-gcal.js` — compara eventos de Calendar contra `bookings`,
  clasifica en `ya-en-bd` / `parseable` / `manual-opaco` / `ignorar`.
- `scripts/reconcile-gcal.js` — verifica que lo pendiente de importar no
  duplique nada ya existente (búsqueda sin filtro de fecha).
- `lib/gcal-import.js` — parseo y clasificación compartidos entre auditoría
  y migración.

### Fase 1 — Migración (ejecutada y verificada)
- `scripts/migrate-gcal.js` — importó **21 eventos** de Calendar a `bookings`
  el 2026-08-07 (15 reservas GYG parseables + 6 manuales). Idempotente vía
  `gcal_event_id` (índice único parcial). Rollback disponible:
  `npm run migrate:gcal:rollback`.
- Resultado verificado: `npm run audit:gcal` → 26 ya-en-bd, 0 pendientes.
- Columnas añadidas a `bookings`: `gcal_event_id`, `booking_end_time`, `boat`,
  `source`, `gyg_booking_id` (todas con `ADD COLUMN IF NOT EXISTS`, ya en prod).

**Pendiente menor de la Fase 1:** dos reservas importadas sin pax en el
título del evento entraron con `passengers = 1`:
- 2026-08-21 16:00 boat1 — "Petit Fute boat trip 1 hour"
- 2026-08-21 18:00 boat1 — "Amit Paginaweb 3 h"

Revisar y corregir el número de pasajeros a mano desde el panel si se conoce
el dato real.

### Bug encontrado y corregido (no relacionado con la migración en sí)
`lib/availability.js` calculaba la fecha con
`row.booking_date.toISOString().split("T")[0]`. Si el driver de Postgres
devuelve la columna `DATE` como objeto `Date` interpretado en hora local de
la máquina, `toISOString()` puede retroceder un día en husos horarios
adelantados a UTC. Confirmado con `scripts/diagnose-date-shift.js`
(comparación de texto crudo, sin `Date` de por medio: las 14 filas
verificadas dieron `✅ DB correcta` — el dato en la base SIEMPRE estuvo bien).

Corregido pidiendo `::text` explícito en toda columna de fecha/hora, en:
- `lib/availability.js`
- `scripts/audit-gcal.js`
- `scripts/reconcile-gcal.js`
- `scripts/diagnose-sobreventa.js`

`dateKey()` en `lib/availability.js` ahora lanza si recibe un `Date` en vez
de un string, para que este bug no pueda reaparecer en silencio.

### Herramientas que quedan (las de auditoría/diagnóstico puntual ya cumplieron su función y se borraron el 2026-08-07)
```
npm run migrate:gcal            # simulacro de migración (dry-run)
npm run migrate:gcal:execute    # migración real
npm run migrate:gcal:rollback   # deshace la migración
npm run compare:availability    # compara Calendar vs Postgres, día a día — correr antes de la Fase 2
```

Se borraron `audit-gcal.js`, `reconcile-gcal.js`, `diagnose-sobreventa.js` y
`diagnose-date-shift.js`: eran de un solo uso (auditar antes de migrar,
investigar el bug de fechas). Si hace falta algo parecido más adelante,
escribir un script nuevo específico para lo que aparezca — no intentar
resucitar estos.

### `lib/availability.js` (nuevo, ya escrito, TODAVÍA NO SE USA)
Reproduce el contrato exacto de `getAvailability` / `getMonthlyAvailability`
del Apps Script (`{ busy: [...] }` y `{ "YYYY-MM-DD": [...] }`), pero
calculado desde Postgres en vez de Calendar. Pensado para que cambiar el
front sea solo cambiar una URL, sin tocar la lógica de solape que ya vive en
`js/experience.js`.

Reglas replicadas a propósito, igual que el Apps Script:
- Se ocupa la hora de inicio y todas las siguientes hasta la de fin, SIN
  incluirla (10:00–13:00 ocupa 10, 11, 12 — no 13).
- Los minutos no cuentan para el cálculo de horas ocupadas.
- El bote real de una reserva es la columna `boat` si está seteada; si no,
  cae a `TOUR_CALENDAR[tour_id]`. Esto importa porque hay reservas (catas de
  vino migradas) cuyo bote real no coincide con el mapeo teórico del tour.

---

## Pendiente — Fase 2: Postgres como única fuente

**No desplegar sin antes correr `npm run compare:availability` y confirmar
0 en sobreventa.** La última corrida (antes del fix de fechas) dio 44 horas
en sobreventa; el diagnóstico (`diagnose:sobreventa`) determinó que 33 eran
"OBSOLETO-MOVIDA" (reservas editadas después de crear el evento, Calendar
nunca se actualiza — comportamiento ya documentado) y 10 eran `FALTA-EN-BD`
reales (los eventos manuales/parseables que la Fase 1 sí importó, pero que en
ese momento el comparador todavía tenía el bug de fechas y los contaba mal).
**Hay que volver a correr `compare:availability` desde cero con el fix ya
aplicado antes de sacar conclusiones — los números de arriba están
desactualizados.**

Pasos, en orden:

1. `npm run compare:availability` — si sobreventa = 0, seguir. Si no, correr
   `npm run diagnose:sobreventa` y resolver cada caso `FALTA-EN-BD` (relanzar
   la migración con el rango que lo cubra) antes de continuar.

2. Extraer a `api/availability.js` un endpoint HTTP que envuelva
   `lib/availability.js`:
   - `GET ?action=getAvailability&date=&calendar=` → `{ busy: [...] }`
   - `GET ?action=getMonthlyAvailability&date=&calendar=` → `{ "YYYY-MM-DD": [...] }`
   - Rewrites nuevos en `vercel.json` (seguir el patrón de
     `/api/admin/*` ya existente).

3. Hacer que `api/gyg-handler.js` use `lib/availability.js` en vez de su
   lógica de solape duplicada (`bookingsByDate`, `rangesOverlap`, etc. en las
   líneas ~150-210). Una sola fuente de verdad para web y GYG.

4. Repuntar el front, 4 llamadas, cambiando la URL base de GAS al nuevo
   endpoint (la forma de la respuesta es idéntica, no debería tocarse más
   que la URL):
   - `js/experience.js` — 2 llamadas (`getAvailability`, `getMonthlyAvailability`)
   - `js/booking.js` — 1 llamada
   - `js/admin-modals.js` — `fetchAvailableSlots()`, usada por crear/editar reserva

5. Quitar `getAvailability` y `getMonthlyAvailability` del whitelist de
   `api/proxy.js` (`allowedActions`), ya que nadie las llamaría más.

6. Verificación post-despliegue: repetir `compare:availability` en
   producción una semana después, para confirmar que no aparecieron nuevas
   sobreventas por casos no contemplados (reservas creadas por otros canales,
   etc.).

## Pendiente — Fase 3: Calendar como espejo limpio

Una vez la Fase 2 esté en producción y estable, Calendar deja de ser fuente
de disponibilidad, pero sigue siendo la agenda visual que consultan los
capitanes. Hay que limpiarlo para que no acumule más eventos huérfanos:

1. Nueva acción `deleteBookingEvent` en los 4 `AppScript-*.js`
   (`AppScript-PROD-BookingWeb.js`, `AppScript-DEMO-BookingWeb.js`, y los
   dos de GYG). Busca el evento por `SumUp ID:` / `GYG Ref:` en la
   descripción (reutilizar `findEventByDescriptionFragment`, ya existe) y
   lo borra.

2. Llamar a esa acción desde `handleBookingAction` en `api/admin.js`:
   - `DELETE` → borrar también el evento de Calendar.
   - `PATCH` (cancelar) → borrar también el evento de Calendar.
   - `PUT`, si cambia `date`/`time`/`boat` → borrar el evento viejo y
     crear uno nuevo (más simple y robusto que intentar moverlo in-place).

3. Actualizar el comentario desactualizado en `lib/blocked-slots.js`
   (dice "la web pública lee Google Calendar" — ya no será cierto).

4. Regenerar `docs/Manual-Panel-Admin-Seaduced-ES.pdf`: desaparecen las tres
   advertencias de "entrad en Google Calendar a mano" (capítulos 11, 12 y la
   tabla del capítulo 16), y el capítulo 14 sobre GYG puede aflojarse ahora
   que editar sí actualiza todo correctamente.

---

## Cambio hecho en paralelo, ya en producción

**Editar reservas de GetYourGuide (incluido el importe) desde el panel.**
No hizo falta ningún cambio de backend — `handleBookingAction` (PUT) nunca
filtró por `source`, así que ya funcionaba de punta a punta. Se agregó un
aviso visible en el modal de Editar (`js/admin-modals.js`,
`openEditModal()`) cuando `booking.isGyg` es true: avisa que cambiar
fecha/hora/barco no se sincroniza con GetYourGuide (riesgo de doble
reserva), mientras que el importe es seguro de corregir porque solo lo usan
las Analíticas internas para restar la comisión del 30%.

Pendiente relacionado: cuando se haga la Fase 3, este aviso se puede acotar
o quitar para fecha/hora/barco, porque en ese momento SÍ se sincronizará
correctamente con Calendar (aunque seguirá sin sincronizarse con el sistema
propio de GetYourGuide — eso no lo resuelve ninguna fase de este plan, solo
está fuera de nuestro control ya que GYG no ofrece un webhook para eso).
