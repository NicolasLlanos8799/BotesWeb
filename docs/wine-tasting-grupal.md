# Wine Tasting Grupal – Seaduced Experience

## 1. Objetivo

Modificar la experiencia actual de Wine Tasting para que funcione como una experiencia grupal en el bote grande, con capacidad para recibir hasta dos grupos diferentes en una misma franja horaria.

La experiencia deja de ser exclusivamente privada. El cliente debe ser informado de que puede compartir el bote con otro grupo.

---

## 2. Bote y capacidad

La experiencia se realizará en el **bote grande**.

| Parámetro | Valor |
|---|---|
| Capacidad total del bote | 12 personas |
| Máximo de grupos por horario | 2 grupos |
| Máximo de personas por grupo | 6 personas |

Cada grupo realiza una reserva independiente. Dos grupos pueden reservar exactamente la misma franja horaria.

**Ejemplo:**

- Grupo 1: Marlene reserva de 10:00 a 12:00 para 4 personas.
- Grupo 2: Nico reserva de 10:00 a 12:00 para 6 personas.

**Resultado:**
- La franja 10:00–12:00 tiene dos reservas. Total: 10 personas.
- La franja queda **cerrada** porque ya se alcanzó el máximo de dos grupos, aunque queden dos lugares libres.

---

## 3. Franjas horarias disponibles

| Franja |
|---|
| 10:00–12:00 |
| 12:00–14:00 |
| 14:00–16:00 |
| 16:00–18:00 |
| 18:00–20:00 |

Cada franja admite un máximo de **2 reservas independientes**.

---

## 4. Funcionamiento de la disponibilidad

Por cada franja horaria, el sistema controla:

- Cantidad de reservas confirmadas.
- Cantidad de personas de cada reserva.
- Máximo de 6 personas por reserva.
- Máximo de 2 reservas por franja.

### Estados posibles de una franja

| Estado | Condición | Comportamiento |
|---|---|---|
| **Disponible** | 0 reservas | Acepta reservas de 1 a 6 personas |
| **Parcialmente disponible** | 1 reserva | Sigue visible; acepta un segundo grupo de 1 a 6 personas |
| **Completa** | 2 reservas | No acepta más reservas; se muestra como agotada |

---

## 5. Regla principal de ocupación

> La disponibilidad se controla por **cantidad de grupos**, no por cantidad total de personas.

- Máximo: 2 grupos por franja.
- Máximo por grupo: 6 personas.
- Máximo teórico total: 12 personas.

Una franja se cierra al alcanzar 2 reservas, **aunque la suma total de personas sea menor a 12**.

**Ejemplo:**
- Reserva 1: 2 personas.
- Reserva 2: 3 personas → Total: 5 personas.
- **El horario se cierra igualmente.**

---

## 6. Selección de cantidad de personas

| Límite | Valor |
|---|---|
| Mínimo | Según condición comercial de Seaduced |
| Máximo | 6 personas por reserva |

Si el grupo supera las 6 personas, mostrar mensaje:

> _"Para grupos de más de 6 personas, por favor contáctanos directamente o consulta otras modalidades de reserva."_

---

## 7. Cambios en la descripción de la experiencia

### Se mantiene
- Fotografía actual.
- Características generales del Wine Tasting.
- Duración de 2 horas.
- Contenido principal de la experiencia.

### Se debe modificar
- Bote asignado.
- Capacidad.
- Condición de experiencia privada.
- Información sobre posibilidad de compartir el bote.

### Texto sugerido para condiciones

> _"Esta experiencia se realiza en nuestro bote con capacidad para 12 personas. Cada reserva corresponde a un grupo de hasta 6 personas. Durante la actividad, es posible que el bote sea compartido con otro grupo que haya reservado la misma franja horaria."_

⚠️ No debe presentarse como **tour privado**.

---

## 8. Comportamiento esperado del calendario

### Estado inicial
- Horario 10:00–12:00: 0/2 reservas → **Disponible**

