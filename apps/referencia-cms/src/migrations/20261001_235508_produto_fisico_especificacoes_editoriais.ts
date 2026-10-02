import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "produtos_fisicos_especificacoes_editoriais" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"valor" varchar NOT NULL
  );
  
  CREATE TABLE "_produtos_fisicos_v_version_especificacoes_editoriais" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"valor" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  ALTER TABLE "produtos_fisicos_especificacoes_editoriais" ADD CONSTRAINT "produtos_fisicos_especificacoes_editoriais_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."produtos_fisicos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_produtos_fisicos_v_version_especificacoes_editoriais" ADD CONSTRAINT "_produtos_fisicos_v_version_especificacoes_editoriais_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_produtos_fisicos_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "produtos_fisicos_especificacoes_editoriais_order_idx" ON "produtos_fisicos_especificacoes_editoriais" USING btree ("_order");
  CREATE INDEX "produtos_fisicos_especificacoes_editoriais_parent_id_idx" ON "produtos_fisicos_especificacoes_editoriais" USING btree ("_parent_id");
  CREATE INDEX "_produtos_fisicos_v_version_especificacoes_editoriais_order_idx" ON "_produtos_fisicos_v_version_especificacoes_editoriais" USING btree ("_order");
  CREATE INDEX "_produtos_fisicos_v_version_especificacoes_editoriais_parent_id_idx" ON "_produtos_fisicos_v_version_especificacoes_editoriais" USING btree ("_parent_id");`)
}

/** Destrutivo: remove as especificações editoriais novas; faça backup antes de rollback. */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "produtos_fisicos_especificacoes_editoriais" CASCADE;
  DROP TABLE "_produtos_fisicos_v_version_especificacoes_editoriais" CASCADE;`)
}
