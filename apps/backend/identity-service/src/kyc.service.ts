import { BadRequestException, Injectable } from "@nestjs/common";
import { dbQuery } from "@nevo/shared-infra";
import { toPublicUploadUrl } from "@nevo/shared-infra";
import type { SubmitKycDto } from "./kyc.dto";

type KycSubmissionRow = {
  id: string;
  user_id: string;
  document_type: string | null;
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
      selfie?: Array<{ filename: string }>;
    }
  ) {
    const documentFile = files.idDocument?.[0];
    const selfieFile = files.selfie?.[0];

    if (!documentFile || !selfieFile) {
      throw new BadRequestException("Both idDocument and selfie files are required");
    }

    const result = await dbQuery<KycSubmissionRow>(
      `
        INSERT INTO kyc_submissions (
          id,
          user_id,
          document_type,
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
          'pending',
          NOW()
        )
        RETURNING
          id,
          user_id,
          document_type,
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
      documentUrl: submission.document_url,
      selfieUrl: submission.selfie_url,
      status: submission.status,
      adminNote: submission.admin_note,
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at
    };
  }
}
