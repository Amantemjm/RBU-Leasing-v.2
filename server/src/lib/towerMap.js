// Decodes a raw column-C "building" value from the lease sheet into the
// canonical seeded Tower name. Estate prefixes in the sheet: CV = Circulo Verde,
// CC = Capitol Commons, GH = Greenhills. AST/ANT = Avila South/North Tower.
const RULES = [
  [/maven/i, "Maven at Capitol Commons"],
  [/royalton/i, "The Royalton at Capitol Commons"],
  [/imperium/i, "The Imperium at Capitol Commons"],
  [/avila|(^|\s)(ast|ant)(\s|$)/i, "Avila North and South"],
  [/connor/i, "Connor at Greenhills"],
  [/viridian/i, "Viridian in Greenhills"],
  [/ibiza/i, "Ibiza Tower"],
  [/seville/i, "Seville Residences"],
  [/lleida/i, "Lleida Tower"],
  [/majorca/i, "Majorca Residences"],
  [/maple/i, "Maple at Verdant Towers"],
  [/glaston/i, "Glaston"],
];

export function towerNameFor(building) {
  if (!building) return null;
  const s = String(building).trim();
  if (!s) return null;
  for (const [re, name] of RULES) if (re.test(s)) return name;
  return null;
}
