import { describe, expect, it } from "vitest";

import { formatRawTableCellText } from "@/lib/article/raw-table-text-format";

describe("formatRawTableCellText", () => {
  it("表内の法令番号は算用数字化し、通常の号番号は漢数字のまま残す", () => {
    expect(
      formatRawTableCellText("昭和二十五年法律第二百二号及び第二号"),
    ).toBe("昭和25年法律第202号及び第二号");
  });

  it("法律以外の法令種別も法令番号を算用数字化する", () => {
    expect(
      formatRawTableCellText("昭和二十五年政令第三百三十八号の第一号"),
    ).toBe("昭和25年政令第338号の第一号");
    expect(
      formatRawTableCellText("昭和二十五年厚生労働省令第百二号"),
    ).toBe("昭和25年厚生労働省令第102号");
  });

  it("条及び項は数字化し、号番号は漢数字のまま残す", () => {
    expect(formatRawTableCellText("第十条第七項第一号")).toBe("第10条第7項第一号");
  });
});
