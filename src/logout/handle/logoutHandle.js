if (self === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    frameBreaker.parentNode.removeChild(frameBreaker);
    document.addEventListener("DOMContentLoaded", handleLogoutResponse);
} else {
    top.location = self.location;
}

const yipFrontOrigin = env.yipFrontOrigin

async function handleLogoutResponse() {
    console.log("Handling logout response")
    console.log("Removing tokens...")
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    localStorage.removeItem("id_token")
    localStorage.removeItem("expiry_time")
    console.log("...Tokens removed")
    console.log("Redirecting to homepage...")
    window.location = yipFrontOrigin
}