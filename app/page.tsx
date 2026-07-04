"use client";

import { useEffect, useMemo, useState } from "react";
import type { Analysis, Annotation, Entity } from "@/lib/types";
import { SAMPLES } from "@/lib/samples";
import { colorForAltitude, colorForAltitudeAlpha } from "@/lib/color";

const MAX_CHARS = 6000;

const DISCLAIMER =
  "この分析は、貼り付けられたテキストの言葉選びや構成が、どのような序列・内外集団のナラティブを構築しているかについてのAIによる読解であり、登場する主体の本質的な価値の優劣や、書き手の人格・意図を断定するものではありません。";

/* ---------- ハイライト付きテキスト ---------- */

function AnnotatedText({
  text,
  analysis,
  selected,
  activeEntityId,
  onSelect,
  onHoverEntity,
}: {
  text: string;
  analysis: Analysis;
  selected: Annotation | null;
  activeEntityId: string | null;
  onSelect: (a: Annotation) => void;
  onHoverEntity: (id: string | null) => void;
}) {
  const entityById = useMemo(
    () => new Map(analysis.entities.map((e) => [e.id, e])),
    [analysis],
  );

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  analysis.annotations.forEach((a, i) => {
    if (a.start > cursor) {
      segments.push(<span key={`t${i}`}>{text.slice(cursor, a.start)}</span>);
    }
    const entity = entityById.get(a.entityId);
    const alt = entity?.altitude ?? 50;
    const isActive = selected === a;
    const isEntityActive = activeEntityId !== null && a.entityId === activeEntityId;
    segments.push(
      <mark
        key={`a${i}`}
        className={`${isActive ? "active" : ""} ${isEntityActive ? "entity-active" : ""}`}
        style={{
          background: colorForAltitudeAlpha(alt, isEntityActive ? 0.32 : 0.18),
          borderBottom: `2px solid ${colorForAltitude(alt)}`,
        }}
        title={a.note}
        onClick={() => onSelect(a)}
        onMouseEnter={() => onHoverEntity(a.entityId)}
        onMouseLeave={() => onHoverEntity(null)}
      >
        {text.slice(a.start, a.end)}
      </mark>,
    );
    cursor = a.end;
  });
  if (cursor < text.length) {
    segments.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <div className="annotated-text">{segments}</div>;
}

/* ---------- 相関図 ---------- */

const W = 420;
const H = 360;
const TOP = 36;
const BOTTOM = 320;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function Graph({
  analysis,
  activeEntityId,
  onSelectEntity,
  onHoverEntity,
}: {
  analysis: Analysis;
  activeEntityId: string | null;
  onSelectEntity: (id: string) => void;
  onHoverEntity: (id: string | null) => void;
}) {
  const { entities, relationships } = analysis;
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  // エッジのホバー/クリックで詳細ツールチップを出す(高度計のcombo-readout相当)
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const activeEdge = hoverEdge ?? selectedEdge;

  const pos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const n = entities.length;
    entities.forEach((e, i) => {
      const x = n === 1 ? W / 2 : 70 + (i * (W - 130)) / (n - 1);
      const y = TOP + ((100 - e.altitude) / 100) * (BOTTOM - TOP);
      map.set(e.id, { x, y });
    });
    return map;
  }, [entities]);

  // アクティブな主体と直接つながっている主体の集合(それ以外は減光する)
  const neighborhood = useMemo(() => {
    if (!activeEntityId) return null;
    const set = new Set<string>([activeEntityId]);
    relationships.forEach((r) => {
      if (r.from === activeEntityId) set.add(r.to);
      if (r.to === activeEntityId) set.add(r.from);
    });
    return set;
  }, [activeEntityId, relationships]);

  return (
    <svg
      className="graph-svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 高度スケール(高度計と同じ軸) */}
      <defs>
        <linearGradient id="track" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#C15A3A" />
          <stop offset="0.5" stopColor="rgba(25,25,25,0.18)" />
          <stop offset="1" stopColor="#7FB5A6" />
        </linearGradient>
      </defs>
      <rect x="14" y={TOP} width="5" height={BOTTOM - TOP} rx="2.5" fill="url(#track)" />
      <text x="26" y={TOP + 4} fontSize="8" fill="#87867F" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
        ABOVE — 序列OSの外側
      </text>
      <text x="26" y={BOTTOM + 2} fontSize="8" fill="#87867F" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
        GROUND — チンパンジーOS重力圏
      </text>

      {/* エッジ */}
      {relationships.map((r, i) => {
        const p1 = pos.get(r.from);
        const p2 = pos.get(r.to);
        if (!p1 || !p2) return null;
        const isInOut = r.type === "in-out-group";
        const involved =
          activeEntityId !== null && (r.from === activeEntityId || r.to === activeEntityId);
        const isActiveEdge = i === activeEdge;
        const dimmed = activeEntityId !== null && !involved && !isActiveEdge;
        const stroke = involved || isActiveEdge ? "#191919" : "rgba(25,25,25,0.3)";

        // 数値ペアはエッジの中間地点に数値のみ表示(主体名は繰り返さない)
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * 9;
        const oy = (dx / len) * 9;

        return (
          <g key={i} opacity={dimmed ? 0.25 : 1}>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={stroke}
              strokeWidth={involved || isActiveEdge ? 2 : 1.2}
              strokeDasharray={isInOut ? "5 4" : undefined}
            />
            {r.type === "hierarchy" && r.splitFrom != null && r.splitTo != null && (
              <text
                x={midX + ox} y={midY + oy}
                fontSize="8.5" textAnchor="middle"
                fill={isActiveEdge ? "#191919" : "#87867F"}
                fontFamily="'JetBrains Mono', monospace"
              >
                {r.splitFrom}/{r.splitTo}
              </text>
            )}
            {/* 当たり判定用の透明な太線(ホバー/クリックで詳細表示) */}
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="transparent"
              strokeWidth="14"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverEdge(i)}
              onMouseLeave={() => setHoverEdge(null)}
              onClick={() => setSelectedEdge(selectedEdge === i ? null : i)}
            />
          </g>
        );
      })}

      {/* ノード */}
      {entities.map((e) => {
        const p = pos.get(e.id)!;
        const isActive = e.id === activeEntityId;
        const dimmed = neighborhood !== null && !neighborhood.has(e.id);
        return (
          <g
            key={e.id}
            opacity={dimmed ? 0.35 : 1}
            onClick={() => onSelectEntity(e.id)}
            onMouseEnter={() => onHoverEntity(e.id)}
            onMouseLeave={() => onHoverEntity(null)}
            style={{ cursor: "pointer" }}
          >
            {isActive && (
              <circle cx={p.x} cy={p.y} r={15} fill="none" stroke="#191919" strokeWidth="1" strokeDasharray="3 3" />
            )}
            <circle
              cx={p.x} cy={p.y} r={isActive ? 11 : 9}
              fill={colorForAltitude(e.altitude)}
              stroke={isActive ? "#191919" : "#FAF9F5"}
              strokeWidth="2"
            />
            <text
              x={p.x} y={p.y - (isActive ? 22 : 16)}
              fontSize="10" fill={isActive ? "#191919" : "#87867F"}
              fontWeight={isActive ? 700 : 400}
              textAnchor="middle"
              fontFamily="'Zen Kaku Gothic New', sans-serif"
            >
              {truncate(e.label, 10)}
            </text>
            <text
              x={p.x} y={p.y + 24}
              fontSize="8.5" fill={colorForAltitude(e.altitude)}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
            >
              {e.altitude} · {e.group === "in" ? "WE" : e.group === "out" ? "THEY" : "—"}
            </text>
          </g>
        );
      })}

      {/* エッジ詳細ツールチップ(高度計のcombo-readout流: 名前+数値を色分けで1回だけ) */}
      {activeEdge !== null && relationships[activeEdge] && (() => {
        const r = relationships[activeEdge];
        const p1 = pos.get(r.from);
        const p2 = pos.get(r.to);
        const eFrom = entityById.get(r.from);
        const eTo = entityById.get(r.to);
        if (!p1 || !p2 || !eFrom || !eTo) return null;

        let parts: { text: string; color: string }[];
        if (r.type === "hierarchy") {
          parts = [
            { text: `${truncate(eFrom.label, 9)} ${r.splitFrom ?? "—"}`, color: colorForAltitude(eFrom.altitude) },
            { text: " / ", color: "#87867F" },
            { text: `${truncate(eTo.label, 9)} ${r.splitTo ?? "—"}`, color: colorForAltitude(eTo.altitude) },
          ];
        } else {
          const eIn = entityById.get(r.inGroup ?? "") ?? eFrom;
          const eOut = entityById.get(r.outGroup ?? "") ?? eTo;
          parts = [
            { text: `内 ${truncate(eIn.label, 9)}`, color: colorForAltitude(eIn.altitude) },
            { text: " / ", color: "#87867F" },
            { text: `外 ${truncate(eOut.label, 9)}`, color: colorForAltitude(eOut.altitude) },
          ];
        }

        const est = (s: string) =>
          [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 9 : 5.5), 0);
        const boxW = parts.reduce((w, p) => w + est(p.text), 0) + 16;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const x = Math.max(4, Math.min(W - boxW - 4, midX - boxW / 2));
        const y = midY - 34 < 4 ? midY + 14 : midY - 34;

        return (
          <g pointerEvents="none">
            <rect
              x={x} y={y} width={boxW} height={20} rx="2"
              fill="#FFFFFF" fillOpacity="0.97"
              stroke="rgba(25,25,25,0.25)" strokeWidth="0.75"
            />
            <text x={x + 8} y={y + 13.5} fontSize="9" fontFamily="'JetBrains Mono', monospace">
              {parts.map((p, j) => (
                <tspan key={j} fill={p.color}>{p.text}</tspan>
              ))}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

/* ---------- ページ本体 ---------- */

export default function Page() {
  const [input, setInput] = useState("");
  const [analyzedText, setAnalyzedText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [resultIsMock, setResultIsMock] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [hoverEntityId, setHoverEntityId] = useState<string | null>(null);

  // ホバー中はホバー対象を、それ以外はクリック選択を強調する
  const activeEntityId = hoverEntityId ?? selectedEntityId;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsMock(params.get("mock") === "1");
  }, []);

  const over = input.length > MAX_CHARS;

  async function analyze() {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSelectedAnnotation(null);
    setSelectedEntityId(null);
    setHoverEntityId(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, mock: isMock }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "分析に失敗しました。もう一度試してください。");
        return;
      }
      setAnalyzedText(input);
      setAnalysis(data.analysis as Analysis);
      setResultIsMock(data.mock === true);
    } catch {
      setError("通信に失敗しました。もう一度試してください。");
    } finally {
      setLoading(false);
    }
  }

  function selectAnnotation(a: Annotation) {
    setSelectedAnnotation(a);
    setSelectedEntityId(a.entityId);
  }

  function selectEntity(id: string) {
    setSelectedEntityId(id);
    // 別の主体を選んだら、無関係な注釈の解説は閉じる
    if (selectedAnnotation && selectedAnnotation.entityId !== id) {
      setSelectedAnnotation(null);
    }
  }

  return (
    <div className="wrap">
      <div className="eyebrow">narrative-xray / 序列ナラティブ透視装置</div>
      <h1>序列透視鏡</h1>
      <p className="subtitle">
        ニュース記事、企業の発表文、演説、宗教的テキスト——日常に流通する文章には、「誰が上で誰が下か」「誰がわれわれで誰がかれらか」という構造が埋め込まれている。テキストを貼り付けると、その序列・内外集団のナラティブ構造をAIが抽出して可視化する。高度計の姉妹装置。
      </p>

      {isMock && <div className="mock-banner">⚠ MOCK MODE — ダミーデータで動作中(APIは呼び出されません)</div>}

      <div className="privacy-note">
        入力したテキストは保存されません(分析のためAIに送信されるのみで、リロードすれば消えます)。個人情報を含むテキストの貼り付けは避けてください。
      </div>

      <div className="form-panel">
        <div className="field">
          <label htmlFor="source">分析するテキスト(2,000〜4,000字程度まで)</label>
          <textarea
            id="source"
            className="source"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ニュース記事・発表文・演説などを貼り付け…"
          />
        </div>
        <div className="form-meta">
          <span className={`char-counter ${over ? "over" : ""}`}>
            {input.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} 字
          </span>
          <div className="sample-buttons">
            {SAMPLES.map((s) => (
              <button key={s.label} className="sample" onClick={() => setInput(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <button
          className="analyze"
          onClick={analyze}
          disabled={loading || over || input.trim().length < 20}
        >
          {loading ? "解析中..." : "構造を解析する"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      {analysis && resultIsMock && (
        <div className="mock-result-warning">
          ⚠ 以下の結果はダミーデータです(MOCK MODE)。エンティティは常に3個・スコアは74/28/52固定で、AIによる分析は行われていません。実際の分析を行うには、URLから <code>?mock=1</code> を外してアクセスし直してください。
        </div>
      )}

      {analysis?.pattern && (
        <div className="panel pattern-panel">
          <div className="panel-label">ナラティブパターン(内集団の正当化フレーム)</div>
          <div className="pattern-name">{analysis.pattern.narrativeFramePattern}</div>
          <div className="pattern-desc">{analysis.pattern.patternDescription}</div>
        </div>
      )}

      {analysis && (
        <div className="result-grid">
          <div className="panel">
            <div className="panel-label">元テキスト + 根拠箇所</div>
            <AnnotatedText
              text={analyzedText}
              analysis={analysis}
              selected={selectedAnnotation}
              activeEntityId={activeEntityId}
              onSelect={selectAnnotation}
              onHoverEntity={setHoverEntityId}
            />
            <div className={`note-panel ${selectedAnnotation ? "" : "placeholder"}`}>
              {selectedAnnotation ? (
                <>
                  <div className="fn">{selectedAnnotation.function}</div>
                  <div className="note-text">{selectedAnnotation.note}</div>
                </>
              ) : (
                <div className="note-text">ハイライト箇所をクリック/ホバーすると、相関図の該当ノードが連動して強調され、判定理由がここに表示される。</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-label">主体の相関図</div>
            <Graph
              analysis={analysis}
              activeEntityId={activeEntityId}
              onSelectEntity={selectEntity}
              onHoverEntity={setHoverEntityId}
            />
            <div className="graph-legend">
              <span><span className="swatch" />序列関係(数値=優位配分。線にカーソル/クリックで詳細)</span>
              <span><span className="swatch dashed" />内集団/外集団の境界</span>
            </div>
            <div className="tag-legend">
              <div className="tag-legend-title">用語の凡例</div>
              <dl>
                <div className="tag-legend-row">
                  <dt><span className="tag tag-we">WE</span>(内集団)</dt>
                  <dd>そのテキストが「われわれ」側として扱っている主体</dd>
                </div>
                <div className="tag-legend-row">
                  <dt><span className="tag tag-they">THEY</span>(外集団)</dt>
                  <dd>そのテキストが「かれら」側として扱っている主体</dd>
                </div>
                <div className="tag-legend-row">
                  <dt><span className="tag tag-neutral">—</span>(中立)</dt>
                  <dd>内外どちらにも明確に位置づけられていない主体</dd>
                </div>
              </dl>
              <p className="tag-legend-note">
                ※ ここでの「われわれ」は読者や利用者自身の立場ではなく、そのテキストの書き手が採用している視点を指す。テキストが誰の言い分を「事実」として書き、誰の言い分に「〜と主張している」という距離を置いているかで判定される。
              </p>
            </div>
            <div className="entity-list">
              {analysis.entities.map((e) => (
                <div
                  key={e.id}
                  className={`entity-row ${e.id === activeEntityId ? "active" : ""}`}
                  onClick={() => selectEntity(e.id)}
                  onMouseEnter={() => setHoverEntityId(e.id)}
                  onMouseLeave={() => setHoverEntityId(null)}
                >
                  <span className="dot" style={{ background: colorForAltitude(e.altitude) }} />
                  <span className="label">{e.label}</span>
                  <span className="score" style={{ color: colorForAltitude(e.altitude) }}>
                    {e.altitude} · {e.group === "in" ? "WE" : e.group === "out" ? "THEY" : "—"}
                  </span>
                  <span className="role">{e.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="disclaimer">※ {DISCLAIMER}</div>
    </div>
  );
}
