// Switch for the student-facing Course Assistant chat in the course portal.
//
// The creator-side controls have moved to a toggle in course Settings
// (`assistant_enabled` / `assistant_strictness` on the course), so the old
// "Assistant" editor tab and the per-lesson transcription badges are gone.
// What remains behind this flag is the student chat widget in the portal
// (`AskAssistant`). It is currently ENABLED; set this to `false` to hide the
// in-portal chat surface without removing the feature.
//
// Note: this flag does NOT gate whether the assistant exists for a course —
// that's the creator's per-course `assistant_enabled` setting. This only gates
// the in-portal chat surface.
export const COURSE_ASSISTANT_UI_ENABLED: boolean = true
