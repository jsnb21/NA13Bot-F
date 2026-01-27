Frontend apps for the Resto AI project.

Structure:
- `frontend/react-app`: React (Vite) SPA that consumes the Flask REST APIs via Axios. This is the primary frontend and preferred deployment artifact.

Quick start (React dev):
```bash
cd frontend/react-app
npm install
npm run dev   # proxies API to http://localhost:5000
```
Set `VITE_API_BASE_URL` for production builds (`npm run build`).

Notes:
- Legacy static demo pages were removed in favor of the React SPA. If you still need a tiny embeddable widget, implement it in the React app or host a separate lightweight script from `frontend/react-app`.
- When serving the React app on a different origin, configure CORS on the Flask API or use a reverse-proxy for production.

Notes:
- The forms call the Flask endpoints at relative paths (`/super-admin`, `/resto-admin`, `/client-api`). When serving static files from a different origin, configure CORS on the Flask app or use a proxy in your dev server.
- The embed widget is a tiny JS file. Copy `frontend/client/embed/embed.js` to a CDN or the restaurant site and call `RestoEmbed.init(...)` with `apiKey` or `restaurantId`.
- For production, build a proper frontend with framework/tooling and host separately (CDN/S3/Netlify) and point it at the Flask API base.
