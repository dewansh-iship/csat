const IMP = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function clamp(n, a, b) {
  const v = Number(n);
  if (Number.isNaN(v)) return a;
  return Math.max(a, Math.min(b, v));
}

const pct = (s, m) => (m ? Math.round((s / m) * 10000) / 100 : 0);

// Slider mapping to template rating levels:
// 0-2 => Low (1), 3 => Acceptable (3), 4-5 => High (5)
export function mapSliderToTemplate(raw0to5) {
  const raw = clamp(raw0to5, 0, 5);
  return raw <= 2 ? 1 : raw === 3 ? 3 : 5;
}

export function computeScores(questions, answers) {
  const aByCode = new Map(answers.map((a) => [a.code, a]));

  let totalScore = 0, totalMax = 0;
  let onboardScore = 0, onboardMax = 0;
  let ashoreScore = 0, ashoreMax = 0;

  const area = {}; // serviceArea -> {score,max,section}

  for (const q of questions) {
    const a = aByCode.get(q.code);
    if (!a || !a.relevant) continue;

    const w = IMP[a.importance];
    if (!w) continue;

    const s = mapSliderToTemplate(a.satisfaction); // 1/3/5
    const score = s * w;
    const max = 5 * w;

    totalScore += score; totalMax += max;

    if (q.section === "ONBOARD") { onboardScore += score; onboardMax += max; }
    if (q.section === "ASHORE") { ashoreScore += score; ashoreMax += max; }

    if (!area[q.serviceArea]) area[q.serviceArea] = { score: 0, max: 0, section: q.section };
    area[q.serviceArea].score += score;
    area[q.serviceArea].max += max;
  }

  const breakdown = {};
  for (const [k, v] of Object.entries(area)) {
    breakdown[k] = { ...v, percent: pct(v.score, v.max) };
  }

  return {
    overall: pct(totalScore, totalMax),
    onboard: pct(onboardScore, onboardMax),
    ashore: pct(ashoreScore, ashoreMax),
    raw: { totalScore, totalMax, onboardScore, onboardMax, ashoreScore, ashoreMax },
    breakdown
  };
}
