/**
 * 建築資料研究社『建築基準法関係法令集 2026年版』収録文書マニフェスト。
 *
 * 収録対象は総目次OCRを人手校正し、2026-07-28にe-Gov法令API v2へ
 * asof=2026-01-01で再照会して正式名称・法令種別・廃止状態を確認した120文書。
 * 「告示」5群は編集上の集合見出しであり、個別告示へ分解できるまで含めない。
 */

export const LAW_BOOK_EDITION_2026 = {
  editionKey: "ksk-2026",
  title: "建築基準法関係法令集 2026年版",
  editionYear: 2026,
  isbn: "978-4-86834-023-2",
  publisher: "建築資料研究社",
  bookPublishedAt: "2025-10-31",
  effectiveAsOf: "2026-01-01",
  manifestVersion: "1.0.0",
} as const;

export type LawBookInclusionMode = "full" | "excerpt";
export type LawCategory = "law" | "cabinet_order" | "ministry_ordinance";

export interface LawBookManifestEntry {
  displayOrder: number;
  printedTitle: string;
  officialTitle: string;
  printedPage: number;
  egovLawId: string;
  inclusionMode: LawBookInclusionMode;
}

export const LAW_BOOK_2026 = [
  {"displayOrder":1,"printedTitle":"建築基準法","officialTitle":"建築基準法","printedPage":1,"egovLawId":"325AC0000000201","inclusionMode":"full"},
  {"displayOrder":2,"printedTitle":"建築基準法施行令","officialTitle":"建築基準法施行令","printedPage":165,"egovLawId":"325CO0000000338","inclusionMode":"full"},
  {"displayOrder":3,"printedTitle":"建築基準法施行規則（抄）","officialTitle":"建築基準法施行規則","printedPage":373,"egovLawId":"325M50004000040","inclusionMode":"excerpt"},
  {"displayOrder":4,"printedTitle":"建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令（抄）","officialTitle":"建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令","printedPage":550,"egovLawId":"411M50004000013","inclusionMode":"excerpt"},
  {"displayOrder":5,"printedTitle":"建築士法","officialTitle":"建築士法","printedPage":553,"egovLawId":"325AC1000000202","inclusionMode":"full"},
  {"displayOrder":6,"printedTitle":"建築士法施行令","officialTitle":"建築士法施行令","printedPage":597,"egovLawId":"325CO0000000201","inclusionMode":"full"},
  {"displayOrder":7,"printedTitle":"建築士法施行規則（抄）","officialTitle":"建築士法施行規則","printedPage":600,"egovLawId":"325M50004000038","inclusionMode":"excerpt"},
  {"displayOrder":8,"printedTitle":"都市計画法","officialTitle":"都市計画法","printedPage":620,"egovLawId":"343AC0000000100","inclusionMode":"full"},
  {"displayOrder":9,"printedTitle":"都市計画法施行令","officialTitle":"都市計画法施行令","printedPage":691,"egovLawId":"344CO0000000158","inclusionMode":"full"},
  {"displayOrder":10,"printedTitle":"都市計画法施行規則（抄）","officialTitle":"都市計画法施行規則","printedPage":728,"egovLawId":"344M50004000049","inclusionMode":"excerpt"},
  {"displayOrder":11,"printedTitle":"風致地区内における建築等の規制に係る条例の制定に関する基準を定める政令（抄）","officialTitle":"風致地区内における建築等の規制に係る条例の制定に関する基準を定める政令","printedPage":736,"egovLawId":"344CO0000000317","inclusionMode":"excerpt"},
  {"displayOrder":12,"printedTitle":"消防法（抄）","officialTitle":"消防法","printedPage":739,"egovLawId":"323AC1000000186","inclusionMode":"excerpt"},
  {"displayOrder":13,"printedTitle":"消防法施行令（抄）","officialTitle":"消防法施行令","printedPage":755,"egovLawId":"336CO0000000037","inclusionMode":"excerpt"},
  {"displayOrder":14,"printedTitle":"危険物の規制に関する政令（抄）","officialTitle":"危険物の規制に関する政令","printedPage":790,"egovLawId":"334CO0000000306","inclusionMode":"excerpt"},
  {"displayOrder":15,"printedTitle":"住宅用防災機器の設置及び維持に関する条例の制定に関する基準を定める省令","officialTitle":"住宅用防災機器の設置及び維持に関する条例の制定に関する基準を定める省令","printedPage":808,"egovLawId":"416M60000008138","inclusionMode":"full"},
  {"displayOrder":16,"printedTitle":"必要とされる防火安全性能を有する消防の用に供する設備等に関する省令","officialTitle":"必要とされる防火安全性能を有する消防の用に供する設備等に関する省令","printedPage":811,"egovLawId":"416M60000008092","inclusionMode":"full"},
  {"displayOrder":17,"printedTitle":"特定共同住宅等における必要とされる防火安全性能を有する消防の用に供する設備等に関する省令","officialTitle":"特定共同住宅等における必要とされる防火安全性能を有する消防の用に供する設備等に関する省令","printedPage":812,"egovLawId":"417M60000008040","inclusionMode":"full"},
  {"displayOrder":18,"printedTitle":"高齢者、障害者等の移動等の円滑化の促進に関する法律（抄）","officialTitle":"高齢者、障害者等の移動等の円滑化の促進に関する法律","printedPage":822,"egovLawId":"418AC0000000091","inclusionMode":"excerpt"},
  {"displayOrder":19,"printedTitle":"高齢者、障害者等の移動等の円滑化の促進に関する法律施行令（抄）","officialTitle":"高齢者、障害者等の移動等の円滑化の促進に関する法律施行令","printedPage":835,"egovLawId":"418CO0000000379","inclusionMode":"excerpt"},
  {"displayOrder":20,"printedTitle":"高齢者、障害者等の移動等の円滑化の促進に関する法律施行規則（抄）","officialTitle":"高齢者、障害者等の移動等の円滑化の促進に関する法律施行規則","printedPage":845,"egovLawId":"418M60000800110","inclusionMode":"excerpt"},
  {"displayOrder":21,"printedTitle":"高齢者、障害者等が円滑に利用できるようにするために誘導すべき建築物特定施設の構造及び配置に関する基準を定める省令","officialTitle":"高齢者、障害者等が円滑に利用できるようにするために誘導すべき建築物特定施設の構造及び配置に関する基準を定める省令","printedPage":848,"egovLawId":"418M60000800114","inclusionMode":"full"},
  {"displayOrder":22,"printedTitle":"建築物のエネルギー消費性能の向上等に関する法律（抄）","officialTitle":"建築物のエネルギー消費性能の向上等に関する法律","printedPage":856,"egovLawId":"427AC0000000053","inclusionMode":"excerpt"},
  {"displayOrder":23,"printedTitle":"建築物のエネルギー消費性能の向上等に関する法律施行令","officialTitle":"建築物のエネルギー消費性能の向上等に関する法律施行令","printedPage":878,"egovLawId":"428CO0000000008","inclusionMode":"full"},
  {"displayOrder":24,"printedTitle":"建築物のエネルギー消費性能の向上等に関する法律施行規則（抄）","officialTitle":"建築物のエネルギー消費性能の向上等に関する法律施行規則","printedPage":880,"egovLawId":"428M60000800005","inclusionMode":"excerpt"},
  {"displayOrder":25,"printedTitle":"建築物エネルギー消費性能基準等を定める省令","officialTitle":"建築物エネルギー消費性能基準等を定める省令","printedPage":905,"egovLawId":"428M60000C00001","inclusionMode":"full"},
  {"displayOrder":26,"printedTitle":"エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律（抄）","officialTitle":"エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律","printedPage":922,"egovLawId":"354AC0000000049","inclusionMode":"excerpt"},
  {"displayOrder":27,"printedTitle":"エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律施行令（抄）","officialTitle":"エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律施行令","printedPage":924,"egovLawId":"354CO0000000267","inclusionMode":"excerpt"},
  {"displayOrder":28,"printedTitle":"建築物の耐震改修の促進に関する法律（抄）","officialTitle":"建築物の耐震改修の促進に関する法律","printedPage":925,"egovLawId":"407AC0000000123","inclusionMode":"excerpt"},
  {"displayOrder":29,"printedTitle":"建築物の耐震改修の促進に関する法律施行令（抄）","officialTitle":"建築物の耐震改修の促進に関する法律施行令","printedPage":931,"egovLawId":"407CO0000000429","inclusionMode":"excerpt"},
  {"displayOrder":30,"printedTitle":"建築物の耐震改修の促進に関する法律施行規則（抄）","officialTitle":"建築物の耐震改修の促進に関する法律施行規則","printedPage":943,"egovLawId":"407M50004000028","inclusionMode":"excerpt"},
  {"displayOrder":31,"printedTitle":"住宅の品質確保の促進等に関する法律（抄）","officialTitle":"住宅の品質確保の促進等に関する法律","printedPage":955,"egovLawId":"411AC0000000081","inclusionMode":"excerpt"},
  {"displayOrder":32,"printedTitle":"住宅の品質確保の促進等に関する法律施行令（抄）","officialTitle":"住宅の品質確保の促進等に関する法律施行令","printedPage":962,"egovLawId":"412CO0000000064","inclusionMode":"excerpt"},
  {"displayOrder":33,"printedTitle":"住宅の品質確保の促進等に関する法律施行規則（抄）","officialTitle":"住宅の品質確保の促進等に関する法律施行規則","printedPage":963,"egovLawId":"412M50004000020","inclusionMode":"excerpt"},
  {"displayOrder":34,"printedTitle":"特定住宅瑕疵担保責任の履行の確保等に関する法律（抄）","officialTitle":"特定住宅瑕疵担保責任の履行の確保等に関する法律","printedPage":968,"egovLawId":"419AC0000000066","inclusionMode":"excerpt"},
  {"displayOrder":35,"printedTitle":"特定住宅瑕疵担保責任の履行の確保等に関する法律施行令（抄）","officialTitle":"特定住宅瑕疵担保責任の履行の確保等に関する法律施行令","printedPage":974,"egovLawId":"419CO0000000395","inclusionMode":"excerpt"},
  {"displayOrder":36,"printedTitle":"特定住宅瑕疵担保責任の履行の確保等に関する法律施行規則（抄）","officialTitle":"特定住宅瑕疵担保責任の履行の確保等に関する法律施行規則","printedPage":977,"egovLawId":"420M60000800010","inclusionMode":"excerpt"},
  {"displayOrder":37,"printedTitle":"長期優良住宅の普及の促進に関する法律（抄）","officialTitle":"長期優良住宅の普及の促進に関する法律","printedPage":979,"egovLawId":"420AC0000000087","inclusionMode":"excerpt"},
  {"displayOrder":38,"printedTitle":"長期優良住宅の普及の促進に関する法律施行令","officialTitle":"長期優良住宅の普及の促進に関する法律施行令","printedPage":986,"egovLawId":"421CO0000000024","inclusionMode":"full"},
  {"displayOrder":39,"printedTitle":"長期優良住宅の普及の促進に関する法律施行規則","officialTitle":"長期優良住宅の普及の促進に関する法律施行規則","printedPage":987,"egovLawId":"421M60000800003","inclusionMode":"full"},
  {"displayOrder":40,"printedTitle":"建設業法（抄）","officialTitle":"建設業法","printedPage":992,"egovLawId":"324AC0000000100","inclusionMode":"excerpt"},
  {"displayOrder":41,"printedTitle":"建設業法施行令（抄）","officialTitle":"建設業法施行令","printedPage":1010,"egovLawId":"331CO0000000273","inclusionMode":"excerpt"},
  {"displayOrder":42,"printedTitle":"宅地建物取引業法（抄）","officialTitle":"宅地建物取引業法","printedPage":1016,"egovLawId":"327AC1000000176","inclusionMode":"excerpt"},
  {"displayOrder":43,"printedTitle":"宅地建物取引業法施行規則（抄）","officialTitle":"宅地建物取引業法施行規則","printedPage":1022,"egovLawId":"332M50004000012","inclusionMode":"excerpt"},
  {"displayOrder":44,"printedTitle":"土地区画整理法（抄）","officialTitle":"土地区画整理法","printedPage":1024,"egovLawId":"329AC0000000119","inclusionMode":"excerpt"},
  {"displayOrder":45,"printedTitle":"都市再開発法（抄）","officialTitle":"都市再開発法","printedPage":1026,"egovLawId":"344AC0000000038","inclusionMode":"excerpt"},
  {"displayOrder":46,"printedTitle":"都市再生特別措置法（抄）","officialTitle":"都市再生特別措置法","printedPage":1031,"egovLawId":"414AC0000000022","inclusionMode":"excerpt"},
  {"displayOrder":47,"printedTitle":"都市再生特別措置法施行令（抄）","officialTitle":"都市再生特別措置法施行令","printedPage":1049,"egovLawId":"414CO0000000190","inclusionMode":"excerpt"},
  {"displayOrder":48,"printedTitle":"都市の低炭素化の促進に関する法律（抄）","officialTitle":"都市の低炭素化の促進に関する法律","printedPage":1053,"egovLawId":"424AC0000000084","inclusionMode":"excerpt"},
  {"displayOrder":49,"printedTitle":"都市の低炭素化の促進に関する法律施行令（抄）","officialTitle":"都市の低炭素化の促進に関する法律施行令","printedPage":1059,"egovLawId":"424CO0000000286","inclusionMode":"excerpt"},
  {"displayOrder":50,"printedTitle":"都市公園法（抄）","officialTitle":"都市公園法","printedPage":1060,"egovLawId":"331AC0000000079","inclusionMode":"excerpt"},
  {"displayOrder":51,"printedTitle":"都市公園法施行令（抄）","officialTitle":"都市公園法施行令","printedPage":1062,"egovLawId":"331CO0000000290","inclusionMode":"excerpt"},
  {"displayOrder":52,"printedTitle":"都市緑地法（抄）","officialTitle":"都市緑地法","printedPage":1063,"egovLawId":"348AC0000000072","inclusionMode":"excerpt"},
  {"displayOrder":53,"printedTitle":"都市緑地法施行令（抄）","officialTitle":"都市緑地法施行令","printedPage":1066,"egovLawId":"349CO0000000003","inclusionMode":"excerpt"},
  {"displayOrder":54,"printedTitle":"港湾法（抄）","officialTitle":"港湾法","printedPage":1067,"egovLawId":"325AC0000000218","inclusionMode":"excerpt"},
  {"displayOrder":55,"printedTitle":"流通業務市街地の整備に関する法律（抄）","officialTitle":"流通業務市街地の整備に関する法律","printedPage":1069,"egovLawId":"341AC0000000110","inclusionMode":"excerpt"},
  {"displayOrder":56,"printedTitle":"幹線道路の沿道の整備に関する法律（抄）","officialTitle":"幹線道路の沿道の整備に関する法律","printedPage":1070,"egovLawId":"355AC0000000034","inclusionMode":"excerpt"},
  {"displayOrder":57,"printedTitle":"集落地域整備法（抄）","officialTitle":"集落地域整備法","printedPage":1074,"egovLawId":"362AC0000000063","inclusionMode":"excerpt"},
  {"displayOrder":58,"printedTitle":"宅地造成及び特定盛土等規制法（抄）","officialTitle":"宅地造成及び特定盛土等規制法","printedPage":1077,"egovLawId":"336AC0000000191","inclusionMode":"excerpt"},
  {"displayOrder":59,"printedTitle":"宅地造成及び特定盛土等規制法施行令（抄）","officialTitle":"宅地造成及び特定盛土等規制法施行令","printedPage":1090,"egovLawId":"337CO0000000016","inclusionMode":"excerpt"},
  {"displayOrder":60,"printedTitle":"密集市街地における防災街区の整備の促進に関する法律（抄）","officialTitle":"密集市街地における防災街区の整備の促進に関する法律","printedPage":1101,"egovLawId":"409AC0000000049","inclusionMode":"excerpt"},
  {"displayOrder":61,"printedTitle":"地すべり等防止法（抄）","officialTitle":"地すべり等防止法","printedPage":1109,"egovLawId":"333AC0000000030","inclusionMode":"excerpt"},
  {"displayOrder":62,"printedTitle":"急傾斜地の崩壊による災害の防止に関する法律（抄）","officialTitle":"急傾斜地の崩壊による災害の防止に関する法律","printedPage":1110,"egovLawId":"344AC0000000057","inclusionMode":"excerpt"},
  {"displayOrder":63,"printedTitle":"土砂災害警戒区域等における土砂災害防止対策の推進に関する法律（抄）","officialTitle":"土砂災害警戒区域等における土砂災害防止対策の推進に関する法律","printedPage":1111,"egovLawId":"412AC0000000057","inclusionMode":"excerpt"},
  {"displayOrder":64,"printedTitle":"特定空港周辺航空機騒音対策特別措置法（抄）","officialTitle":"特定空港周辺航空機騒音対策特別措置法","printedPage":1113,"egovLawId":"353AC0000000026","inclusionMode":"excerpt"},
  {"displayOrder":65,"printedTitle":"特定空港周辺航空機騒音対策特別措置法施行令（抄）","officialTitle":"特定空港周辺航空機騒音対策特別措置法施行令","printedPage":1114,"egovLawId":"353CO0000000355","inclusionMode":"excerpt"},
  {"displayOrder":66,"printedTitle":"特定都市河川浸水被害対策法（抄）","officialTitle":"特定都市河川浸水被害対策法","printedPage":1115,"egovLawId":"415AC0000000077","inclusionMode":"excerpt"},
  {"displayOrder":67,"printedTitle":"特定都市河川浸水被害対策法施行令（抄）","officialTitle":"特定都市河川浸水被害対策法施行令","printedPage":1120,"egovLawId":"416CO0000000168","inclusionMode":"excerpt"},
  {"displayOrder":68,"printedTitle":"津波防災地域づくりに関する法律（抄）","officialTitle":"津波防災地域づくりに関する法律","printedPage":1122,"egovLawId":"423AC0000000123","inclusionMode":"excerpt"},
  {"displayOrder":69,"printedTitle":"津波防災地域づくりに関する法律施行令（抄）","officialTitle":"津波防災地域づくりに関する法律施行令","printedPage":1133,"egovLawId":"423CO0000000426","inclusionMode":"excerpt"},
  {"displayOrder":70,"printedTitle":"被災市街地復興特別措置法（抄）","officialTitle":"被災市街地復興特別措置法","printedPage":1136,"egovLawId":"407AC0000000014","inclusionMode":"excerpt"},
  {"displayOrder":71,"printedTitle":"特定非常災害の被害者の権利利益の保全等を図るための特別措置に関する法律（抄）","officialTitle":"特定非常災害の被害者の権利利益の保全等を図るための特別措置に関する法律","printedPage":1138,"egovLawId":"408AC0000000085","inclusionMode":"excerpt"},
  {"displayOrder":72,"printedTitle":"景観法（抄）","officialTitle":"景観法","printedPage":1140,"egovLawId":"416AC0000000110","inclusionMode":"excerpt"},
  {"displayOrder":73,"printedTitle":"地域における歴史的風致の維持及び向上に関する法律（抄）","officialTitle":"地域における歴史的風致の維持及び向上に関する法律","printedPage":1148,"egovLawId":"420AC0000000040","inclusionMode":"excerpt"},
  {"displayOrder":74,"printedTitle":"屋外広告物法（抄）","officialTitle":"屋外広告物法","printedPage":1153,"egovLawId":"324AC0000000189","inclusionMode":"excerpt"},
  {"displayOrder":75,"printedTitle":"文化財保護法（抄）","officialTitle":"文化財保護法","printedPage":1155,"egovLawId":"325AC0100000214","inclusionMode":"excerpt"},
  {"displayOrder":76,"printedTitle":"国土利用計画法（抄）","officialTitle":"国土利用計画法","printedPage":1157,"egovLawId":"349AC1000000092","inclusionMode":"excerpt"},
  {"displayOrder":77,"printedTitle":"労働基準法（抄）","officialTitle":"労働基準法","printedPage":1159,"egovLawId":"322AC0000000049","inclusionMode":"excerpt"},
  {"displayOrder":78,"printedTitle":"事業附属寄宿舎規程（抄）","officialTitle":"事業附属寄宿舎規程","printedPage":1161,"egovLawId":"322M40002000007","inclusionMode":"excerpt"},
  {"displayOrder":79,"printedTitle":"労働安全衛生法（抄）","officialTitle":"労働安全衛生法","printedPage":1162,"egovLawId":"347AC0000000057","inclusionMode":"excerpt"},
  {"displayOrder":80,"printedTitle":"労働安全衛生法施行令（抄）","officialTitle":"労働安全衛生法施行令","printedPage":1164,"egovLawId":"347CO0000000318","inclusionMode":"excerpt"},
  {"displayOrder":81,"printedTitle":"労働安全衛生規則（抄）","officialTitle":"労働安全衛生規則","printedPage":1167,"egovLawId":"347M50002000032","inclusionMode":"excerpt"},
  {"displayOrder":82,"printedTitle":"クレーン等安全規則（抄）","officialTitle":"クレーン等安全規則","printedPage":1179,"egovLawId":"347M50002000034","inclusionMode":"excerpt"},
  {"displayOrder":83,"printedTitle":"石綿障害予防規則（抄）","officialTitle":"石綿障害予防規則","printedPage":1180,"egovLawId":"417M60000100021","inclusionMode":"excerpt"},
  {"displayOrder":84,"printedTitle":"廃棄物の処理及び清掃に関する法律（抄）","officialTitle":"廃棄物の処理及び清掃に関する法律","printedPage":1185,"egovLawId":"345AC0000000137","inclusionMode":"excerpt"},
  {"displayOrder":85,"printedTitle":"建設工事に係る資材の再資源化等に関する法律（抄）","officialTitle":"建設工事に係る資材の再資源化等に関する法律","printedPage":1186,"egovLawId":"412AC0000000104","inclusionMode":"excerpt"},
  {"displayOrder":86,"printedTitle":"建設工事に係る資材の再資源化等に関する法律施行令（抄）","officialTitle":"建設工事に係る資材の再資源化等に関する法律施行令","printedPage":1189,"egovLawId":"412CO0000000495","inclusionMode":"excerpt"},
  {"displayOrder":87,"printedTitle":"道路法（抄）","officialTitle":"道路法","printedPage":1190,"egovLawId":"327AC1000000180","inclusionMode":"excerpt"},
  {"displayOrder":88,"printedTitle":"駐車場法（抄）","officialTitle":"駐車場法","printedPage":1192,"egovLawId":"332AC0000000106","inclusionMode":"excerpt"},
  {"displayOrder":89,"printedTitle":"駐車場法施行令（抄）","officialTitle":"駐車場法施行令","printedPage":1194,"egovLawId":"332CO0000000340","inclusionMode":"excerpt"},
  {"displayOrder":90,"printedTitle":"自転車の安全利用の促進及び自転車等の駐車対策の総合的推進に関する法律（抄）","officialTitle":"自転車の安全利用の促進及び自転車等の駐車対策の総合的推進に関する法律","printedPage":1197,"egovLawId":"355AC1000000087","inclusionMode":"excerpt"},
  {"displayOrder":91,"printedTitle":"水道法（抄）","officialTitle":"水道法","printedPage":1198,"egovLawId":"332AC0000000177","inclusionMode":"excerpt"},
  {"displayOrder":92,"printedTitle":"水道法施行令（抄）","officialTitle":"水道法施行令","printedPage":1200,"egovLawId":"332CO0000000336","inclusionMode":"excerpt"},
  {"displayOrder":93,"printedTitle":"給水装置の構造及び材質の基準に関する省令（抄）","officialTitle":"給水装置の構造及び材質の基準に関する省令","printedPage":1201,"egovLawId":"409M50000100014","inclusionMode":"excerpt"},
  {"displayOrder":94,"printedTitle":"下水道法（抄）","officialTitle":"下水道法","printedPage":1202,"egovLawId":"333AC0000000079","inclusionMode":"excerpt"},
  {"displayOrder":95,"printedTitle":"下水道法施行令（抄）","officialTitle":"下水道法施行令","printedPage":1205,"egovLawId":"334CO0000000147","inclusionMode":"excerpt"},
  {"displayOrder":96,"printedTitle":"浄化槽法（抄）","officialTitle":"浄化槽法","printedPage":1207,"egovLawId":"358AC1000000043","inclusionMode":"excerpt"},
  {"displayOrder":97,"printedTitle":"高圧ガス保安法（抄）","officialTitle":"高圧ガス保安法","printedPage":1210,"egovLawId":"326AC0000000204","inclusionMode":"excerpt"},
  {"displayOrder":98,"printedTitle":"ガス事業法（抄）","officialTitle":"ガス事業法","printedPage":1211,"egovLawId":"329AC0000000051","inclusionMode":"excerpt"},
  {"displayOrder":99,"printedTitle":"液化石油ガスの保安の確保及び取引の適正化に関する法律（抄）","officialTitle":"液化石油ガスの保安の確保及び取引の適正化に関する法律","printedPage":1212,"egovLawId":"342AC0000000149","inclusionMode":"excerpt"},
  {"displayOrder":100,"printedTitle":"建築物における衛生的環境の確保に関する法律（抄）","officialTitle":"建築物における衛生的環境の確保に関する法律","printedPage":1213,"egovLawId":"345AC1000000020","inclusionMode":"excerpt"},
  {"displayOrder":101,"printedTitle":"建築物における衛生的環境の確保に関する法律施行令（抄）","officialTitle":"建築物における衛生的環境の確保に関する法律施行令","printedPage":1214,"egovLawId":"345CO0000000304","inclusionMode":"excerpt"},
  {"displayOrder":102,"printedTitle":"学校教育法（抄）","officialTitle":"学校教育法","printedPage":1215,"egovLawId":"322AC0000000026","inclusionMode":"excerpt"},
  {"displayOrder":103,"printedTitle":"幼稚園設置基準（抄）","officialTitle":"幼稚園設置基準","printedPage":1216,"egovLawId":"331M50000080032","inclusionMode":"excerpt"},
  {"displayOrder":104,"printedTitle":"社会福祉法（抄）","officialTitle":"社会福祉法","printedPage":1217,"egovLawId":"326AC0000000045","inclusionMode":"excerpt"},
  {"displayOrder":105,"printedTitle":"児童福祉法（抄）","officialTitle":"児童福祉法","printedPage":1219,"egovLawId":"322AC0000000164","inclusionMode":"excerpt"},
  {"displayOrder":106,"printedTitle":"児童福祉施設の設備及び運営に関する基準（抄）","officialTitle":"児童福祉施設の設備及び運営に関する基準","printedPage":1220,"egovLawId":"323M40000100063","inclusionMode":"excerpt"},
  {"displayOrder":107,"printedTitle":"老人福祉法（抄）","officialTitle":"老人福祉法","printedPage":1223,"egovLawId":"338AC0000000133","inclusionMode":"excerpt"},
  {"displayOrder":108,"printedTitle":"養護老人ホームの設備及び運営に関する基準（抄）","officialTitle":"養護老人ホームの設備及び運営に関する基準","printedPage":1224,"egovLawId":"341M50000100019","inclusionMode":"excerpt"},
  {"displayOrder":109,"printedTitle":"特別養護老人ホームの設備及び運営に関する基準（抄）","officialTitle":"特別養護老人ホームの設備及び運営に関する基準","printedPage":1226,"egovLawId":"411M50000100046","inclusionMode":"excerpt"},
  {"displayOrder":110,"printedTitle":"医療法（抄）","officialTitle":"医療法","printedPage":1229,"egovLawId":"323AC0000000205","inclusionMode":"excerpt"},
  {"displayOrder":111,"printedTitle":"医療法施行規則（抄）","officialTitle":"医療法施行規則","printedPage":1230,"egovLawId":"323M40000100050","inclusionMode":"excerpt"},
  {"displayOrder":112,"printedTitle":"旅館業法（抄）","officialTitle":"旅館業法","printedPage":1232,"egovLawId":"323AC0000000138","inclusionMode":"excerpt"},
  {"displayOrder":113,"printedTitle":"旅館業法施行令（抄）","officialTitle":"旅館業法施行令","printedPage":1234,"egovLawId":"332CO0000000152","inclusionMode":"excerpt"},
  {"displayOrder":114,"printedTitle":"風俗営業等の規制及び業務の適正化等に関する法律（抄）","officialTitle":"風俗営業等の規制及び業務の適正化等に関する法律","printedPage":1235,"egovLawId":"323AC0000000122","inclusionMode":"excerpt"},
  {"displayOrder":115,"printedTitle":"畜舎等の建築等及び利用の特例に関する法律（抄）","officialTitle":"畜舎等の建築等及び利用の特例に関する法律","printedPage":1238,"egovLawId":"503AC0000000034","inclusionMode":"excerpt"},
  {"displayOrder":116,"printedTitle":"民法（抄）","officialTitle":"民法","printedPage":1242,"egovLawId":"129AC0000000089","inclusionMode":"excerpt"},
  {"displayOrder":117,"printedTitle":"建物の区分所有等に関する法律（抄）","officialTitle":"建物の区分所有等に関する法律","printedPage":1250,"egovLawId":"337AC0000000069","inclusionMode":"excerpt"},
  {"displayOrder":118,"printedTitle":"空家等対策の推進に関する特別措置法（抄）","officialTitle":"空家等対策の推進に関する特別措置法","printedPage":1251,"egovLawId":"426AC1000000127","inclusionMode":"excerpt"},
  {"displayOrder":119,"printedTitle":"地域再生法（抄）","officialTitle":"地域再生法","printedPage":1254,"egovLawId":"417AC0000000024","inclusionMode":"excerpt"},
  {"displayOrder":120,"printedTitle":"広域的地域活性化のための基盤整備に関する法律（抄）","officialTitle":"広域的地域活性化のための基盤整備に関する法律","printedPage":1258,"egovLawId":"419AC0000000052","inclusionMode":"excerpt"},
] as const satisfies readonly LawBookManifestEntry[];

export function lawCategoryFromEgovId(egovLawId: string): LawCategory {
  if (/^\d{3}AC/.test(egovLawId)) return "law";
  if (/^\d{3}CO/.test(egovLawId)) return "cabinet_order";
  if (/^\d{3}M/.test(egovLawId)) return "ministry_ordinance";
  throw new Error(`未対応のe-Gov法令IDです: ${egovLawId}`);
}

export function officialLawDataUrl(egovLawId: string): string {
  return `https://laws.e-gov.go.jp/api/2/law_file/xml/${encodeURIComponent(egovLawId)}?asof=${LAW_BOOK_EDITION_2026.effectiveAsOf}`;
}
