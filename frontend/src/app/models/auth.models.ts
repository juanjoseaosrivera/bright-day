/**
 * API request/response contracts for the auth domain. These mirror the
 * backend Pydantic schemas (`app/domains/auth/schemas.py`) — the single
 * boundary between the two apps.
 */

export type FocusArea =
  | 'stress'
  | 'anxiety'
  | 'mood'
  | 'sleep'
  | 'self_reflection'
  | 'relationships'
  | 'other';

export type CheckinFrequency = 'daily' | 'few_times_week' | 'weekly';

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OnboardingRequest {
  display_name: string;
  primary_focus: FocusArea;
  focus_areas: FocusArea[];
  current_stress: number;
  checkin_frequency: CheckinFrequency;
  used_wellbeing_tools_before: boolean;
  goals_note: string | null;
  acknowledged_not_medical: boolean;
}

export interface User {
  user_id: string;
  email: string;
  display_name: string | null;
  onboarding_completed: boolean;
}

export interface OnboardingAnswers {
  primary_focus: string;
  focus_areas: string[];
  current_stress: number;
  checkin_frequency: string;
  used_wellbeing_tools_before: boolean;
  goals_note: string | null;
}

export interface Me extends User {
  onboarding: OnboardingAnswers | null;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
  email: string;
}
