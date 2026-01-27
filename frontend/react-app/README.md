# Resto AI React Frontend

A React (Vite) SPA that consumes the Flask REST API (`/super-admin`, `/resto-admin`, `/client-api`). Uses Axios for HTTP.

## Quick start
```bash
cd frontend/react-app
npm install
npm run dev
```
Vite dev server runs on http://localhost:5173 with a proxy to the Flask API on http://localhost:5000 (see `vite.config.js`).

## API base
- Dev: proxy handles `/super-admin`, `/resto-admin`, `/client-api` to `http://localhost:5000`.
- Prod: set `VITE_API_BASE_URL` env before `npm run build` to point to your API host.

## Tabs
- Super Admin: creates restaurants (POST /super-admin/restaurants) and returns `restaurant_id` + `api_key`.
- Resto Admin: sets system instructions and uploads menus with `X-API-Key`.
- Client Chat: sends user queries to `/client-api/v1/chat` with `X-API-Key` or `X-Restaurant-Id`.

## Build
```bash
npm run build
npm run preview  # optional local preview
```
`dist/` contains the static assets; serve from any CDN/static host. Set `VITE_API_BASE_URL` for non-proxied deployments.
