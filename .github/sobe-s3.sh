#!/bin/bash
# O S3 do CI (a API do R2, sem credencial real): RustFS, porque o MinIO fechou a
# distribuição gratuita e a imagem pública passou a pedir login. As variáveis continuam
# MINIO_* para os testes não mudarem. O bucket sai pelo `aws` do próprio runner.
set -euo pipefail
docker run -d --name s3 -p 9000:9000 \
  -e RUSTFS_ACCESS_KEY="$MINIO_USUARIO" -e RUSTFS_SECRET_KEY="$MINIO_SENHA" \
  rustfs/rustfs:1.0.0
pronto=0
for i in $(seq 1 30); do curl -sf "$MINIO_ENDPOINT/minio/health/ready" && { pronto=1; break; }; sleep 1; done
if [ "$pronto" != 1 ]; then docker logs s3; exit 1; fi
export AWS_ACCESS_KEY_ID="$MINIO_USUARIO" AWS_SECRET_ACCESS_KEY="$MINIO_SENHA" AWS_DEFAULT_REGION=us-east-1
aws configure set default.s3.addressing_style path
aws --endpoint-url "$MINIO_ENDPOINT" s3api create-bucket --bucket "$R2_BUCKET"
aws --endpoint-url "$MINIO_ENDPOINT" s3api put-bucket-policy --bucket "$R2_BUCKET" \
  --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::$R2_BUCKET/*\"]}]}"
