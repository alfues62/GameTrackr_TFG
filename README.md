# GameTrackr

Aplicación web para **seguir, organizar y analizar tu biblioteca de videojuegos**: catálogo con datos de IGDB, sincronización automática con **Steam y PlayStation Network**, motor de recomendación, dashboard estadístico, autenticación social (Google / Steam) y una capa social (feed, listas, reseñas).

## Puesta en marcha

Requisito: Docker con Docker Compose.

git clone <url-del-repo>
cd GameTrackr_Web
cp .env.example .env

En `.env` tiene que haber al menos `SECRET_KEY`, `NEXTAUTH_SECRET` y las credenciales de **IGDB** (`IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET`, gratis en [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)). Sin ellas el catálogo de juegos queda vacío. `STEAM_API_KEY` y las de Google OAuth son opcionales: sin ellas, esos inicios de sesión concretos quedan deshabilitados, pero el resto de la aplicación funciona con normalidad.

docker compose up --build


El backend aplica las migraciones solo. En arranques posteriores basta con `docker compose up`.

Frontend -> http://localhost:3000
Backend -> http://localhost:8000
Admin de Django -> http://localhost:8000/admin/

## Desarrollo sin Docker

# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python manage.py migrate && python manage.py runserver

# Frontend
cd frontend && npm install && npm run dev

Se necesita Node.js 20+ y Python 3.12+, y un `frontend/.env.local` con `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3000` y `NEXT_PUBLIC_API_URL=http://localhost:8000`.