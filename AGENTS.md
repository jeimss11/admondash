# Instrucciones del proyecto

## Alcance acordado con el dueño

- Trabajar en `admonDash` para complementar la app móvil `impresora`.
- El repositorio móvil `D:/codex/ImpresionBluetooth-clone` es **solo lectura**: no editar, formatear, compilar, instalar, cambiar Git ni publicar desde allí. Consultar su código para Firebase y flujos.
- No publicar cambios de Firebase de producción (reglas, índices, funciones, migraciones, datos) sin autorización explícita del dueño sobre una entrega concreta. Las pruebas deben usar datos sintéticos y entornos aislados.
- Las reglas e índices de producción los aplica exclusivamente el dueño manualmente. No recrear `firestore.rules` ni `firestore.indexes.json` en la raíz ni agregar referencias de Firestore al `firebase.json` normal. Entregar recomendaciones en `docs/integration/FIREBASE_MANUAL.md`. Los archivos de `firebase/emulator` se usan únicamente para pruebas con `demo-admondash`; no desplegarlos.
- Conservar cambios locales ajenos. La auditoría inicial encontró cambios sin confirmar en distribuidores, modelos, ventas y caché; ver `docs/integration/README.md`.

## Requisitos de producto confirmados

- El móvil es la entrada principal de datos. El escritorio también registra ventas y administra el negocio.
- Conservar la separación entre `ventas` y `ventas_appweb` y agregar su lectura en reportes; no copiar automáticamente ventas web al móvil.
- El dueño entra con la misma cuenta Firebase del móvil. Colaboradores web tienen cuentas propias y membresía/permisos del negocio; no son suscripciones ni vendedores móviles.
- No alterar las sesiones, tokens de suscripción o asignaciones de vendedor del móvil para implementar login/logout o subcuentas web.
- Ofrecer inventario central y por vendedor como modos configurables del negocio, con cambio controlado y conciliación.
- País inicial Colombia; valores iniciales propuestos COP, `es-CO`, `America/Bogota`; permitir extensión futura por país sin reinterpretar el histórico.

## Antes de cambios de integración

Leer `docs/integration/FIRESTORE_CONTRACT.md` y `docs/integration/IMPLEMENTATION_PLAN.md`. `productos[].precio` de una venta móvil es el importe completo de la línea, no el precio unitario. Preservar cantidades fraccionarias, tipos móviles y Timestamp de sincronización. Una cantidad de producto ausente no equivale a cero.

El móvil puede reemplazar documentos completos de ventas/clientes y subir stock absoluto. No prometer stock global transaccional solo por introducir una transacción web. Guardar metadatos administrativos independientes y validar conflictos.

No tratar `role` móvil como autorización. Separar `auth.uid` del colaborador y `ownerUid` del negocio. Las reglas y backend deben verificar membresías; el navegador no concede permisos.

## Verificación

Desde `frontend`:

```powershell
npm run test:contracts
node .\node_modules\typescript\bin\tsc -p tsconfig.app.json --noEmit
node .\node_modules\@angular\cli\bin\ng.js build
```

Node 22.15+ para el runner de contrato. La suite Angular preexistente todavía tiene defectos documentados en `docs/integration/TEST_PLAN.md`; no presentar las pruebas de contrato como validación integral ni de seguridad.
