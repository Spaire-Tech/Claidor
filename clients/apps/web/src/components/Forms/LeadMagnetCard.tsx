'use client'

import {
  DEFAULT_FORM_STYLE,
  FormAttachedCustomField,
  FormStyle,
  FormSubmitResult,
  useSubmitForm,
} from '@/hooks/queries/forms'
import { useState } from 'react'

// Faithful port of the "Lead Magnet Form" design: a two-column card with a
// cover image on one side and the capture form on the other. The accent
// colour and input corner radius are driven by CSS custom properties so the
// static CSS below can stay shared. Used by the public Space render AND the
// builder's live preview (preview just turns interactivity off).

const CORNER_RADIUS: Record<FormStyle['corner'], string> = {
  sharp: '8px',
  rounded: '16px',
  pill: '999px',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Join class fragments at runtime. NOTE: don't inline conditional classes as
// `className={`lm-x${cond ? ' y' : ''}`}` — prettier-plugin-tailwindcss treats
// className template literals as class lists and strips the leading space,
// collapsing `lm-x y` into the bogus single class `lm-xy`. Building the string
// here (the plugin doesn't touch arbitrary calls) keeps the space intact.
const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

const CSS = `
.lm-container{width:100%;display:flex;justify-content:center}
.lm-frame{--input-radius:16px;display:flex;width:100%;max-width:860px;min-height:504px;overflow:hidden;background:#fff;border-radius:24px;box-shadow:0 1px 2px rgba(12,12,13,.05),0 24px 60px -28px rgba(12,12,13,.32);font-family:"Schibsted Grotesk",system-ui,sans-serif;color:#0c0c0d}
.lm-frame.media-right{flex-direction:row-reverse}
.lm-media{flex:0 0 42%;min-width:0;min-height:0;position:relative;background:#f1f1f3}
.lm-media img{width:100%;height:100%;object-fit:cover;display:block}
.lm-media-ph{width:100%;height:100%;display:grid;place-items:center;color:#9a9aa4;font-size:14px;font-weight:500;text-align:center;padding:20px}
.lm-panel{flex:1 1 58%;min-width:0;display:flex;align-items:center;justify-content:center;padding:44px 46px}
.lm-inner{width:100%;max-width:360px}
.lm-headline{font-size:clamp(27px,2.6vw,34px);font-weight:800;line-height:1.04;letter-spacing:-.02em;margin:0 0 12px}
.lm-subhead{font-size:15.5px;line-height:1.5;color:#62626c;margin:0 0 26px}
.lm-form{display:flex;flex-direction:column;gap:12px}
.lm-field{display:flex;flex-direction:column}
.lm-flabel{font-size:13px;font-weight:600;color:#62626c;margin:0 2px 6px}
.lm-input{width:100%;height:58px;padding:0 20px;font-family:inherit;font-size:16px;font-weight:500;color:#0c0c0d;background:#f3f3f5;border:1.5px solid transparent;border-radius:var(--input-radius);transition:border-color .15s,background .15s,box-shadow .15s}
.lm-input::placeholder{color:#9a9aa4;font-weight:500}
.lm-input:focus{outline:none;background:#fff;border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 15%,transparent)}
.lm-input.invalid{border-color:#e23b3b;background:#fff6f6}
.lm-err{font-size:13px;font-weight:500;color:#d62f2f;margin:7px 2px 0}
.lm-consent{display:flex;align-items:flex-start;gap:11px;margin-top:6px;cursor:pointer;user-select:none}
.lm-consent .box{flex:0 0 auto;width:22px;height:22px;margin-top:1px;border-radius:7px;border:1.5px solid #c9c9d1;background:#fff;display:grid;place-items:center;transition:background .12s,border-color .12s}
.lm-consent .box svg{width:13px;height:13px;opacity:0;transform:scale(.6);transition:all .12s}
.lm-consent.checked .box{background:var(--accent);border-color:var(--accent)}
.lm-consent.checked .box svg{opacity:1;transform:scale(1)}
.lm-consent.invalid .box{border-color:#e23b3b}
.lm-consent span{font-size:13.5px;line-height:1.45;color:#62626c}
.lm-cta{margin-top:14px;width:100%;height:58px;border:none;border-radius:999px;background:#0c0c0d;color:#fff;font-family:inherit;font-size:16px;font-weight:700;letter-spacing:-.01em;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px;transition:transform .14s,background .14s,box-shadow .14s}
.lm-cta:hover{background:#1f1f22;transform:translateY(-1px)}
.lm-cta:disabled{opacity:.65;cursor:default;transform:none}
.lm-spinner{width:17px;height:17px;border:2.2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:lm-spin .7s linear infinite}
@keyframes lm-spin{to{transform:rotate(360deg)}}
.lm-foot{margin-top:18px;font-size:12.5px;color:#9a9aa4;text-align:center}
.lm-foot svg{width:12px;height:12px;vertical-align:-1px;margin-right:4px}
.lm-success .check{width:64px;height:64px;border-radius:50%;background:var(--accent);display:grid;place-items:center;margin-bottom:26px}
.lm-success .check svg{width:30px;height:30px}
.lm-success h2{font-size:clamp(30px,3vw,40px);font-weight:800;letter-spacing:-.02em;line-height:1.04;margin:0 0 14px}
.lm-success p{font-size:16.5px;line-height:1.55;color:#62626c;margin:0 0 8px}
.lm-success p strong{color:#0c0c0d;font-weight:700}
.lm-success .actions{display:flex;align-items:center;gap:18px;margin-top:26px;flex-wrap:wrap}
.lm-linkbtn{background:none;border:none;padding:0;cursor:pointer;font-family:inherit;font-size:14.5px;font-weight:600;color:var(--accent)}
.lm-linkbtn:hover{text-decoration:underline}
.lm-linkbtn.muted{color:#9a9aa4}
@media (max-width:720px){.lm-frame,.lm-frame.media-right{flex-direction:column;max-width:none}.lm-media{flex:0 0 200px}.lm-panel{padding:32px 26px 40px;align-items:flex-start}}
`

const CheckIcon = ({ color = '#fff' }: { color?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M5 12.5l4.2 4.2L19 7"
      stroke={color}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

type FieldValue = string | number | boolean | null

export type LeadMagnetCardForm = {
  id?: string
  title: string
  subtitle: string | null
  button_label: string
  success_message: string | null
  image_url: string | null
  style: FormStyle
  attached_custom_fields: FormAttachedCustomField[]
}

const CustomFieldInput = ({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormAttachedCustomField
  value: FieldValue
  onChange: (v: FieldValue) => void
  disabled: boolean
}) => {
  const cf = field.custom_field
  const label = (
    <span className="lm-flabel">
      {cf.name}
      {field.required ? ' *' : ''}
    </span>
  )

  if (cf.type === 'checkbox') {
    return (
      <label
        className="lm-consent"
        style={{ cursor: disabled ? 'default' : 'pointer' }}
      >
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <span>
          {cf.name}
          {field.required ? ' *' : ''}
        </span>
      </label>
    )
  }
  if (cf.type === 'select') {
    return (
      <div className="lm-field">
        {label}
        <select
          className="lm-input"
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose an option</option>
          {cf.properties.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }
  const type =
    cf.type === 'number' ? 'number' : cf.type === 'date' ? 'date' : 'text'
  return (
    <div className="lm-field">
      {label}
      <input
        className="lm-input"
        type={type}
        disabled={disabled}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) =>
          onChange(
            cf.type === 'number'
              ? e.target.value === ''
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </div>
  )
}

export const LeadMagnetCard = ({
  form,
  interactive = false,
}: {
  form: LeadMagnetCardForm
  interactive?: boolean
}) => {
  const submit = useSubmitForm(form.id ?? '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({})
  const [errors, setErrors] = useState<{
    name?: string
    email?: string
    consent?: boolean
  }>({})
  const [result, setResult] = useState<FormSubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const style = form.style ?? DEFAULT_FORM_STYLE
  const frameStyle = {
    ['--accent' as string]: style.accent,
    ['--input-radius' as string]:
      CORNER_RADIUS[style.corner] ?? CORNER_RADIUS.rounded,
  } as React.CSSProperties

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!interactive || !form.id) return
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Please enter your name.'
    if (!email.trim()) next.email = 'Please enter your email.'
    else if (!EMAIL_RE.test(email.trim()))
      next.email = "That email doesn't look right."
    if (style.show_consent && !consent) next.consent = true
    setErrors(next)
    if (Object.keys(next).length) return

    setError(null)
    try {
      const res = await submit.mutateAsync({
        email: email.trim(),
        name: name.trim() || null,
        custom_field_data: fieldValues,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const reset = () => {
    setResult(null)
    setName('')
    setEmail('')
    setConsent(false)
    setFieldValues({})
    setErrors({})
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="lm-container">
        <div
          className={cx(
            'lm-frame',
            style.media_side === 'right' && 'media-right',
          )}
          style={frameStyle}
        >
          <div className="lm-media">
            {form.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.image_url}
                alt=""
                style={{ objectPosition: style.media_position ?? '50% 50%' }}
              />
            ) : (
              <div className="lm-media-ph">Drop your cover image</div>
            )}
          </div>

          <div className="lm-panel">
            <div className="lm-inner">
              {result?.success ? (
                <div className="lm-success">
                  <div className="check">
                    <CheckIcon />
                  </div>
                  <h2>Check your inbox</h2>
                  <p>
                    {result.success_message || (
                      <>
                        We just sent your free download to{' '}
                        <strong>{email || 'your email'}</strong>.
                      </>
                    )}
                  </p>
                  <div className="actions">
                    {result.download ? (
                      <a
                        className="lm-linkbtn"
                        href={result.download.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download now
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="lm-linkbtn muted"
                      onClick={reset}
                    >
                      Start over
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="lm-headline">
                    {form.title || 'Your headline'}
                  </h1>
                  {form.subtitle ? (
                    <p className="lm-subhead">{form.subtitle}</p>
                  ) : null}

                  <form className="lm-form" onSubmit={onSubmit} noValidate>
                    <div className="lm-field">
                      <input
                        className={cx('lm-input', errors.name && 'invalid')}
                        type="text"
                        placeholder="Your name"
                        autoComplete="name"
                        value={name}
                        disabled={!interactive}
                        onChange={(e) => {
                          setName(e.target.value)
                          if (errors.name)
                            setErrors({ ...errors, name: undefined })
                        }}
                      />
                      {errors.name ? (
                        <div className="lm-err">{errors.name}</div>
                      ) : null}
                    </div>

                    <div className="lm-field">
                      <input
                        className={cx('lm-input', errors.email && 'invalid')}
                        type="email"
                        placeholder="Email address"
                        autoComplete="email"
                        value={email}
                        disabled={!interactive}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (errors.email)
                            setErrors({ ...errors, email: undefined })
                        }}
                      />
                      {errors.email ? (
                        <div className="lm-err">{errors.email}</div>
                      ) : null}
                    </div>

                    {form.attached_custom_fields.map((field) => (
                      <CustomFieldInput
                        key={field.custom_field_id}
                        field={field}
                        disabled={!interactive}
                        value={fieldValues[field.custom_field.slug] ?? null}
                        onChange={(v) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [field.custom_field.slug]: v,
                          }))
                        }
                      />
                    ))}

                    {style.show_consent ? (
                      <div
                        className={cx(
                          'lm-consent',
                          consent && 'checked',
                          errors.consent && 'invalid',
                        )}
                        onClick={() => {
                          if (!interactive) return
                          setConsent(!consent)
                          if (errors.consent)
                            setErrors({ ...errors, consent: undefined })
                        }}
                        role="checkbox"
                        aria-checked={consent}
                      >
                        <span className="box">
                          <CheckIcon />
                        </span>
                        <span>
                          I agree to receive emails and accept the privacy
                          policy.
                        </span>
                      </div>
                    ) : null}

                    {error ? <div className="lm-err">{error}</div> : null}

                    <button
                      type="submit"
                      className="lm-cta"
                      disabled={submit.isPending}
                    >
                      {submit.isPending ? (
                        <>
                          <span className="lm-spinner" />
                          Sending…
                        </>
                      ) : (
                        form.button_label || 'Submit'
                      )}
                    </button>
                  </form>

                  <div className="lm-foot">
                    Your details are safe. Unsubscribe anytime.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
