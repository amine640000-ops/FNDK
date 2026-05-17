import { BadRequestException, Injectable } from "@nestjs/common";
import { dbQuery } from "@nevo/shared-infra";
import { toPublicUploadUrl } from "@nevo/shared-infra";
import type { SubmitKycDto } from "./kyc.dto";

type KycSubmissionRow = {
  id: string;
  user_id: string;
  document_type: string | null;
  nationality: string | null;
  first_name: string | null;
  last_name: string | null;
  document_number: string | null;
  document_url: string;
  selfie_url: string;
  status: string;
  admin_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

@Injectable()
export class KycService {
  async submit(
    userId: string,
    dto: SubmitKycDto,
    files: {
      idDocument?: Array<{ filename: string }>;
      document?: Array<{ filename: string }>;
      id_document?: Array<{ filename: string }>;
      documentFile?: Array<{ filename: string }>;
      selfie?: Array<{ filename: string }>;
      selfieFile?: Array<{ filename: string }>;
      selfie_file?: Array<{ filename: string }>;
    } = {}
  ) {
    const documentFile = files.idDocument?.[0] ?? files.document?.[0] ?? files.id_document?.[0] ?? files.documentFile?.[0];
    const selfieFile = files.selfie?.[0] ?? files.selfieFile?.[0] ?? files.selfie_file?.[0];

    if (!documentFile || !selfieFile) {
      throw new BadRequestException("Both ID document and selfie files are required");
    }

    const result = await dbQuery<KycSubmissionRow>(
      `
        INSERT INTO kyc_submissions (
          id,
          user_id,
          document_type,
          nationality,
          first_name,
          last_name,
          document_number,
          document_url,
          selfie_url,
          status,
          submitted_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'pending',
          NOW()
        )
        RETURNING
          id,
          user_id,
          document_type,
          nationality,
          first_name,
          last_name,
          document_number,
          document_url,
          selfie_url,
          status,
          admin_note,
          submitted_at,
          reviewed_at
      `,
      [
        userId,
        dto.documentType ?? "government-id",
        dto.nationality?.trim() || null,
        dto.firstName?.trim() || null,
        dto.lastName?.trim() || null,
        dto.documentNumber?.trim() || null,
        toPublicUploadUrl("kyc", documentFile.filename),
        toPublicUploadUrl("kyc", selfieFile.filename)
      ]
    );

    await dbQuery("UPDATE users SET kyc_status = 'pending' WHERE id = $1", [userId]);

    return this.mapSubmission(result.rows[0]);
  }

  async listForUser(userId: string) {
    const result = await dbQuery<KycSubmissionRow>(
      `
        SELECT
          id,
          user_id,
          document_type,
          nationality,
          first_name,
          last_name,
          document_number,
          document_url,
          selfie_url,
          status,
          admin_note,
          submitted_at,
          reviewed_at
        FROM kyc_submissions
        WHERE user_id = $1
        ORDER BY submitted_at DESC
      `,
      [userId]
    );

    return result.rows.map((submission) => this.mapSubmission(submission));
  }

  private mapSubmission(submission: KycSubmissionRow) {
    return {
      id: submission.id,
      userId: submission.user_id,
      documentType: submission.document_type,
      nationality: submission.nationality,
      firstName: submission.first_name,
      lastName: submission.last_name,
      documentNumber: submission.document_number,
      documentUrl: submission.document_url,
      selfieUrl: submission.selfie_url,
      status: submission.status,
      adminNote: submission.admin_note,
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at
    };
  }
}
