import sgMail from '@sendgrid/mail';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup logging
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFilePath = path.join(logDir, 'sendgrid-test.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
  console.log(message);
}

// For directly running this script
const apiKey = process.env.SENDGRID_API_KEY;

if (!apiKey) {
  log('ERROR: No SendGrid API key found');
  process.exit(1);
}

log(`API Key length: ${apiKey.length} characters`);

// Set API key
sgMail.setApiKey(apiKey);

const testEmail = {
  to: 'obedtest@tbn.tv', // Replace with your test email
  from: 'alerts@obedtv.com', // Must be verified with SendGrid
  subject: 'SendGrid Test Email',
  text: 'This is a test email from SendGrid',
  html: '<p>This is a test email from SendGrid</p>',
  mail_settings: {
    sandbox_mode: {
      enable: process.env.SENDGRID_SANDBOX === 'true'
    }
  }
};

log('Sending test email...');
log(`Sandbox mode: ${process.env.SENDGRID_SANDBOX === 'true' ? 'ENABLED' : 'DISABLED'}`);

sgMail.send(testEmail)
  .then(response => {
    log(`SUCCESS: Email sent with status code: ${response[0]?.statusCode}`);
    log(`Message ID: ${response[0]?.headers['x-message-id'] || 'unknown'}`);
    log(`Complete response: ${JSON.stringify(response, null, 2)}`);
  })
  .catch(error => {
    log('ERROR: Failed to send email');
    log(`Error code: ${error.code || 'unknown'}`);
    log(`Error message: ${error.message || 'No message'}`);
    
    if (error.response) {
      log(`Status code: ${error.response.statusCode}`);
      log(`Body: ${JSON.stringify(error.response.body, null, 2)}`);
      log(`Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
    }
  });