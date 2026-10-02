# Entorno Firebase aislado

Este directorio es exclusivamente para `demo-admondash`. Su configuración vive en `firebase.emulator.json`, separada de `firebase.json`, y sus reglas candidatas no deben desplegarse a producción.

Puertos locales: Auth `9099`, Firestore `8080`, Functions `5001`, Emulator UI `4000`.

Arranque previsto, una vez instalada la CLI local:

```powershell
npm run emulators:start
```

En otra terminal, iniciar la interfaz con:

```powershell
cd frontend
npm run start:emulator
```

Con los emuladores activos, validar las reglas candidatas con:

```powershell
npm run test:rules
```

Validar las funciones de invitación y membresía con:

```powershell
npm run functions:build
cd functions
npm test
```

El modo `emulator` usa el ID `demo-admondash` y redirige Auth/Firestore a `127.0.0.1`. No contiene ni acepta credenciales, datos ni tokens de producción.

Las reglas actuales son deliberadamente conservadoras: el dueño conserva el acceso legado a su árbol `usuarios/{ownerUid}`, y un miembro solo recibe lecturas explícitas. Las funciones `createInvitation`, `acceptInvitation` y `revokeMember` crean, aceptan o revocan membresías con auditoría; los clientes nunca escriben esas rutas directamente. Las funciones solo se configuran en `firebase.emulator.json` hasta que se revise una entrega de producción.
