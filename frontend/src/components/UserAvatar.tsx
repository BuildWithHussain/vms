import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function UserAvatar({
  name,
  image,
}: {
  name?: string
  image?: string | null
}) {
  if (!name) return null

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default">
        <Avatar size="sm">
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback>{name[0].toUpperCase()}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}
