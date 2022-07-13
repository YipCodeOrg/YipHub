import { validFrontRedirects } from "../authCommon.js"

if (self === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    frameBreaker.parentNode.removeChild(frameBreaker);
    document.addEventListener("DOMContentLoaded", handleCodeResponse);
} else {
    top.location = self.location;
}

const sanitizedUrlParams = new Proxy(new URLSearchParams(window.location.search), {
    get(searchParams, prop){
        if (prop === "code") {
            return encodeURIComponent(searchParams.get("code"))
        }
        if (prop === "state") {
            const state = searchParams.get("state")
            const validationRegex=/^([0-9a-f]{64})$/i;
            if(validationRegex.test(state)){
                return state
            }
            throw "State parameter failed validation regex. Should be 64 digit hex number."
        }
        throw "Failed to process unrecognised URL parameter"
    }
});

const encodedSelfUrl = encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname)

const yipFrontOrigin = env.yipFrontOrigin

async function handleCodeResponse() {
    const isValid = isStateValid()
    sessionStorage.removeItem("state") 
    if(isValid){
        console.log("Exchanging code for tokens...");
        await exchangeCodeForTokens()
        console.log("...Code exchanged for tokens");
        const postLoginRedirect = sessionStorage.getItem("postLoginRedirect") ?? "app"
        sessionStorage.removeItem("postLoginRedirect")
        if (validFrontRedirects.includes(postLoginRedirect)) {
            window.location.replace(yipFrontOrigin + postLoginRedirect)
        }
        else{
            throw new Error("Invalid redirect found in session storage")
        }
    } else{
        throw "Invalid state"
    }                         
}

function isStateValid(){
    const receivedState = sanitizedUrlParams.state
    const storedState = sessionStorage.getItem("state")
    if(!storedState || !receivedState || storedState != receivedState){
        return false
    }
    return true
}

async function exchangeCodeForTokens(){
    const tokenUrl = `${env.cognitoOrigin}/oauth2/token`
    
    const code_verifier = sessionStorage.getItem("code_verifier")
    sessionStorage.removeItem("code_verifier")
    
    const result = await fetch
    (
        tokenUrl, 
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: Object.entries({
                "grant_type": "authorization_code",
                "client_id": env.cognitoClientId,
                "code": sanitizedUrlParams.code,
                "redirect_uri": encodedSelfUrl,
                "code_verifier": code_verifier,
            }).map(([k, v]) => `${k}=${v}`).join("&"),
        }
    ).then(res => res.json())

    const {
        id_token,
        error,
        expires_in
    } = result

    if(error){
        throw new Error(error)
    }

    //For now, don't need access/refresh tokens. May need it in future.
    //localStorage.setItem("access_token", access_token)
    //NOTE: If using refresh token, will need to revoke it during logout
    //localStorage.setItem("refresh_token", refresh_token)
    localStorage.setItem("id_token", id_token)
    const expiry_time = calculateExpiry(expires_in)
    localStorage.setItem("expiry_time", expiry_time)
}

function calculateExpiry(expiresInSeconds){
    const nowInMilis = Date.now()
    const expiresInMilis = expiresInSeconds*1000
    return nowInMilis + expiresInMilis
}