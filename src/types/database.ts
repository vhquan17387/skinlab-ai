// Database row shapes (shared by all backends).

import type { SubmissionStatus, ImageKind } from "@/lib/constants";

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  lead_id: string;
  status: SubmissionStatus;
  skin_concerns: string[];
  notes_from_user: string | null;
  consent_terms: boolean;
  consent_data: boolean;
  consent_images: boolean;
  user_agent: string | null;
  ip_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageRow {
  id: string;
  submission_id: string;
  kind: ImageKind;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface AnalysisResult {
  id: string;
  submission_id: string;
  provider: string;
  provider_model: string | null;
  raw: unknown;
  normalized: unknown;
  overall_score: number | null;
  created_at: string;
}

export interface Report {
  id: string;
  submission_id: string;
  token: string;
  published_at: string;
  revoked_at: string | null;
}

export interface AdminNote {
  id: string;
  submission_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
}

// Insert payloads -----------------------------------------------------------

export interface NewLead {
  full_name: string;
  email: string;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
}

export interface NewSubmission {
  lead_id: string;
  skin_concerns: string[];
  notes_from_user?: string | null;
  consent_terms: boolean;
  consent_data: boolean;
  consent_images: boolean;
  user_agent?: string | null;
  ip_hash?: string | null;
}

export interface NewImage {
  submission_id: string;
  kind: ImageKind;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface NewAnalysisResult {
  submission_id: string;
  provider: string;
  provider_model?: string | null;
  raw: unknown;
  normalized: unknown;
  overall_score: number | null;
}

export interface NewAdminNote {
  submission_id: string;
  author_id?: string | null;
  author_email?: string | null;
  body: string;
}
