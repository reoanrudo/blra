-- F-7: 設計書 §13.1 の制約が実際の PostgreSQL で機能するかの検証
--
-- 検証対象:
--   C-1 の修正  … valid_from の NOT NULL を外し CHECK で条件付き必須にした件
--   ADR-013     … 同一 Provision の有効期間重複を EXCLUDE 制約で禁止する件
--   §4.2        … 境界を半開区間 [valid_from, valid_to) とする件
--
-- 期待結果は各ケースの EXPECT コメントに記す。

\set ON_ERROR_STOP off

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS provision_version;
DROP TYPE IF EXISTS valid_from_status_enum;

CREATE TYPE valid_from_status_enum AS ENUM ('FIXED', 'UNDETERMINED', 'ESTIMATED');

CREATE TABLE provision_version (
  provision_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provision_id        uuid NOT NULL,
  citation_anchor     text NOT NULL,
  body                text NOT NULL,
  valid_from          date,
  valid_from_status   valid_from_status_enum NOT NULL DEFAULT 'FIXED',
  valid_to            date,
  CHECK (valid_from_status <> 'FIXED' OR valid_from IS NOT NULL)
);

ALTER TABLE provision_version ADD CONSTRAINT no_overlapping_validity
  EXCLUDE USING gist (
    provision_id WITH =,
    daterange(valid_from, valid_to, '[)') WITH &&
  ) WHERE (valid_from_status = 'FIXED');

\echo ''
\echo '=== ケース1: FIXED かつ valid_from あり → 成功すべき ==='
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_to, valid_from_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'art35', '第35条 本文', '2025-04-01', '2026-04-01', 'FIXED');

\echo ''
\echo '=== ケース2: FIXED かつ valid_from が NULL → CHECK で弾かれるべき（C-1） ==='
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_from_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'art35', '不正データ', NULL, 'FIXED');

\echo ''
\echo '=== ケース3: UNDETERMINED かつ valid_from が NULL → 成功すべき（C-1 の狙い） ==='
\echo '    「政令で定める日から施行する」を仮日付なしで表現できること'
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_from_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'art35', '未確定施行日の版', NULL, 'UNDETERMINED');

\echo ''
\echo '=== ケース4: 同一 provision で期間が重複 → EXCLUDE で弾かれるべき（ADR-013） ==='
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_to, valid_from_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'art35', '重複する版', '2025-10-01', '2026-10-01', 'FIXED');

\echo ''
\echo '=== ケース5: 半開区間の境界 valid_to = 次の valid_from → 成功すべき（§4.2） ==='
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_to, valid_from_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'art35', '次の版', '2026-04-01', NULL, 'FIXED');

\echo ''
\echo '=== ケース6: 別 provision なら同じ期間でも成功すべき ==='
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_to, valid_from_status)
VALUES ('22222222-2222-2222-2222-222222222222', 'art36', '別条の版', '2025-04-01', '2026-04-01', 'FIXED');

\echo ''
\echo '=== ケース7: 現行版が2つ（valid_to NULL が重複）→ 弾かれるべき ==='
INSERT INTO provision_version (provision_id, citation_anchor, body, valid_from, valid_to, valid_from_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'art35', 'もう一つの現行版', '2027-01-01', NULL, 'FIXED');

\echo ''
\echo '=== 最終状態 ==='
SELECT citation_anchor, valid_from, valid_to, valid_from_status, left(body, 20) AS body
FROM provision_version ORDER BY provision_id, valid_from NULLS LAST;

\echo ''
\echo '=== 時点解決クエリ（§4.2）: 2025-06-01 時点で有効な版 ==='
SELECT citation_anchor, valid_from, valid_to, left(body, 20) AS body
FROM provision_version
WHERE provision_id = '11111111-1111-1111-1111-111111111111'
  AND valid_from <= '2025-06-01'
  AND (valid_to IS NULL OR '2025-06-01' < valid_to)
  AND valid_from_status = 'FIXED';
