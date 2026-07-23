import type { Product } from "@/lib/types"
import { StarIcon } from "./icons"

type Props = {
  product: Product
  // For kit items: the role this product fills and why it was chosen.
  roleLabel?: string
  reason?: string
}

function keySpecs(product: Product): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(product.specs)) {
    if (k === "subcategory") continue
    out.push(`${v}`)
  }
  return [...product.features, ...out].slice(0, 4)
}

export function ProductCard({ product, roleLabel, reason }: Props) {
  const specs = keySpecs(product)
  return (
    <div className="rounded-md border border-light-grey bg-white p-4 shadow-charlie-sm flex flex-col gap-2">
      {roleLabel && (
        <span className="self-start rounded-pill bg-soft-mint px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal">
          {roleLabel}
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate">
            {product.brand}
          </p>
          <h4 className="font-display text-[15px] font-semibold leading-tight text-charcoal">
            {product.name}
          </h4>
        </div>
        <p className="shrink-0 font-display text-lg font-bold text-charcoal">
          ${product.price}
        </p>
      </div>

      <div className="flex items-center gap-1.5 text-[12px] text-slate">
        <StarIcon size={13} className="text-coral" />
        <span className="font-medium text-charcoal">{product.avg_rating.toFixed(1)}</span>
        <span>({product.review_count})</span>
        <span aria-hidden="true">·</span>
        <span
          className={product.in_stock ? "text-teal" : "text-cool-grey"}
        >
          {product.in_stock ? "In stock" : "Out of stock"}
        </span>
      </div>

      {specs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {specs.map((s) => (
            <li
              key={s}
              className="rounded-sm bg-off-white px-2 py-0.5 text-[11px] text-slate"
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      {reason && <p className="text-[12px] leading-5 text-slate">{reason}</p>}
    </div>
  )
}
