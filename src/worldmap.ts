/**
 * The fictional world of War Economy mode: silly cousins of real countries,
 * drawn as low-poly shapes on a 1000×520 war-room map.
 */
export interface Country {
  id: string;
  name: string;
  /** Who it's a cousin of, shown in the country's tooltip. */
  nickname: string;
  points: [number, number][];
}

export const COUNTRIES: Country[] = [
  { id: 'canadia', name: 'Canadia', nickname: 'Polite, cold, apologizes to its own moose', points: [[70, 70], [330, 55], [365, 115], [305, 150], [120, 150], [62, 108]] },
  { id: 'murica', name: "'Murica", nickname: 'Land of the free refill', points: [[118, 152], [303, 152], [318, 196], [262, 240], [160, 238], [104, 192]] },
  { id: 'futbolia', name: 'Futbolia', nickname: 'Where every argument is settled with a penalty shootout', points: [[232, 270], [312, 258], [338, 318], [296, 420], [258, 446], [240, 352]] },
  { id: 'tealand', name: 'Tealand', nickname: 'Rainy island of queues and crumpets', points: [[428, 92], [452, 86], [462, 124], [440, 132]] },
  { id: 'bonjouria', name: 'Bonjouria', nickname: 'Strikes on Tuesdays, croissants every day', points: [[452, 140], [496, 134], [504, 172], [466, 180]] },
  { id: 'autobahnia', name: 'Autobahnia', nickname: 'No speed limits, strict recycling', points: [[496, 108], [538, 104], [546, 150], [504, 156]] },
  { id: 'bearlandia', name: 'Bearlandia', nickname: 'Very big, very cold, very much a bear', points: [[540, 58], [822, 46], [866, 108], [764, 140], [602, 140], [546, 122]] },
  { id: 'petrolia', name: 'Petrolia', nickname: 'Sits on an ocean of oil and an ocean of sand', points: [[556, 188], [622, 178], [644, 232], [592, 252], [560, 226]] },
  { id: 'savannia', name: 'Savannia', nickname: 'Vast, sunny, and quietly running the coffee supply', points: [[446, 208], [556, 200], [590, 282], [540, 402], [500, 412], [468, 300]] },
  { id: 'cricketania', name: 'Cricketania', nickname: 'Matches last five days and nobody minds', points: [[652, 198], [704, 192], [714, 240], [682, 292], [656, 242]] },
  { id: 'dragonia', name: 'Dragonia', nickname: 'Makes everything, including your phone', points: [[704, 142], [824, 142], [844, 200], [762, 232], [708, 202]] },
  { id: 'sunrisia', name: 'Sunrisia', nickname: 'Bullet trains, vending machines for everything', points: [[858, 148], [882, 142], [890, 196], [866, 202]] },
  { id: 'downundria', name: 'Down Undria', nickname: 'Everything here is upside down and slightly venomous', points: [[790, 342], [892, 330], [904, 392], [822, 414]] },
];

/** Famous non-country spots news can happen at. */
export const PLACES: Record<string, { name: string; at: [number, number] }> = {
  strait: { name: 'Strait of Hmm-uz', at: [636, 238] },
  canal: { name: 'Suez-ish Canal', at: [556, 196] },
  channel: { name: 'The Wobbly Channel', at: [460, 132] },
  pacific: { name: 'The Very Big Ocean', at: [960, 260] },
};

export const countryById = (id: string) => COUNTRIES.find((c) => c.id === id)!;

export function centroid(c: Country): [number, number] {
  const n = c.points.length;
  return [c.points.reduce((s, p) => s + p[0], 0) / n, c.points.reduce((s, p) => s + p[1], 0) / n];
}

export interface MapDot {
  id: number;
  at: [number, number];
  tone: 'conflict' | 'calm' | 'econ';
  fresh: boolean;
}

/** The war-room map: grid, countries (some lit up), places, and clickable event dots. */
export function renderMap(lit: Record<string, 'red' | 'amber' | 'green'>, dots: MapDot[], tension: number, war: boolean) {
  const grid = [];
  for (let x = 0; x <= 1000; x += 50) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="520"/>`);
  for (let y = 0; y <= 520; y += 52) grid.push(`<line x1="0" y1="${y}" x2="1000" y2="${y}"/>`);
  const countries = COUNTRIES.map((c) => {
    const [cx, cy] = centroid(c);
    const state = lit[c.id] ?? '';
    return `<g class="country ${state}" data-country="${c.id}">
      <polygon points="${c.points.map((p) => p.join(',')).join(' ')}"><title>${c.name}: ${c.nickname}</title></polygon>
      <text x="${cx}" y="${cy + 4}">${c.name}</text>
    </g>`;
  }).join('');
  const places = Object.values(PLACES)
    .map((p) => `<g class="place"><circle cx="${p.at[0]}" cy="${p.at[1]}" r="3"/><text x="${p.at[0] + 6}" y="${p.at[1] + 3}">${p.name}</text></g>`)
    .join('');
  const pins = dots
    .map(
      (d) => `<g class="dot ${d.tone} ${d.fresh ? 'fresh' : ''}" data-dot="${d.id}" transform="translate(${d.at[0]} ${d.at[1]})">
        <circle class="ring" r="6"/><circle class="core" r="5"/><circle class="hit" r="14"/></g>`,
    )
    .join('');
  const sweep = war ? `<g class="sweep"><path d="M500 260 L500 -300 A560 560 0 0 1 900 -130 Z"/></g>` : '';
  return `<svg class="world ${war ? 'war' : ''}" viewBox="0 0 1000 520" style="--tension:${tension / 100}" role="img" aria-label="World map">
    <g class="grid">${grid.join('')}</g>
    ${sweep}
    ${countries}
    ${places}
    ${pins}
  </svg>`;
}
