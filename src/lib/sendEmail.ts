import nodemailer from "nodemailer";

export class SendEmailError extends Error {}

/**
 * SMTP_* 환경변수가 전부 채워져 있는지 확인한다. 비어있으면 이메일 기능은 "미설정"으로 간주해
 * 조용히 비활성화된다 - 회사 SMTP 계정을 받기 전까지는 개인 계정을 쓰지 않기로 했기 때문에,
 * 지금은 이 값이 항상 false다. 값을 채우기만 하면(재배포 없이) 바로 켜진다.
 */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL
  );
}

function getTransporter() {
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465는 SMTPS, 587/25는 STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendTripSettlementEmail(params: {
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; content: Buffer; contentType: string };
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new SendEmailError(
      "이메일 발송 기능이 아직 설정되지 않았습니다 (.env의 SMTP_* 값이 비어 있습니다)."
    );
  }

  const fromName = process.env.SMTP_FROM_NAME || "정총무";
  const fromEmail = process.env.SMTP_FROM_EMAIL;

  const transporter = getTransporter();
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      attachments: [params.attachment],
    });
  } catch (err) {
    throw new SendEmailError(`이메일 발송에 실패했습니다: ${(err as Error).message}`);
  }
}
