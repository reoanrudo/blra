# BLRA — 建築法令リファレンス

建築実務者が、適用時点と出典の確からしさを明示したまま法令原文をたどり、案件単位で根拠を保存し、第三者が再現できる形で共有するためのサービス。

- 設計正本: [docs/design-spec.md](docs/design-spec.md)（v1.1・Normative）
- 調査記録: [docs/research-log.md](docs/research-log.md)（Informative。設計根拠）
- 体制: Solo Track（実装1名＋AI支援）。設計書 §15.8

---

## 現在地: S0 — Corpus Feasibility

**まだアプリケーションを作らない。** 現在は S0（3週間）であり、目的は「対象コーパスを正確に構造化して提供できるか」を実測することだけである。

設計書 §15.2 のとおり、S0 の結果次第でプロダクト定義そのものが変わる。告示の溶け込み済み現行全文が入手できない場合、次の3択のいずれかを選ぶ事業判断が発生する。

1. 自製の編集現行版を人手確認込みで提供する（運用コストを商品原価に組み込む）
2. 告示は原文のみ提供し、統合は利用者に委ねる（価値提案が弱まる）
3. 対象テーマを、告示依存の少ない領域へ変更する

この判断が出るまで S1 へ進まない。

### S0 の実施項目

| # | 内容 | 種別 | 成果物 | 状態 |
|---|---|---|---|---|
| F-1 | Source Inventory | 調査 | [s0-findings/F-1-source-inventory.md](s0-findings/F-1-source-inventory.md) | 未着手 |
| F-2 | e-Gov Parser Spike（条項号抽出率 99% 以上） | コード | [s0-findings/F-2-parser.md](s0-findings/F-2-parser.md) | **PASS 3/3** |
| F-3 | 告示 Parser Spike（50件中45件以上） | コード | `spikes/src/f2-egov-parser/`（拡張） | 未着手 |
| F-4 | 溶け込み実現性（自製統合の所要工数実測） | 調査 | [s0-findings/F-4-consolidation.md](s0-findings/F-4-consolidation.md) | 未着手 |
| F-5 | Version Diff Spike | コード | `spikes/src/f5-version-diff/` | 未着手 |
| F-6 | Citation Resolver Spike（実引用200件で解決率90%以上） | コード | `spikes/src/f6-citation-resolver/` | 未着手 |
| F-7 | 検索基盤と拡張の可用性確認（pg_bigm / PGroonga / btree_gist） | 検証 | [s0-findings/F-7-search-infra.md](s0-findings/F-7-search-infra.md) | 未着手 |
| F-8 | 利用条件の法的確認 | 調査 | [s0-findings/F-8-legal-terms.md](s0-findings/F-8-legal-terms.md) | 未着手 |
| F-9 | 履歴版の遡及範囲実測（`coverage_from` の初期値確定） | 検証 | [s0-findings/F-9-coverage.md](s0-findings/F-9-coverage.md) | **完了・要判断** |

並行して U-1〜U-4（実務者ヒアリング、Baseline計測、検索課題30件、Design Partner確保）を進める。設計書 §15.3・§15.9。

### S0 Exit Criteria

- F-1〜F-9 を完了する
- 上記3択のいずれを採るかを決定し、ADR に記録する
- **中止条件**（設計書 §15.9.1）: 告示の統合が1件あたり2時間を超える、または対象法令の5%以上で条項構造を抽出できない場合、S1 へ進まず判断へ戻る

### S1 着手前に必須の前提

- [ ] **建築法令 Domain Reviewer の確保**（外部1〜2名・有償・兼任不可）。設計書 ADR-016 により、未確保のまま S1 へ進まない
- [ ] O-1（告示の入手可否）の決定
- [ ] O-2（日本語検索基盤）の決定
- [ ] O-3（対象テーマの確定）

---

## ディレクトリ

```
docs/          設計正本と調査記録、ADR
s0-findings/   S0 の調査系成果物（F-1, F-4, F-7, F-8, F-9）
spikes/        S0 のコード系検証（F-2, F-3, F-5, F-6）
```

`spikes/` は**使い捨て前提**である。ここのコードを本実装へそのまま持ち込まない。S0 で確かめたいのは「できるか」と「どれだけ手間がかかるか」であって、コードの完成度ではない。本実装は S1 で `src/` を新設して始める。

## 開発

```bash
cd spikes && npm install
```

```bash
cd spikes && npm run f2 -- --law 325AC0000000201
```

## 技術選定

TypeScript / Node 22。理由と代替案の評価は [docs/adr/ADR-022-language-and-stack.md](docs/adr/ADR-022-language-and-stack.md)。

## 最重要原則（設計書 §18）

> 本サービスは、法令を自動判定することで信頼を得るのではない。法令原文、適用時点、出典の確からしさ、参照関係、調査根拠を正確に扱うことで信頼を獲得する。

誤った条文を自信を持って表示した瞬間に、このプロダクトの存在価値は失われる。
