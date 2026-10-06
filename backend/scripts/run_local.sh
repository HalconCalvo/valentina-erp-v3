#!/usr/bin/env bash
# Runs the backend against the LOCAL copy of production (PostgreSQL 16 on port 5433).
# The connection lives outside the repo in ~/.pgurl_valentina_local (chmod 600).
# LOCAL_SAFE_MODE disables the scheduled backup, cloud uploads and emails.
set -euo pipefail

PGURL_FILE="${HOME}/.pgurl_valentina_local"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
PG_DATA="/opt/homebrew/var/postgresql@16"
PG_PORT=5433

if [[ ! -f "${PGURL_FILE}" ]]; then
  echo "No existe ${PGURL_FILE}. Debe contener la URL de la base local." >&2
  exit 1
fi

LOCAL_URL="$(tr -d '[:space:]' < "${PGURL_FILE}")"
case "${LOCAL_URL}" in
  *render.com*)
    echo "ABORTADO: ${PGURL_FILE} apunta a Render (producción)." >&2
    exit 1
    ;;
  *localhost:${PG_PORT}/*) ;;
  *)
    echo "ABORTADO: ${PGURL_FILE} no apunta a localhost:${PG_PORT}." >&2
    exit 1
    ;;
esac

if ! "${PG_BIN}/pg_isready" -h localhost -p "${PG_PORT}" > /dev/null; then
  echo "PostgreSQL 16 no responde en el puerto ${PG_PORT}. Enciéndelo con:" >&2
  echo "  ${PG_BIN}/pg_ctl -D ${PG_DATA} -o \"-p ${PG_PORT}\" -l ~/valentina_local/pg16.log start" >&2
  exit 1
fi

export DATABASE_URL="${LOCAL_URL}"
export LOCAL_SAFE_MODE=true
export GOOGLE_APPLICATION_CREDENTIALS=""

cd "$(dirname "$0")/.."
echo "Backend LOCAL → localhost:${PG_PORT} (LOCAL_SAFE_MODE=true). Frontend:"
echo "  cd ../frontend && VITE_API_URL=http://localhost:8000/api/v1 npm run dev"
exec python3 -m uvicorn app.main:app --reload --port 8000
