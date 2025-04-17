const { sendBookingEmail } = require("./email");

sendBookingEmail("your-email@gmail.com", "Toyota Corolla", "2025-04-01", "2025-04-10")
    .then(() => console.log("Email test success!"))
    .catch((error) => console.error("Email test failed:", error));