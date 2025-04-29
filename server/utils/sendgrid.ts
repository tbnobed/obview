import { MailService } from '@sendgrid/mail';
import fs from 'fs';
import path from 'path';

// Setup logging
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFilePath = path.join(logDir, 'sendgrid.log');

function logToFile(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
}

if (!process.env.SENDGRID_API_KEY) {
  const warning = "SENDGRID_API_KEY environment variable is not set. Email functionality will not work.";
  console.warn(warning);
  logToFile(warning);
} else {
  logToFile("SENDGRID_API_KEY is set. Email functionality should be working.");
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
    logToFile(`Attempting to send email to ${params.to} from ${params.from} with subject: ${params.subject}`);
    
    if (!process.env.SENDGRID_API_KEY) {
      const error = "Cannot send email: SENDGRID_API_KEY is not set";
      console.error(error);
      logToFile(error);
      return false;
    }
    
    const response = await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    
    const successMsg = `Email sent successfully to ${params.to}`;
    console.log(successMsg);
    logToFile(successMsg);
    logToFile(`SendGrid response: ${JSON.stringify(response)}`);
    
    return true;
  } catch (error) {
    const errorMsg = `SendGrid email error when sending to ${params.to}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    logToFile(errorMsg);
    
    if (error instanceof Error && error.stack) {
      logToFile(`Error stack: ${error.stack}`);
    }
    
    if (typeof error === 'object' && error !== null) {
      logToFile(`Error details: ${JSON.stringify(error)}`);
    }
    
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
  try {
    logToFile(`Preparing invitation email to ${to} for project "${projectName}" from "${inviterName}" with role "${role}"`);
    
    // Determine the correct invite URL
    // If we're in a Replit environment, construct a proper URL
    let baseUrl = appUrl;
    if (process.env.REPL_ID) {
      baseUrl = `https://${process.env.REPL_ID}.repl.co`;
      logToFile(`Running in Replit environment, using base URL: ${baseUrl}`);
    } else {
      logToFile(`Using provided app URL: ${baseUrl}`);
    }
    
    const inviteUrl = `${baseUrl}/invite/${token}`;
    logToFile(`Generated invite URL: ${inviteUrl}`);
    
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
    
    const sender = process.env.EMAIL_FROM || 'alerts@obedtv.com';
    logToFile(`Using sender email: ${sender}`);
    
    return await sendEmail({
      to,
      from: sender,
      subject,
      html,
      text
    });
  } catch (error) {
    const errorMsg = `Error preparing invitation email to ${to}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    logToFile(errorMsg);
    return false;
  }
}