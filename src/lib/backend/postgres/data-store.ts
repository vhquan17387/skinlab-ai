import { getPool } from "./pool";
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

export class PostgresDataStore implements DataStore {
  private get pool() {
    return getPool();
  }

  async insertLead(lead: NewLead): Promise<Lead> {
    const { rows } = await this.pool.query<Lead>(
      `INSERT INTO leads (full_name, email, phone, age, gender)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [lead.full_name, lead.email, lead.phone ?? null, lead.age ?? null, lead.gender ?? null],
    );
    return rows[0];
  }

  async insertSubmission(sub: NewSubmission): Promise<Submission> {
    const { rows } = await this.pool.query<Submission>(
      `INSERT INTO submissions
        (lead_id, skin_concerns, notes_from_user, consent_terms, consent_data,
         consent_images, user_agent, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        sub.lead_id,
        sub.skin_concerns,
        sub.notes_from_user ?? null,
        sub.consent_terms,
        sub.consent_data,
        sub.consent_images,
        sub.user_agent ?? null,
        sub.ip_hash ?? null,
      ],
    );
    return rows[0];
  }

  async insertImage(img: NewImage): Promise<ImageRow> {
    const { rows } = await this.pool.query<ImageRow>(
      `INSERT INTO images
        (submission_id, kind, storage_path, mime_type, size_bytes, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        img.submission_id,
        img.kind,
        img.storage_path,
        img.mime_type ?? null,
        img.size_bytes ?? null,
        img.width ?? null,
        img.height ?? null,
      ],
    );
    return rows[0];
  }

  async insertAnalysisResult(res: NewAnalysisResult): Promise<AnalysisResult> {
    const { rows } = await this.pool.query<AnalysisResult>(
      `INSERT INTO analysis_results
        (submission_id, provider, provider_model, raw, normalized, overall_score)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (submission_id, provider) DO UPDATE SET
         provider_model = EXCLUDED.provider_model,
         raw = EXCLUDED.raw,
         normalized = EXCLUDED.normalized,
         overall_score = EXCLUDED.overall_score
       RETURNING *`,
      [
        res.submission_id,
        res.provider,
        res.provider_model ?? null,
        JSON.stringify(res.raw),
        JSON.stringify(res.normalized),
        res.overall_score,
      ],
    );
    return rows[0];
  }

  async createReport(submissionId: string, token: string): Promise<Report> {
    const { rows } = await this.pool.query<Report>(
      `INSERT INTO reports (submission_id, token) VALUES ($1,$2) RETURNING *`,
      [submissionId, token],
    );
    return rows[0];
  }

  async setSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ): Promise<void> {
    await this.pool.query(`UPDATE submissions SET status = $2 WHERE id = $1`, [
      submissionId,
      status,
    ]);
  }

  async getReportByToken(token: string): Promise<Report | null> {
    const { rows } = await this.pool.query<Report>(
      `SELECT * FROM reports WHERE token = $1`,
      [token],
    );
    return rows[0] ?? null;
  }

  async getSubmissionDetail(
    submissionId: string,
  ): Promise<SubmissionDetail | null> {
    const subRes = await this.pool.query<Submission>(
      `SELECT * FROM submissions WHERE id = $1`,
      [submissionId],
    );
    const submission = subRes.rows[0];
    if (!submission) return null;

    const [leadRes, imagesRes, analysisRes, reportRes] = await Promise.all([
      this.pool.query<Lead>(`SELECT * FROM leads WHERE id = $1`, [
        submission.lead_id,
      ]),
      this.pool.query<ImageRow>(
        `SELECT * FROM images WHERE submission_id = $1 ORDER BY kind`,
        [submissionId],
      ),
      this.pool.query<AnalysisResult>(
        `SELECT * FROM analysis_results WHERE submission_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [submissionId],
      ),
      this.pool.query<Report>(
        `SELECT * FROM reports WHERE submission_id = $1`,
        [submissionId],
      ),
    ]);

    return {
      submission,
      lead: leadRes.rows[0],
      images: imagesRes.rows,
      analysis: analysisRes.rows[0] ?? null,
      report: reportRes.rows[0] ?? null,
    };
  }

  async listSubmissions(
    filter: SubmissionListFilter,
  ): Promise<{ items: SubmissionListItem[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      params.push(filter.status);
      where.push(`s.status = $${params.length}`);
    }
    if (filter.search && filter.search.trim()) {
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(
        `(lower(l.full_name) LIKE ${p} OR lower(l.email) LIKE ${p} OR lower(coalesce(l.phone,'')) LIKE ${p})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRes = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM submissions s JOIN leads l ON l.id = s.lead_id ${whereSql}`,
      params,
    );
    const total = Number(totalRes.rows[0]?.count ?? 0);

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const { rows } = await this.pool.query(
      `SELECT
          row_to_json(s.*) AS submission,
          row_to_json(l.*) AS lead,
          ar.overall_score AS overall_score,
          ar.provider AS provider
        FROM submissions s
        JOIN leads l ON l.id = s.lead_id
        LEFT JOIN LATERAL (
          SELECT overall_score, provider FROM analysis_results
          WHERE submission_id = s.id ORDER BY created_at DESC LIMIT 1
        ) ar ON true
        ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, filter.limit, filter.offset],
    );

    const items: SubmissionListItem[] = rows.map((r) => ({
      submission: r.submission,
      lead: r.lead,
      overall_score: r.overall_score,
      provider: r.provider,
    }));
    return { items, total };
  }

  async getImagesForSubmission(submissionId: string): Promise<ImageRow[]> {
    const { rows } = await this.pool.query<ImageRow>(
      `SELECT * FROM images WHERE submission_id = $1 ORDER BY kind`,
      [submissionId],
    );
    return rows;
  }

  async getImageByKind(
    submissionId: string,
    kind: ImageKind,
  ): Promise<ImageRow | null> {
    const { rows } = await this.pool.query<ImageRow>(
      `SELECT * FROM images WHERE submission_id = $1 AND kind = $2`,
      [submissionId, kind],
    );
    return rows[0] ?? null;
  }

  async listNotes(submissionId: string): Promise<AdminNote[]> {
    const { rows } = await this.pool.query<AdminNote>(
      `SELECT * FROM admin_notes WHERE submission_id = $1 ORDER BY created_at DESC`,
      [submissionId],
    );
    return rows;
  }

  async addNote(note: NewAdminNote): Promise<AdminNote> {
    const { rows } = await this.pool.query<AdminNote>(
      `INSERT INTO admin_notes (submission_id, author_id, author_email, body)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [note.submission_id, note.author_id ?? null, note.author_email ?? null, note.body],
    );
    return rows[0];
  }

  async exportSubmissions(
    status?: SubmissionStatus,
  ): Promise<SubmissionListItem[]> {
    const params: unknown[] = [];
    let whereSql = "";
    if (status) {
      params.push(status);
      whereSql = `WHERE s.status = $1`;
    }
    const { rows } = await this.pool.query(
      `SELECT
          row_to_json(s.*) AS submission,
          row_to_json(l.*) AS lead,
          ar.overall_score AS overall_score,
          ar.provider AS provider
        FROM submissions s
        JOIN leads l ON l.id = s.lead_id
        LEFT JOIN LATERAL (
          SELECT overall_score, provider FROM analysis_results
          WHERE submission_id = s.id ORDER BY created_at DESC LIMIT 1
        ) ar ON true
        ${whereSql}
        ORDER BY s.created_at DESC`,
      params,
    );
    return rows.map((r) => ({
      submission: r.submission,
      lead: r.lead,
      overall_score: r.overall_score,
      provider: r.provider,
    }));
  }
}
