#!/usr/bin/env node

// Simple script to check SendGrid configuration
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MailService } from '@sendgrid/mail';

dotenv.config();

// Setup colored output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Log with color
function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// Check if the logs directory exists, create it if it doesn't
const logDir = path.join(process.cwd(), 'server/logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log file path
const logFile = path.join(logDir, 'sendgrid-check.log');
const logToFile = (message) => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
};

log(colors.blue, '======================================');
log(colors.blue, '     SendGrid Configuration Check     ');
log(colors.blue, '======================================');
log(colors.reset, '');

// Check API key
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  log(colors.red, 'ERROR: SendGrid API key is not set. Please set SENDGRID_API_KEY in your .env file.');
  logToFile('ERROR: SendGrid API key is not set.');
  process.exit(1);
}

log(colors.green, '✓ SendGrid API key is set.');
log(colors.green, `✓ API key length: ${apiKey.length} characters`);
logToFile(`API key is set (${apiKey.length} characters)`);

// Check from email
const fromEmail = process.env.EMAIL_FROM || 'alerts@obedtv.com';
log(colors.green, `✓ From email: ${fromEmail}`);
logToFile(`From email: ${fromEmail}`);

// Check sandbox mode
const sandboxMode = process.env.SENDGRID_SANDBOX === 'true';
if (sandboxMode) {
  log(colors.yellow, '⚠ Sandbox mode is ENABLED. Emails will not be delivered.');
} else {
  log(colors.green, '✓ Sandbox mode is DISABLED. Emails will be delivered.');
}
logToFile(`Sandbox mode: ${sandboxMode ? 'ENABLED' : 'DISABLED'}`);

// Create SendGrid mail service
const mailService = new MailService();
mailService.setApiKey(apiKey);

// Ask if user wants to send a test email
import { createInterface } from 'readline';
const readline = createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('\nWould you like to send a test email? (y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y') {
    readline.question('Enter recipient email: ', async (to) => {
      log(colors.blue, `\nSending test email to ${to}...`);
      logToFile(`Sending test email to ${to}`);
      
      try {
        const email = {
          to,
          from: fromEmail,
          subject: 'SendGrid Test Email',
          text: `This is a test email from OBview (${new Date().toISOString()})`,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background-color: #6366f1; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">OBview Test Email</h1>
                  </div>
                  <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
                    <p>This is a test email from OBview sent at ${new Date().toISOString()}</p>
                    <p>If you received this email, it means your email configuration is working correctly.</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="color: #64748b; font-size: 12px;">This is a diagnostic email for testing purposes.</p>
                  </div>
                </div>`,
          mail_settings: {
            sandbox_mode: {
              enable: sandboxMode
            }
          }
        };
        
        const response = await mailService.send(email);
        log(colors.green, `✓ Email sent with status code: ${response[0].statusCode}`);
        log(colors.green, `✓ Message ID: ${response[0].headers['x-message-id'] || 'unknown'}`);
        logToFile(`Email sent successfully, status code: ${response[0].statusCode}`);
        logToFile(`Message ID: ${response[0].headers['x-message-id'] || 'unknown'}`);
        
        log(colors.cyan, `\n→ Note: Even with a successful 202 status code, the email might not be delivered due to:
  1. Email provider spam filters
  2. SendGrid account restrictions for new accounts
  3. Email delivery delays
  4. Recipient server filtering`);
      } catch (error) {
        log(colors.red, `✗ Failed to send email: ${error.message}`);
        logToFile(`Failed to send email: ${error.message}`);
        
        if (error.response) {
          log(colors.red, `✗ Status code: ${error.response.statusCode}`);
          log(colors.red, `✗ Error body: ${JSON.stringify(error.response.body)}`);
          logToFile(`Status code: ${error.response.statusCode}`);
          logToFile(`Error body: ${JSON.stringify(error.response.body)}`);
        }
      }
      
      readline.close();
    });
  } else {
    log(colors.yellow, 'Skipping test email.');
    readline.close();
  }
});