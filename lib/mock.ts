import type { Analysis, Annotation } from "./types";

/**
 * APIキーなしでUIを確認するためのモック分析を生成する。
 * 貼り付けられた任意のテキストに対して、実際の文位置にアノテーションを
 * 張るため、文区切りベースでダミーの根拠箇所を作る。
 */
/**
 * テキストから固有名詞らしき語を頻度順に拾う簡易ヒューリスティック。
 * 実分析と同じく「テキストに実際に登場するラベル」をモックでも使うため。
 */
function extractCandidateLabels(text: string): string[] {
  const counts = new Map<string, number>();
  const patterns = [
    // 複合語(カタカナ+接尾辞など)を先に拾う: 例「ミルバ共和国」「北岸連邦政府」
    /[ア-ヴー一-龠]{2,10}(?:省|庁|党|政府|委員会|連邦政府|連邦|共和国|大学|銀行|協会|機構)/g,
    /[ア-ヴー]{3,10}/g,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([w]) => w)
    .filter((w, i, arr) => arr.findIndex((x) => x.includes(w) && x !== w) === -1)
    .slice(0, 3);
}

export function buildMockAnalysis(text: string): Analysis {
  const labels = extractCandidateLabels(text);
  const labelA = labels[0] ?? "主体A";
  const labelB = labels[1] ?? "主体B";
  const labelC = labels[2] ?? "第三者";
  const sentences: { start: number; end: number }[] = [];
  const re = /[^。．!?！?\n]+[。．!?！?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && sentences.length < 12) {
    if (m[0].trim().length >= 8) {
      sentences.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  const pick = (i: number) => sentences[Math.min(i, sentences.length - 1)];
  const annotations: Annotation[] = [];

  if (sentences.length > 0) {
    const s = pick(0);
    annotations.push({
      start: s.start,
      end: s.end,
      quote: text.slice(s.start, s.end),
      entityId: "e1",
      function: "elevating",
      note: `(モック)${labelA}を主語に据え、行為の正当性を前提として提示している`,
    });
  }
  if (sentences.length > 1) {
    const s = pick(Math.floor(sentences.length / 2));
    annotations.push({
      start: s.start,
      end: s.end,
      quote: text.slice(s.start, s.end),
      entityId: "e2",
      function: "otherizing",
      note: `(モック)${labelB}を『理解し難い他者』として外集団化する言葉選び`,
    });
  }
  if (sentences.length > 2) {
    const s = pick(sentences.length - 1);
    annotations.push({
      start: s.start,
      end: s.end,
      quote: text.slice(s.start, s.end),
      entityId: "e2",
      function: "diminishing",
      note: `(モック)${labelB}の主張を受動態・伝聞形で弱め、下位に位置づけている`,
    });
  }

  return {
    entities: [
      { id: "e1", label: labelA, role: "above / in-group", altitude: 74, group: "in" },
      { id: "e2", label: labelB, role: "below / out-group", altitude: 28, group: "out" },
      { id: "e3", label: labelC, role: "neutral", altitude: 52, group: "neutral" },
    ],
    relationships: [
      { from: "e1", to: "e2", type: "hierarchy", splitFrom: 72, splitTo: 28 },
      { from: "e1", to: "e2", type: "in-out-group", inGroup: "e1", outGroup: "e2" },
      { from: "e1", to: "e3", type: "hierarchy", splitFrom: 58, splitTo: 42 },
    ],
    annotations,
    pattern: {
      narrativeFramePattern: "権威・秩序防衛型(authority/subversion)",
      patternDescription:
        "(モック)『秩序ある市場を守る』のような表現で、既存の権威と秩序の維持を無条件の善として設定し、それに従わない側を逸脱として外集団化する正当化パターン。",
    },
  };
}
