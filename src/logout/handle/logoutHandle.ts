import { setWindowLocation } from "../../common/common.js";
import { envType } from "../../envType.js";
declare var env:envType

if (self === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    if(!!frameBreaker?.parentNode){
        frameBreaker.parentNode.removeChild(frameBreaker);
        document.addEventListener("DOMContentLoaded", handleLogoutResponse);
    }
} else {
    if(!!top){
        top.location = self.location;
    }    
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
    setWindowLocation(yipFrontOrigin)
}