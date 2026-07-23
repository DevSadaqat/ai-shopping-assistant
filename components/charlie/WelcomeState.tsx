import { CharlieLogo } from "./CharlieLogo"
import { QuickActionChip } from "./QuickActionChip"
import { PackageIcon, PaintRollerIcon, SearchIcon, WrenchIcon } from "./icons"

type QuickAction = { label: string; prompt: string; icon: React.ReactNode }

const ACTIONS: QuickAction[] = [
  {
    label: "Plan a painting project on a budget",
    prompt: "What do I need to paint my bedroom for under $150?",
    icon: <PaintRollerIcon size={18} />,
  },
  {
    label: "Help me find the right product",
    prompt: "Help me find the right product for my project.",
    icon: <SearchIcon size={18} />,
  },
  {
    label: "Get DIY inspiration or project help",
    prompt: "I need some DIY inspiration or project help.",
    icon: <WrenchIcon size={18} />,
  },
  {
    label: "Check stock availability",
    prompt: "Can you check stock availability for me?",
    icon: <PackageIcon size={18} />,
  },
]

type Props = {
  onQuickAction: (prompt: string) => void
}

export function WelcomeState({ onQuickAction }: Props) {
  return (
    <div className="flex flex-col items-center text-center px-4 py-12 md:py-16">
      <CharlieLogo variant="primary" height={96} priority className="mb-6" />
      <h1 className="font-display text-[36px] leading-[44px] font-bold text-charcoal">
        G&rsquo;day! I&rsquo;m Charlie.
      </h1>
      <p className="mt-3 text-slate text-base max-w-md">
        Your friendly AI shopping and project assistant.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3 w-full max-w-2xl">
        {ACTIONS.map((a) => (
          <QuickActionChip
            key={a.label}
            icon={a.icon}
            label={a.label}
            onClick={() => onQuickAction(a.prompt)}
          />
        ))}
      </div>
    </div>
  )
}
