const nodemailer = require('nodemailer');

// Create a transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.email,  
    pass: process.env.password      
  }
});

export const sendMail = async (email: string, subject: string, text: string) => {
const mailOptions = {
  from: process.env.email,  
  to: email,   
  subject: subject,
  text: text
};
transporter.sendMail(mailOptions, (error:any, info:any) => {
  if (error) {
    console.log('Error occurred: ' + error.message);
  } else {
    console.log('Email sent: ' + info.response);
  }
})
}
