# Pruebas locales con la cuenta Firebase real aislada

Este modo permite recorrer la aplicación en `localhost` con Firebase Auth y Firestore reales, exclusivamente bajo el propietario de prueba `Kv1o39fFnyW22INmXyXS8WMFgnR2`.

## Qué protege

- El arranque normal (`npm start`) y el build de producción no contienen esta excepción.
- Solo `npm run start:real-test` habilita operaciones administrativas que antes estaban limitadas al emulador.
- Si se inicia sesión con cualquier UID distinto, dichas operaciones fallan cerradas.
- La aplicación no toca reglas, índices, Functions, sesiones móviles, suscripciones ni `active_sellers`.
- No se crean datos de ejemplo automáticamente. Cada documento de prueba aparece solo tras una acción manual en la interfaz.

## Uso desde Visual Studio Code

En una terminal situada en `frontend`:

```powershell
npm run start:real-test
```

Abrir la dirección `http://localhost:4200` que muestre Angular e iniciar sesión con el correo y contraseña de la cuenta de prueba. Elegir `admon` en el selector operativo para probar apertura, cierre, reapertura, conciliación e inventario administrativo.

Las operaciones creadas quedan bajo el UID de prueba, normalmente en `usuarios/Kv1o39fFnyW22INmXyXS8WMFgnR2/...` y, para el libro administrativo nuevo, `negocios/Kv1o39fFnyW22INmXyXS8WMFgnR2/...`. No quedan mezcladas con el dueño productivo.

## Límites claros

El modo no puede saltar reglas Firestore existentes. Si una escritura del UID de pruebas es denegada, se muestra el error de permisos; no se cambia una regla automáticamente. Las áreas que siguen siendo una vista de consulta o todavía no tienen flujo de producto completo conservarán esa limitación; este modo no inventa funcionalidad ni convierte datos de prueba en datos de producción.

Al terminar, detener el proceso con `Ctrl+C` y cerrar sesión. Para volver al modo ordinario ejecutar `npm start`.
