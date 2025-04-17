document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem("token");
    const authButtons = document.getElementById("authButtons"); // ✅ Wrapper for login/register buttons
    const logoutBtn = document.getElementById("logoutBtn");

    if (token) {
        console.log("User is logged in, replacing Login/Register with Logout.");
        if (authButtons) authButtons.style.display = "none"; // ✅ Hide Login & Register buttons
        if (logoutBtn) logoutBtn.style.display = "block"; // ✅ Show Logout button
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
            localStorage.removeItem("token"); // ✅ Remove token
            alert("You have been logged out.");
            window.location.href = "rent.html"; // ✅ Redirect after logout
        });
    }
});
