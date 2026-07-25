# Entornos: Demo y Producción

## Arquitectura de dos entornos

```
Rama Git          →  Deployment Vercel     →  Dominio
──────────────────────────────────────────────────────
demo (o staging)  →  Preview               →  demo.seaduced.dk (o *.vercel.app)
main              →  Production            →  seaduced.dk
```

Vercel aplica automáticamente las variables de entorno correctas según la rama. No hay nada que cambiar en el código — solo las variables en el dashboard de Vercel.

---

## Variables de entorno en Vercel

Ir a: **Vercel Dashboard → botes-web → Settings → Environment Variables**

| Variable              | Preview (demo)              | Production                    |
|-----------------------|-----------------------------|-------------------------------|
| `APP_ENV`             | `demo`                      | `production`                  |
| `GAS_URL`             | URL del script GAS de demo  | URL del script GAS de prod    |
| `SUMUP_ACCESS_TOKEN`  | *(mismo — SumUp es real)*   | *(mismo)*                     |
| `SUMUP_MERCHANT_CODE` | *(mismo)*                   | *(mismo)*                     |
| `POSTGRES_URL`        | DB de demo                  | DB de producción              |
| `POSTGRES_*`          | resto de variables de demo  | resto de variables de prod    |

---

## Cómo crear el entorno de producción paso a paso

### 1. Crear el Google Apps Script de producción

1. Ir a [script.google.com](https://script.google.com) con la cuenta real de Seaduced
2. Abrir el script actual (demo) → hacer una copia
3. En la copia, cambiar:
   - El Google Calendar al calendario real de reservas
   - El email de notificaciones al email real (hola@seaduced.dk)
4. Publicar el nuevo script: **Deploy → New deployment → Web app**
5. Copiar la URL del nuevo deployment — esa es la `GAS_URL` de producción

### 2. Configurar variables en Vercel

1. Ir a Vercel Dashboard → botes-web → Settings → Environment Variables
2. Para cada variable, seleccionar a qué entorno aplica:
   - `APP_ENV = demo` → marcar solo **Preview**
   - `APP_ENV = production` → marcar solo **Production**
   - `GAS_URL = <url demo>` → marcar solo **Preview**
   - `GAS_URL = <url prod>` → marcar solo **Production**
   - `SUMUP_*` → marcar **All** (es el mismo en ambos)
   - `POSTGRES_*` → según si quieres DBs separadas o compartidas

### 3. Crear la rama demo (si no existe)

```bash
git checkout -b demo
git push origin demo
```

Vercel detectará la rama `demo` automáticamente y creará un deployment de Preview con las variables de Preview.

### 4. Mantener `main` como producción

Cualquier `git push` a `main` desplegará a producción con las variables de Production.

---

## Indicador visual

Cuando `APP_ENV=demo`, el sitio muestra un banner amarillo en la parte superior:

```
⚠️ DEMO MODE — Payments, emails & calendar are in test mode  ✕
```

En producción (`APP_ENV=production`) el banner no aparece.

---

---

## Base de datos: Demo vs Producción

Cada entorno tiene su propia base de datos en **Neon** (PostgreSQL). Ambas tienen exactamente el mismo schema — solo cambian los datos y las credenciales.

```
Neon Project: seaduced-demo   →  BD de demo  →  entorno Preview de Vercel
Neon Project: seaduced-prod   →  BD de prod  →  entorno Production de Vercel
```

### Schema de la tabla `bookings`

El archivo canónico es `db/schema.sql`. Columnas principales:

| Columna          | Tipo                 | Descripción                    |
|------------------|----------------------|--------------------------------|
| `id`             | SERIAL PK            | ID autoincremental             |
| `created_at`     | TIMESTAMP WITH TZ    | Fecha de creación              |
| `tour_id`        | VARCHAR(50)          | ID interno del tour            |
| `tour_name`      | VARCHAR(255)         | Nombre del tour                |
| `customer_name`  | VARCHAR(255)         | Nombre del cliente             |
| `customer_email` | VARCHAR(255)         | Email del cliente              |
| `customer_phone` | VARCHAR(50)          | Teléfono                       |
| `passengers`     | INTEGER              | Número de pasajeros            |
| `booking_date`   | DATE                 | Fecha de la reserva            |
| `booking_time`   | TIME                 | Hora de la reserva             |
| `total_price`    | DECIMAL(10,2)        | Precio total en DKK            |
| `payment_status` | VARCHAR(20)          | `PENDING` / `PAID`             |
| `sumup_id`       | VARCHAR(100) UNIQUE  | ID del checkout de SumUp       |
| `lang`           | VARCHAR(20)          | Idioma del cliente             |

### Cómo crear la BD de producción

**Paso 1 — Crear el proyecto en Neon:**

1. Ir a [console.neon.tech](https://console.neon.tech)
2. Click en **New Project**
3. Nombre: `seaduced-prod` | Region: EU (más cercana a Dinamarca)
4. Click **Create project**
5. Copiar el **Connection String** (pooled) que aparece en pantalla

**Paso 2 — Inicializar la tabla:**

Opción A — Desde el **SQL Editor de Neon** (más fácil):
1. En el proyecto `seaduced-prod`, abrir **SQL Editor**
2. Pegar el contenido de `db/schema.sql` y ejecutarlo
3. Listo ✓

Opción B — Desde terminal local:
```bash
POSTGRES_URL="postgresql://neondb_owner:XXXX@ep-PROD.neon.tech/neondb?sslmode=require" \
APP_ENV="production" \
node scripts/init-db.js
```

**Paso 3 — Añadir las credenciales en Vercel:**

En Vercel Dashboard → botes-web → Settings → Environment Variables, añadir solo para **Production**:
- `POSTGRES_URL` → Connection string pooled de `seaduced-prod`
- `POSTGRES_URL_NON_POOLING` → Connection string directo de `seaduced-prod`
- `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`

Ver `.env.production.example` para el formato exacto.

---

## Archivos de referencia

| Archivo | Propósito |
|---------|-----------|
| `.env.local` | Variables para desarrollo local (siempre demo) |
| `.env.demo.example` | Plantilla para las variables de Preview en Vercel |
| `.env.production.example` | Plantilla para las variables de Production en Vercel |
| `db/schema.sql` | Schema SQL canónico de la tabla `bookings` |
| `lib/db.js` | Módulo de conexión a la BD (usado por los serverless functions) |
| `scripts/init-db.js` | Script para inicializar la tabla en cualquier BD |

> **Nunca** subas `.env.local` a Git. Está en `.gitignore`.
> Los archivos `.example` sí se pueden subir — no contienen valores reales.
