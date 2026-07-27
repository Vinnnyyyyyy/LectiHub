# LectiHub backend migration: Express → Laravel 12

## Stack decision

| Layer | Framework |
|---|---|
| Frontend | **Vue 3** + Vite + Pinia + Vue Router (unchanged) |
| Backend (new) | **Laravel 12** + Sanctum + SQLite/MySQL |
| Backend (legacy) | Express in `LectiHub-server/` kept during cutover |

## New backend location

`LectiHub-api/` — Laravel 12 API.

Vue still calls `/api/...`. Vite proxies to Laravel on **port 8000**:

```bash
# Terminal A — Laravel
cd LectiHub-api
php artisan serve --port=8000

# Terminal B — Vue
npm run dev
```

To keep using Express temporarily:

```bash
VITE_API_PROXY_TARGET=http://localhost:3000 npm run dev
```

## Auth (done)

Compatible with the existing Vue auth store:

- `POST /api/auth/register` → student account + Sanctum token
- `POST /api/auth/login` → `{ token, role, username, fullName, mustChangePassword }`
- `GET /api/auth/me` (Bearer token)
- `POST /api/auth/logout`

Demo seeds:

| User | Password | Role |
|---|---|---|
| `admin` | `admin123` | admin |
| `teacher_ava` / `teacher_ben` / `teacher_cara` | `teacher123` | teacher |

```bash
cd LectiHub-api
php artisan migrate:fresh --seed
```

## Migration roadmap (modules still on Express)

Port these from `LectiHub-server/` into Laravel controllers/models/migrations:

1. **Users admin** — create teachers, list/delete users  
2. **Schedule requests** — student booking + admin assign  
3. **Classes / join / complete**  
4. **Availability**  
5. **Lesson reports + student feedback**  
6. **Notifications**  
7. **Calendar**  
8. **Chat**  
9. **Free trial + Dolibarr** (`DOLIBARR_*` env)  
10. **Payment receipts**  

Suggested order: Users → Schedule → Classes → Free trial/Dolibarr → Payments → Chat/Calendar.

## Env notes

Copy `LectiHub-api/.env.example` values. Add Dolibarr when porting trial/payments:

```env
DOLIBARR_ENABLED=false
DOLIBARR_MODE=api
DOLIBARR_API_URL=
DOLIBARR_API_KEY=
```

## Why not rewrite everything in one PR

The Express API is large (~4k+ lines of controllers). This PR establishes Laravel 12 + Vue 3 auth so the team can migrate feature-by-feature without blocking the frontend.
