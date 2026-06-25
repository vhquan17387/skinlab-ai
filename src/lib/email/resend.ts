import "server-only";

interface ReportEmailInput {
  to: string;
  fullName: string;
  token: string;
}

// Sends the "report ready" email via Resend. No-op when RESEND_API_KEY is unset.
export async function sendReportReadyEmail(input: ReportEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set — skipping report email to", input.to);
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || "SkinAI Lab <noreply@example.com>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const reportUrl = `${appUrl}/report/${input.token}`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: input.to,
      subject: "Báo cáo phân tích da của bạn đã sẵn sàng",
      html: `
        <p>Xin chào ${input.fullName},</p>
        <p>Báo cáo phân tích da của bạn đã sẵn sàng. Bạn có thể xem tại liên kết dưới đây:</p>
        <p><a href="${reportUrl}">${reportUrl}</a></p>
        <p style="color:#666;font-size:13px;">Kết quả phân tích chỉ mang tính tham khảo, không phải chẩn đoán y khoa và không thay thế việc thăm khám với bác sĩ da liễu.</p>
      `,
    });
  } catch (err) {
    console.error("[email] Failed to send report email:", err);
  }
}
