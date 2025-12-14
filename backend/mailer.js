import nodemailer from "nodemailer";

let transporter = null;

function boolEnv(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === "true";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getMailer() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  // For 587 we must use STARTTLS (secure=false + requireTLS=true)
  const secure = port === 465 ? true : boolEnv("SMTP_SECURE", false);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,                 // true for 465, false for 587
    requireTLS: !secure,    // ✅ forces STARTTLS on 587
    family: 4,              // ✅ force IPv4 (prevents Node IPv6 route timeouts)

    auth: user && pass ? { user, pass } : undefined,

    // ✅ Faster + more reliable
    pool: true,
    maxConnections: 2,
    maxMessages: 50,

    // ✅ Avoid timeouts (Hostinger can be slow to greet)
    connectionTimeout: 60_000,
    greetingTimeout: 60_000,
    socketTimeout: 60_000,

    tls: {
      rejectUnauthorized: true,
      servername: host,
    },
  });

  return transporter;
}

export async function sendOtpEmail({ to, code }) {
  const from = process.env.SMTP_FROM || "CSAT Survey <no-reply@umms.cloud>";
  const app = process.env.APP_NAME || "CSAT Survey";
  const brand = process.env.BRAND_NAME || app; // optional
  const ttl = Number(process.env.OTP_TTL_MINUTES || 10);
  const year = new Date().getFullYear();

  const safeBrand = escapeHtml(brand);
  const safeCode = escapeHtml(code);

  // ✅ Helps users find OTP instantly in inbox
  const subject = `${brand} OTP — ${code}`;

  // ✅ Plain text fallback (deliverability + accessibility)
  const text =
    `${brand} verification code: ${code}\n\n` +
    `This OTP expires in ${ttl} minutes.\n` +
    `If you didn't request it, ignore this email.`;

  // ✅ Gmail-safe premium design (tables + inline styles)
  const html = `
  <div style="margin:0;padding:0;background:#f6f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7fb;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          
          <!-- Preheader (hidden) -->
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
            Your one-time code is ${safeCode}. Expires in ${ttl} minutes.
          </div>

          <!-- container -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
            style="width:560px;max-width:560px;background:#ffffff;border:1px solid #e9edf5;border-radius:18px;overflow:hidden;">

            <!-- header -->
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #eef2f7;background:#fbfcff;">
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;color:#0f172a;">
                  <div style="font-size:14px;font-weight:700;letter-spacing:0.2px;">${safeBrand}</div>
                  <div style="font-size:20px;font-weight:800;margin-top:6px;">Verify your email</div>
                  <div style="font-size:13px;color:#64748b;margin-top:6px;line-height:1.5;">
                    Use the one-time password (OTP) below. It expires in <b>${ttl} minutes</b>.
                  </div>
                </div>
              </td>
            </tr>

            <!-- OTP block -->
            <tr>
              <td style="padding:20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                  style="background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;">
                  <tr>
                    <td style="padding:14px 14px 6px 14px;">
                      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;color:#64748b;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">
                        One-Time Password
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:8px 14px 16px 14px;">
                      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;
                        font-size:34px;font-weight:900;letter-spacing:0.22em;color:#0f172a;">
                        ${safeCode}
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;color:#64748b;font-size:12px;margin-top:14px;line-height:1.5;">
                  If you didn’t request this OTP, you can safely ignore this email.
                </div>

                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;color:#94a3b8;font-size:11px;margin-top:10px;line-height:1.5;">
                  Tip: Copy & paste the OTP into the survey window.
                </div>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="padding:14px 20px;border-top:1px solid #eef2f7;background:#fbfcff;">
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;color:#94a3b8;font-size:11px;line-height:1.5;">
                  © ${year} ${safeBrand}. This is an automated message.
                </div>
              </td>
            </tr>

          </table>

          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;color:#94a3b8;font-size:11px;margin-top:12px;text-align:center;">
            Sent by ${safeBrand}
          </div>

        </td>
      </tr>
    </table>
  </div>`;

  const mailer = getMailer();

  // Debug SMTP once if needed:
  // await mailer.verify();

  await mailer.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}