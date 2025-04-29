import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will not work.");
}

// Initialize the SendGrid mail service with API key
const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY || '');

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Send an email using SendGrid
 * @param params Email parameters
 * @returns Promise<boolean> Success status
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    console.log(`Email sent successfully to ${params.to}`);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

/**
 * Send a project invitation email
 * @param to Recipient email
 * @param inviterName Name of the person who sent the invitation
 * @param projectName Name of the project
 * @param role Role granted in the project
 * @param token Invitation token
 * @param appUrl Base URL of the application
 * @returns Promise<boolean> Success status
 */
export async function sendInvitationEmail(
  to: string,
  inviterName: string,
  projectName: string,
  role: string,
  token: string,
  appUrl: string = process.env.APP_URL || `http://localhost:5000`
): Promise<boolean> {
  const inviteUrl = `${appUrl}/invite/${token}`;
  
  const subject = `${inviterName} invited you to collaborate on ${projectName}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #6366f1; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Project Invitation</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
        <p>Hello,</p>
        <p><strong>${inviterName}</strong> has invited you to collaborate on the project <strong>${projectName}</strong> as a <strong>${role}</strong>.</p>
        <p>Click the button below to accept this invitation:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p>Or copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #4f46e5;">${inviteUrl}</p>
        <p>This invitation will expire in 7 days.</p>
        <p>If you have any questions, please contact the project owner.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #64748b; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    </div>
  `;
  
  const text = `
    ${inviterName} has invited you to collaborate on the project ${projectName} as a ${role}.
    
    To accept this invitation, visit: ${inviteUrl}
    
    This invitation will expire in 7 days.
    
    If you didn't expect this invitation, you can safely ignore this email.
  `;
  
  return await sendEmail({
    to,
    from: process.env.FROM_EMAIL || 'noreply@example.com',
    subject,
    html,
    text
  });
}