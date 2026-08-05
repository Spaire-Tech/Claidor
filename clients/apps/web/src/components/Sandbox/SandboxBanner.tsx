import { CONFIG } from '@/utils/config'

const SandboxBanner = () => {
  if (!CONFIG.IS_SANDBOX) {
    return null
  }
  return (
    <div className="sticky top-0 z-50 flex flex-row items-center justify-between bg-blue-100 px-8 py-2 text-sm text-blue-600 ">
      <div></div>
      <div className="hidden md:block">
        Changes you make here don&apos;t affect your live account • Payments are
        not processed
      </div>
      <div>
        <a href="https://app.spairehq.com/start" className="font-bold hover:opacity-50">
          Exit sandbox
        </a>
      </div>
    </div>
  )
}

export default SandboxBanner
