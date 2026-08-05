import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'

interface BenefitGrantMemberBadgeProps {
  member: schemas['Member'] | null | undefined
}

export const BenefitGrantMemberBadge = ({
  member,
}: BenefitGrantMemberBadgeProps) => {
  if (!member) {
    return <span className=" text-sm text-gray-500">—</span>
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar
        className="h-8 w-8"
        avatar_url={null}
        name={member.name || member.email}
      />
      <div className="flex min-w-0 flex-col">
        <div className="w-full truncate text-sm">
          {member.name ?? member.email}
        </div>
        {member.name && (
          <div className=" w-full truncate text-xs text-gray-500">
            {member.email}
          </div>
        )}
      </div>
    </div>
  )
}
