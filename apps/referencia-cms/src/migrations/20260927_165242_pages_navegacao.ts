import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "navegacao_rotulo" varchar;
  ALTER TABLE "pages" ADD COLUMN "navegacao_cabecalho" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "navegacao_rodape" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "navegacao_ordem" numeric DEFAULT 100;
  ALTER TABLE "_pages_v" ADD COLUMN "version_navegacao_rotulo" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_navegacao_cabecalho" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_navegacao_rodape" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_navegacao_ordem" numeric DEFAULT 100;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "navegacao_rotulo";
  ALTER TABLE "pages" DROP COLUMN "navegacao_cabecalho";
  ALTER TABLE "pages" DROP COLUMN "navegacao_rodape";
  ALTER TABLE "pages" DROP COLUMN "navegacao_ordem";
  ALTER TABLE "_pages_v" DROP COLUMN "version_navegacao_rotulo";
  ALTER TABLE "_pages_v" DROP COLUMN "version_navegacao_cabecalho";
  ALTER TABLE "_pages_v" DROP COLUMN "version_navegacao_rodape";
  ALTER TABLE "_pages_v" DROP COLUMN "version_navegacao_ordem";`)
}
