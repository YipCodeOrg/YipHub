if (self === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    frameBreaker.parentNode.removeChild(frameBreaker);
    document.addEventListener("DOMContentLoaded", initiateLogout);
} else {
    top.location = self.location;
}        

const logoutCallbackUrlEncoded = encodeURIComponent(`${env.selfOrigin}/logout/handle/index.html`)                 

async function initiateLogout() {
    const callCognitoUrl = `${env.cognitoOrigin}/logout?client_id=${env.cognitoClientId}&logout_uri=${logoutCallbackUrlEncoded}`
    console.log("Redirecting to Cognito...");
    window.location = callCognitoUrl
}
