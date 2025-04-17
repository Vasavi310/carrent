// email.js
const nodemailer = require("nodemailer");

function sendConfirmationEmail(toEmail, carModel, pickupDate, returnDate) {
  let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "chandavasavi1@gmail.com",
      pass: "qgdpobjrljqhqoni",
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const mailOptions = {
    from: "chandavasavi1@gmail.com",
    to: toEmail,
    subject: "Car Booking Confirmation",
    text: `Your booking for ${carModel} is confirmed.\n\nPickup Date: ${pickupDate}\nReturn Date: ${returnDate}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Email error:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
}

module.exports = sendConfirmationEmail;
