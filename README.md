# LectiHub

Vue 3 frontend + **Laravel 12** API (new backend).

| Layer | Path | Stack |
|---|---|---|
| Frontend | `/` (`src/`) | Vue 3, Vite, Pinia, Vue Router |
| Backend (new) | `LectiHub-api/` | Laravel 12 + Sanctum + SQLite |
| Backend (legacy) | `LectiHub-server/` | Express — kept during migration |

See `LectiHub-api/README.md` for Laravel setup and the Express → Laravel cutover plan.

### Local development (Laravel + Vue)

```sh
# API
cd LectiHub-api
composer install
php artisan migrate:fresh --seed
php artisan serve --port=8000

# Frontend (separate terminal)
npm install
npm run dev
```

Open `http://localhost:5173` — Vite proxies `/api` to Laravel `:8000`.

Demo logins: `admin` / `admin123`, teachers `teacher_ava` / `teacher123`.

---

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
