# 一級建築士法規ベンチマーク

`architect-law-exam-ground-truth.json` には、公式問題から作成した派生情報だけを保存する。
問題文・選択肢は保存しない。根拠確認前のレコードは `draft` とし、評価対象に含めない。

現在は令和3年の30問を `draft` で登録済み。ただし、これらは正答となる主要論点だけを持つ
Schema Version 1 の部分データであり、複合問題として完成していない。検証済みは0問で、
全選択肢由来の論点と統合判断を確認するまで問題単位の評価には使用しない。

次期 Schema Version 2 は「問題→全選択肢由来の派生論点→統合判断」の階層型とする。詳細は
[`複合問題の論点分解設計`](../../docs/superpowers/specs/2026-08-09-compound-architect-law-problem-design.md)
を参照する。

## レコード形式

```json
{
  "examId": "1k-2021-gakka3-q01",
  "category": "definition",
  "query": "条文番号を含めない短い検索課題",
  "targetProvisions": [
    { "egovLawId": "法令ID", "articleNumberNormalized": "条番号" }
  ],
  "navigationPath": [
    { "egovLawId": "法令ID", "articleNumberNormalized": "条番号" }
  ],
  "exceptions": [],
  "unsupportedSources": [],
  "rationaleStatus": "draft"
}
```

`rationaleStatus` は、入力中を `draft`、公式正答肢・試験年度の法令・根拠条文を確認した後だけ
`verified` とする。`verified` 以外のレコードは評価に使用されない。

このレコード形式は Schema Version 1 である。Schema Version 2 へ移行するときは、既存レコードを
正答主要論点に対応する派生論点として保持し、`issueSetStatus=partial` にする。自動移行によって
`complete` または問題単位の `verified` にしてはならない。

## 実行

```bash
npm run bench:architect-law
npm run bench:architect-law -- --run --split=learning
npm run bench:architect-law -- --run --split=holdout
```

引数なしではマニフェストと正解セット整備率だけを検査する。`--run` を付けた場合だけDB検索を
実行する。未見評価は `--split=holdout` を明示しない限り実行されない。
