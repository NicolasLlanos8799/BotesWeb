# Códigos de descuento — resumen para el cliente

## Qué es
Una nueva función que permite crear códigos de descuento (por ejemplo `VERANO30`) y que los clientes los usen al reservar en la web. El descuento se aplica al total de la reserva (experiencia + extras).

## Cómo crear un descuento
1. Entrar al panel: `seaduced-experience.com/admin` y abrir **Discounts** en el menú.
2. Completar el formulario:
   - **Code**: nombre del código (da igual mayúsculas o minúsculas).
   - **Type**: porcentaje (%) o monto fijo (DKK).
   - **Discount / Amount off**: solo el número (30 o 500). Al lado aparece `%` o `DKK` según el tipo.
   - **Number of uses**: cuántas veces se puede usar en total. Cada uso es una reserva distinta; el monto fijo se descuenta una vez por reserva.
   - **Expires on**: fecha de vencimiento elegida desde un calendario (opcional; vale todo ese día).
3. Tocar **Create code**. Queda activo al instante.

En la lista se ve cada código con sus usos (ej. `1 / 5`) y su estado: **Active**, **Expired** (venció) o **Used up** (se agotaron los usos). **Delete** lo elimina.

## Cuándo lo aplica el cliente
En la página de reserva, dentro del resumen y junto al total, hay un campo **Discount code** con el botón **Apply**. Si el código es válido, el cliente ve el descuento y el nuevo total antes de pagar. Si no es válido, vencido o agotado, se le avisa y el precio no cambia. Si el código es de monto fijo y ese monto es igual o mayor al total de la reserva, no se puede aplicar y también se le avisa. Después paga el monto con descuento.

## Cuándo se gasta un uso
Recién cuando el **pago queda confirmado**. Mientras un cliente está pagando, ese uso queda reservado para él y nadie más puede tomarlo; si no completa el pago en 30 minutos, el uso vuelve a estar disponible. Al pagarse el último uso, el código pasa a "Used up" y nadie más puede aplicarlo.

## Dónde queda registrado
- En el detalle de cada reserva (admin), debajo de **Price**, aparece **Discount: CÓDIGO (-30%)** o **(-500 DKK)**. El precio ya es el final.
- El email de confirmación al cliente y el aviso interno incluyen el código y el porcentaje.
