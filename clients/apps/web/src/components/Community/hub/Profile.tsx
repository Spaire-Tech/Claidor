'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Community Hub — Profile tab (student view).
 *
 * The member's own settings: how they show up in the room (display name +
 * photo), their notification preferences, and a shortcut back to the course.
 * Everything here is REAL — name/avatar PATCH the customer profile endpoint,
 * the toggles read/write the customer notification preferences. (The backend
 * exposes two global channels — email + in-app — so those are the two shown.)
 */
import {
  useCustomerNotificationPreferences,
  useUpdateCommunityProfile,
  useUpdateCustomerNotificationPreferences,
} from '@/hooks/queries/community'
import * as React from 'react'
import { Field, Toggle } from './atoms'
import { HeadInfo } from './HeadInfo'
import { Glyph } from './icons'

const { useEffect, useRef, useState } = React

// Down-rez a picked image to a 256px square data URL (mirrors the portal's
// ProfileOnboarding: customer avatars inline as a data URL, no S3 needed).
function downrez(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = 256
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Image processing failed'))
        const scale = Math.max(size / img.width, size / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => reject(new Error('Could not read image'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function ProfileTab({
  token,
  selfName,
  selfAvatar,
  courseTitle,
  brandName,
  lessonsCount,
  onGoToCourse,
  showToast,
}: {
  token: string
  selfName: string
  selfAvatar?: string | null
  courseTitle: string
  brandName: string
  lessonsCount: number
  onGoToCourse: () => void
  showToast: (m: string) => void
}) {
  const update = useUpdateCommunityProfile(token)
  const prefsQ = useCustomerNotificationPreferences(token)
  const updatePrefs = useUpdateCustomerNotificationPreferences(token)

  const [name, setName] = useState(selfName)
  const [avatar, setAvatar] = useState<string | null>(selfAvatar ?? null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Seed from props once they resolve (the parent loads identity async).
  useEffect(() => {
    if (!dirty) {
      setName(selfName)
      setAvatar(selfAvatar ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfName, selfAvatar])

  const prefs = prefsQ.data
  const emailOn = prefs?.email_enabled ?? true
  const bellOn = prefs?.bell_enabled ?? true

  const pick = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    try {
      const url = await downrez(file)
      setAvatar(url)
      setDirty(true)
    } catch {
      showToast('Could not read that image')
    }
  }

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await update.mutateAsync({ name: name.trim(), avatar_url: avatar })
      setDirty(false)
      showToast('Profile updated')
    } catch {
      showToast('Could not save your profile')
    } finally {
      setBusy(false)
    }
  }

  const togglePref = (key: 'email_enabled' | 'bell_enabled') => {
    if (!prefs) return
    updatePrefs.mutate({ ...prefs, [key]: !prefs[key] })
  }

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">
            Your profile
            <HeadInfo>
              How you show up in the room. Update your photo and name, and choose
              how you’d like to hear about new replies and live moments.
            </HeadInfo>
          </div>
        </div>
      </div>

      <div className="glist-label">You</div>
      <div className="card prof-card" style={{ marginBottom: 26 }}>
        <div className="prof-id">
          <button
            type="button"
            className="avatar-edit"
            onClick={() => fileRef.current?.click()}
            aria-label="Change photo"
          >
            {avatar ? (
              <img src={avatar} alt="" />
            ) : (
              <span className="hub-av-fallback" style={{ width: 64, height: 64 }} />
            )}
            <span className="avatar-edit-over">
              <Glyph d="image" size={18} stroke={1.9} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          />
          <div className="prof-id-main">
            <div className="prof-id-name">{name || 'Your name'}</div>
            <div className="prof-id-sub">Member · {courseTitle}</div>
          </div>
        </div>
        <Field label="Display name">
          <input
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDirty(true)
            }}
            placeholder="How the room sees you"
          />
        </Field>
        <div className="prof-save">
          <button
            className="btn btn-primary btn-sm"
            disabled={!dirty || busy || !name.trim()}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="glist-label">Notifications</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow">
          <div className="grow-main">
            <div className="gl">Email notifications</div>
            <div className="gs">
              Replies, new activities, and event reminders, sent to your inbox
            </div>
          </div>
          <div className="grow-ctl">
            <Toggle on={emailOn} onClick={() => togglePref('email_enabled')} />
          </div>
        </div>
        <div className="grow">
          <div className="grow-main">
            <div className="gl">In-app notifications</div>
            <div className="gs">The bell in your portal lights up on new activity</div>
          </div>
          <div className="grow-ctl">
            <Toggle on={bellOn} onClick={() => togglePref('bell_enabled')} />
          </div>
        </div>
      </div>

      <div className="glist-label">The course</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow">
          <div className="grow-main">
            <div className="gl">{courseTitle}</div>
            <div className="gs">
              {brandName} · {lessonsCount}{' '}
              {lessonsCount === 1 ? 'lesson' : 'lessons'} · your enrollment gives
              you this room
            </div>
          </div>
          <div className="grow-ctl">
            <button className="btn btn-quiet btn-sm" onClick={onGoToCourse}>
              Go to course
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
