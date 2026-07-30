import type { MigrationBuilder } from "node-pg-migrate";

// M5: Identity 系テーブル（organization, app_user, organization_member）
// 設計書 §12.3（ロール5種）、§14.2（Managed OIDC + RBAC）
// 設計書 §13.1 に物理スキーマ未記載のため、本マイグレーションで補完する。

export async function up(pgm: MigrationBuilder): Promise<void> {
  // §12.3 ロール enum（5種）
  pgm.createType("role_enum", [
    "ORGANIZATION_ADMIN",
    "RESEARCHER",
    "REVIEWER",
    "CORPUS_EDITOR",
    "SYSTEM_ADMIN",
  ]);

  // 組織
  pgm.createTable("organization", {
    organization_id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    name: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "ACTIVE" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // ユーザ（OIDC アカウントと1:1）
  // OIDC 仕様上 sub は issuer 内でのみ一意。 therefore (oidc_issuer, oidc_sub) の複合一意。
  pgm.createTable("app_user", {
    user_id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    // OIDC issuer URL（例: http://localhost:8080/realms/blra）
    oidc_issuer: { type: "text", notNull: true },
    // OIDC subject claim（issuer 内で一意）
    oidc_sub: { type: "text", notNull: true },
    email: { type: "text", notNull: true, unique: true },
    display_name: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "ACTIVE" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // (oidc_issuer, oidc_sub) の複合一意制約
  // OIDC 仕様: sub は issuer 内でのみ一意。プロバイダ間移行も考慮。
  pgm.addConstraint("app_user", "app_user_oidc_unique", {
    unique: ["oidc_issuer", "oidc_sub"],
  });

  // 組織メンバーシップ（ユーザ × 組織 × ロール）
  // 1ユーザが複数ロール所持可（3組複合主キー）
  pgm.createTable("organization_member", {
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organization(organization_id)",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "app_user(user_id)",
    },
    role: { type: "role_enum", notNull: true },
    granted_by: { type: "uuid", references: "app_user(user_id)" },
    granted_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("organization_member", "organization_member_pk", {
    primaryKey: ["organization_id", "user_id", "role"],
  });

  pgm.createIndex("organization_member", "user_id", {
    name: "idx_organization_member_user_id",
  });

  // システム組織の seed（SYSTEM_ADMIN ロール付与先。
  // RLS ポリシーを等値比較に保つため、NULL ではなく固定UUIDの組織を作成）
  pgm.sql(`
    INSERT INTO organization (organization_id, name, status)
    VALUES ('00000000-0000-0000-0000-000000000001', 'SYSTEM', 'ACTIVE')
    ON CONFLICT (organization_id) DO NOTHING
  `);

  // デフォルト組織（初回ログインユーザの RESEARCHER ロール付与先）
  pgm.sql(`
    INSERT INTO organization (organization_id, name, status)
    VALUES ('00000000-0000-0000-0000-000000000002', 'DEFAULT', 'ACTIVE')
    ON CONFLICT (organization_id) DO NOTHING
  `);

  // RLS 基盤: organization テーブルのポリシー雛形（§12.3 アプリ層+RLS二重担保）
  pgm.sql(`ALTER TABLE organization ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`
    CREATE POLICY org_isolation ON organization
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
        OR organization_id IS NULL
      )
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP POLICY IF EXISTS org_isolation ON organization`);
  pgm.sql(`ALTER TABLE organization DISABLE ROW LEVEL SECURITY`);
  pgm.dropTable("organization_member");
  pgm.dropTable("app_user");
  pgm.dropType("role_enum");
  pgm.dropTable("organization");
}
