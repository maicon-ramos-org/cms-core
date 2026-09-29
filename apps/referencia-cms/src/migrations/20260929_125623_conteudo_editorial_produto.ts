import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_produtos_fisicos_editorial_status" AS ENUM('sem_conteudo', 'rascunho', 'em_revisao', 'aprovado');
  CREATE TYPE "public"."enum__produtos_fisicos_v_version_editorial_status" AS ENUM('sem_conteudo', 'rascunho', 'em_revisao', 'aprovado');
  ALTER TABLE "produtos_fisicos" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "resumo" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "descricao_markdown" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "destaques" jsonb;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "faq" jsonb;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "facts_hash" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "content_generator" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "prompt_version" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "content_version" numeric;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "editorial_status" "enum_produtos_fisicos_editorial_status" DEFAULT 'sem_conteudo' NOT NULL;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "editorial_refresh_em" timestamp(3) with time zone;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "editorial_refresh_motivo" varchar;
  ALTER TABLE "produtos_fisicos" ADD COLUMN "indexavel" boolean DEFAULT false;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_meta_title" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_meta_description" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_resumo" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_descricao_markdown" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_destaques" jsonb;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_faq" jsonb;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_facts_hash" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_content_generator" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_prompt_version" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_content_version" numeric;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_editorial_status" "enum__produtos_fisicos_v_version_editorial_status" DEFAULT 'sem_conteudo' NOT NULL;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_editorial_refresh_em" timestamp(3) with time zone;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_editorial_refresh_motivo" varchar;
  ALTER TABLE "_produtos_fisicos_v" ADD COLUMN "version_indexavel" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "produtos_fisicos" DROP COLUMN "meta_title";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "meta_description";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "resumo";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "descricao_markdown";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "destaques";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "faq";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "facts_hash";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "content_generator";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "prompt_version";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "content_version";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "editorial_status";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "editorial_refresh_em";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "editorial_refresh_motivo";
  ALTER TABLE "produtos_fisicos" DROP COLUMN "indexavel";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_meta_description";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_resumo";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_descricao_markdown";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_destaques";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_faq";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_facts_hash";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_content_generator";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_prompt_version";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_content_version";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_editorial_status";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_editorial_refresh_em";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_editorial_refresh_motivo";
  ALTER TABLE "_produtos_fisicos_v" DROP COLUMN "version_indexavel";
  DROP TYPE "public"."enum_produtos_fisicos_editorial_status";
  DROP TYPE "public"."enum__produtos_fisicos_v_version_editorial_status";`)
}
