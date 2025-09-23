# Amazon SES Integration Guide for Nairalancers

## Prerequisites

1. **AWS Account**: Ensure you have an AWS account
2. **SES Access**: Amazon SES must be available in your chosen region
3. **Verified Email/Domain**: You need to verify the sender email address or domain in SES

## Step 1: AWS SES Setup

### 1.1 Create AWS SES Configuration

1. Go to AWS SES Console
2. Choose your region (recommend us-east-1 for better availability)
3. Go to "Verified identities" and verify your sender email address or domain
4. Note: In SES Sandbox mode, you can only send to verified email addresses

### 1.2 Create IAM User for SES

1. Go to AWS IAM Console
2. Create a new user with programmatic access
3. Attach the following policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```

4. Save the Access Key ID and Secret Access Key

## Step 2: Environment Configuration

Add these environment variables to your `.env` file:

```env
# AWS SES Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here

# SES Email Configuration
SES_SENDER_EMAIL=noreply@yourdomain.com
SES_SENDER_NAME=Nairalancers

# Client URL for password reset links
CLIENT_URL=http://localhost:5173
```

### Required Environment Variables:

- **AWS_REGION**: AWS region where SES is configured (e.g., us-east-1)
- **AWS_ACCESS_KEY_ID**: IAM user access key
- **AWS_SECRET_ACCESS_KEY**: IAM user secret key
- **SES_SENDER_EMAIL**: Verified email address in SES
- **SES_SENDER_NAME**: Display name for emails
- **CLIENT_URL**: Frontend URL for password reset links

## Step 3: Testing the Integration

### 3.1 Test Email Configuration

Use the built-in configuration checker:

```javascript
import { checkSESConfiguration } from './services/emailService.js';

const config = await checkSESConfiguration();
console.log(config);
```

### 3.2 Test Sending Emails

The integration includes three types of emails:

1. **Email Verification** (for email changes)
2. **Registration Verification** (welcome emails)
3. **Password Reset** (forgot password)

### 3.3 Test Endpoints

You can test the email functionality through existing endpoints:

- POST `/api/auth/request-password-reset` - Test password reset email
- POST `/api/email-verification/request` - Test email verification
- POST `/api/auth/register` - Test registration email (if implemented)

## Step 4: Production Considerations

### 4.1 Move Out of SES Sandbox

1. Go to SES Console → Account dashboard
2. Request production access
3. This allows sending to any email address

### 4.2 Setup Email Authentication

1. **SPF Record**: Add to your domain's DNS
2. **DKIM**: Enable in SES console
3. **DMARC**: Configure for better deliverability

### 4.3 Monitoring and Logging

1. Enable SES configuration sets for tracking
2. Monitor bounce and complaint rates
3. Set up CloudWatch alarms

## Step 5: Error Handling

The integration handles common SES errors:

- **MessageRejected**: Invalid recipient email
- **MailFromDomainNotVerifiedException**: Sender domain not verified
- **SendingQuotaExceededException**: Daily sending limit exceeded

## Troubleshooting

### Common Issues:

1. **"Email address not verified"**
   - Verify sender email in SES console
   - Check SES_SENDER_EMAIL environment variable

2. **"Access Denied"**
   - Check IAM user permissions
   - Verify AWS credentials

3. **"MessageRejected"**
   - Check recipient email format
   - Ensure SES is out of sandbox for external emails

4. **"Region not supported"**
   - SES is not available in all regions
   - Use us-east-1, us-west-2, or eu-west-1

### Testing Commands:

```bash
# Test SES configuration
node -e "
import('./services/emailService.js').then(({ checkSESConfiguration }) => {
  checkSESConfiguration().then(console.log);
});
"

# Test sending email
node -e "
import('./services/emailService.js').then(({ sendVerificationEmail }) => {
  sendVerificationEmail('test@example.com', '123456', 'test')
    .then(console.log)
    .catch(console.error);
});
"
```

## Security Best Practices

1. **Environment Variables**: Never commit AWS credentials to git
2. **IAM Permissions**: Use least privilege principle
3. **Rate Limiting**: Implement email sending rate limits
4. **Input Validation**: Always validate email addresses
5. **Monitoring**: Set up alerts for unusual email activity

## Email Templates

The integration includes responsive HTML email templates:

- Professional design with Nairalancers branding
- Mobile-responsive layout
- Clear call-to-action buttons
- Security notices and expiration warnings
- Fallback text versions

## Support

For issues related to:
- AWS SES setup: Check AWS documentation
- Email delivery: Monitor SES metrics in AWS console
- Template modifications: Edit `api/services/emailService.js`

## Migration from Mock Implementation

The integration automatically replaces the mock email functions in:
- `api/controllers/emailVerification.controller.js`
- `api/controllers/auth.controller.js`

All existing API endpoints will work without changes.
