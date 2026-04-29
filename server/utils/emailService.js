const sgMail = require("@sendgrid/mail");

const sendEmail = async (to, subject, text) => {
  // Set API key inside function to ensure env is loaded
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
  console.log("Sending email to:", to);
  console.log("From:", process.env.EMAIL_FROM);
  console.log("API Key starts with:", process.env.SENDGRID_API_KEY?.substring(0, 10));
  
  const msg = {
    to, 
    from: process.env.EMAIL_FROM, // This must be a VERIFIED email in your SendGrid dashboard
    subject,
    text,
  };
  
  try {
    const result = await sgMail.send(msg);
    console.log("Email sent successfully");
    return result;
  } catch (error) {
    console.error("SendGrid Error Details:", error.response?.body || error.message);
    throw error;
  }
};

module.exports = sendEmail;