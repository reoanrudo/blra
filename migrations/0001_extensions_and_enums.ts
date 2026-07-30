import type { MigrationBuilder } from "node-pg-migrate";

// 拡張機能と PostgreSQL enum 型の定義。
// 設計書 §5.2（Authority Class, Consolidation State, Verification Status）、
// §4.2（ValidFromStatus）、§6.3（AnchorStatus は S3）、§7.2（EdgeType）、§8.4（SourceType）、
// §13.1（ProvisionType）から値を集約。

const enumDefinitions = [
  // §5.2 軸1: Authority Class（法的権威）
  `CREATE TYPE authority_class_enum AS ENUM (
    'PRIMARY_LAW',
    'CABINET_ORDER',
    'MINISTERIAL_ORDINANCE',
    'NOTIFICATION',
    'LOCAL_ORDINANCE',
    'LOCAL_RULE',
    'OFFICIAL_GUIDANCE',
    'ADMINISTRATIVE_REFERENCE',
    'SECONDARY_COMMENTARY'
  )`,

  // §8.4 SourceType 別 Parser の分類に基づくコード値
  `CREATE TYPE source_type_enum AS ENUM (
    'EGOV_LAW',
    'NOTIFICATION_HTML',
    'NOTIFICATION_TEXT_PDF',
    'NOTIFICATION_IMAGE_PDF',
    'LOCAL_RULE'
  )`,

  // §5.2 軸2: Consolidation State（本文の統合状態）
  `CREATE TYPE consolidation_state_enum AS ENUM (
    'OFFICIAL_CONSOLIDATED',
    'OFFICIAL_AS_ENACTED',
    'OFFICIAL_AMENDMENT',
    'DERIVED_CONSOLIDATED',
    'UNKNOWN'
  )`,

  // §5.2 軸3: Verification Status（確認状態）
  `CREATE TYPE verification_status_enum AS ENUM (
    'UNVERIFIED',
    'MECHANICAL',
    'HUMAN_REVIEWED',
    'GAZETTE_VERIFIED'
  )`,

  // §4.2 valid_from_status
  `CREATE TYPE valid_from_status_enum AS ENUM (
    'FIXED',
    'UNDETERMINED',
    'ESTIMATED'
  )`,

  // §13.1 provision_type
  `CREATE TYPE provision_type_enum AS ENUM (
    'ARTICLE',
    'PARAGRAPH',
    'ITEM',
    'TABLE',
    'SUPPLEMENTARY'
  )`,

  // §7.2 edge_type（reference_edge は S2 で使用、テーブル自体も S2 で作成）
  `CREATE TYPE edge_type_enum AS ENUM (
    'CITES',
    'DELEGATES_TO',
    'APPLIES_MUTATIS_MUTANDIS',
    'DEFINES',
    'EXCEPTS'
  )`,
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 拡張機能は docker-entrypoint-initdb.d でも有効化しているが、
  // マイグレーション経由でも確実に有効化（べき等）
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_bigm`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  for (const def of enumDefinitions) {
    pgm.sql(def);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // enum 型を逆順で削除
  const enumNames = [
    "edge_type_enum",
    "provision_type_enum",
    "valid_from_status_enum",
    "verification_status_enum",
    "consolidation_state_enum",
    "source_type_enum",
    "authority_class_enum",
  ];
  for (const name of enumNames) {
    pgm.sql(`DROP TYPE IF EXISTS ${name}`);
  }
}
