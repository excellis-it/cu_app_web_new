const nodemailer = require('nodemailer');
const path = require('path');
const Email = require('email-templates');

class GmailMailer {
    constructor() {

    }

    async sendMail(from: any, to: any, subject: any, tplName: string, html: any) {
        try {
            const templateDir = path.join(__dirname, "../views/", 'email-templates', tplName)
            const email = new Email({
                views: {
                    root: templateDir,
                    options: {
                        extension: 'ejs'
                    }
                }
            });

            const getMailBody = await email.render('html', html);

            // Determine which email provider to use
            const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';
            let transporter;

            if (emailProvider === 'brevo') {
                // Brevo SMTP configuration for production/server
                transporter = nodemailer.createTransport({
                    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
                    port: parseInt(process.env.BREVO_SMTP_PORT || '587'),
                    secure: false, // use TLS
                    auth: {
                        user: process.env.BREVO_SMTP_USER || '921166001@smtp-brevo.com',
                        pass: process.env.BREVO_SMTP_PASSWORD || 'OPDQXhTFYAW9qvLV',
                    },
                });
                console.log('📧 Using Brevo SMTP for email');
            } else {
                // Gmail configuration for local development
                transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.GMAIL_USER,
                        pass: process.env.GMAIL_PASSWORD,
                    },
                });
                console.log('📧 Using Gmail for email');
            }
            //Setup the mailOptions
            let mailOptions = {
                // If using Brevo, override the 'from' address with the verified sender
                from: emailProvider === 'brevo' ? (process.env.BREVO_SENDER_EMAIL || process.env.BREVO_SMTP_USER) : from,
                to,
                subject,
                html: getMailBody
            };
            return await transporter.sendMail(mailOptions);
        } catch (err) {
            throw err;
        }
    }

}

module.exports = new GmailMailer();