#!/usr/bin/env bash
# Actualiza SAHAD-UBV desde GitHub y reinicia el proceso PM2 "sahad".
# El .env no se toca. La base se respalda y se alinea al schema.prisma.
# Uso en el servidor de pruebas: /root/www/node/redesplegar-sahad.sh
set -euo pipefail
cd /root/www/node/schaah
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true

pnpm db:respaldo
git pull --ff-only
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec prisma db push
pnpm build
rm -rf dist/views dist/public
cp -r src/views src/public dist/
pm2 restart sahad --update-env
pm2 save
sleep 3
curl -fsS http://127.0.0.1:3000/health && echo
