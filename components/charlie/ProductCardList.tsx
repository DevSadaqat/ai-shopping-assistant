import type { ProductCardData, ProjectKit } from "@/lib/types"
import { ProductCard } from "./ProductCard"
import { PaintRollerIcon } from "./icons"

type Props = {
  data: ProductCardData
}

export function ProductCardList({ data }: Props) {
  if (data.kind === "search") {
    if (data.products.length === 0) return null
    return (
      <div className="charlie-message-in mt-2 grid gap-3 sm:grid-cols-2">
        {data.products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    )
  }

  // kit
  const { kit } = data
  if (kit.items.length === 0) return null

  return (
    <div className="charlie-message-in mt-2 rounded-md border border-light-grey bg-off-white p-3 sm:p-4">
      <KitSummary kit={kit} />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {kit.items.map((it) => (
          <ProductCard
            key={it.product.id}
            product={it.product}
            roleLabel={it.label}
            reason={it.reason}
          />
        ))}
      </div>

      {kit.skipped.length > 0 && (
        <p className="mt-3 text-[12px] text-slate">
          Not included to stay on budget:{" "}
          <span className="text-charcoal">
            {kit.skipped.map((s) => s.label).join(", ")}
          </span>
          .
        </p>
      )}
    </div>
  )
}

function KitSummary({ kit: k }: { kit: ProjectKit }) {
  const over = k.budget !== null && !k.within_budget
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-charcoal">
        <span className="text-teal" aria-hidden="true">
          <PaintRollerIcon size={20} />
        </span>
        <span className="font-display text-[15px] font-semibold capitalize">
          {k.project} kit
        </span>
      </div>
      <div className="text-right">
        <p className="font-display text-lg font-bold text-charcoal">${k.total}</p>
        {k.budget !== null && (
          <p
            className={`text-[12px] font-medium ${over ? "text-coral" : "text-teal"}`}
          >
            {over ? `over $${k.budget} budget` : `within $${k.budget} budget`}
          </p>
        )}
      </div>
    </div>
  )
}
