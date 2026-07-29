# BLRA — 建築法令リファレンス

建築実務者が、適用時点と出典の確からしさを明示したまま法令原文をたどり、案件単位で根拠を保存し、第三者が再現できる形で共有するためのサービス。

- 設計正本: [docs/design-spec.md](docs/design-spec.md)（v1.1・Normative）
- 調査記録: [docs/research-log.md](docs/research-log.md)（Informative。設計根拠）
- 体制: Solo Track（実装1名＋AI支援）。設計書 §15.8

---

## 現在地: S0 完了 → S1 着手準備

**S0 Corpus Feasibility が完了した（[ADR-024](docs/adr/ADR-024-s0-exit.md)）。** F-1〜F-9 の全項目が合格基準を満たし、中止条件に非該当。3択（O-1）は案Bに決定した（[ADR-023](docs/adr/ADR-023-notification-consolidation-policy.md)）。

S1（Corpus Foundation）へ進む前提は次のとおり。

- [ ] **建築法令 Domain Reviewer の確保**（外部1〜2名・有償・兼任不可）。設計書 ADR-016 により、未確保のまま S1 へ進まない。**これが唯一のハードブロッカー**
- [ ] U-1（実務者ヒアリング）で「告示の現行全文が読めないツールに価値があるか」を確認する
- [ ] O-3（対象テーマの確定）。F-9 の結果を踏まえ、新築の防火・避難に寄せる方向

S0 の主要な結論:
- **国法令**: e-Gov API v2 から溶け込み済み現行全文が取得可能。構造化 99.97%、版管理・差分・Anchor 移行も実測で成立
- **告示**: テキストPDF で取得可能（OCR 不要）。ただし公式の溶け込み済み現行全文は存在しない。案文＋改正履歴の提示に留める（案B）
- **利用条件**: e-Gov・国交省は PDL1.0（CC BY 4.0 互換）で自由利用。自治体例規は自治体ごとに異なる
- **検索基盤**: pg_bigm で日本語全文検索が成立

### S0 の実施項目

| # | 内容 | 種別 | 成果物 | 状態 |
|---|---|---|---|---|
| F-1 | Source Inventory | 調査 | [s0-findings/F-1-source-inventory.md](s0-findings/F-1-source-inventory.md) | **完了** |
| F-2 | e-Gov Parser Spike（条項号抽出率 99% 以上） | コード | [s0-findings/F-2-parser.md](s0-findings/F-2-parser.md) | **PASS 3/3** |
| F-3 | 告示 Parser Spike（50件中45件以上） | コード | [s0-findings/F-3-F-4-notifications.md](s0-findings/F-3-F-4-notifications.md) | **PASS 54/60（90%）** |
| F-4 | 溶け込み実現性（自製統合の所要工数実測） | 調査 | [s0-findings/F-3-F-4-notifications.md](s0-findings/F-3-F-4-notifications.md) | **完了・案B 採用（[ADR-023](docs/adr/ADR-023-notification-consolidation-policy.md)）** |
| F-5 | Version Diff Spike | コード | [s0-findings/F-5-version-diff.md](s0-findings/F-5-version-diff.md) | **PASS** |
| F-6 | Citation Resolver Spike（実引用200件で解決率90%以上） | コード | [s0-findings/F-6-citation-resolver.md](s0-findings/F-6-citation-resolver.md) | **PASS 99.6%** |
| F-7 | 検索基盤と拡張の可用性確認（pg_bigm / PGroonga / btree_gist） | 検証 | [s0-findings/F-7-search-infra.md](s0-findings/F-7-search-infra.md) | **PASS** |
| F-8 | 利用条件の法的確認 | 調査 | [s0-findings/F-8-legal-terms.md](s0-findings/F-8-legal-terms.md) | **完了（一次情報で確認）** |
| F-9 | 履歴版の遡及範囲実測（`coverage_from` の初期値確定） | 検証 | [s0-findings/F-9-coverage.md](s0-findings/F-9-coverage.md) | **完了（法=2016, 令・規則=2017）** |

並行して U-1〜U-4（実務者ヒアリング、Baseline計測、検索課題30件、Design Partner確保）を進める。設計書 §15.3・§15.9。

### S0 Exit Criteria

- F-1〜F-9 を完了する
- ~~上記3択のいずれを採るかを決定し、ADR に記録する~~ **→ 完了（案B、[ADR-023](docs/adr/ADR-023-notification-consolidation-policy.md)）**
- ~~F-1〜F-9 を完了する~~ **→ 完了（全項目 PASS）**
- ~~上記3択のいずれを採るかを決定し、ADR に記録する~~ **→ 完了（案B、[ADR-023](docs/adr/ADR-023-notification-consolidation-policy.md)）**
- **中止条件**（設計書 §15.9.1）: 告示の統合が1件あたり2時間を超える、または対象法令の5%以上で条項構造を抽出できない場合、S1 へ進まず判断へ戻る → **両方とも非該当（[ADR-024](docs/adr/ADR-024-s0-exit.md)）**

### S1 着手前に必須の前提

- [ ] **建築法令 Domain Reviewer の確保**（外部1〜2名・有償・兼任不可）。設計書 ADR-016 により、未確保のまま S1 へ進まない。**唯一のハードブロッカー**
- [x] ~~O-1（告示の入手可否）の決定~~ **→ 案B（[ADR-023](docs/adr/ADR-023-notification-consolidation-policy.md)）**
- [ ] O-2（日本語検索基盤）の決定 → F-7 で pg_bigm 採用が実質決定。ADR 化は S1 着手時
- [ ] O-3（対象テーマの確定）→ F-9 の結果を踏まえ新築防火・避難に寄せる方向。U-1 結果と合わせて最終決定

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
cd spikes && npm run f2
```

## 技術選定

TypeScript / Node 22。理由と代替案の評価は [docs/adr/ADR-022-language-and-stack.md](docs/adr/ADR-022-language-and-stack.md)。

## 最重要原則（設計書 §18）

> 本サービスは、法令を自動判定することで信頼を得るのではない。法令原文、適用時点、出典の確からしさ、参照関係、調査根拠を正確に扱うことで信頼を獲得する。

誤った条文を自信を持って表示した瞬間に、このプロダクトの存在価値は失われる。
