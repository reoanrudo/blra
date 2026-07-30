/**
 * e-Gov API revision_info から valid_from / valid_from_status を導出する。
 *
 * 設計書 §4.2 法令時間モデル:
 *  - amendment_enforcement_date がある → FIXED（施行日確定）
 *  - amendment_enforcement_date 無し・scheduled がある → UNDETERMINED（施行日未確定）
 *  - どちらも無い → UNDETERMINED + validFrom=null
 *
 * ESTIMATED（推測日付）は M3 では使わない（§4.2「推測で表示することを禁じる」の精神）。
 */

import type { RevisionInfo, ValidFromResult } from "./types.js";

export function deriveValidFrom(revision: RevisionInfo): ValidFromResult {
  // enforcement_date があれば確定（第一優先）
  if (revision.amendment_enforcement_date) {
    return {
      validFrom: new Date(revision.amendment_enforcement_date),
      validFromStatus: "FIXED",
    };
  }

  // scheduled は参考情報として保持するが、施行日は未確定なので validFrom は null
  // （scheduled を仮の validFrom に入れると時点検索が静かに誤る。§4.2）
  return {
    validFrom: null,
    validFromStatus: "UNDETERMINED",
  };
}