### Primera reserva (Marlene, 4 personas)
- Horario 10:00–12:00: 1/2 reservas → **Parcialmente disponible**
- La franja continúa apareciendo en el calendario.

### Segunda reserva (Nico, 6 personas)
- Horario 10:00–12:00: 2/2 reservas → **Completo**
- La franja ya no permite nuevas reservas.

---

## 9. Validaciones necesarias

El sistema debe impedir:

- [ ] Reservar para más de 6 personas en una sola reserva.
- [ ] Crear una tercera reserva en la misma franja.
- [ ] Sobrepasar el máximo de dos grupos.
- [ ] Reservar un horario completo.
- [ ] Duplicar reservas por error de pago o recarga de página.
- [ ] Bloquear un horario indefinidamente si el pago no se completa.

También debe definirse el comportamiento con reservas pendientes, canceladas o rechazadas.

---

## 10. Estados de reserva

| Estado | Ocupa lugar |
|---|---|
| Confirmada | ✅ Sí |
| Pagada | ✅ Sí |
| Pendiente de pago | ⏳ Bloqueo temporal |
| Cancelada | ❌ Libera el lugar |
| Pago rechazado | ❌ Libera el lugar |
| Reembolsada y cancelada | ❌ Libera el lugar |

> Las reservas pendientes de pago deben bloquear el lugar durante un período limitado y liberarlo automáticamente si el pago no se completa.

---

## 11. Cancelaciones

Cuando un grupo cancela:

- La franja vuelve a quedar disponible para una nueva reserva.
- La reserva restante no se ve afectada.
- La disponibilidad se actualiza automáticamente.

**Ejemplo:**
- Reserva 1: confirmada. Reserva 2: cancelada.
- Resultado: 1/2 activas → **Parcialmente disponible**.

---

## 12. Emails de confirmación

Cada grupo recibe su propio email. La información de un grupo **no debe enviarse al otro**.

El email debe incluir:

- [ ] Nombre de la experiencia.
- [ ] Fecha.
- [ ] Franja horaria.
- [ ] Cantidad de personas.
- [ ] Duración.
- [ ] Punto de encuentro.
- [ ] Condiciones de cancelación.
- [ ] Aclaración de que la experiencia puede compartirse con otro grupo.

---

## 13. Panel administrativo

El administrador debe poder ver por franja:

| Campo | Detalle |
|---|---|
| Fecha | — |
| Horario | — |
| Grupo 1 | Nombre, personas, estado |
| Grupo 2 | Nombre, personas, estado |
| Total personas | Suma de ambos grupos |
| Estado general | Disponible / Parcial / Completo |

**Ejemplo visual:**

```
10:00–12:00
├── Grupo 1: Marlene – 4 personas – pagado
├── Grupo 2: Nico – 6 personas – pagado
├── Total: 10 personas
└── Estado: completo
```

---

## 14. Casos de prueba

1. [ ] Una reserva de 1 persona.
2. [ ] Una reserva de 6 personas.
3. [ ] Dos reservas en el mismo horario.
4. [ ] Dos reservas de 6 personas cada una.
5. [ ] Intento de tercera reserva → debe rechazarse.
6. [ ] Intento de reservar para 7 personas → debe rechazarse.
7. [ ] Cancelación de uno de los dos grupos.
8. [ ] Pago rechazado.
9. [ ] Pago pendiente que no se completa.
10. [ ] Dos clientes intentando reservar el último lugar al mismo tiempo (race condition).
11. [ ] Confirmación correcta de emails.
12. [ ] Visualización correcta en móvil y escritorio.

---

## 15. Resumen técnico

Cada combinación `fecha + franja` tiene capacidad máxima de 2 reservas. Cada reserva: máximo 6 personas.

```
reservas_activas == 0  → disponible
reservas_activas == 1  → disponible para un segundo grupo
reservas_activas == 2  → completo
personas_reserva > 6   → rechazar
reserva cancelada      → liberar lugar
pago fallido/expirado  → liberar lugar
```
