import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import dotenv from "dotenv";

dotenv.config();

// Configure SES client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Verified sender email (must be verified in SES)
const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || "noreply@nairalancers.com";
const SENDER_NAME = process.env.SES_SENDER_NAME || "Nairalancers";

// Email templates
const emailTemplates = {
  // Email verification template
  emailVerification: (code, type = "change") => ({
    subject: "Verify Your Email Address - Nairalancers",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #1dbf73; }
          .logo { font-size: 24px; font-weight: bold; color: #1dbf73; }
          .content { padding: 30px 0; }
          .verification-code { 
            background-color: #f8f9fa; 
            border: 2px dashed #1dbf73; 
            padding: 20px; 
            text-align: center; 
            margin: 20px 0; 
            border-radius: 8px;
          }
          .code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #1dbf73; 
            letter-spacing: 5px; 
            font-family: monospace;
          }
          .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; }
          .warning { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🚀 Nairalancers</div>
          </div>
          <div class="content">
            <h2>Email Verification Required</h2>
            <p>Hello!</p>
            <p>${type === "change" ? "You've requested to change your email address." : "Thank you for your email verification request."}</p>
            <p>Please use the verification code below to complete the process:</p>
            
            <div class="verification-code">
              <div class="code">${code}</div>
            </div>
            
            <div class="warning">
              <strong>⏰ Important:</strong> This verification code will expire in 10 minutes for security reasons.
            </div>
            
            <p>If you didn't request this verification, please ignore this email or contact our support team.</p>
            
            <p>Best regards,<br>The Nairalancers Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Nairalancers. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Email Verification - Nairalancers
      
      Hello!
      
      ${type === "change" ? "You've requested to change your email address." : "Thank you for your email verification request."}
      
      Please use this verification code: ${code}
      
      This code will expire in 10 minutes.
      
      If you didn't request this verification, please ignore this email.
      
      Best regards,
      The Nairalancers Team
    `
  }),

  // Registration verification template
  registrationVerification: (code, firstname) => ({
    subject: "Welcome to Nairalancers! Verify Your Email",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Nairalancers</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #1dbf73; }
          .logo { font-size: 24px; font-weight: bold; color: #1dbf73; }
          .content { padding: 30px 0; }
          .welcome-banner { background: linear-gradient(135deg, #1dbf73, #00b894); padding: 30px; text-align: center; color: white; border-radius: 8px; margin: 20px 0; }
          .verification-code { 
            background-color: #f8f9fa; 
            border: 2px dashed #1dbf73; 
            padding: 20px; 
            text-align: center; 
            margin: 20px 0; 
            border-radius: 8px;
          }
          .code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #1dbf73; 
            letter-spacing: 5px; 
            font-family: monospace;
          }
          .features { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .feature { margin: 10px 0; }
          .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🚀 Nairalancers</div>
          </div>
          <div class="content">
            <div class="welcome-banner">
              <h1>Welcome to Nairalancers, ${firstname}! 🎉</h1>
              <p>You're just one step away from joining Nigeria's premier freelancing platform!</p>
            </div>
            
            <h2>Verify Your Email Address</h2>
            <p>Please use the verification code below to complete your registration:</p>
            
            <div class="verification-code">
              <div class="code">${code}</div>
            </div>
            
            <div class="features">
              <h3>What you can do on Nairalancers:</h3>
              <div class="feature">✅ Connect with top freelancers and clients</div>
              <div class="feature">✅ Secure payment processing</div>
              <div class="feature">✅ 24/7 customer support</div>
              <div class="feature">✅ Build your professional portfolio</div>
            </div>
            
            <p><strong>⏰ This verification code will expire in 10 minutes.</strong></p>
            
            <p>If you didn't create this account, please ignore this email.</p>
            
            <p>Welcome aboard!<br>The Nairalancers Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Nairalancers. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to Nairalancers, ${firstname}!
      
      You're just one step away from joining Nigeria's premier freelancing platform!
      
      Please use this verification code to complete your registration: ${code}
      
      This code will expire in 10 minutes.
      
      What you can do on Nairalancers:
      - Connect with top freelancers and clients
      - Secure payment processing
      - 24/7 customer support
      - Build your professional portfolio
      
      If you didn't create this account, please ignore this email.
      
      Welcome aboard!
      The Nairalancers Team
    `
  }),

  // Password reset template
  passwordReset: (resetLink, firstname) => ({
    subject: "Reset Your Nairalancers Password",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #1dbf73; }
          .logo { font-size: 24px; font-weight: bold; color: #1dbf73; }
          .content { padding: 30px 0; }
          .reset-button { 
            display: inline-block; 
            background-color: #1dbf73; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
            font-weight: bold;
          }
          .security-notice { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107; }
          .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🚀 Nairalancers</div>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hi ${firstname},</p>
            <p>We received a request to reset your Nairalancers account password.</p>
            <p>Click the button below to reset your password:</p>
            
            <div style="text-align: center;">
              <a href="${resetLink}" class="reset-button">Reset My Password</a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px;">${resetLink}</p>
            
            <div class="security-notice">
              <strong>🔒 Security Notice:</strong>
              <ul>
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Your password won't change until you create a new one</li>
              </ul>
            </div>
            
            <p>If you continue to have problems, please contact our support team.</p>
            
            <p>Best regards,<br>The Nairalancers Team</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Nairalancers. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request - Nairalancers
      
      Hi ${firstname},
      
      We received a request to reset your Nairalancers account password.
      
      Click this link to reset your password:
      ${resetLink}
      
      Security Notice:
      - This link will expire in 1 hour
      - If you didn't request this reset, please ignore this email
      - Your password won't change until you create a new one
      
      If you continue to have problems, please contact our support team.
      
      Best regards,
      The Nairalancers Team
    `
  }),

  // Gig approval notification template for admin
  'gig-approval-notification': (templateData) => ({
    subject: templateData.isUpdate ? 'Gig Updated - Re-approval Required' : 'New Gig Posted - Approval Required',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gig ${templateData.isUpdate ? 'Update' : 'Approval'} Required</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #1dbf73; }
          .logo { font-size: 24px; font-weight: bold; color: #1dbf73; }
          .content { padding: 30px 0; }
          .gig-info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .btn { 
            display: inline-block; 
            padding: 12px 25px; 
            margin: 0 10px; 
            text-decoration: none; 
            border-radius: 5px; 
            font-weight: bold;
            color: white;
          }
          .btn-primary { background-color: #1dbf73; }
          .btn-secondary { background-color: #6c757d; }
          .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; }
          .highlight { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🚀 Nairalancers Admin</div>
          </div>
          <div class="content">
            <h2>${templateData.isUpdate ? '📝 Gig Updated - Re-approval Required' : '🎯 New Gig Posted - Approval Required'}</h2>
            <p>Hello Admin,</p>
            <p>${templateData.isUpdate ? 'A gig has been updated and requires re-approval:' : 'A new gig has been posted and requires your approval:'}</p>
            
            <div class="gig-info">
              <h3>📋 Gig Details</h3>
              <div class="info-row">
                <span class="label">Title:</span>
                <span class="value">${templateData.gigTitle}</span>
              </div>
              <div class="info-row">
                <span class="label">Seller:</span>
                <span class="value">${templateData.sellerName} (@${templateData.sellerUsername})</span>
              </div>
              <div class="info-row">
                <span class="label">Category:</span>
                <span class="value">${templateData.gigCategory} → ${templateData.gigSubcategory}</span>
              </div>
              <div class="info-row">
                <span class="label">Base Price:</span>
                <span class="value">₦${templateData.basePrice.toLocaleString()}</span>
              </div>
              ${templateData.hasPackages ? '<div class="info-row"><span class="label">Packages:</span><span class="value">✅ Enabled</span></div>' : ''}
              ${templateData.hasMilestones ? '<div class="info-row"><span class="label">Milestones:</span><span class="value">✅ Enabled</span></div>' : ''}
              <div class="info-row">
                <span class="label">${templateData.isUpdate ? 'Updated' : 'Created'}:</span>
                <span class="value">${templateData.isUpdate ? templateData.updatedAt : templateData.createdAt}</span>
              </div>
            </div>

            ${templateData.hasPackages ? '<div class="highlight">💼 This gig includes package options (Basic, Standard, Premium)</div>' : ''}
            ${templateData.hasMilestones ? '<div class="highlight">🎯 This gig includes milestone-based project structure</div>' : ''}

            <div class="action-buttons">
              <a href="${templateData.adminUrl}" class="btn btn-primary">Review Gig</a>
              <a href="${templateData.approvalUrl}" class="btn btn-secondary">Manage All Gigs</a>
            </div>

            <p><strong>Quick Actions:</strong></p>
            <ul>
              <li>Review gig content and ensure it meets platform guidelines</li>
              <li>Check pricing structure${templateData.hasPackages ? ' and package configuration' : ''}</li>
              ${templateData.hasMilestones ? '<li>Verify milestone setup and pricing breakdown</li>' : ''}
              <li>Approve, reject, or request modifications</li>
            </ul>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Nairalancers Admin Panel. All rights reserved.</p>
            <p>This is an automated notification. Please log into admin panel for actions.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ${templateData.isUpdate ? 'Gig Updated - Re-approval Required' : 'New Gig Posted - Approval Required'}
      
      Hello Admin,
      
      ${templateData.isUpdate ? 'A gig has been updated and requires re-approval:' : 'A new gig has been posted and requires your approval:'}
      
      Gig Details:
      - Title: ${templateData.gigTitle}
      - Seller: ${templateData.sellerName} (@${templateData.sellerUsername})
      - Category: ${templateData.gigCategory} → ${templateData.gigSubcategory}
      - Base Price: ₦${templateData.basePrice.toLocaleString()}
      ${templateData.hasPackages ? '- Packages: Enabled' : ''}
      ${templateData.hasMilestones ? '- Milestones: Enabled' : ''}
      - ${templateData.isUpdate ? 'Updated' : 'Created'}: ${templateData.isUpdate ? templateData.updatedAt : templateData.createdAt}
      
      ${templateData.hasPackages ? 'This gig includes package options (Basic, Standard, Premium)' : ''}
      ${templateData.hasMilestones ? 'This gig includes milestone-based project structure' : ''}
      
      Review Gig: ${templateData.adminUrl}
      Manage All Gigs: ${templateData.approvalUrl}
      
      Please review and take appropriate action.
      
      Nairalancers Admin Team
    `
  })
};

// Send email function (supports both legacy and new format)
export const sendEmail = async (emailDataOrTo, templateOrData, dataOrUndefined) => {
  try {
    let to, template, data, emailContent;

    // Check if first parameter is an object (new format)
    if (typeof emailDataOrTo === 'object' && emailDataOrTo.to) {
      // New object format: { to, subject, template, templateData }
      to = Array.isArray(emailDataOrTo.to) ? emailDataOrTo.to : [emailDataOrTo.to];
      template = emailDataOrTo.template;
      data = emailDataOrTo.templateData;
      
      if (emailDataOrTo.subject && !template) {
        // Direct email content provided
        emailContent = {
          subject: emailDataOrTo.subject,
          html: emailDataOrTo.html || '',
          text: emailDataOrTo.text || ''
        };
      } else {
        // Use template
        emailContent = emailTemplates[template](data);
      }
    } else {
      // Legacy format: (to, template, data)
      to = [emailDataOrTo];
      template = templateOrData;
      data = dataOrUndefined;
      emailContent = emailTemplates[template](data.code || data.resetLink, data.firstname, data.type);
    }
    
    // Send to multiple recipients if array, otherwise single recipient
    const results = [];
    
    for (const recipient of to) {
      const command = new SendEmailCommand({
        Source: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        Destination: {
          ToAddresses: [recipient],
        },
        Message: {
          Subject: {
            Data: emailContent.subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: emailContent.html,
              Charset: "UTF-8",
            },
            Text: {
              Data: emailContent.text,
              Charset: "UTF-8",
            },
          },
        },
      });

      const result = await sesClient.send(command);
      results.push({
        recipient,
        success: true,
        messageId: result.MessageId
      });
      
      console.log(`✅ Email sent successfully to ${recipient}:`, result.MessageId);
    }
    
    return {
      success: true,
      results,
      message: `Email sent successfully to ${to.length} recipient${to.length > 1 ? 's' : ''}`
    };
    
  } catch (error) {
    console.error(`❌ Failed to send email to ${Array.isArray(to) ? to.join(', ') : to}:`, error);
    
    // Handle specific SES errors
    if (error.name === 'MessageRejected') {
      throw new Error('Email was rejected. Please check the recipient email address.');
    } else if (error.name === 'MailFromDomainNotVerifiedException') {
      throw new Error('Sender email domain is not verified in AWS SES.');
    } else if (error.name === 'ConfigurationSetDoesNotExistException') {
      throw new Error('AWS SES configuration error.');
    } else {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
};

// Specific email sending functions
export const sendVerificationEmail = async (email, code, type = "change") => {
  return await sendEmail(email, "emailVerification", { code, type });
};

export const sendRegistrationVerificationEmail = async (email, code, firstname) => {
  return await sendEmail(email, "registrationVerification", { code, firstname });
};

export const sendPasswordResetEmail = async (email, resetLink, firstname) => {
  return await sendEmail(email, "passwordReset", { resetLink, firstname });
};

// Email validation helper
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Check if SES is properly configured
export const checkSESConfiguration = async () => {
  try {
    // You can add SES configuration verification here
    // For now, just check if required env vars exist
    const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'SES_SENDER_EMAIL'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    return {
      configured: true,
      message: 'SES configuration appears to be valid'
    };
  } catch (error) {
    return {
      configured: false,
      message: error.message
    };
  }
};

export default {
  sendEmail,
  sendVerificationEmail,
  sendRegistrationVerificationEmail,
  sendPasswordResetEmail,
  isValidEmail,
  checkSESConfiguration
};
