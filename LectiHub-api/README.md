# LectiHub API (Laravel 12)

Vue 3 frontend stays in the repo root. This Laravel app replaces `LectiHub-server/` (Express).

## Run locally

```bash
# Terminal A — Laravel API (port 8000)
cd LectiHub-api
cp .env.example .env   # first time
composer install
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --port=8000

# Terminal B — Vue
npm install
npm run dev
```

Vite proxies `/api` → `http://localhost:8000`. To keep Express temporarily:

```bash
VITE_API_PROXY_TARGET=http://localhost:3000 npm run dev
```

### Windows / Composer zip error

Enable `extension=zip` (and `fileinfo`, `mbstring`, `openssl`, `pdo_sqlite`, `sqlite3`, `curl`) in `php.ini`, then confirm with `php -m | findstr zip`. WAMP is not required.

## Demo accounts

| User | Password | Role |
|---|---|---|
| `admin` | `admin123` | admin |
| `teacher_ava` / `teacher_ben` / `teacher_cara` | `teacher123` | teacher |
| Students | self-register | student |

## Ported modules (Vue contracts preserved)

| Module | Paths |
|---|---|
| Auth | `/api/auth/*` |
| Users | `/api/users` |
| Schedule | `/api/schedule-requests` |
| Availability | `/api/availability/*` |
| Classes | `/api/classes/*` |
| Lesson reports | `/api/lesson-reports`, `/api/classes/:id/report` |
| Student feedback | `/api/student-feedback`, `/api/lesson-reports/:id/feedback` |
| Notifications | `/api/notifications` |
| Chat | `/api/chat/*` |
| Calendar | `/api/calendar/*` |
| Admin monitoring | `/api/admin/monitoring` |
| Free trial + Dolibarr | `/api/trial-requests` |
| Payment receipts | `/api/payment-receipts` |

JSON responses stay **camelCase** to match Pinia stores.

## Env (see `.env.example`)

```env
DOLIBARR_ENABLED=false
DOLIBARR_MODE=log
DOLIBARR_API_URL=
DOLIBARR_API_KEY=
MEETING_PROVIDER=jitsi
MEETING_ALLOW_EARLY_JOIN=true
BOOKING_LEAD_DAYS=2
EMAIL_ENABLED=false
```

Legacy Express code remains in `LectiHub-server/` until cutover is confirmed.
