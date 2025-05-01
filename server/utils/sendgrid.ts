import { MailService } from '@sendgrid/mail';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config';

// In ES modules, __dirname is not defined, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Get SendGrid API key from environment
const apiKey = process.env.SENDGRID_API_KEY || process.env.NEW_SENDGRID_API_KEY;

if (!apiKey) {
  const warning = "No SendGrid API key found. Email functionality will not work.";
  console.warn(warning);
  logToFile(warning);
} else {
  logToFile("SendGrid API key is set. Email functionality should be working.");
}

// Initialize the SendGrid mail service with API key
const mailService = new MailService();
mailService.setApiKey(apiKey || '');

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
    // Log all input parameters for debugging
    logToFile(`Sending email with the following parameters:`);
    logToFile(`  - To: ${params.to}`);
    logToFile(`  - From: ${params.from}`);
    logToFile(`  - Subject: ${params.subject}`);
    logToFile(`  - Text length: ${params.text?.length || 0} characters`);
    logToFile(`  - HTML length: ${params.html?.length || 0} characters`);
    
    // Verify API key exists - use the module scoped variable
    if (!apiKey) {
      const error = "Cannot send email: No SendGrid API key is set";
      console.error(error);
      logToFile(error);
      return false;
    }
    
    // Log API key state (not the actual key for security)
    const apiKeyLength = apiKey.length;
    logToFile(`Using SendGrid API key (${apiKeyLength} characters)`);
    
    // Ensure the API key is properly set in the mail service
    mailService.setApiKey(apiKey);
    logToFile(`API key set in mail service`);
    
    // Prepare email data with configurable sandbox mode
    // The account now has a verified sender (alerts@obedtv.com)
    const emailData = {
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
      mail_settings: {
        sandbox_mode: {
          enable: config.sendgridSandbox
        }
      }
    };
    
    logToFile(`Sending email via SendGrid...`);
    const response = await mailService.send(emailData);
    
    // Log success and response details
    const successMsg = `Email sent successfully to ${params.to}`;
    console.log(successMsg);
    logToFile(successMsg);
    
    if (response && response.length > 0) {
      const statusCode = response[0]?.statusCode;
      const messageId = response[0]?.headers?.['x-message-id'] || 'unknown';
      
      logToFile(`SendGrid response status code: ${statusCode}`);
      logToFile(`SendGrid message ID: ${messageId}`);
      logToFile(`Full response: ${JSON.stringify(response)}`);
    } else {
      logToFile(`No detailed response received from SendGrid`);
    }
    
    return true;
  } catch (error) {
    // Enhanced error logging
    const errorMsg = `SendGrid email error when sending to ${params.to}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    logToFile(errorMsg);
    
    // Log stack trace if available
    if (error instanceof Error && error.stack) {
      logToFile(`Error stack: ${error.stack}`);
    }
    
    // Log error object details if possible
    try {
      if (typeof error === 'object' && error !== null) {
        logToFile(`Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
        
        // Check for specific SendGrid error properties
        if ('response' in error) {
          const responseBody = (error as any).response?.body || {};
          logToFile(`SendGrid API response: ${JSON.stringify(responseBody)}`);
          
          // Check for common SendGrid errors and provide helpful messages
          if (responseBody.errors) {
            responseBody.errors.forEach((err: any) => {
              if (err.message) {
                console.error(`SendGrid specific error: ${err.message}`);
                logToFile(`SendGrid specific error: ${err.message}`);
              }
              
              // Help with common error codes
              if (err.field === 'from' && err.message?.includes('does not exist')) {
                console.error('IMPORTANT: Your sender email is not verified with SendGrid.');
                logToFile('IMPORTANT: Your sender email is not verified with SendGrid.');
                logToFile('Try using a sendgrid.net address or verify your domain/email with SendGrid.');
              }
              
              if (err.message?.includes('forbidden')) {
                console.error('IMPORTANT: Your SendGrid API key may have insufficient permissions or your account needs verification.');
                logToFile('IMPORTANT: Your SendGrid API key may have insufficient permissions or your account needs verification.');
                logToFile('Try using sandbox mode or check your SendGrid account status.');
              }
            });
          }
        }
      }
    } catch (jsonError) {
      logToFile(`Error serializing error object: ${jsonError}`);
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
  appUrl?: string
): Promise<boolean> {
  try {
    logToFile(`Preparing invitation email to ${to} for project "${projectName}" from "${inviterName}" with role "${role}"`);
    logToFile(`Token: ${token}`);
    
    // Use the application domain from our config
    const baseUrl = config.appDomain;
    logToFile(`Using application domain from config: ${baseUrl}`);
    
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
    
    // Use the verified sender identity for your SendGrid account
    // alerts@obedtv.com is already verified with SendGrid
    const sender = config.emailFrom;
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