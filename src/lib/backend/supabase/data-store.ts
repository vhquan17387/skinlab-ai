import { getServiceClient } from "./clients";
import type {
  DataStore,
  SubmissionListFilter,
  SubmissionListItem,
  SubmissionDetail,
} from "@/lib/backend/types";
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
import type { SubmissionStatus, ImageKind } from "@/lib/constants";

// Uses the service-role client, so RLS (which denies anon/authenticated) is
// bypassed for server-side queries — matching the local data store behaviour.
export class SupabaseDataStore implements DataStore {
  private get db() {
    return getServiceClient();
  }

  async insertLead(lead: NewLead): Promise<Lead> {
    const { data, error } = await this.db
      .from("leads")
      .insert({
        full_name: lead.full_name,
        email: lead.email,
        phone: lead.phone ?? null,
        age: lead.age ?? null,
        gender: lead.gender ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Lead;
  }

  async insertSubmission(sub: NewSubmission): Promise<Submission> {
    const { data, error } = await this.db
      .from("submissions")
      .insert({
        lead_id: sub.lead_id,
        skin_concerns: sub.skin_concerns,
        notes_from_user: sub.notes_from_user ?? null,
        consent_terms: sub.consent_terms,
        consent_data: sub.consent_data,
        consent_images: sub.consent_images,
        user_agent: sub.user_agent ?? null,
        ip_hash: sub.ip_hash ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Submission;
  }

  async insertImage(img: NewImage): Promise<ImageRow> {
    const { data, error } = await this.db
      .from("images")
      .insert({
        submission_id: img.submission_id,
        kind: img.kind,
        storage_path: img.storage_path,
        mime_type: img.mime_type ?? null,
        size_bytes: img.size_bytes ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ImageRow;
  }

  async insertAnalysisResult(res: NewAnalysisResult): Promise<AnalysisResult> {
    const { data, error } = await this.db
      .from("analysis_results")
      .upsert(
        {
          submission_id: res.submission_id,
          provider: res.provider,
          provider_model: res.provider_model ?? null,
          raw: res.raw,
          normalized: res.normalized,
          overall_score: res.overall_score,
        },
        { onConflict: "submission_id,provider" },
      )
      .select()
      .single();
    if (error) throw error;
    return data as AnalysisResult;
  }

  async createReport(submissionId: string, token: string): Promise<Report> {
    const { data, error } = await this.db
      .from("reports")
      .insert({ submission_id: submissionId, token })
      .select()
      .single();
    if (error) throw error;
    return data as Report;
  }

  async setSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ): Promise<void> {
    const { error } = await this.db
      .from("submissions")
      .update({ status })
      .eq("id", submissionId);
    if (error) throw error;
  }

  async getReportByToken(token: string): Promise<Report | null> {
    const { data } = await this.db
      .from("reports")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    return (data as Report) ?? null;
  }

  async getSubmissionDetail(
    submissionId: string,
  ): Promise<SubmissionDetail | null> {
    const { data: submission } = await this.db
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (!submission) return null;

    const [lead, images, analysis, report] = await Promise.all([
      this.db.from("leads").select("*").eq("id", submission.lead_id).single(),
      this.db
        .from("images")
        .select("*")
        .eq("submission_id", submissionId)
        .order("kind"),
      this.db
        .from("analysis_results")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.db
        .from("reports")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle(),
    ]);

    return {
      submission: submission as Submission,
      lead: lead.data as Lead,
      images: (images.data as ImageRow[]) ?? [],
      analysis: (analysis.data as AnalysisResult) ?? null,
      report: (report.data as Report) ?? null,
    };
  }

  private async leadIdsMatchingSearch(search: string): Promise<string[]> {
    const term = `%${search.trim()}%`;
    const { data } = await this.db
      .from("leads")
      .select("id")
      .or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    return ((data as { id: string }[]) ?? []).map((r) => r.id);
  }

  private async attachAnalysis(
    submissions: Submission[],
    leadsById: Map<string, Lead>,
  ): Promise<SubmissionListItem[]> {
    if (submissions.length === 0) return [];
    const ids = submissions.map((s) => s.id);
    const { data: analyses } = await this.db
      .from("analysis_results")
      .select("submission_id, overall_score, provider, created_at")
      .in("submission_id", ids)
      .order("created_at", { ascending: false });

    const latest = new Map<string, { overall_score: number | null; provider: string }>();
    for (const a of (analyses as
      | { submission_id: string; overall_score: number | null; provider: string }[]
      | null) ?? []) {
      if (!latest.has(a.submission_id)) {
        latest.set(a.submission_id, { overall_score: a.overall_score, provider: a.provider });
      }
    }

    return submissions.map((s) => ({
      submission: s,
      lead: leadsById.get(s.lead_id)!,
      overall_score: latest.get(s.id)?.overall_score ?? null,
      provider: latest.get(s.id)?.provider ?? null,
    }));
  }

  async listSubmissions(
    filter: SubmissionListFilter,
  ): Promise<{ items: SubmissionListItem[]; total: number }> {
    let leadFilter: string[] | null = null;
    if (filter.search && filter.search.trim()) {
      leadFilter = await this.leadIdsMatchingSearch(filter.search);
      if (leadFilter.length === 0) return { items: [], total: 0 };
    }

    let query = this.db
      .from("submissions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(filter.offset, filter.offset + filter.limit - 1);
    if (filter.status) query = query.eq("status", filter.status);
    if (leadFilter) query = query.in("lead_id", leadFilter);

    const { data, count, error } = await query;
    if (error) throw error;
    const submissions = (data as Submission[]) ?? [];

    const leadsById = await this.loadLeads(submissions.map((s) => s.lead_id));
    const items = await this.attachAnalysis(submissions, leadsById);
    return { items, total: count ?? 0 };
  }

  private async loadLeads(leadIds: string[]): Promise<Map<string, Lead>> {
    const unique = Array.from(new Set(leadIds));
    const map = new Map<string, Lead>();
    if (unique.length === 0) return map;
    const { data } = await this.db.from("leads").select("*").in("id", unique);
    for (const l of (data as Lead[]) ?? []) map.set(l.id, l);
    return map;
  }

  async getImagesForSubmission(submissionId: string): Promise<ImageRow[]> {
    const { data } = await this.db
      .from("images")
      .select("*")
      .eq("submission_id", submissionId)
      .order("kind");
    return (data as ImageRow[]) ?? [];
  }

  async getImageByKind(
    submissionId: string,
    kind: ImageKind,
  ): Promise<ImageRow | null> {
    const { data } = await this.db
      .from("images")
      .select("*")
      .eq("submission_id", submissionId)
      .eq("kind", kind)
      .maybeSingle();
    return (data as ImageRow) ?? null;
  }

  async listNotes(submissionId: string): Promise<AdminNote[]> {
    const { data } = await this.db
      .from("admin_notes")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false });
    return (data as AdminNote[]) ?? [];
  }

  async addNote(note: NewAdminNote): Promise<AdminNote> {
    const { data, error } = await this.db
      .from("admin_notes")
      .insert({
        submission_id: note.submission_id,
        author_id: note.author_id ?? null,
        author_email: note.author_email ?? null,
        body: note.body,
      })
      .select()
      .single();
    if (error) throw error;
    return data as AdminNote;
  }

  async exportSubmissions(
    status?: SubmissionStatus,
  ): Promise<SubmissionListItem[]> {
    let query = this.db
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data } = await query;
    const submissions = (data as Submission[]) ?? [];
    const leadsById = await this.loadLeads(submissions.map((s) => s.lead_id));
    return this.attachAnalysis(submissions, leadsById);
  }
}
