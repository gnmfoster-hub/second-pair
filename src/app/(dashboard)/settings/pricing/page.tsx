import { requireStudio, getArtists, getPriceBands } from "@/lib/studio";
import { quoteForBand, depositFor, describeDepositRule } from "@/lib/quote";
import { formatRange, formatPence } from "@/lib/money";
import { BandEditor } from "./BandEditor";
import { SeedBands } from "./SeedBands";

export default async function PricingPage() {
  const { studio } = await requireStudio();
  const [bands, artists] = await Promise.all([
    getPriceBands(studio.id),
    getArtists(studio.id),
  ]);
  const activeArtists = artists.filter((a) => a.active);

  return (
    <div className="space-y-8">
      <section className="card overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium">Size bands</h2>
          <p className="hint mt-1">
            Hours per band, multiplied by their hourly rate, is the quote. Mark
            the big ones as consultation-first.
          </p>
        </div>

        <div className="flex gap-3 border-t border-border px-5 py-2 text-xs uppercase tracking-wide text-muted">
          <span className="flex-1">Size</span>
          <span className="w-24">Hours from</span>
          <span className="w-24">to</span>
          <span className="w-32" />
          <span className="w-[7.5rem]" />
        </div>

        {bands.map((band, i) => (
          <BandEditor key={band.id} band={band} index={i} />
        ))}
        <BandEditor index={bands.length} />

        {bands.length === 0 && <SeedBands />}
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium">What the assistant will quote</h2>
          <p className="hint mt-1">
            Live from the numbers above. Ranges never drop below anyone&rsquo;s minimum
            charge. Deposit rule: {describeDepositRule(studio.deposit_rule)}.
          </p>
        </div>

        {activeArtists.length === 0 || bands.length === 0 ? (
          <p className="hint border-t border-border px-5 py-6">
            Add at least one active artist and one size band to see the quote table.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Size</th>
                  {activeArtists.map((a) => (
                    <th key={a.id} className="px-5 py-3 font-medium">
                      {a.name}
                    </th>
                  ))}
                  <th className="px-5 py-3 font-medium">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bands.map((band) => {
                  const quotes = activeArtists.map((a) => quoteForBand(a, band));
                  const cheapest = quotes.reduce((m, q) =>
                    q.low_pence < m.low_pence ? q : m,
                  );
                  return (
                    <tr key={band.id}>
                      <td className="px-5 py-3">
                        {band.size_label}
                        {band.requires_consultation && (
                          <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                            consult
                          </span>
                        )}
                      </td>
                      {quotes.map((q, i) => (
                        <td key={activeArtists[i].id} className="whitespace-nowrap px-5 py-3">
                          {formatRange(q.low_pence, q.high_pence)}
                          {q.hit_minimum && (
                            <span
                              className="ml-1.5 text-warn"
                              title="Floored at their minimum charge"
                            >
                              ↑
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-5 py-3 text-muted">
                        {formatPence(depositFor(studio.deposit_rule, cheapest))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
