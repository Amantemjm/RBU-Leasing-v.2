// The RBU estate / tower hierarchy. Seeded idempotently (insert only if missing).
export const ESTATE_HIERARCHY = {
  "Capitol Commons": [
    "The Royalton at Capitol Commons",
    "The Imperium at Capitol Commons",
    "Maven at Capitol Commons",
    "Empress at Capitol Commons",
  ],
  "Greenhills Center": [
    "Viridian in Greenhills",
    "Connor at Greenhills",
  ],
  "Circulo Verde": [
    "Avila North and South",
    "Majorca Residences",
    "Ibiza Tower",
    "Seville Residences",
    "Lleida Tower",
    "Garden Homes",
  ],
  "Ortigas East": [
    "Maple at Verdant Towers",
  ],
  "Ortigas Center": [
    "Residences at The Galleon",
    "Olin at Jade Drive",
  ],
};

export async function seedEstates(prisma) {
  for (const [estateName, towers] of Object.entries(ESTATE_HIERARCHY)) {
    const estate = await prisma.estate.upsert({
      where: { name: estateName },
      update: {},
      create: { name: estateName },
    });
    for (const towerName of towers) {
      await prisma.tower.upsert({
        where: { estateId_name: { estateId: estate.id, name: towerName } },
        update: {},
        create: { estateId: estate.id, name: towerName },
      });
    }
  }
}
