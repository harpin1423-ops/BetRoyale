# STATUS.md — BetRoyale Club

## ✅ Refactorización Profesional Completada

### Nueva Estructura de Carpetas

```
server/                        ← Backend modular (extraído del monolito server.ts de 97KB)
├── config/
│   ├── env.ts                 ← Variables de entorno tipadas y validadas
│   └── database.ts            ← Pool MySQL con detección de queries lentas
├── db/
│   └── schema.ts              ← initDB(): esquema, migraciones y datos semilla
├── middleware/
│   ├── auth.ts                ← authenticateToken + requireAdmin (JWT)
│   ├── logger.ts              ← HTTP logger con detección de requests lentos
│   └── errorHandler.ts        ← Error handler global + 404 handler
├── services/
│   ├── telegram.service.ts    ← sendTelegramMessage + formatPickParaTelegram
│   ├── mercadopago.service.ts ← tasa de cambio + activarSuscripcion
│   └── email.service.ts       ← ✨ NUEVO: Nodemailer (bienvenida, recuperación, VIP)
└── routes/
    ├── auth.routes.ts         ← /api/auth/* (register, login, me, password)
    ├── picks.routes.ts        ← /api/picks/* (CRUD + tracking + bulk)
    ├── users.routes.ts        ← /api/user/* + /api/users/* (perfil, métricas, admin)
    ├── leagues.routes.ts      ← /api/leagues/* + /api/countries/*
    ├── markets.routes.ts      ← /api/markets/*
    ├── payments.routes.ts     ← /api/payments/* (MP + webhook mejorado)
    ├── stats.routes.ts        ← /api/stats/* (rendimiento, yield, ingresos, historial)
    └── promoCodes.routes.ts   ← /api/promo-codes/*

src/
├── lib/
│   └── api.ts                 ← ✨ NUEVO: Cliente HTTP con auth automática
├── hooks/
│   └── useApi.ts              ← ✨ NUEVO: Hook para loading/error automático
└── pages/
    └── HistorialPicks.tsx     ← ✨ NUEVO: Página pública /historial con métricas
```

---

## ✅ Módulos Completados

### Core Platform
- [x] Sistema de picks (gratuitos y VIP)
- [x] Autenticación JWT (login/registro)
- [x] Panel de Administración completo
- [x] Sistema de suscripciones con Mercado Pago
- [x] Notificaciones automáticas a Telegram
- [x] Análisis con Google Gemini (IA)
- [x] Estadísticas de rendimiento (público)
- [x] Página de Pricing con planes
- [x] Perfil de usuario con métricas de bankroll
- [x] Parlays (apuestas combinadas)
- [x] Tracking de picks (mensajes de seguimiento)
- [x] Múltiples tipos de pick (cuota_2, cuota_3, cuota_4, cuota_5)
- [x] Códigos promocionales de descuento

### Refactorización Profesional (Completada ahora)
- [x] Backend modular: server/ con config, db, middleware, services, routes
- [x] Frontend modular: src/lib/api.ts + src/hooks/useApi.ts
- [x] Documentación completa en español (línea a línea)
- [x] Arquitectura limpia: zero breaking changes en endpoints

---

## ✅ Pendientes Resueltos del Roadmap

| # | Tarea | Estado |
|---|---|---|
| 1 | Webhooks Mercado Pago | ✅ Mejorado con idempotencia y log en BD |
| 2 | Sistema de Emails | ✅ Implementado con Nodemailer (bienvenida + VIP) |
| 3 | Historial de Picks | ✅ Página /historial con Yield, HitRate y filtros |
| 4 | Mobile UI Polish | 🔄 Pendiente (sidebar colapsable admin) |

---

## 🔄 Próximos Pasos

1. **Descomponer AdminDashboard.tsx** (172KB → secciones separadas en src/pages/admin/sections/)
2. **Mobile Sidebar** en el AdminDashboard (menú hamburguesa)
3. **Enlace `/historial`** en la Navbar principal
4. **Recuperación de contraseña** (endpoint + formulario frontend)
5. **Mejorar la UI de HistorialPicks** con gráfico de evolución del bankroll

---

## ⚙️ Variables de Entorno

```bash
# Base de datos
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=betroyale

# Seguridad
JWT_SECRET=super-secret-key

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_FREE_CHANNEL_ID=
TELEGRAM_FREE_INVITE_LINK=

# Email (NUEVO - opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="BetRoyale Club <noreply@betroyale.club>"

# App
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
```
