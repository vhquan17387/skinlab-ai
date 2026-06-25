// Backend abstraction: every page/route accesses data/storage/auth through
// these interfaces only. Never import `pg` or `supabase-js` directly elsewhere.

import type { NextRequest, NextResponse } from "next/server";
import type { SubmissionStatus, ImageKind } from "@/lib/constants";
import type {
  Lead,
  Submission,
  ImageRow,
  AnalysisResult,
  Report,
  AdminNote,
  NewLead,
  NewSubmission,
  NewImage,
  NewAnalysisResult,
  NewAdminNote,
} from "@/types/database";

export interface SubmissionListFilter {
  status?: SubmissionStatus;
  search?: string;
  limit: number;
  offset: number;
}

export interface SubmissionListItem {
  submission: Submission;
  lead: Lead;
  overall_score: number | null;
  provider: string | null;
}

export interface SubmissionDetail {
  submission: Submission;
  lead: Lead;
  images: ImageRow[];
  analysis: AnalysisResult | null;
  report: Report | null;
}

export interface DataStore {
  // Public ingest pipeline
  insertLead(lead: NewLead): Promise<Lead>;
  insertSubmission(sub: NewSubmission): Promise<Submission>;
  insertImage(img: NewImage): Promise<ImageRow>;
  insertAnalysisResult(res: NewAnalysisResult): Promise<AnalysisResult>;
  createReport(submissionId: string, token: string): Promise<Report>;
  setSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  // Public report
  getReportByToken(token: string): Promise<Report | null>;
  getSubmissionDetail(submissionId: string): Promise<SubmissionDetail | null>;

  // Admin
  listSubmissions(
    filter: SubmissionListFilter,
  ): Promise<{ items: SubmissionListItem[]; total: number }>;
  getImagesForSubmission(submissionId: string): Promise<ImageRow[]>;
  getImageByKind(
    submissionId: string,
    kind: ImageKind,
  ): Promise<ImageRow | null>;
  listNotes(submissionId: string): Promise<AdminNote[]>;
  addNote(note: NewAdminNote): Promise<AdminNote>;
  exportSubmissions(status?: SubmissionStatus): Promise<SubmissionListItem[]>;
}

export interface PutBlobInput {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface BlobStore {
  put(input: PutBlobInput): Promise<{ path: string }>;
  get(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthBackend {
  signIn(
    email: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  // Runs on the Edge runtime — must NOT transitively import `pg`.
  middleware(req: NextRequest): Promise<NextResponse>;
}

export interface Backend {
  data: DataStore;
  blob: BlobStore;
  auth: AuthBackend;
}
