import type { MessageBlock } from "@rakazo/contracts";
import { useEffect, useRef, useState } from "react";

/**
 * A chart the agent drew.
 *
 * The drawing is not ours. `buildPlotParts` is the upstream's own Observable
 * Plot wrapper (`@rakazo/core/plot`), the same call their web app makes, and it
 * hands back a real DOM node rather than a string of SVG — so a spec written by
 * a model is never injected as markup. Plot is imported lazily for the reason
 * they import it lazily: a thread with no chart in it should not pay for the
 * library.
 *
 * What is Caisra's is the frame around it: the card, the width, and the line
 * that appears when a spec cannot be drawn. A chart that fails silently is a
 * blank rectangle where an answer should be.
 */
export function Chart({ block }: { block: Extract<MessageBlock, { kind: "chart" }> }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { buildPlotParts } = await import("@rakazo/core/plot");
        if (cancelled || !holder.current) return;
        const parts = buildPlotParts(block.spec as never, block.data, document, { width: 470 });
        setFailed(null);
        holder.current.replaceChildren(parts.plotted);
      } catch (error) {
        if (!cancelled) {
          setFailed(error instanceof Error ? error.message : "This chart could not be drawn.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [block.spec, block.data]);

  return (
    <div className="row row--left">
      <div className="card card--chart">
        <div className="card__title">{block.name}</div>
        {failed ? <div className="card__body">{failed}</div> : null}
        <div className="chart" ref={holder} />
      </div>
    </div>
  );
}
