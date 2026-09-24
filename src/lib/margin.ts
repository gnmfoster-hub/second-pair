/**
 * What the things a business sells actually make it.
 *
 * Found by auditing the database for columns the product stores and never
 * looks at. `services.cost_pence` is one: a salon has set it on cuticle oil
 * (sells for £9, costs them £3.42) and on a base coat, and the figure has
 * never appeared on a screen.
 *
 * Takings are already reported, and takings are the wrong number for retail.
 * Selling £200 of product at a 62% margin and £200 of product at a 15% margin
 * are the same line in every report this business has, and they are not
 * remotely the same week. Somebody deciding whether to keep stocking a thing
 * needs the difference.
 *
 * Only where a cost is known, and said so. A shop that has never filled that
 * in should see nothing here rather than a margin of 100%, which is the number
 * an empty cost column produces and is a lie with a decimal point on it.
 */

export type Sold = {
  name: string;
  quantity: number;
  unitPence: number;
  /** What it costs the business. Null where nobody has said. */
  costPence: number | null;
};

export type Made = {
  name: string;
  sold: number;
  tookPence: number;
  costPence: number;
  madePence: number;
  /** Rounded. Null when the cost is not known. */
  percent: number | null;
};

export type Margin = {
  /** Only the lines with a cost against them. */
  lines: Made[];
  tookPence: number;
  costPence: number;
  madePence: number;
  percent: number | null;
  /** Lines sold with no cost recorded, so the figures above leave them out. */
  unknown: number;
};

export function marginOf(items: Sold[]): Margin {
  const known = items.filter((i) => i.costPence !== null && i.costPence !== undefined);

  const byName = new Map<string, Made>();
  for (const i of known) {
    const took = i.unitPence * i.quantity;
    const cost = (i.costPence as number) * i.quantity;

    const row = byName.get(i.name) ?? {
      name: i.name,
      sold: 0,
      tookPence: 0,
      costPence: 0,
      madePence: 0,
      percent: null,
    };

    row.sold += i.quantity;
    row.tookPence += took;
    row.costPence += cost;
    row.madePence += took - cost;
    byName.set(i.name, row);
  }

  const lines = [...byName.values()]
    .map((r) => ({ ...r, percent: share(r.madePence, r.tookPence) }))
    /* Most money made first. It is the question being asked. */
    .sort((a, b) => b.madePence - a.madePence);

  const tookPence = lines.reduce((n, r) => n + r.tookPence, 0);
  const costPence = lines.reduce((n, r) => n + r.costPence, 0);

  return {
    lines,
    tookPence,
    costPence,
    madePence: tookPence - costPence,
    percent: share(tookPence - costPence, tookPence),
    unknown: items.length - known.length,
  };
}

/**
 * A percentage, or null where the question does not arise.
 *
 * Nought taken is not a nought per cent margin, it is no sale. And a negative
 * margin is reported as it is rather than floored — selling at a loss is a
 * thing that happens and is exactly what somebody needs telling.
 */
function share(made: number, took: number): number | null {
  if (took <= 0) return null;
  return Math.round((made / took) * 100);
}
