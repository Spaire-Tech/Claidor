import { schemas } from '@spaire/client'
import { formatCurrency } from '@spaire/currency'

interface WalletCardProps {
  organization: schemas['CustomerOrganization']
  wallet: schemas['CustomerWallet'] | schemas['Wallet']
}

const WalletCard = ({ organization, wallet }: WalletCardProps) => {
  return (
    <div className=" relative w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-gray-100 p-8 shadow-lg">
      {/* Content */}
      <div className="relative z-10">
        {/* Organization logo */}
        <div className="mb-4">
          {organization.avatar_url ? (
            <img
              src={organization.avatar_url}
              alt={organization.name}
              className=" h-12 w-12 rounded-lg border border-gray-200 bg-white object-cover p-1"
            />
          ) : (
            <div className=" flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-gray-600 ">
              {organization.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Balance */}
        <div className="mb-2">
          <div className=" mb-1 text-sm font-medium tracking-wider text-gray-500 uppercase">
            Available Balance
          </div>
          <div className="text-4xl font-bold tracking-tight text-gray-950">
            {formatCurrency('compact')(wallet.balance, wallet.currency)}
          </div>
        </div>

        {/* Card footer */}
        <div className="mt-8 flex items-end justify-between">
          <div>
            <div className=" text-xs font-medium tracking-wider text-gray-500 uppercase">
              Organization
            </div>
            <div className="text-sm font-semibold text-gray-950">
              {organization.name}
            </div>
          </div>
          <div className="text-right">
            <div className=" text-xs font-medium tracking-wider text-gray-500 uppercase">
              Currency
            </div>
            <div className="text-sm font-semibold text-gray-950 uppercase">
              {wallet.currency}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WalletCard
