import AuthShell, { Legal } from '@/components/Auth/AuthShell'
import { primary, provider } from '@/components/Auth/parts'
import LogoIcon from '@/components/Brand/LogoIcon'
import { getServerURL } from '@/utils/api'
import { schemas } from '@simeon/client'
import { getTranslator, type AcceptedLocale } from '@simeon/i18n'

// The consent a bot gets when a person adds Simeon to it (10 November 2026,
// the founder: "have it the same design as our log in web page"): the login
// page's frame, column and buttons (`AuthShell`, `parts`), with the bot's
// mascot beside Simeon's mark above the heading; the account it signs in to
// as a card (the founder's reference, "Choose an account to continue");
// what the bot can do and nothing more; Allow and Deny; the Terms line. The
// bots of the Bots section are known by the name they register with and
// shown by theirs, with their mascot (`/bots/<id>.png`); any other by its own.

/** The bots of Settings › AI Models › Bots, from the name a bot registers with. */
const BOTS = [
  { id: 'dots', name: 'Dots', match: /dots|chatgpt|openai/i },
  { id: 'muse', name: 'Muse', match: /muse|meta/i },
  { id: 'grokbot', name: 'Grok Bot', match: /grok/i },
]

const tile =
  'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.1)]'

/** The bot beside Simeon: its mascot (or its own logo, or its initial), three dots, Simeon's mark on white. */
const Marks = ({
  bot,
  logo,
  name,
}: {
  bot?: string
  logo?: string | null
  name: string
}) => {
  const picture = bot ? `/bots/${bot}.png` : (logo ?? undefined)
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className={tile}>
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[22px] text-[#0d0d0d]">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="flex gap-1">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="h-1 w-1 rounded-full bg-[#c7c7cc]" />
        ))}
      </span>
      <span className={tile}>
        <LogoIcon size={30} className="text-[#0d0d0d]" />
      </span>
    </div>
  )
}

const CheckMark = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M3.5 8.5l3 3 6-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const BotConsentPage = ({
  authorizeResponse: { client, sub },
  searchParams,
  locale,
}: {
  authorizeResponse: schemas['AuthorizeResponseUser']
  searchParams: Record<string, string>
  locale: AcceptedLocale
}) => {
  const t = getTranslator(locale)
  const known = BOTS.find((one) => one.match.test(client.client_name ?? ''))
  const name = known?.name ?? client.client_name ?? client.client_id
  const actionURL = `${getServerURL()}/v1/oauth2/consent?${new URLSearchParams(searchParams)}`
  const email = sub?.email
  return (
    <AuthShell
      mark={<Marks bot={known?.id} logo={client.logo_uri} name={name} />}
      heading={t('simeon.connectBot.heading', { bot: name })}
      line={t('simeon.connectBot.line', { bot: name })}
    >
      {email ? (
        <div className="flex items-center gap-3.5 rounded-[26px] border border-[#e3e3e3] px-4 py-3.5">
          {sub?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sub.avatar_url}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8c547] text-[16px] text-[#0d0d0d]">
              {email.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="text-[16px] text-[#0d0d0d]">
              {t('simeon.connectBot.account')}
            </span>
            <span className="truncate text-[14px] text-[#5d5d5d]">{email}</span>
          </span>
        </div>
      ) : null}
      <ul className="mt-6 flex flex-col gap-2.5 px-1 text-[15px] text-[#0d0d0d]">
        {(['see', 'message', 'read'] as const).map((key) => (
          <li key={key} className="flex items-center gap-2.5">
            <CheckMark />
            {t(`simeon.connectBot.${key}`)}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 px-1 text-[13px] text-[#86868b]">
        {t('simeon.connectBot.nothingElse')}
      </p>
      <form
        method="post"
        action={actionURL}
        className="mt-8 flex flex-col gap-3"
      >
        <button type="submit" name="action" value="allow" className={primary}>
          {t('simeon.connectBot.allow')}
        </button>
        <button type="submit" name="action" value="deny" className={provider}>
          {t('simeon.connectBot.deny')}
        </button>
      </form>
      <div className="mt-12">
        <Legal locale={locale} />
      </div>
    </AuthShell>
  )
}

export default BotConsentPage
