-- pg_bigm と btree_gist をテンプレートDBへ有効化し、
-- 以降に作成される全データベースで利用可能にする。
-- pg_bigm は shared_preload_libraries への登録済み（docker-compose.yml の command 参照）。

-- pg_bigm: 日本語全文検索（S2 で使用、M1 で有効化のみ）
CREATE EXTENSION IF NOT EXISTS pg_bigm;

-- btree_gist: EXCLUDE制約で uuid の等値比較に必要（ADR-013、provision_version）
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- uuid-ossp: uuid_generate_v4()（マイグレーションで使用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
