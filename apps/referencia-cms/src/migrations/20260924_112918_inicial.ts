import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_programas_ativos_programa" AS ENUM('hostinger', 'cloudways', 'amazon', 'shopee', 'awin', 'impact', 'mercadolivre', 'hotmart', 'direto', 'outro');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('super-admin', 'agente', 'editor', 'ingestao', 'sistema');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_pages_template" AS ENUM('conteudo', 'institucional', 'contato', 'indice');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_template" AS ENUM('conteudo', 'institucional', 'contato', 'indice');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_links_gerados_fonte_ancora" AS ENUM('curada', 'derivada');
  CREATE TYPE "public"."enum_queries_log_origem" AS ENUM('chat', 'mcp', 'webmcp', 'busca');
  CREATE TYPE "public"."enum_lojas_programa" AS ENUM('hostinger', 'cloudways', 'amazon', 'shopee', 'awin', 'impact', 'mercadolivre', 'hotmart', 'direto', 'outro');
  CREATE TYPE "public"."enum_cupons_desconto_tipo" AS ENUM('percentual', 'valor', 'frete', 'outro');
  CREATE TYPE "public"."enum_cupons_aplica_sobre" AS ENUM('preco_cheio', 'preco_ja_descontado', 'desconhecido');
  CREATE TYPE "public"."enum_cupons_estado" AS ENUM('pendente', 'publicado', 'expirando', 'expirado', 'revisao');
  CREATE TYPE "public"."enum_cupons_origem" AS ENUM('importado', 'agente', 'manual');
  CREATE TYPE "public"."enum_cupons_metodo" AS ENUM('corroboracao', 'api', 'manual');
  CREATE TYPE "public"."enum_cupons_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__cupons_v_version_desconto_tipo" AS ENUM('percentual', 'valor', 'frete', 'outro');
  CREATE TYPE "public"."enum__cupons_v_version_aplica_sobre" AS ENUM('preco_cheio', 'preco_ja_descontado', 'desconhecido');
  CREATE TYPE "public"."enum__cupons_v_version_estado" AS ENUM('pendente', 'publicado', 'expirando', 'expirado', 'revisao');
  CREATE TYPE "public"."enum__cupons_v_version_origem" AS ENUM('importado', 'agente', 'manual');
  CREATE TYPE "public"."enum__cupons_v_version_metodo" AS ENUM('corroboracao', 'api', 'manual');
  CREATE TYPE "public"."enum__cupons_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_ofertas_tipo" AS ENUM('cupom', 'credito', 'lifetime', 'desconto_api');
  CREATE TYPE "public"."enum_ofertas_preco_ciclo" AS ENUM('unico', 'mensal', 'anual');
  CREATE TYPE "public"."enum_ofertas_desconto_loja_tipo" AS ENUM('percentual', 'valor');
  CREATE TYPE "public"."enum_ofertas_desconto_loja_fonte" AS ENUM('site-loja', 'programa', 'manual');
  CREATE TYPE "public"."enum_ofertas_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__ofertas_v_version_tipo" AS ENUM('cupom', 'credito', 'lifetime', 'desconto_api');
  CREATE TYPE "public"."enum__ofertas_v_version_preco_ciclo" AS ENUM('unico', 'mensal', 'anual');
  CREATE TYPE "public"."enum__ofertas_v_version_desconto_loja_tipo" AS ENUM('percentual', 'valor');
  CREATE TYPE "public"."enum__ofertas_v_version_desconto_loja_fonte" AS ENUM('site-loja', 'programa', 'manual');
  CREATE TYPE "public"."enum__ofertas_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_produtos_fonte_coleta" AS ENUM('grupo', 'api', 'radar', 'manual');
  CREATE TYPE "public"."enum_produtos_estado" AS ENUM('rascunho', 'landing', 'indexavel', 'encerrado');
  CREATE TYPE "public"."enum_produtos_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__produtos_v_version_fonte_coleta" AS ENUM('grupo', 'api', 'radar', 'manual');
  CREATE TYPE "public"."enum__produtos_v_version_estado" AS ENUM('rascunho', 'landing', 'indexavel', 'encerrado');
  CREATE TYPE "public"."enum__produtos_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_banners_posicao" AS ENUM('home_topo');
  CREATE TYPE "public"."enum_cliques_tipo_doc" AS ENUM('cupom', 'oferta', 'produto');
  CREATE TYPE "public"."enum_cliques_ref" AS ENUM('pagina', 'chat', 'mcp', 'grupo-wa', 'grupo-tg', 'outro');
  CREATE TYPE "public"."enum_cliques_user_agent_class" AS ENUM('humano', 'bot', 'agente-ia');
  CREATE TYPE "public"."enum_historico_desconto_fonte" AS ENUM('snapshot-diario', 'import', 'manual');
  CREATE TYPE "public"."enum_categorias_oferta_navegacao" AS ENUM('nao_curada', 'canonica', 'sinonimo', 'oculta');
  CREATE TYPE "public"."enum_produtos_fisicos_categoria" AS ENUM('filamento', 'impressora', 'resina', 'acessorio');
  CREATE TYPE "public"."enum_produtos_fisicos_estado" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__produtos_fisicos_v_version_categoria" AS ENUM('filamento', 'impressora', 'resina', 'acessorio');
  CREATE TYPE "public"."enum__produtos_fisicos_v_version_estado" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum_variantes_produto_estado" AS ENUM('incerta', 'confirmada');
  CREATE TYPE "public"."enum_ofertas_produto_disponibilidade" AS ENUM('disponivel', 'indisponivel', 'desconhecida');
  CREATE TYPE "public"."enum_ofertas_produto_estado" AS ENUM('draft', 'ativa', 'encerrada');
  CREATE TYPE "public"."enum_historico_preco_oferta_disponibilidade" AS ENUM('disponivel', 'indisponivel', 'desconhecida');
  CREATE TYPE "public"."enum_vinculos_catalogo_metodo" AS ENUM('gtin', 'sku', 'url', 'atributos', 'humano');
  CREATE TYPE "public"."enum_vinculos_catalogo_decisao" AS ENUM('pendente', 'confirmado', 'rejeitado');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'snapshotDesconto');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'snapshotDesconto');
  CREATE TABLE "tenants_programas_ativos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"programa" "enum_tenants_programas_ativos_programa" NOT NULL,
  	"id_afiliado_env" varchar NOT NULL
  );
  
  CREATE TABLE "tenants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"nome" varchar NOT NULL,
  	"nicho" varchar,
  	"canonical_host" varchar NOT NULL,
  	"tema_cor_primaria" varchar DEFAULT '#6F57D3' NOT NULL,
  	"tema_cor_sobre_marca" varchar DEFAULT '#ffffff',
  	"tema_cor_fundo" varchar DEFAULT '#ffffff' NOT NULL,
  	"tema_cor_acao" varchar DEFAULT '#07C03B',
  	"tema_cor_sobre_acao" varchar DEFAULT '#04240b',
  	"tema_cor_desconto" varchar DEFAULT '#AC0167',
  	"tema_cor_verificado" varchar DEFAULT '#0a7a2c',
  	"tema_cor_texto" varchar DEFAULT '#242424',
  	"tema_cor_apoio" varchar DEFAULT '#6b6b6b',
  	"tema_cor_sutil" varchar DEFAULT '#746a90',
  	"tema_cor_superficie" varchar DEFAULT '#ffffff',
  	"tema_cor_superficie_marca" varchar DEFAULT '#faf9ff',
  	"tema_cor_superficie_verificado" varchar DEFAULT '#f4fdf7',
  	"tema_cor_borda" varchar DEFAULT '#e7e4f0',
  	"tema_cor_borda_codigo" varchar DEFAULT '#cbbff0',
  	"tema_cor_superficie_expirado" varchar DEFAULT '#f4f6f9',
  	"tema_cor_aviso" varchar DEFAULT '#9a5b08',
  	"tema_logo_id" integer,
  	"tema_favicon_id" integer,
  	"tema_icones_svg_id" integer,
  	"tema_icones_ico_id" integer,
  	"tema_icones_apple_id" integer,
  	"tema_icones_png192_id" integer,
  	"tema_icones_png512_id" integer,
  	"tema_fonte_titulos" varchar DEFAULT 'Lexend Deca',
  	"tema_fonte_corpo" varchar DEFAULT 'Open Sans',
  	"tema_escuro_ativo" boolean DEFAULT true,
  	"tema_escuro_cor_primaria" varchar DEFAULT '#B5A5F5',
  	"tema_escuro_cor_sobre_marca" varchar DEFAULT '#17132A',
  	"tema_escuro_cor_fundo" varchar DEFAULT '#121019',
  	"tema_escuro_cor_acao" varchar DEFAULT '#22C55E',
  	"tema_escuro_cor_sobre_acao" varchar DEFAULT '#062B12',
  	"tema_escuro_cor_desconto" varchar DEFAULT '#FF6FB1',
  	"tema_escuro_cor_verificado" varchar DEFAULT '#4ADE80',
  	"tema_escuro_cor_texto" varchar DEFAULT '#ECE9F5',
  	"tema_escuro_cor_apoio" varchar DEFAULT '#A9A2BD',
  	"tema_escuro_cor_sutil" varchar DEFAULT '#948DB0',
  	"tema_escuro_cor_superficie" varchar DEFAULT '#1B1826',
  	"tema_escuro_cor_superficie_marca" varchar DEFAULT '#221E33',
  	"tema_escuro_cor_superficie_verificado" varchar DEFAULT '#10261A',
  	"tema_escuro_cor_borda" varchar DEFAULT '#2E2A42',
  	"tema_escuro_cor_borda_codigo" varchar DEFAULT '#4A3F78',
  	"tema_escuro_cor_superficie_expirado" varchar DEFAULT '#191725',
  	"tema_escuro_cor_aviso" varchar DEFAULT '#F0B45E',
  	"tema_escuro_logo_id" integer,
  	"webmcp_polyfill" boolean DEFAULT false,
  	"autolinker_max_links_pagina" numeric DEFAULT 5 NOT NULL,
  	"seo_gsc_property" varchar,
  	"seo_sitemap_enabled" boolean DEFAULT true,
  	"seo_title_pattern_loja" varchar DEFAULT '{n} Cupons {loja} Testados em {mes} {ano}' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tenants_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "tenants_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tenants_id" integer
  );
  
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_tenants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "posts_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"pergunta" varchar,
  	"resposta" varchar
  );
  
  CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"titulo" varchar,
  	"slug" varchar,
  	"corpo" jsonb,
  	"categoria_id" integer,
  	"autor_id" integer,
  	"capa_id" integer,
  	"schema_extra" jsonb,
  	"publicado_em" timestamp(3) with time zone,
  	"atualizado_em" timestamp(3) with time zone,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "posts_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "_posts_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"pergunta" varchar,
  	"resposta" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_titulo" varchar,
  	"version_slug" varchar,
  	"version_corpo" jsonb,
  	"version_categoria_id" integer,
  	"version_autor_id" integer,
  	"version_capa_id" integer,
  	"version_schema_extra" jsonb,
  	"version_publicado_em" timestamp(3) with time zone,
  	"version_atualizado_em" timestamp(3) with time zone,
  	"version_wordpress_id" varchar,
  	"version_slug_wp" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_posts_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"titulo" varchar,
  	"slug" varchar,
  	"template" "enum_pages_template" DEFAULT 'conteudo',
  	"corpo" jsonb,
  	"dados" jsonb,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"origem" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "pages_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_titulo" varchar,
  	"version_slug" varchar,
  	"version_template" "enum__pages_v_version_template" DEFAULT 'conteudo',
  	"version_corpo" jsonb,
  	"version_dados" jsonb,
  	"version_wordpress_id" varchar,
  	"version_slug_wp" varchar,
  	"version_origem" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_pages_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "mensagens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"mensagem" varchar NOT NULL,
  	"origem_url" varchar,
  	"lida" boolean DEFAULT false,
  	"user_agent" varchar,
  	"ip_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "midia" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"alt" varchar NOT NULL,
  	"credit" varchar,
  	"wp_url_antiga" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_cartao_url" varchar,
  	"sizes_cartao_width" numeric,
  	"sizes_cartao_height" numeric,
  	"sizes_cartao_mime_type" varchar,
  	"sizes_cartao_filesize" numeric,
  	"sizes_cartao_filename" varchar,
  	"sizes_capa_url" varchar,
  	"sizes_capa_width" numeric,
  	"sizes_capa_height" numeric,
  	"sizes_capa_mime_type" varchar,
  	"sizes_capa_filesize" numeric,
  	"sizes_capa_filename" varchar,
  	"sizes_og_url" varchar,
  	"sizes_og_width" numeric,
  	"sizes_og_height" numeric,
  	"sizes_og_mime_type" varchar,
  	"sizes_og_filesize" numeric,
  	"sizes_og_filename" varchar
  );
  
  CREATE TABLE "categorias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"descricao_seo" varchar,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "autores" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"bio" varchar,
  	"avatar_id" integer,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "autores_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "link_rules" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"prioridade" numeric DEFAULT 0,
  	"ativo" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "link_rules_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "link_rules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer,
  	"pages_id" integer,
  	"lojas_id" integer,
  	"ofertas_id" integer,
  	"produtos_id" integer
  );
  
  CREATE TABLE "links_gerados" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"origem_url" varchar NOT NULL,
  	"ancora" varchar NOT NULL,
  	"fonte_ancora" "enum_links_gerados_fonte_ancora" DEFAULT 'curada' NOT NULL,
  	"run_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "links_gerados_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer,
  	"pages_id" integer,
  	"lojas_id" integer,
  	"ofertas_id" integer,
  	"produtos_id" integer
  );
  
  CREATE TABLE "queries_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"origem" "enum_queries_log_origem" NOT NULL,
  	"texto" varchar NOT NULL,
  	"tools" jsonb,
  	"achou" boolean DEFAULT false NOT NULL,
  	"latencia_ms" numeric,
  	"custo_usd" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lojas_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"pergunta" varchar NOT NULL,
  	"resposta" varchar NOT NULL
  );
  
  CREATE TABLE "lojas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"logo_id" integer,
  	"url_site" varchar NOT NULL,
  	"programa" "enum_lojas_programa" NOT NULL,
  	"descricao" jsonb,
  	"watch_url" varchar,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lojas_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cupons_fontes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"origem" varchar,
  	"ts" timestamp(3) with time zone
  );
  
  CREATE TABLE "cupons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"loja_id" integer,
  	"codigo" varchar,
  	"desconto_tipo" "enum_cupons_desconto_tipo",
  	"desconto_valor" numeric,
  	"aplica_sobre" "enum_cupons_aplica_sobre" DEFAULT 'desconhecido',
  	"condicoes" varchar,
  	"validade" timestamp(3) with time zone,
  	"estado" "enum_cupons_estado" DEFAULT 'pendente',
  	"fontes_count" numeric DEFAULT 1,
  	"origem" "enum_cupons_origem" DEFAULT 'manual',
  	"verificado_em" timestamp(3) with time zone,
  	"metodo" "enum_cupons_metodo",
  	"taxa_sucesso" numeric,
  	"url_afiliado_fonte" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_cupons_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_cupons_v_version_fontes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"origem" varchar,
  	"ts" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_cupons_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_loja_id" integer,
  	"version_codigo" varchar,
  	"version_desconto_tipo" "enum__cupons_v_version_desconto_tipo",
  	"version_desconto_valor" numeric,
  	"version_aplica_sobre" "enum__cupons_v_version_aplica_sobre" DEFAULT 'desconhecido',
  	"version_condicoes" varchar,
  	"version_validade" timestamp(3) with time zone,
  	"version_estado" "enum__cupons_v_version_estado" DEFAULT 'pendente',
  	"version_fontes_count" numeric DEFAULT 1,
  	"version_origem" "enum__cupons_v_version_origem" DEFAULT 'manual',
  	"version_verificado_em" timestamp(3) with time zone,
  	"version_metodo" "enum__cupons_v_version_metodo",
  	"version_taxa_sucesso" numeric,
  	"version_url_afiliado_fonte" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__cupons_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "ofertas_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"pergunta" varchar,
  	"resposta" varchar
  );
  
  CREATE TABLE "ofertas_beneficios" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"texto" varchar
  );
  
  CREATE TABLE "ofertas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"loja_id" integer,
  	"titulo" varchar,
  	"slug" varchar,
  	"tipo" "enum_ofertas_tipo",
  	"preco_valor" numeric,
  	"preco_moeda" varchar DEFAULT 'BRL',
  	"preco_ciclo" "enum_ofertas_preco_ciclo",
  	"preco_preco_em" timestamp(3) with time zone,
  	"desconto_loja_valor" numeric,
  	"desconto_loja_tipo" "enum_ofertas_desconto_loja_tipo" DEFAULT 'percentual',
  	"desconto_loja_moeda" varchar DEFAULT 'BRL',
  	"desconto_loja_verificado_em" timestamp(3) with time zone,
  	"desconto_loja_fonte" "enum_ofertas_desconto_loja_fonte",
  	"cupom_id" integer,
  	"url_afiliado_fonte" varchar,
  	"corpo" jsonb,
  	"imagem_id" integer,
  	"headline" varchar,
  	"rotulo_oferta" varchar,
  	"resumo" varchar,
  	"dados" jsonb,
  	"destaque" boolean DEFAULT false,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"origem" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_ofertas_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "ofertas_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ofertas_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categorias_oferta_id" integer
  );
  
  CREATE TABLE "_ofertas_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"pergunta" varchar,
  	"resposta" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_ofertas_v_version_beneficios" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"texto" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_ofertas_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_loja_id" integer,
  	"version_titulo" varchar,
  	"version_slug" varchar,
  	"version_tipo" "enum__ofertas_v_version_tipo",
  	"version_preco_valor" numeric,
  	"version_preco_moeda" varchar DEFAULT 'BRL',
  	"version_preco_ciclo" "enum__ofertas_v_version_preco_ciclo",
  	"version_preco_preco_em" timestamp(3) with time zone,
  	"version_desconto_loja_valor" numeric,
  	"version_desconto_loja_tipo" "enum__ofertas_v_version_desconto_loja_tipo" DEFAULT 'percentual',
  	"version_desconto_loja_moeda" varchar DEFAULT 'BRL',
  	"version_desconto_loja_verificado_em" timestamp(3) with time zone,
  	"version_desconto_loja_fonte" "enum__ofertas_v_version_desconto_loja_fonte",
  	"version_cupom_id" integer,
  	"version_url_afiliado_fonte" varchar,
  	"version_corpo" jsonb,
  	"version_imagem_id" integer,
  	"version_headline" varchar,
  	"version_rotulo_oferta" varchar,
  	"version_resumo" varchar,
  	"version_dados" jsonb,
  	"version_destaque" boolean DEFAULT false,
  	"version_wordpress_id" varchar,
  	"version_slug_wp" varchar,
  	"version_origem" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__ofertas_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_ofertas_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_ofertas_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categorias_oferta_id" integer
  );
  
  CREATE TABLE "produtos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"titulo" varchar,
  	"slug" varchar,
  	"loja_id" integer,
  	"imagem_id" integer,
  	"preco" numeric,
  	"preco_em" timestamp(3) with time zone,
  	"cupom_id" integer,
  	"url_afiliado_fonte" varchar,
  	"fonte_coleta" "enum_produtos_fonte_coleta",
  	"estado" "enum_produtos_estado" DEFAULT 'rascunho',
  	"indexavel" boolean DEFAULT false,
  	"kgr_allintitle" numeric,
  	"gate_antithin_alternativas" boolean DEFAULT false,
  	"gate_antithin_faq" boolean DEFAULT false,
  	"gate_antithin_editorial" boolean DEFAULT false,
  	"gsc_impressoes_90d" numeric,
  	"gsc_cliques_90d" numeric,
  	"origem" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_produtos_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "produtos_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_produtos_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_titulo" varchar,
  	"version_slug" varchar,
  	"version_loja_id" integer,
  	"version_imagem_id" integer,
  	"version_preco" numeric,
  	"version_preco_em" timestamp(3) with time zone,
  	"version_cupom_id" integer,
  	"version_url_afiliado_fonte" varchar,
  	"version_fonte_coleta" "enum__produtos_v_version_fonte_coleta",
  	"version_estado" "enum__produtos_v_version_estado" DEFAULT 'rascunho',
  	"version_indexavel" boolean DEFAULT false,
  	"version_kgr_allintitle" numeric,
  	"version_gate_antithin_alternativas" boolean DEFAULT false,
  	"version_gate_antithin_faq" boolean DEFAULT false,
  	"version_gate_antithin_editorial" boolean DEFAULT false,
  	"version_gsc_impressoes_90d" numeric,
  	"version_gsc_cliques_90d" numeric,
  	"version_origem" varchar,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__produtos_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_produtos_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "banners" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"imagem_id" integer NOT NULL,
  	"imagem_mobile_id" integer,
  	"oferta_id" integer NOT NULL,
  	"posicao" "enum_banners_posicao" DEFAULT 'home_topo' NOT NULL,
  	"ativo" boolean DEFAULT true,
  	"inicia_em" timestamp(3) with time zone,
  	"termina_em" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cliques" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"tipo_doc" "enum_cliques_tipo_doc" NOT NULL,
  	"doc_id" varchar NOT NULL,
  	"loja_id" integer,
  	"programa" varchar,
  	"ref" "enum_cliques_ref" DEFAULT 'pagina' NOT NULL,
  	"user_agent_class" "enum_cliques_user_agent_class",
  	"ip_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "historico_desconto" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"oferta_id" integer NOT NULL,
  	"data" timestamp(3) with time zone NOT NULL,
  	"desconto_pct" numeric NOT NULL,
  	"preco" numeric,
  	"cupom_codigo" varchar,
  	"fonte" "enum_historico_desconto_fonte" DEFAULT 'snapshot-diario' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categorias_oferta" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"pai_id" integer,
  	"descricao" jsonb,
  	"navegacao" "enum_categorias_oferta_navegacao" DEFAULT 'nao_curada' NOT NULL,
  	"equivalente_a_id" integer,
  	"ordem_chip" numeric,
  	"wordpress_id" varchar,
  	"slug_wp" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "produtos_fisicos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"marca" varchar NOT NULL,
  	"modelo" varchar NOT NULL,
  	"categoria" "enum_produtos_fisicos_categoria" NOT NULL,
  	"descricao" varchar,
  	"imagem_id" integer,
  	"gtin" varchar,
  	"mpn" varchar,
  	"especificacoes" jsonb,
  	"estado" "enum_produtos_fisicos_estado" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_produtos_fisicos_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer NOT NULL,
  	"version_nome" varchar NOT NULL,
  	"version_slug" varchar NOT NULL,
  	"version_marca" varchar NOT NULL,
  	"version_modelo" varchar NOT NULL,
  	"version_categoria" "enum__produtos_fisicos_v_version_categoria" NOT NULL,
  	"version_descricao" varchar,
  	"version_imagem_id" integer,
  	"version_gtin" varchar,
  	"version_mpn" varchar,
  	"version_especificacoes" jsonb,
  	"version_estado" "enum__produtos_fisicos_v_version_estado" DEFAULT 'draft' NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "variantes_produto" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"produto_id" integer NOT NULL,
  	"nome" varchar NOT NULL,
  	"sku_fabricante" varchar,
  	"gtin" varchar,
  	"material" varchar,
  	"cor" varchar,
  	"peso_g" numeric,
  	"diametro_mm" numeric,
  	"acabamento" varchar,
  	"especificacoes" jsonb,
  	"imagem_id" integer,
  	"estado" "enum_variantes_produto_estado" DEFAULT 'incerta' NOT NULL,
  	"chave_normalizada" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ofertas_produto" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"variante_id" integer NOT NULL,
  	"loja_id" integer NOT NULL,
  	"seller_normalizado" varchar,
  	"external_listing_id" varchar,
  	"url_origem" varchar NOT NULL,
  	"url_afiliado" varchar,
  	"url_canonica" varchar,
  	"chave_listing" varchar,
  	"url_redirect" varchar,
  	"preco" numeric NOT NULL,
  	"frete" numeric,
  	"disponibilidade" "enum_ofertas_produto_disponibilidade" DEFAULT 'desconhecida' NOT NULL,
  	"estado" "enum_ofertas_produto_estado" DEFAULT 'draft' NOT NULL,
  	"fonte" varchar NOT NULL,
  	"observado_em" timestamp(3) with time zone NOT NULL,
  	"validade" timestamp(3) with time zone,
  	"confianca" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "historico_preco_oferta" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"oferta_id" integer NOT NULL,
  	"preco" numeric NOT NULL,
  	"frete" numeric,
  	"disponibilidade" "enum_historico_preco_oferta_disponibilidade" NOT NULL,
  	"fonte" varchar NOT NULL,
  	"observado_em" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "vinculos_catalogo" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"entrada" varchar NOT NULL,
  	"variante_id" integer NOT NULL,
  	"oferta_id" integer,
  	"metodo" "enum_vinculos_catalogo_metodo" NOT NULL,
  	"score" numeric NOT NULL,
  	"evidencia" jsonb NOT NULL,
  	"decisao" "enum_vinculos_catalogo_decisao" DEFAULT 'pendente' NOT NULL,
  	"observado_em" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "elegibilidade_cupom" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"cupom_id" integer NOT NULL,
  	"oferta_id" integer NOT NULL,
  	"minimo_pedido" numeric,
  	"inicio" timestamp(3) with time zone,
  	"fim" timestamp(3) with time zone,
  	"verificado_em" timestamp(3) with time zone NOT NULL,
  	"fonte" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tenants_id" integer,
  	"users_id" integer,
  	"posts_id" integer,
  	"pages_id" integer,
  	"mensagens_id" integer,
  	"midia_id" integer,
  	"categorias_id" integer,
  	"tags_id" integer,
  	"autores_id" integer,
  	"link_rules_id" integer,
  	"links_gerados_id" integer,
  	"queries_log_id" integer,
  	"lojas_id" integer,
  	"cupons_id" integer,
  	"ofertas_id" integer,
  	"produtos_id" integer,
  	"banners_id" integer,
  	"cliques_id" integer,
  	"historico_desconto_id" integer,
  	"categorias_oferta_id" integer,
  	"produtos_fisicos_id" integer,
  	"variantes_produto_id" integer,
  	"ofertas_produto_id" integer,
  	"historico_preco_oferta_id" integer,
  	"vinculos_catalogo_id" integer,
  	"elegibilidade_cupom_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants_programas_ativos" ADD CONSTRAINT "tenants_programas_ativos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_logo_id_midia_id_fk" FOREIGN KEY ("tema_logo_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_favicon_id_midia_id_fk" FOREIGN KEY ("tema_favicon_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_icones_svg_id_midia_id_fk" FOREIGN KEY ("tema_icones_svg_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_icones_ico_id_midia_id_fk" FOREIGN KEY ("tema_icones_ico_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_icones_apple_id_midia_id_fk" FOREIGN KEY ("tema_icones_apple_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_icones_png192_id_midia_id_fk" FOREIGN KEY ("tema_icones_png192_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_icones_png512_id_midia_id_fk" FOREIGN KEY ("tema_icones_png512_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_tema_escuro_logo_id_midia_id_fk" FOREIGN KEY ("tema_escuro_logo_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants_texts" ADD CONSTRAINT "tenants_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_rels" ADD CONSTRAINT "tenants_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tenants_rels" ADD CONSTRAINT "tenants_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_faq" ADD CONSTRAINT "posts_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_autor_id_autores_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."autores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_capa_id_midia_id_fk" FOREIGN KEY ("capa_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_texts" ADD CONSTRAINT "posts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_faq" ADD CONSTRAINT "_posts_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_categoria_id_categorias_id_fk" FOREIGN KEY ("version_categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_autor_id_autores_id_fk" FOREIGN KEY ("version_autor_id") REFERENCES "public"."autores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_capa_id_midia_id_fk" FOREIGN KEY ("version_capa_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_meta_image_id_midia_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_texts" ADD CONSTRAINT "_posts_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_texts" ADD CONSTRAINT "pages_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_meta_image_id_midia_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_texts" ADD CONSTRAINT "_pages_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "midia" ADD CONSTRAINT "midia_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categorias" ADD CONSTRAINT "categorias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categorias" ADD CONSTRAINT "categorias_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "autores" ADD CONSTRAINT "autores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "autores" ADD CONSTRAINT "autores_avatar_id_midia_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "autores_texts" ADD CONSTRAINT "autores_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."autores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules" ADD CONSTRAINT "link_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "link_rules_texts" ADD CONSTRAINT "link_rules_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."link_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules_rels" ADD CONSTRAINT "link_rules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."link_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules_rels" ADD CONSTRAINT "link_rules_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules_rels" ADD CONSTRAINT "link_rules_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules_rels" ADD CONSTRAINT "link_rules_rels_lojas_fk" FOREIGN KEY ("lojas_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules_rels" ADD CONSTRAINT "link_rules_rels_ofertas_fk" FOREIGN KEY ("ofertas_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "link_rules_rels" ADD CONSTRAINT "link_rules_rels_produtos_fk" FOREIGN KEY ("produtos_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_gerados" ADD CONSTRAINT "links_gerados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "links_gerados_rels" ADD CONSTRAINT "links_gerados_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."links_gerados"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_gerados_rels" ADD CONSTRAINT "links_gerados_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_gerados_rels" ADD CONSTRAINT "links_gerados_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_gerados_rels" ADD CONSTRAINT "links_gerados_rels_lojas_fk" FOREIGN KEY ("lojas_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_gerados_rels" ADD CONSTRAINT "links_gerados_rels_ofertas_fk" FOREIGN KEY ("ofertas_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_gerados_rels" ADD CONSTRAINT "links_gerados_rels_produtos_fk" FOREIGN KEY ("produtos_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "queries_log" ADD CONSTRAINT "queries_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lojas_faq" ADD CONSTRAINT "lojas_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lojas" ADD CONSTRAINT "lojas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lojas" ADD CONSTRAINT "lojas_logo_id_midia_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lojas" ADD CONSTRAINT "lojas_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lojas_texts" ADD CONSTRAINT "lojas_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cupons_fontes" ADD CONSTRAINT "cupons_fontes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cupons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cupons" ADD CONSTRAINT "cupons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cupons" ADD CONSTRAINT "cupons_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cupons_v_version_fontes" ADD CONSTRAINT "_cupons_v_version_fontes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_cupons_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_cupons_v" ADD CONSTRAINT "_cupons_v_parent_id_cupons_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cupons_v" ADD CONSTRAINT "_cupons_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_cupons_v" ADD CONSTRAINT "_cupons_v_version_loja_id_lojas_id_fk" FOREIGN KEY ("version_loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas_faq" ADD CONSTRAINT "ofertas_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ofertas_beneficios" ADD CONSTRAINT "ofertas_beneficios_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_imagem_id_midia_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas_texts" ADD CONSTRAINT "ofertas_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ofertas_rels" ADD CONSTRAINT "ofertas_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ofertas_rels" ADD CONSTRAINT "ofertas_rels_categorias_oferta_fk" FOREIGN KEY ("categorias_oferta_id") REFERENCES "public"."categorias_oferta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ofertas_v_version_faq" ADD CONSTRAINT "_ofertas_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_ofertas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ofertas_v_version_beneficios" ADD CONSTRAINT "_ofertas_v_version_beneficios_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_ofertas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ofertas_v" ADD CONSTRAINT "_ofertas_v_parent_id_ofertas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ofertas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ofertas_v" ADD CONSTRAINT "_ofertas_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ofertas_v" ADD CONSTRAINT "_ofertas_v_version_loja_id_lojas_id_fk" FOREIGN KEY ("version_loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ofertas_v" ADD CONSTRAINT "_ofertas_v_version_cupom_id_cupons_id_fk" FOREIGN KEY ("version_cupom_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ofertas_v" ADD CONSTRAINT "_ofertas_v_version_imagem_id_midia_id_fk" FOREIGN KEY ("version_imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ofertas_v" ADD CONSTRAINT "_ofertas_v_version_meta_image_id_midia_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ofertas_v_texts" ADD CONSTRAINT "_ofertas_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_ofertas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ofertas_v_rels" ADD CONSTRAINT "_ofertas_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_ofertas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ofertas_v_rels" ADD CONSTRAINT "_ofertas_v_rels_categorias_oferta_fk" FOREIGN KEY ("categorias_oferta_id") REFERENCES "public"."categorias_oferta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_imagem_id_midia_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos_texts" ADD CONSTRAINT "produtos_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_produtos_v" ADD CONSTRAINT "_produtos_v_parent_id_produtos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."produtos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_v" ADD CONSTRAINT "_produtos_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_v" ADD CONSTRAINT "_produtos_v_version_loja_id_lojas_id_fk" FOREIGN KEY ("version_loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_v" ADD CONSTRAINT "_produtos_v_version_imagem_id_midia_id_fk" FOREIGN KEY ("version_imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_v" ADD CONSTRAINT "_produtos_v_version_cupom_id_cupons_id_fk" FOREIGN KEY ("version_cupom_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_v" ADD CONSTRAINT "_produtos_v_version_meta_image_id_midia_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_v_texts" ADD CONSTRAINT "_produtos_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_produtos_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "banners" ADD CONSTRAINT "banners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "banners" ADD CONSTRAINT "banners_imagem_id_midia_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "banners" ADD CONSTRAINT "banners_imagem_mobile_id_midia_id_fk" FOREIGN KEY ("imagem_mobile_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "banners" ADD CONSTRAINT "banners_oferta_id_ofertas_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cliques" ADD CONSTRAINT "cliques_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cliques" ADD CONSTRAINT "cliques_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "historico_desconto" ADD CONSTRAINT "historico_desconto_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "historico_desconto" ADD CONSTRAINT "historico_desconto_oferta_id_ofertas_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categorias_oferta" ADD CONSTRAINT "categorias_oferta_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categorias_oferta" ADD CONSTRAINT "categorias_oferta_pai_id_categorias_oferta_id_fk" FOREIGN KEY ("pai_id") REFERENCES "public"."categorias_oferta"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categorias_oferta" ADD CONSTRAINT "categorias_oferta_equivalente_a_id_categorias_oferta_id_fk" FOREIGN KEY ("equivalente_a_id") REFERENCES "public"."categorias_oferta"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categorias_oferta" ADD CONSTRAINT "categorias_oferta_meta_image_id_midia_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos_fisicos" ADD CONSTRAINT "produtos_fisicos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "produtos_fisicos" ADD CONSTRAINT "produtos_fisicos_imagem_id_midia_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_fisicos_v" ADD CONSTRAINT "_produtos_fisicos_v_parent_id_produtos_fisicos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."produtos_fisicos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_fisicos_v" ADD CONSTRAINT "_produtos_fisicos_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_produtos_fisicos_v" ADD CONSTRAINT "_produtos_fisicos_v_version_imagem_id_midia_id_fk" FOREIGN KEY ("version_imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variantes_produto" ADD CONSTRAINT "variantes_produto_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variantes_produto" ADD CONSTRAINT "variantes_produto_produto_id_produtos_fisicos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos_fisicos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variantes_produto" ADD CONSTRAINT "variantes_produto_imagem_id_midia_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."midia"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas_produto" ADD CONSTRAINT "ofertas_produto_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas_produto" ADD CONSTRAINT "ofertas_produto_variante_id_variantes_produto_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes_produto"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ofertas_produto" ADD CONSTRAINT "ofertas_produto_loja_id_lojas_id_fk" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "historico_preco_oferta" ADD CONSTRAINT "historico_preco_oferta_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "historico_preco_oferta" ADD CONSTRAINT "historico_preco_oferta_oferta_id_ofertas_produto_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_produto"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vinculos_catalogo" ADD CONSTRAINT "vinculos_catalogo_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vinculos_catalogo" ADD CONSTRAINT "vinculos_catalogo_variante_id_variantes_produto_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes_produto"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vinculos_catalogo" ADD CONSTRAINT "vinculos_catalogo_oferta_id_ofertas_produto_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_produto"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "elegibilidade_cupom" ADD CONSTRAINT "elegibilidade_cupom_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "elegibilidade_cupom" ADD CONSTRAINT "elegibilidade_cupom_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "elegibilidade_cupom" ADD CONSTRAINT "elegibilidade_cupom_oferta_id_ofertas_produto_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_produto"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mensagens_fk" FOREIGN KEY ("mensagens_id") REFERENCES "public"."mensagens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_midia_fk" FOREIGN KEY ("midia_id") REFERENCES "public"."midia"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categorias_fk" FOREIGN KEY ("categorias_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_autores_fk" FOREIGN KEY ("autores_id") REFERENCES "public"."autores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_link_rules_fk" FOREIGN KEY ("link_rules_id") REFERENCES "public"."link_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_links_gerados_fk" FOREIGN KEY ("links_gerados_id") REFERENCES "public"."links_gerados"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_queries_log_fk" FOREIGN KEY ("queries_log_id") REFERENCES "public"."queries_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lojas_fk" FOREIGN KEY ("lojas_id") REFERENCES "public"."lojas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cupons_fk" FOREIGN KEY ("cupons_id") REFERENCES "public"."cupons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ofertas_fk" FOREIGN KEY ("ofertas_id") REFERENCES "public"."ofertas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_produtos_fk" FOREIGN KEY ("produtos_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_banners_fk" FOREIGN KEY ("banners_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cliques_fk" FOREIGN KEY ("cliques_id") REFERENCES "public"."cliques"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_historico_desconto_fk" FOREIGN KEY ("historico_desconto_id") REFERENCES "public"."historico_desconto"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categorias_oferta_fk" FOREIGN KEY ("categorias_oferta_id") REFERENCES "public"."categorias_oferta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_produtos_fisicos_fk" FOREIGN KEY ("produtos_fisicos_id") REFERENCES "public"."produtos_fisicos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variantes_produto_fk" FOREIGN KEY ("variantes_produto_id") REFERENCES "public"."variantes_produto"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ofertas_produto_fk" FOREIGN KEY ("ofertas_produto_id") REFERENCES "public"."ofertas_produto"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_historico_preco_oferta_fk" FOREIGN KEY ("historico_preco_oferta_id") REFERENCES "public"."historico_preco_oferta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_vinculos_catalogo_fk" FOREIGN KEY ("vinculos_catalogo_id") REFERENCES "public"."vinculos_catalogo"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_elegibilidade_cupom_fk" FOREIGN KEY ("elegibilidade_cupom_id") REFERENCES "public"."elegibilidade_cupom"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_programas_ativos_order_idx" ON "tenants_programas_ativos" USING btree ("_order");
  CREATE INDEX "tenants_programas_ativos_parent_id_idx" ON "tenants_programas_ativos" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");
  CREATE UNIQUE INDEX "tenants_canonical_host_idx" ON "tenants" USING btree ("canonical_host");
  CREATE INDEX "tenants_tema_tema_logo_idx" ON "tenants" USING btree ("tema_logo_id");
  CREATE INDEX "tenants_tema_tema_favicon_idx" ON "tenants" USING btree ("tema_favicon_id");
  CREATE INDEX "tenants_tema_icones_tema_icones_svg_idx" ON "tenants" USING btree ("tema_icones_svg_id");
  CREATE INDEX "tenants_tema_icones_tema_icones_ico_idx" ON "tenants" USING btree ("tema_icones_ico_id");
  CREATE INDEX "tenants_tema_icones_tema_icones_apple_idx" ON "tenants" USING btree ("tema_icones_apple_id");
  CREATE INDEX "tenants_tema_icones_tema_icones_png192_idx" ON "tenants" USING btree ("tema_icones_png192_id");
  CREATE INDEX "tenants_tema_icones_tema_icones_png512_idx" ON "tenants" USING btree ("tema_icones_png512_id");
  CREATE INDEX "tenants_tema_escuro_tema_escuro_logo_idx" ON "tenants" USING btree ("tema_escuro_logo_id");
  CREATE INDEX "tenants_updated_at_idx" ON "tenants" USING btree ("updated_at");
  CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");
  CREATE INDEX "tenants_texts_order_parent" ON "tenants_texts" USING btree ("order","parent_id");
  CREATE INDEX "tenants_rels_order_idx" ON "tenants_rels" USING btree ("order");
  CREATE INDEX "tenants_rels_parent_idx" ON "tenants_rels" USING btree ("parent_id");
  CREATE INDEX "tenants_rels_path_idx" ON "tenants_rels" USING btree ("path");
  CREATE INDEX "tenants_rels_tenants_id_idx" ON "tenants_rels" USING btree ("tenants_id");
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_tenants_order_idx" ON "users_tenants" USING btree ("_order");
  CREATE INDEX "users_tenants_parent_id_idx" ON "users_tenants" USING btree ("_parent_id");
  CREATE INDEX "users_tenants_tenant_idx" ON "users_tenants" USING btree ("tenant_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "posts_faq_order_idx" ON "posts_faq" USING btree ("_order");
  CREATE INDEX "posts_faq_parent_id_idx" ON "posts_faq" USING btree ("_parent_id");
  CREATE INDEX "posts_tenant_idx" ON "posts" USING btree ("tenant_id");
  CREATE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_categoria_idx" ON "posts" USING btree ("categoria_id");
  CREATE INDEX "posts_autor_idx" ON "posts" USING btree ("autor_id");
  CREATE INDEX "posts_capa_idx" ON "posts" USING btree ("capa_id");
  CREATE INDEX "posts_publicado_em_idx" ON "posts" USING btree ("publicado_em");
  CREATE UNIQUE INDEX "posts_wordpress_id_idx" ON "posts" USING btree ("wordpress_id");
  CREATE INDEX "posts_slug_wp_idx" ON "posts" USING btree ("slug_wp");
  CREATE INDEX "posts_meta_meta_image_idx" ON "posts" USING btree ("meta_image_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "posts" USING btree ("_status");
  CREATE UNIQUE INDEX "tenant_slug_idx" ON "posts" USING btree ("tenant_id","slug");
  CREATE INDEX "posts_texts_order_parent" ON "posts_texts" USING btree ("order","parent_id");
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_tags_id_idx" ON "posts_rels" USING btree ("tags_id");
  CREATE INDEX "_posts_v_version_faq_order_idx" ON "_posts_v_version_faq" USING btree ("_order");
  CREATE INDEX "_posts_v_version_faq_parent_id_idx" ON "_posts_v_version_faq" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_tenant_idx" ON "_posts_v" USING btree ("version_tenant_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_categoria_idx" ON "_posts_v" USING btree ("version_categoria_id");
  CREATE INDEX "_posts_v_version_version_autor_idx" ON "_posts_v" USING btree ("version_autor_id");
  CREATE INDEX "_posts_v_version_version_capa_idx" ON "_posts_v" USING btree ("version_capa_id");
  CREATE INDEX "_posts_v_version_version_publicado_em_idx" ON "_posts_v" USING btree ("version_publicado_em");
  CREATE INDEX "_posts_v_version_version_wordpress_id_idx" ON "_posts_v" USING btree ("version_wordpress_id");
  CREATE INDEX "_posts_v_version_version_slug_wp_idx" ON "_posts_v" USING btree ("version_slug_wp");
  CREATE INDEX "_posts_v_version_meta_version_meta_image_idx" ON "_posts_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_latest_idx" ON "_posts_v" USING btree ("latest");
  CREATE INDEX "version_tenant_version_slug_idx" ON "_posts_v" USING btree ("version_tenant_id","version_slug");
  CREATE INDEX "_posts_v_texts_order_parent" ON "_posts_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_tags_id_idx" ON "_posts_v_rels" USING btree ("tags_id");
  CREATE INDEX "pages_tenant_idx" ON "pages" USING btree ("tenant_id");
  CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE UNIQUE INDEX "pages_wordpress_id_idx" ON "pages" USING btree ("wordpress_id");
  CREATE INDEX "pages_slug_wp_idx" ON "pages" USING btree ("slug_wp");
  CREATE INDEX "pages_origem_idx" ON "pages" USING btree ("origem");
  CREATE INDEX "pages_meta_meta_image_idx" ON "pages" USING btree ("meta_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE UNIQUE INDEX "tenant_slug_1_idx" ON "pages" USING btree ("tenant_id","slug");
  CREATE UNIQUE INDEX "tenant_origem_idx" ON "pages" USING btree ("tenant_id","origem");
  CREATE INDEX "pages_texts_order_parent" ON "pages_texts" USING btree ("order","parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_tenant_idx" ON "_pages_v" USING btree ("version_tenant_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_wordpress_id_idx" ON "_pages_v" USING btree ("version_wordpress_id");
  CREATE INDEX "_pages_v_version_version_slug_wp_idx" ON "_pages_v" USING btree ("version_slug_wp");
  CREATE INDEX "_pages_v_version_version_origem_idx" ON "_pages_v" USING btree ("version_origem");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "_pages_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "version_tenant_version_slug_1_idx" ON "_pages_v" USING btree ("version_tenant_id","version_slug");
  CREATE INDEX "version_tenant_version_origem_idx" ON "_pages_v" USING btree ("version_tenant_id","version_origem");
  CREATE INDEX "_pages_v_texts_order_parent" ON "_pages_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "mensagens_tenant_idx" ON "mensagens" USING btree ("tenant_id");
  CREATE INDEX "mensagens_updated_at_idx" ON "mensagens" USING btree ("updated_at");
  CREATE INDEX "mensagens_created_at_idx" ON "mensagens" USING btree ("created_at");
  CREATE INDEX "midia_tenant_idx" ON "midia" USING btree ("tenant_id");
  CREATE INDEX "midia_wp_url_antiga_idx" ON "midia" USING btree ("wp_url_antiga");
  CREATE INDEX "midia_updated_at_idx" ON "midia" USING btree ("updated_at");
  CREATE INDEX "midia_created_at_idx" ON "midia" USING btree ("created_at");
  CREATE UNIQUE INDEX "midia_filename_idx" ON "midia" USING btree ("filename");
  CREATE INDEX "midia_sizes_cartao_sizes_cartao_filename_idx" ON "midia" USING btree ("sizes_cartao_filename");
  CREATE INDEX "midia_sizes_capa_sizes_capa_filename_idx" ON "midia" USING btree ("sizes_capa_filename");
  CREATE INDEX "midia_sizes_og_sizes_og_filename_idx" ON "midia" USING btree ("sizes_og_filename");
  CREATE INDEX "categorias_tenant_idx" ON "categorias" USING btree ("tenant_id");
  CREATE INDEX "categorias_slug_idx" ON "categorias" USING btree ("slug");
  CREATE UNIQUE INDEX "categorias_wordpress_id_idx" ON "categorias" USING btree ("wordpress_id");
  CREATE INDEX "categorias_slug_wp_idx" ON "categorias" USING btree ("slug_wp");
  CREATE INDEX "categorias_meta_meta_image_idx" ON "categorias" USING btree ("meta_image_id");
  CREATE INDEX "categorias_updated_at_idx" ON "categorias" USING btree ("updated_at");
  CREATE INDEX "categorias_created_at_idx" ON "categorias" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_slug_2_idx" ON "categorias" USING btree ("tenant_id","slug");
  CREATE INDEX "tags_tenant_idx" ON "tags" USING btree ("tenant_id");
  CREATE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE UNIQUE INDEX "tags_wordpress_id_idx" ON "tags" USING btree ("wordpress_id");
  CREATE INDEX "tags_slug_wp_idx" ON "tags" USING btree ("slug_wp");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_slug_3_idx" ON "tags" USING btree ("tenant_id","slug");
  CREATE INDEX "autores_tenant_idx" ON "autores" USING btree ("tenant_id");
  CREATE INDEX "autores_slug_idx" ON "autores" USING btree ("slug");
  CREATE INDEX "autores_avatar_idx" ON "autores" USING btree ("avatar_id");
  CREATE UNIQUE INDEX "autores_wordpress_id_idx" ON "autores" USING btree ("wordpress_id");
  CREATE INDEX "autores_slug_wp_idx" ON "autores" USING btree ("slug_wp");
  CREATE INDEX "autores_updated_at_idx" ON "autores" USING btree ("updated_at");
  CREATE INDEX "autores_created_at_idx" ON "autores" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_slug_4_idx" ON "autores" USING btree ("tenant_id","slug");
  CREATE INDEX "autores_texts_order_parent" ON "autores_texts" USING btree ("order","parent_id");
  CREATE INDEX "link_rules_tenant_idx" ON "link_rules" USING btree ("tenant_id");
  CREATE INDEX "link_rules_updated_at_idx" ON "link_rules" USING btree ("updated_at");
  CREATE INDEX "link_rules_created_at_idx" ON "link_rules" USING btree ("created_at");
  CREATE INDEX "link_rules_texts_order_parent" ON "link_rules_texts" USING btree ("order","parent_id");
  CREATE INDEX "link_rules_rels_order_idx" ON "link_rules_rels" USING btree ("order");
  CREATE INDEX "link_rules_rels_parent_idx" ON "link_rules_rels" USING btree ("parent_id");
  CREATE INDEX "link_rules_rels_path_idx" ON "link_rules_rels" USING btree ("path");
  CREATE INDEX "link_rules_rels_posts_id_idx" ON "link_rules_rels" USING btree ("posts_id");
  CREATE INDEX "link_rules_rels_pages_id_idx" ON "link_rules_rels" USING btree ("pages_id");
  CREATE INDEX "link_rules_rels_lojas_id_idx" ON "link_rules_rels" USING btree ("lojas_id");
  CREATE INDEX "link_rules_rels_ofertas_id_idx" ON "link_rules_rels" USING btree ("ofertas_id");
  CREATE INDEX "link_rules_rels_produtos_id_idx" ON "link_rules_rels" USING btree ("produtos_id");
  CREATE INDEX "links_gerados_tenant_idx" ON "links_gerados" USING btree ("tenant_id");
  CREATE INDEX "links_gerados_origem_url_idx" ON "links_gerados" USING btree ("origem_url");
  CREATE INDEX "links_gerados_fonte_ancora_idx" ON "links_gerados" USING btree ("fonte_ancora");
  CREATE INDEX "links_gerados_run_id_idx" ON "links_gerados" USING btree ("run_id");
  CREATE INDEX "links_gerados_updated_at_idx" ON "links_gerados" USING btree ("updated_at");
  CREATE INDEX "links_gerados_created_at_idx" ON "links_gerados" USING btree ("created_at");
  CREATE INDEX "links_gerados_rels_order_idx" ON "links_gerados_rels" USING btree ("order");
  CREATE INDEX "links_gerados_rels_parent_idx" ON "links_gerados_rels" USING btree ("parent_id");
  CREATE INDEX "links_gerados_rels_path_idx" ON "links_gerados_rels" USING btree ("path");
  CREATE INDEX "links_gerados_rels_posts_id_idx" ON "links_gerados_rels" USING btree ("posts_id");
  CREATE INDEX "links_gerados_rels_pages_id_idx" ON "links_gerados_rels" USING btree ("pages_id");
  CREATE INDEX "links_gerados_rels_lojas_id_idx" ON "links_gerados_rels" USING btree ("lojas_id");
  CREATE INDEX "links_gerados_rels_ofertas_id_idx" ON "links_gerados_rels" USING btree ("ofertas_id");
  CREATE INDEX "links_gerados_rels_produtos_id_idx" ON "links_gerados_rels" USING btree ("produtos_id");
  CREATE INDEX "queries_log_tenant_idx" ON "queries_log" USING btree ("tenant_id");
  CREATE INDEX "queries_log_updated_at_idx" ON "queries_log" USING btree ("updated_at");
  CREATE INDEX "queries_log_created_at_idx" ON "queries_log" USING btree ("created_at");
  CREATE INDEX "lojas_faq_order_idx" ON "lojas_faq" USING btree ("_order");
  CREATE INDEX "lojas_faq_parent_id_idx" ON "lojas_faq" USING btree ("_parent_id");
  CREATE INDEX "lojas_tenant_idx" ON "lojas" USING btree ("tenant_id");
  CREATE INDEX "lojas_slug_idx" ON "lojas" USING btree ("slug");
  CREATE INDEX "lojas_logo_idx" ON "lojas" USING btree ("logo_id");
  CREATE UNIQUE INDEX "lojas_wordpress_id_idx" ON "lojas" USING btree ("wordpress_id");
  CREATE INDEX "lojas_slug_wp_idx" ON "lojas" USING btree ("slug_wp");
  CREATE INDEX "lojas_meta_meta_image_idx" ON "lojas" USING btree ("meta_image_id");
  CREATE INDEX "lojas_updated_at_idx" ON "lojas" USING btree ("updated_at");
  CREATE INDEX "lojas_created_at_idx" ON "lojas" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_slug_5_idx" ON "lojas" USING btree ("tenant_id","slug");
  CREATE INDEX "lojas_texts_order_parent" ON "lojas_texts" USING btree ("order","parent_id");
  CREATE INDEX "cupons_fontes_order_idx" ON "cupons_fontes" USING btree ("_order");
  CREATE INDEX "cupons_fontes_parent_id_idx" ON "cupons_fontes" USING btree ("_parent_id");
  CREATE INDEX "cupons_tenant_idx" ON "cupons" USING btree ("tenant_id");
  CREATE INDEX "cupons_loja_idx" ON "cupons" USING btree ("loja_id");
  CREATE INDEX "cupons_codigo_idx" ON "cupons" USING btree ("codigo");
  CREATE INDEX "cupons_estado_idx" ON "cupons" USING btree ("estado");
  CREATE INDEX "cupons_origem_idx" ON "cupons" USING btree ("origem");
  CREATE INDEX "cupons_updated_at_idx" ON "cupons" USING btree ("updated_at");
  CREATE INDEX "cupons_created_at_idx" ON "cupons" USING btree ("created_at");
  CREATE INDEX "cupons__status_idx" ON "cupons" USING btree ("_status");
  CREATE UNIQUE INDEX "loja_codigo_idx" ON "cupons" USING btree ("loja_id","codigo");
  CREATE INDEX "_cupons_v_version_fontes_order_idx" ON "_cupons_v_version_fontes" USING btree ("_order");
  CREATE INDEX "_cupons_v_version_fontes_parent_id_idx" ON "_cupons_v_version_fontes" USING btree ("_parent_id");
  CREATE INDEX "_cupons_v_parent_idx" ON "_cupons_v" USING btree ("parent_id");
  CREATE INDEX "_cupons_v_version_version_tenant_idx" ON "_cupons_v" USING btree ("version_tenant_id");
  CREATE INDEX "_cupons_v_version_version_loja_idx" ON "_cupons_v" USING btree ("version_loja_id");
  CREATE INDEX "_cupons_v_version_version_codigo_idx" ON "_cupons_v" USING btree ("version_codigo");
  CREATE INDEX "_cupons_v_version_version_estado_idx" ON "_cupons_v" USING btree ("version_estado");
  CREATE INDEX "_cupons_v_version_version_origem_idx" ON "_cupons_v" USING btree ("version_origem");
  CREATE INDEX "_cupons_v_version_version_updated_at_idx" ON "_cupons_v" USING btree ("version_updated_at");
  CREATE INDEX "_cupons_v_version_version_created_at_idx" ON "_cupons_v" USING btree ("version_created_at");
  CREATE INDEX "_cupons_v_version_version__status_idx" ON "_cupons_v" USING btree ("version__status");
  CREATE INDEX "_cupons_v_created_at_idx" ON "_cupons_v" USING btree ("created_at");
  CREATE INDEX "_cupons_v_updated_at_idx" ON "_cupons_v" USING btree ("updated_at");
  CREATE INDEX "_cupons_v_latest_idx" ON "_cupons_v" USING btree ("latest");
  CREATE INDEX "version_loja_version_codigo_idx" ON "_cupons_v" USING btree ("version_loja_id","version_codigo");
  CREATE INDEX "ofertas_faq_order_idx" ON "ofertas_faq" USING btree ("_order");
  CREATE INDEX "ofertas_faq_parent_id_idx" ON "ofertas_faq" USING btree ("_parent_id");
  CREATE INDEX "ofertas_beneficios_order_idx" ON "ofertas_beneficios" USING btree ("_order");
  CREATE INDEX "ofertas_beneficios_parent_id_idx" ON "ofertas_beneficios" USING btree ("_parent_id");
  CREATE INDEX "ofertas_tenant_idx" ON "ofertas" USING btree ("tenant_id");
  CREATE INDEX "ofertas_loja_idx" ON "ofertas" USING btree ("loja_id");
  CREATE INDEX "ofertas_slug_idx" ON "ofertas" USING btree ("slug");
  CREATE INDEX "ofertas_cupom_idx" ON "ofertas" USING btree ("cupom_id");
  CREATE INDEX "ofertas_imagem_idx" ON "ofertas" USING btree ("imagem_id");
  CREATE UNIQUE INDEX "ofertas_wordpress_id_idx" ON "ofertas" USING btree ("wordpress_id");
  CREATE INDEX "ofertas_slug_wp_idx" ON "ofertas" USING btree ("slug_wp");
  CREATE INDEX "ofertas_origem_idx" ON "ofertas" USING btree ("origem");
  CREATE INDEX "ofertas_meta_meta_image_idx" ON "ofertas" USING btree ("meta_image_id");
  CREATE INDEX "ofertas_updated_at_idx" ON "ofertas" USING btree ("updated_at");
  CREATE INDEX "ofertas_created_at_idx" ON "ofertas" USING btree ("created_at");
  CREATE INDEX "ofertas__status_idx" ON "ofertas" USING btree ("_status");
  CREATE UNIQUE INDEX "tenant_slug_6_idx" ON "ofertas" USING btree ("tenant_id","slug");
  CREATE UNIQUE INDEX "tenant_origem_1_idx" ON "ofertas" USING btree ("tenant_id","origem");
  CREATE INDEX "ofertas_texts_order_parent" ON "ofertas_texts" USING btree ("order","parent_id");
  CREATE INDEX "ofertas_rels_order_idx" ON "ofertas_rels" USING btree ("order");
  CREATE INDEX "ofertas_rels_parent_idx" ON "ofertas_rels" USING btree ("parent_id");
  CREATE INDEX "ofertas_rels_path_idx" ON "ofertas_rels" USING btree ("path");
  CREATE INDEX "ofertas_rels_categorias_oferta_id_idx" ON "ofertas_rels" USING btree ("categorias_oferta_id");
  CREATE INDEX "_ofertas_v_version_faq_order_idx" ON "_ofertas_v_version_faq" USING btree ("_order");
  CREATE INDEX "_ofertas_v_version_faq_parent_id_idx" ON "_ofertas_v_version_faq" USING btree ("_parent_id");
  CREATE INDEX "_ofertas_v_version_beneficios_order_idx" ON "_ofertas_v_version_beneficios" USING btree ("_order");
  CREATE INDEX "_ofertas_v_version_beneficios_parent_id_idx" ON "_ofertas_v_version_beneficios" USING btree ("_parent_id");
  CREATE INDEX "_ofertas_v_parent_idx" ON "_ofertas_v" USING btree ("parent_id");
  CREATE INDEX "_ofertas_v_version_version_tenant_idx" ON "_ofertas_v" USING btree ("version_tenant_id");
  CREATE INDEX "_ofertas_v_version_version_loja_idx" ON "_ofertas_v" USING btree ("version_loja_id");
  CREATE INDEX "_ofertas_v_version_version_slug_idx" ON "_ofertas_v" USING btree ("version_slug");
  CREATE INDEX "_ofertas_v_version_version_cupom_idx" ON "_ofertas_v" USING btree ("version_cupom_id");
  CREATE INDEX "_ofertas_v_version_version_imagem_idx" ON "_ofertas_v" USING btree ("version_imagem_id");
  CREATE INDEX "_ofertas_v_version_version_wordpress_id_idx" ON "_ofertas_v" USING btree ("version_wordpress_id");
  CREATE INDEX "_ofertas_v_version_version_slug_wp_idx" ON "_ofertas_v" USING btree ("version_slug_wp");
  CREATE INDEX "_ofertas_v_version_version_origem_idx" ON "_ofertas_v" USING btree ("version_origem");
  CREATE INDEX "_ofertas_v_version_meta_version_meta_image_idx" ON "_ofertas_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_ofertas_v_version_version_updated_at_idx" ON "_ofertas_v" USING btree ("version_updated_at");
  CREATE INDEX "_ofertas_v_version_version_created_at_idx" ON "_ofertas_v" USING btree ("version_created_at");
  CREATE INDEX "_ofertas_v_version_version__status_idx" ON "_ofertas_v" USING btree ("version__status");
  CREATE INDEX "_ofertas_v_created_at_idx" ON "_ofertas_v" USING btree ("created_at");
  CREATE INDEX "_ofertas_v_updated_at_idx" ON "_ofertas_v" USING btree ("updated_at");
  CREATE INDEX "_ofertas_v_latest_idx" ON "_ofertas_v" USING btree ("latest");
  CREATE INDEX "version_tenant_version_slug_2_idx" ON "_ofertas_v" USING btree ("version_tenant_id","version_slug");
  CREATE INDEX "version_tenant_version_origem_1_idx" ON "_ofertas_v" USING btree ("version_tenant_id","version_origem");
  CREATE INDEX "_ofertas_v_texts_order_parent" ON "_ofertas_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_ofertas_v_rels_order_idx" ON "_ofertas_v_rels" USING btree ("order");
  CREATE INDEX "_ofertas_v_rels_parent_idx" ON "_ofertas_v_rels" USING btree ("parent_id");
  CREATE INDEX "_ofertas_v_rels_path_idx" ON "_ofertas_v_rels" USING btree ("path");
  CREATE INDEX "_ofertas_v_rels_categorias_oferta_id_idx" ON "_ofertas_v_rels" USING btree ("categorias_oferta_id");
  CREATE INDEX "produtos_tenant_idx" ON "produtos" USING btree ("tenant_id");
  CREATE INDEX "produtos_slug_idx" ON "produtos" USING btree ("slug");
  CREATE INDEX "produtos_loja_idx" ON "produtos" USING btree ("loja_id");
  CREATE INDEX "produtos_imagem_idx" ON "produtos" USING btree ("imagem_id");
  CREATE INDEX "produtos_cupom_idx" ON "produtos" USING btree ("cupom_id");
  CREATE INDEX "produtos_estado_idx" ON "produtos" USING btree ("estado");
  CREATE INDEX "produtos_origem_idx" ON "produtos" USING btree ("origem");
  CREATE INDEX "produtos_meta_meta_image_idx" ON "produtos" USING btree ("meta_image_id");
  CREATE INDEX "produtos_updated_at_idx" ON "produtos" USING btree ("updated_at");
  CREATE INDEX "produtos_created_at_idx" ON "produtos" USING btree ("created_at");
  CREATE INDEX "produtos__status_idx" ON "produtos" USING btree ("_status");
  CREATE UNIQUE INDEX "tenant_slug_7_idx" ON "produtos" USING btree ("tenant_id","slug");
  CREATE UNIQUE INDEX "tenant_origem_2_idx" ON "produtos" USING btree ("tenant_id","origem");
  CREATE INDEX "produtos_texts_order_parent" ON "produtos_texts" USING btree ("order","parent_id");
  CREATE INDEX "_produtos_v_parent_idx" ON "_produtos_v" USING btree ("parent_id");
  CREATE INDEX "_produtos_v_version_version_tenant_idx" ON "_produtos_v" USING btree ("version_tenant_id");
  CREATE INDEX "_produtos_v_version_version_slug_idx" ON "_produtos_v" USING btree ("version_slug");
  CREATE INDEX "_produtos_v_version_version_loja_idx" ON "_produtos_v" USING btree ("version_loja_id");
  CREATE INDEX "_produtos_v_version_version_imagem_idx" ON "_produtos_v" USING btree ("version_imagem_id");
  CREATE INDEX "_produtos_v_version_version_cupom_idx" ON "_produtos_v" USING btree ("version_cupom_id");
  CREATE INDEX "_produtos_v_version_version_estado_idx" ON "_produtos_v" USING btree ("version_estado");
  CREATE INDEX "_produtos_v_version_version_origem_idx" ON "_produtos_v" USING btree ("version_origem");
  CREATE INDEX "_produtos_v_version_meta_version_meta_image_idx" ON "_produtos_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_produtos_v_version_version_updated_at_idx" ON "_produtos_v" USING btree ("version_updated_at");
  CREATE INDEX "_produtos_v_version_version_created_at_idx" ON "_produtos_v" USING btree ("version_created_at");
  CREATE INDEX "_produtos_v_version_version__status_idx" ON "_produtos_v" USING btree ("version__status");
  CREATE INDEX "_produtos_v_created_at_idx" ON "_produtos_v" USING btree ("created_at");
  CREATE INDEX "_produtos_v_updated_at_idx" ON "_produtos_v" USING btree ("updated_at");
  CREATE INDEX "_produtos_v_latest_idx" ON "_produtos_v" USING btree ("latest");
  CREATE INDEX "version_tenant_version_slug_3_idx" ON "_produtos_v" USING btree ("version_tenant_id","version_slug");
  CREATE INDEX "version_tenant_version_origem_2_idx" ON "_produtos_v" USING btree ("version_tenant_id","version_origem");
  CREATE INDEX "_produtos_v_texts_order_parent" ON "_produtos_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "banners_tenant_idx" ON "banners" USING btree ("tenant_id");
  CREATE INDEX "banners_imagem_idx" ON "banners" USING btree ("imagem_id");
  CREATE INDEX "banners_imagem_mobile_idx" ON "banners" USING btree ("imagem_mobile_id");
  CREATE INDEX "banners_oferta_idx" ON "banners" USING btree ("oferta_id");
  CREATE INDEX "banners_updated_at_idx" ON "banners" USING btree ("updated_at");
  CREATE INDEX "banners_created_at_idx" ON "banners" USING btree ("created_at");
  CREATE INDEX "cliques_tenant_idx" ON "cliques" USING btree ("tenant_id");
  CREATE INDEX "cliques_doc_id_idx" ON "cliques" USING btree ("doc_id");
  CREATE INDEX "cliques_loja_idx" ON "cliques" USING btree ("loja_id");
  CREATE INDEX "cliques_updated_at_idx" ON "cliques" USING btree ("updated_at");
  CREATE INDEX "cliques_created_at_idx" ON "cliques" USING btree ("created_at");
  CREATE INDEX "historico_desconto_tenant_idx" ON "historico_desconto" USING btree ("tenant_id");
  CREATE INDEX "historico_desconto_oferta_idx" ON "historico_desconto" USING btree ("oferta_id");
  CREATE INDEX "historico_desconto_data_idx" ON "historico_desconto" USING btree ("data");
  CREATE INDEX "historico_desconto_updated_at_idx" ON "historico_desconto" USING btree ("updated_at");
  CREATE INDEX "historico_desconto_created_at_idx" ON "historico_desconto" USING btree ("created_at");
  CREATE UNIQUE INDEX "oferta_data_idx" ON "historico_desconto" USING btree ("oferta_id","data");
  CREATE INDEX "categorias_oferta_tenant_idx" ON "categorias_oferta" USING btree ("tenant_id");
  CREATE INDEX "categorias_oferta_slug_idx" ON "categorias_oferta" USING btree ("slug");
  CREATE INDEX "categorias_oferta_pai_idx" ON "categorias_oferta" USING btree ("pai_id");
  CREATE INDEX "categorias_oferta_navegacao_idx" ON "categorias_oferta" USING btree ("navegacao");
  CREATE INDEX "categorias_oferta_equivalente_a_idx" ON "categorias_oferta" USING btree ("equivalente_a_id");
  CREATE UNIQUE INDEX "categorias_oferta_wordpress_id_idx" ON "categorias_oferta" USING btree ("wordpress_id");
  CREATE INDEX "categorias_oferta_slug_wp_idx" ON "categorias_oferta" USING btree ("slug_wp");
  CREATE INDEX "categorias_oferta_meta_meta_image_idx" ON "categorias_oferta" USING btree ("meta_image_id");
  CREATE INDEX "categorias_oferta_updated_at_idx" ON "categorias_oferta" USING btree ("updated_at");
  CREATE INDEX "categorias_oferta_created_at_idx" ON "categorias_oferta" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_slug_8_idx" ON "categorias_oferta" USING btree ("tenant_id","slug");
  CREATE INDEX "produtos_fisicos_tenant_idx" ON "produtos_fisicos" USING btree ("tenant_id");
  CREATE INDEX "produtos_fisicos_imagem_idx" ON "produtos_fisicos" USING btree ("imagem_id");
  CREATE INDEX "produtos_fisicos_updated_at_idx" ON "produtos_fisicos" USING btree ("updated_at");
  CREATE INDEX "produtos_fisicos_created_at_idx" ON "produtos_fisicos" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_slug_9_idx" ON "produtos_fisicos" USING btree ("tenant_id","slug");
  CREATE INDEX "_produtos_fisicos_v_parent_idx" ON "_produtos_fisicos_v" USING btree ("parent_id");
  CREATE INDEX "_produtos_fisicos_v_version_version_tenant_idx" ON "_produtos_fisicos_v" USING btree ("version_tenant_id");
  CREATE INDEX "_produtos_fisicos_v_version_version_imagem_idx" ON "_produtos_fisicos_v" USING btree ("version_imagem_id");
  CREATE INDEX "_produtos_fisicos_v_version_version_updated_at_idx" ON "_produtos_fisicos_v" USING btree ("version_updated_at");
  CREATE INDEX "_produtos_fisicos_v_version_version_created_at_idx" ON "_produtos_fisicos_v" USING btree ("version_created_at");
  CREATE INDEX "_produtos_fisicos_v_created_at_idx" ON "_produtos_fisicos_v" USING btree ("created_at");
  CREATE INDEX "_produtos_fisicos_v_updated_at_idx" ON "_produtos_fisicos_v" USING btree ("updated_at");
  CREATE INDEX "version_tenant_version_slug_4_idx" ON "_produtos_fisicos_v" USING btree ("version_tenant_id","version_slug");
  CREATE INDEX "variantes_produto_tenant_idx" ON "variantes_produto" USING btree ("tenant_id");
  CREATE INDEX "variantes_produto_produto_idx" ON "variantes_produto" USING btree ("produto_id");
  CREATE INDEX "variantes_produto_imagem_idx" ON "variantes_produto" USING btree ("imagem_id");
  CREATE INDEX "variantes_produto_updated_at_idx" ON "variantes_produto" USING btree ("updated_at");
  CREATE INDEX "variantes_produto_created_at_idx" ON "variantes_produto" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_produto_chave_normalizada_idx" ON "variantes_produto" USING btree ("tenant_id","produto_id","chave_normalizada");
  CREATE INDEX "ofertas_produto_tenant_idx" ON "ofertas_produto" USING btree ("tenant_id");
  CREATE INDEX "ofertas_produto_variante_idx" ON "ofertas_produto" USING btree ("variante_id");
  CREATE INDEX "ofertas_produto_loja_idx" ON "ofertas_produto" USING btree ("loja_id");
  CREATE INDEX "ofertas_produto_updated_at_idx" ON "ofertas_produto" USING btree ("updated_at");
  CREATE INDEX "ofertas_produto_created_at_idx" ON "ofertas_produto" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_chave_listing_idx" ON "ofertas_produto" USING btree ("tenant_id","chave_listing");
  CREATE INDEX "historico_preco_oferta_tenant_idx" ON "historico_preco_oferta" USING btree ("tenant_id");
  CREATE INDEX "historico_preco_oferta_oferta_idx" ON "historico_preco_oferta" USING btree ("oferta_id");
  CREATE INDEX "historico_preco_oferta_updated_at_idx" ON "historico_preco_oferta" USING btree ("updated_at");
  CREATE INDEX "historico_preco_oferta_created_at_idx" ON "historico_preco_oferta" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_oferta_observado_em_idx" ON "historico_preco_oferta" USING btree ("tenant_id","oferta_id","observado_em");
  CREATE INDEX "vinculos_catalogo_tenant_idx" ON "vinculos_catalogo" USING btree ("tenant_id");
  CREATE INDEX "vinculos_catalogo_variante_idx" ON "vinculos_catalogo" USING btree ("variante_id");
  CREATE INDEX "vinculos_catalogo_oferta_idx" ON "vinculos_catalogo" USING btree ("oferta_id");
  CREATE INDEX "vinculos_catalogo_updated_at_idx" ON "vinculos_catalogo" USING btree ("updated_at");
  CREATE INDEX "vinculos_catalogo_created_at_idx" ON "vinculos_catalogo" USING btree ("created_at");
  CREATE INDEX "elegibilidade_cupom_tenant_idx" ON "elegibilidade_cupom" USING btree ("tenant_id");
  CREATE INDEX "elegibilidade_cupom_cupom_idx" ON "elegibilidade_cupom" USING btree ("cupom_id");
  CREATE INDEX "elegibilidade_cupom_oferta_idx" ON "elegibilidade_cupom" USING btree ("oferta_id");
  CREATE INDEX "elegibilidade_cupom_updated_at_idx" ON "elegibilidade_cupom" USING btree ("updated_at");
  CREATE INDEX "elegibilidade_cupom_created_at_idx" ON "elegibilidade_cupom" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_cupom_oferta_idx" ON "elegibilidade_cupom" USING btree ("tenant_id","cupom_id","oferta_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_tenants_id_idx" ON "payload_locked_documents_rels" USING btree ("tenants_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_mensagens_id_idx" ON "payload_locked_documents_rels" USING btree ("mensagens_id");
  CREATE INDEX "payload_locked_documents_rels_midia_id_idx" ON "payload_locked_documents_rels" USING btree ("midia_id");
  CREATE INDEX "payload_locked_documents_rels_categorias_id_idx" ON "payload_locked_documents_rels" USING btree ("categorias_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_autores_id_idx" ON "payload_locked_documents_rels" USING btree ("autores_id");
  CREATE INDEX "payload_locked_documents_rels_link_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("link_rules_id");
  CREATE INDEX "payload_locked_documents_rels_links_gerados_id_idx" ON "payload_locked_documents_rels" USING btree ("links_gerados_id");
  CREATE INDEX "payload_locked_documents_rels_queries_log_id_idx" ON "payload_locked_documents_rels" USING btree ("queries_log_id");
  CREATE INDEX "payload_locked_documents_rels_lojas_id_idx" ON "payload_locked_documents_rels" USING btree ("lojas_id");
  CREATE INDEX "payload_locked_documents_rels_cupons_id_idx" ON "payload_locked_documents_rels" USING btree ("cupons_id");
  CREATE INDEX "payload_locked_documents_rels_ofertas_id_idx" ON "payload_locked_documents_rels" USING btree ("ofertas_id");
  CREATE INDEX "payload_locked_documents_rels_produtos_id_idx" ON "payload_locked_documents_rels" USING btree ("produtos_id");
  CREATE INDEX "payload_locked_documents_rels_banners_id_idx" ON "payload_locked_documents_rels" USING btree ("banners_id");
  CREATE INDEX "payload_locked_documents_rels_cliques_id_idx" ON "payload_locked_documents_rels" USING btree ("cliques_id");
  CREATE INDEX "payload_locked_documents_rels_historico_desconto_id_idx" ON "payload_locked_documents_rels" USING btree ("historico_desconto_id");
  CREATE INDEX "payload_locked_documents_rels_categorias_oferta_id_idx" ON "payload_locked_documents_rels" USING btree ("categorias_oferta_id");
  CREATE INDEX "payload_locked_documents_rels_produtos_fisicos_id_idx" ON "payload_locked_documents_rels" USING btree ("produtos_fisicos_id");
  CREATE INDEX "payload_locked_documents_rels_variantes_produto_id_idx" ON "payload_locked_documents_rels" USING btree ("variantes_produto_id");
  CREATE INDEX "payload_locked_documents_rels_ofertas_produto_id_idx" ON "payload_locked_documents_rels" USING btree ("ofertas_produto_id");
  CREATE INDEX "payload_locked_documents_rels_historico_preco_oferta_id_idx" ON "payload_locked_documents_rels" USING btree ("historico_preco_oferta_id");
  CREATE INDEX "payload_locked_documents_rels_vinculos_catalogo_id_idx" ON "payload_locked_documents_rels" USING btree ("vinculos_catalogo_id");
  CREATE INDEX "payload_locked_documents_rels_elegibilidade_cupom_id_idx" ON "payload_locked_documents_rels" USING btree ("elegibilidade_cupom_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tenants_programas_ativos" CASCADE;
  DROP TABLE "tenants" CASCADE;
  DROP TABLE "tenants_texts" CASCADE;
  DROP TABLE "tenants_rels" CASCADE;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_tenants" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "posts_faq" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_texts" CASCADE;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v_version_faq" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_texts" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_texts" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_texts" CASCADE;
  DROP TABLE "mensagens" CASCADE;
  DROP TABLE "midia" CASCADE;
  DROP TABLE "categorias" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "autores" CASCADE;
  DROP TABLE "autores_texts" CASCADE;
  DROP TABLE "link_rules" CASCADE;
  DROP TABLE "link_rules_texts" CASCADE;
  DROP TABLE "link_rules_rels" CASCADE;
  DROP TABLE "links_gerados" CASCADE;
  DROP TABLE "links_gerados_rels" CASCADE;
  DROP TABLE "queries_log" CASCADE;
  DROP TABLE "lojas_faq" CASCADE;
  DROP TABLE "lojas" CASCADE;
  DROP TABLE "lojas_texts" CASCADE;
  DROP TABLE "cupons_fontes" CASCADE;
  DROP TABLE "cupons" CASCADE;
  DROP TABLE "_cupons_v_version_fontes" CASCADE;
  DROP TABLE "_cupons_v" CASCADE;
  DROP TABLE "ofertas_faq" CASCADE;
  DROP TABLE "ofertas_beneficios" CASCADE;
  DROP TABLE "ofertas" CASCADE;
  DROP TABLE "ofertas_texts" CASCADE;
  DROP TABLE "ofertas_rels" CASCADE;
  DROP TABLE "_ofertas_v_version_faq" CASCADE;
  DROP TABLE "_ofertas_v_version_beneficios" CASCADE;
  DROP TABLE "_ofertas_v" CASCADE;
  DROP TABLE "_ofertas_v_texts" CASCADE;
  DROP TABLE "_ofertas_v_rels" CASCADE;
  DROP TABLE "produtos" CASCADE;
  DROP TABLE "produtos_texts" CASCADE;
  DROP TABLE "_produtos_v" CASCADE;
  DROP TABLE "_produtos_v_texts" CASCADE;
  DROP TABLE "banners" CASCADE;
  DROP TABLE "cliques" CASCADE;
  DROP TABLE "historico_desconto" CASCADE;
  DROP TABLE "categorias_oferta" CASCADE;
  DROP TABLE "produtos_fisicos" CASCADE;
  DROP TABLE "_produtos_fisicos_v" CASCADE;
  DROP TABLE "variantes_produto" CASCADE;
  DROP TABLE "ofertas_produto" CASCADE;
  DROP TABLE "historico_preco_oferta" CASCADE;
  DROP TABLE "vinculos_catalogo" CASCADE;
  DROP TABLE "elegibilidade_cupom" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_tenants_programas_ativos_programa";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum_pages_template";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_template";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_links_gerados_fonte_ancora";
  DROP TYPE "public"."enum_queries_log_origem";
  DROP TYPE "public"."enum_lojas_programa";
  DROP TYPE "public"."enum_cupons_desconto_tipo";
  DROP TYPE "public"."enum_cupons_aplica_sobre";
  DROP TYPE "public"."enum_cupons_estado";
  DROP TYPE "public"."enum_cupons_origem";
  DROP TYPE "public"."enum_cupons_metodo";
  DROP TYPE "public"."enum_cupons_status";
  DROP TYPE "public"."enum__cupons_v_version_desconto_tipo";
  DROP TYPE "public"."enum__cupons_v_version_aplica_sobre";
  DROP TYPE "public"."enum__cupons_v_version_estado";
  DROP TYPE "public"."enum__cupons_v_version_origem";
  DROP TYPE "public"."enum__cupons_v_version_metodo";
  DROP TYPE "public"."enum__cupons_v_version_status";
  DROP TYPE "public"."enum_ofertas_tipo";
  DROP TYPE "public"."enum_ofertas_preco_ciclo";
  DROP TYPE "public"."enum_ofertas_desconto_loja_tipo";
  DROP TYPE "public"."enum_ofertas_desconto_loja_fonte";
  DROP TYPE "public"."enum_ofertas_status";
  DROP TYPE "public"."enum__ofertas_v_version_tipo";
  DROP TYPE "public"."enum__ofertas_v_version_preco_ciclo";
  DROP TYPE "public"."enum__ofertas_v_version_desconto_loja_tipo";
  DROP TYPE "public"."enum__ofertas_v_version_desconto_loja_fonte";
  DROP TYPE "public"."enum__ofertas_v_version_status";
  DROP TYPE "public"."enum_produtos_fonte_coleta";
  DROP TYPE "public"."enum_produtos_estado";
  DROP TYPE "public"."enum_produtos_status";
  DROP TYPE "public"."enum__produtos_v_version_fonte_coleta";
  DROP TYPE "public"."enum__produtos_v_version_estado";
  DROP TYPE "public"."enum__produtos_v_version_status";
  DROP TYPE "public"."enum_banners_posicao";
  DROP TYPE "public"."enum_cliques_tipo_doc";
  DROP TYPE "public"."enum_cliques_ref";
  DROP TYPE "public"."enum_cliques_user_agent_class";
  DROP TYPE "public"."enum_historico_desconto_fonte";
  DROP TYPE "public"."enum_categorias_oferta_navegacao";
  DROP TYPE "public"."enum_produtos_fisicos_categoria";
  DROP TYPE "public"."enum_produtos_fisicos_estado";
  DROP TYPE "public"."enum__produtos_fisicos_v_version_categoria";
  DROP TYPE "public"."enum__produtos_fisicos_v_version_estado";
  DROP TYPE "public"."enum_variantes_produto_estado";
  DROP TYPE "public"."enum_ofertas_produto_disponibilidade";
  DROP TYPE "public"."enum_ofertas_produto_estado";
  DROP TYPE "public"."enum_historico_preco_oferta_disponibilidade";
  DROP TYPE "public"."enum_vinculos_catalogo_metodo";
  DROP TYPE "public"."enum_vinculos_catalogo_decisao";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
