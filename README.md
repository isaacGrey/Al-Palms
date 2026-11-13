# Al-Palms · Campus Student Management

Modern, compact campus-administration interface built with React and Vite. The frontend includes student records, admissions review, analytics, campuses, events, activity logs, and a staff directory.

## Repository layout

- `src/`, `index.html`, `package.json`: production React frontend deployed to Vercel.
- `server/`: existing Express/MySQL API. Host this separately on a Node server with persistent MySQL and storage.
- [Al-Palms-demo](https://github.com/isaacGrey/Al-Palms-demo): separate public portfolio demo with fabricated data and demo accounts. No demo credentials or demo seed data are loaded in production.

## Deploy frontend to Vercel

1. Import this repo and select the repository **root** as the project directory.
2. Framework: **Vite**; build: `npm run build`; output: `dist`.
3. Set `VITE_API_BASE_URL` to your deployed API origin (for example `https://api.your-domain.com`). Do **not** include the `/api` path.
4. Deploy. `vercel.json` rewrites direct visits to /dashboard, /students and other routes to the SPA, avoiding blank 404 screens.

## Run locally

```bash
npm install
cp .env.example .env
# Edit .env with your API URL
npm run dev
```

For the backend, run `cd server && npm install && npm start`. Provide database and JWT environment variables on your **server**, never via Vite (`VITE_` variables are public in a frontend build). Set `FRONTEND_ORIGINS` on the API to the comma-separated list of your Vercel production and preview origins you explicitly trust.

## Security notes

The old frontend was an unusable gitlink without a source URL; it was removed. The previously committed `server/.env` and `server/node_modules` were removed from the active branch. **Any credentials committed in earlier revisions remain in Git history and must be rotated/revoked.** Sensitive data also needs server-side authorization and access-control review before production use. Never use the portfolio demo for real student information.
