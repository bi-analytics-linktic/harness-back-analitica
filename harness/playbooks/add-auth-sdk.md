**Implementar la autenticación mediante SDK**

1. **Instalación inicial del SDK**
    
    Ejecutar:
    
    bash
    
    ```
    pnpm add https://api-auth-monitoreo.igniva.co/api/external-apps/v1/sdk/bi-iam-sdk-1.1.2.tgz
    ```
    
2. **Validación de versión**
    
    Una vez instalado, validar la última versión publicada del SDK y, si existe una versión más reciente, instalar esa versión. La documentación para implementar la autenticación con `api-auth-monitoreo` está incluida dentro del mismo SDK y debe usarse como referencia.
    
3. **Regla obligatoria en `init.sh`**
    
    La autenticación debe realizarse exclusivamente mediante el SDK. Antes de implementarla, se debe eliminar todo lo relacionado con la autenticación deprecada, en caso de que esté activa o implementada. Después de la limpieza, implementar la nueva autenticación usando el SDK.
    
4. **Deprecación de autenticación por access token**
    
    Toda autenticación basada en access token queda deprecada. No se debe implementar ni mantener. La única implementación permitida es la autenticación mediante el SDK.
    
5. **Roles y permisos**
    
    Los roles y permisos deben provenir del SDK de autenticación. Por lo tanto, se debe eliminar la variable de entorno `IAM_ALLOWED_ROLES`.
    
6. **Advertencia en `FRONT.md`**
    
    Incluir en `FRONT.md` una advertencia indicando que no se deben subir [completar: credenciales, secretos, tokens, archivos de configuración sensibles, etc.].
    
    Además, dejar explícito que no se deben implementar nuevas formas de autenticación distintas. 
    
    nunca subir rutas sin login o autenticacion en caso de que eso pase se debe informar inmediatamente al equipo de backend, generarse la alerta 
    
7. **Criterios de aceptación**
    - El SDK queda instalado y actualizado a la última versión publicada.
    - `init.sh` usa obligatoriamente la autenticación del SDK.
    - No queda código activo de autenticación por access token.
    - `IAM_ALLOWED_ROLES` fue eliminada de los entornos.
    - Los roles y permisos se obtienen desde el SDK.
    - `FRONT.md` contiene la advertencia correspondiente.

Actualizarse

---

### **Integración con el harness (decidido, ADR 0019)**

- **Rutas en `/api/v1/auth`:** las rutas del SDK se montan con `app.use('/api/v1/auth', app.get(IAM_AUTH_ROUTES))` en `src/main.ts`, **después** de `app.enableCors(...)` y `app.use(securityHeaders())`. `app.use` no recibe el prefijo global de Nest, por eso la ruta va completa. El front llama `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, etc.
- **CORS con credenciales:** la sesión va en cookies `HttpOnly`, así que `buildCorsOptions` usa `credentials: true`, solo con la allowlist exacta de `CORS_ORIGINS`. El front llama con `credentials: 'include'`.
- **Mismos orígenes:** `routes.allowedOrigins` de `IamModule` recibe `config.get('cors.origins', { infer: true })`. No se crea otra variable de orígenes (nada de `FRONT_ORIGIN`).
- **IP real del usuario:** `HTTP_TRUST_PROXY` (por ejemplo `loopback, uniquelocal`) y `app.set('trust proxy', trustProxy)` solo si está definida. Nunca `true` ni un número de saltos.

---

### **Observaciones**

Hay dos partes del texto original que quedaron incompletas y conviene definir antes de publicarlo como instrucción final:

- “**no se pueden o se deben subir**”: falta indicar exactamente qué no se debe subir.
- “**solo se de**”: probablemente se refiere a “solo se debe usar el SDK” o “solo se debe implementar la autenticación del SDK”.