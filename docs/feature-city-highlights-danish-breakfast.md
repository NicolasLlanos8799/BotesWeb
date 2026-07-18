# Feature: Tour City Highlights con Desayuno Danés

## Objetivo
Nueva experiencia independiente (no add-on) reservable directamente desde la web. Basada en el recorrido City Highlights + desayuno danés servido a bordo.

---

## Configuración base

| Campo | Valor |
|---|---|
| Nombre | Tour City Highlights con Desayuno Danés |
| Recorrido base | City Highlights |
| Duración | 2 horas |
| Barco | Boat 1 (pequeño) |
| Capacidad máxima | 6 personas |
| Precio | 4.499 DKK |
| Imágenes | Reutilizar las de `city-highlights-1h` |

---

## Lógica del sistema

- **No crear un calendario nuevo.**
- Usar el calendario existente de **Boat 1**.
- Solo hay dos calendarios: Boat 1 (máx. 6) y Boat 2 (máx. 12).

---

## Disponibilidad

Tres horarios de salida independientes (cada uno = 2 horas):

| Salida | Llegada |
|---|---|
| 09:00 | 11:00 |
| 10:00 | 12:00 |
| 11:00 | 13:00 |

> No mostrar otros horarios para esta experiencia.

---

## Capacidad

- Mínimo: 1 persona
- Máximo: 6 personas
- El sistema no debe permitir reservas de más de 6 personas.

---

## Descripción (copy web)

**Tour City Highlights con Desayuno Danés**

Comienza tu día descubriendo Copenhague desde el agua mientras disfrutas de un auténtico desayuno danés.

Recorre los canales de la ciudad en nuestro tour City Highlights de dos horas mientras te relajas con un desayuno cuidadosamente seleccionado, servido a bordo.

**El desayuno incluye:**
- Bollería danesa recién horneada
- Café recién hecho
- Té
- Zumo
- Pan de masa madre con mantequilla y queso *(equilibrio entre dulce y salado)*
- Botella de agua para toda la travesía

*Una experiencia perfecta para combinar los lugares más emblemáticos de Copenhague, los sabores tradicionales daneses y una relajante mañana navegando por sus canales.*

---

## Checklist de implementación

- [ ] Crear nueva experiencia: `Tour City Highlights con Desayuno Danés`
- [ ] Asignar recorrido base: City Highlights
- [ ] Duración: 2 horas
- [ ] Vincular al calendario existente de Boat 1
- [ ] Configurar horarios: 09:00 · 10:00 · 11:00 (únicamente)
- [ ] Capacidad: 1–6 personas
- [ ] Precio: 4.499 DKK
- [ ] Reutilizar imágenes de `city-highlights-1h`
