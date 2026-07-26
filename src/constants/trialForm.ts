import { TIME_SLOTS } from './timeSlots'

export const TRIAL_DURATION_MINUTES = 30

export const TRIAL_PROGRAMS = [
  'Data Analytics',
  'English Conversation',
  'Math Tutoring',
  'Coding Basics',
  'Exam Prep',
  'Other',
] as const

export type TrialProgram = (typeof TRIAL_PROGRAMS)[number]

export type TrialEntityType = 'company' | 'individual'

export const TRIAL_ENTITY_OPTIONS: { value: TrialEntityType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
]

export type TrialVideoPlatform = 'zoom' | 'google_meet' | 'digital_samba' | 'jitsi'

export const TRIAL_VIDEO_PLATFORM_OPTIONS: {
  value: TrialVideoPlatform
  label: string
}[] = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'digital_samba', label: 'Digital Samba' },
  { value: 'jitsi', label: 'Jitsi' },
]

export const TRIAL_TIME_SLOTS = TIME_SLOTS
