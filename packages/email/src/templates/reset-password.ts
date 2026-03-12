export interface ResetPasswordEmailOptions {
  recipientName: string;
  resetUrl: string;
}

export function buildResetPasswordEmail(
  opts: ResetPasswordEmailOptions,
): { subject: string; html: string } {
  const subject = "Reset your password — Vigilry";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e4e4e7; }
    .header { background: #18181b; padding: 24px 32px; }
    .header h1 { margin: 0; color: #fff; font-size: 20px; font-weight: 600; }
    .body { padding: 32px; }
    .btn { display: inline-block; margin-top: 8px; padding: 12px 24px; background: #18181b; color: #fff; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; }
    .footer { padding: 20px 32px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Vigilry</h1>
    </div>
    <div class="body">
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hi ${opts.recipientName},</p>
      <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
      <a class="btn" href="${opts.resetUrl}">Reset password</a>
      <p style="margin:24px 0 0;color:#71717a;font-size:12px;">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>
    </div>
    <div class="footer">
      Vigilry · Automated Incident Detection
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}
