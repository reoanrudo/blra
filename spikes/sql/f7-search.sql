-- F-7: pg_bigm による日本語全文検索の実測
--
-- 設計書 §9.2 の検証:
--   「形態素解析の辞書に載らない専門語（準耐火構造、特定防火設備、令8区画）が
--     多いため、形態素単独では取りこぼす。N-gram との併用を前提とする」
--
-- 前提: npm run f7:export で spikes/out/provisions.tsv を作成済み

CREATE EXTENSION IF NOT EXISTS pg_bigm;

DROP TABLE IF EXISTS provision_search;

CREATE TABLE provision_search (
  law_id          text NOT NULL,
  law_title       text NOT NULL,
  canonical_path  text NOT NULL,
  stable_label    text NOT NULL,
  provision_type  text NOT NULL,
  heading         text NOT NULL,
  body            text NOT NULL,
  valid_from      date
);

\copy provision_search FROM 'out/provisions.tsv' WITH (FORMAT text, DELIMITER E'\t')

CREATE INDEX idx_body_bigm ON provision_search USING gin (body gin_bigm_ops);
CREATE INDEX idx_heading_bigm ON provision_search USING gin (heading gin_bigm_ops);
ANALYZE provision_search;

\echo ''
\echo '=== 投入結果 ==='
SELECT law_title, count(*) AS 条項数 FROM provision_search GROUP BY law_title ORDER BY 1;

\echo ''
\echo '=== 専門語の検索ヒット数（設計書 §9.2 の検証） ==='
SELECT '準耐火構造' AS 語, count(*) FROM provision_search WHERE body LIKE '%準耐火構造%'
UNION ALL SELECT '特定防火設備', count(*) FROM provision_search WHERE body LIKE '%特定防火設備%'
UNION ALL SELECT '防火区画', count(*) FROM provision_search WHERE body LIKE '%防火区画%'
UNION ALL SELECT '排煙設備', count(*) FROM provision_search WHERE body LIKE '%排煙設備%'
UNION ALL SELECT '無窓居室', count(*) FROM provision_search WHERE body LIKE '%無窓居室%'
UNION ALL SELECT '避難階段', count(*) FROM provision_search WHERE body LIKE '%避難階段%'
UNION ALL SELECT '竪穴', count(*) FROM provision_search WHERE body LIKE '%竪穴%';

\echo ''
\echo '=== 実検索例: 防火区画（上位5件） ==='
SELECT law_title, stable_label, left(body, 60) AS 抜粋
FROM provision_search WHERE body LIKE '%防火区画%' LIMIT 5;

\echo ''
\echo '=== インデックスが使われるか（EXPLAIN） ==='
EXPLAIN (COSTS OFF) SELECT count(*) FROM provision_search WHERE body LIKE '%特定防火設備%';
