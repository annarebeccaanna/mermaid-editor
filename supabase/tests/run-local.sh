#!/usr/bin/env bash
# Führt die Datenbank-Tests gegen ein kurzlebiges Postgres in Docker aus.
# Benötigt Docker und das Image postgres:16. Es bleibt nichts zurück.
set -euo pipefail

cd "$(dirname "$0")/../.."
name="mmd-rls-test-$$"

docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test postgres:16 >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT

# Beim ersten Start fährt Postgres einmal hoch, init-t und startet neu: auf die zweite Bereitmeldung warten.
until [ "$(docker logs "$name" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ]; do sleep 0.5; done

run() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -q <"$1"; }

run supabase/tests/local_stub.sql
for m in supabase/migrations/*.sql; do run "$m"; done
run supabase/tests/permissions.test.sql
echo "Alle Datenbank-Tests bestanden."
