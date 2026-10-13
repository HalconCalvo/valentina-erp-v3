#!/usr/bin/env bash
# Copies PRODUCTION data into the "Valentina Pruebas" database (docs/AMBIENTE_PRUEBAS.md).
# - Production is only read (pg_dump). Its URL lives outside the repo in ~/.pgurl_valentina.
# - The target is ~/.pgurl_valentina_pruebas (chmod 600): its database name must contain "pruebas" and it must not
#   be the production database. The target is wiped and replaced by the copy.
# - After restoring, the SMTP password is removed so Pruebas can never send email (the backend also runs in safe mode).
set -euo pipefail

PROD_FILE="${HOME}/.pgurl_valentina"
TEST_FILE="${HOME}/.pgurl_valentina_pruebas"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
DUMP_DIR="${HOME}/valentina_local/dumps"

for f in "${PROD_FILE}" "${TEST_FILE}"; do
  [[ -f "${f}" ]] || { echo "Falta ${f}." >&2; exit 1; }
done
PROD_URL="$(tr -d '[:space:]' < "${PROD_FILE}")"
TEST_URL="$(tr -d '[:space:]' < "${TEST_FILE}")"

db_name() { local u="${1%%\?*}"; echo "${u##*/}"; }
db_host() { local u="${1#*@}"; echo "${u%%[:/]*}"; }

if [[ "${TEST_URL}" == "${PROD_URL}" ]] || \
   [[ "$(db_host "${TEST_URL}")/$(db_name "${TEST_URL}")" == "$(db_host "${PROD_URL}")/$(db_name "${PROD_URL}")" ]]; then
  echo "ABORTADO: el destino es la base de PRODUCCIÓN." >&2
  exit 1
fi
case "${TEST_URL}" in
  postgres://*|postgresql://*) ;;
  *) echo "ABORTADO: ${TEST_FILE} no contiene una URL de PostgreSQL." >&2; exit 1 ;;
esac
case "$(db_name "${TEST_URL}")" in
  *pruebas*) ;;
  *) echo "ABORTADO: el nombre de la base destino debe contener 'pruebas'." >&2; exit 1 ;;
esac

echo "Destino: $(db_host "${TEST_URL}")/$(db_name "${TEST_URL}") (se reemplaza todo su contenido)."
read -r -p "Escribe PRUEBAS para continuar: " answer
[[ "${answer}" == "PRUEBAS" ]] || { echo "Cancelado."; exit 1; }

mkdir -p "${DUMP_DIR}"
DUMP="${DUMP_DIR}/prod_para_pruebas_$(date +%Y%m%d_%H%M).dump"
echo "1/3 Copia de producción (solo lectura) → ${DUMP}"
"${PG_BIN}/pg_dump" --format=custom --no-owner --no-privileges --dbname="${PROD_URL}" --file="${DUMP}"

echo "2/3 Restaurando en Pruebas"
"${PG_BIN}/pg_restore" --clean --if-exists --no-owner --no-privileges --dbname="${TEST_URL}" "${DUMP}"

echo "3/3 Sin correo: se borra la contraseña SMTP en Pruebas"
"${PG_BIN}/psql" "${TEST_URL}" -v ON_ERROR_STOP=1 -c "UPDATE global_config SET smtp_password = NULL;"

echo "Listo. Pruebas tiene la copia de producción del $(date '+%d/%m/%Y %H:%M')."
