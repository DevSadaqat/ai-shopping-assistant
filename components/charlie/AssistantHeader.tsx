import { CharlieLogo } from "./CharlieLogo"
import { IconButton } from "./IconButton"
import { CloseIcon, RefreshIcon } from "./icons"

type Props = {
  onRefresh?: () => void
  onClose?: () => void
}

export function AssistantHeader({ onRefresh, onClose }: Props) {
  return (
    <header
      className="
        sticky top-0 z-10
        flex items-center justify-between
        bg-white border-b border-light-grey
        px-4 md:px-6 py-3
      "
    >
      <div className="flex items-center gap-3">
        <CharlieLogo variant="icon" height={32} priority />
        <span className="font-display font-semibold text-lg text-charcoal">
          Charlie
        </span>
      </div>

      <div className="flex items-center gap-1">
        {onRefresh && (
          <IconButton label="Start a new chat" onClick={onRefresh}>
            <RefreshIcon size={20} />
          </IconButton>
        )}
        {onClose && (
          <IconButton label="Close Charlie" onClick={onClose}>
            <CloseIcon size={20} />
          </IconButton>
        )}
      </div>
    </header>
  )
}