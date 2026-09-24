#!/bin/bash
# MinIO no próprio job (a API S3 do R2, sem credencial real). `docker run` e não `services:`
# porque o MinIO precisa do argumento `server /data`, que `services` não aceita.
set -euo pipefail
docker run -d --name minio -p 9000:9000 \
  -e MINIO_ROOT_USER="$MINIO_USUARIO" -e MINIO_ROOT_PASSWORD="$MINIO_SENHA" \
  quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
pronto=0
for i in $(seq 1 30); do curl -sf "$MINIO_ENDPOINT/minio/health/ready" && { pronto=1; break; }; sleep 1; done
if [ "$pronto" != 1 ]; then docker logs minio; exit 1; fi
docker exec minio mc alias set local http://127.0.0.1:9000 "$MINIO_USUARIO" "$MINIO_SENHA"
docker exec minio mc mb --ignore-existing "local/$R2_BUCKET"
docker exec minio mc anonymous set download "local/$R2_BUCKET"
