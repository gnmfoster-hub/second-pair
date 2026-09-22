/**
 * The back office wears the product's face, not the poster's.
 *
 * "app" is the class globals.css hangs the quiet theme off: panels take a
 * hairline instead of a 2px ink keyline and a 6px offset slab, buttons keep
 * the pill and lose the gradient and the glow, page titles come down a size,
 * and section headings sit in Instrument Sans rather than Anton.
 *
 * The dashboard has carried it since the re-theme and /admin never did,
 * because it has no layout of its own and nothing else in the tree adds it.
 * So every card on the console, the billing page and the reports — twenty-two
 * of them — was still drawn as a poster: Giles's words were that the blocks
 * look very bad with horrible shadows, and they were the only screens left in
 * the product still doing it.
 *
 * A layout rather than a class on each page, so anything added under /admin
 * later gets it without anybody remembering to.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="app">{children}</div>;
}
