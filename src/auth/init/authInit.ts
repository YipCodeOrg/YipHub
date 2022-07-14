import { validFrontRedirects } from "../authCommon.js"
import { envType } from "../../envType.js";
import { setWindowLocation } from "../../common/common.js";
declare var env:envType

if (self === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    frameBreaker.parentNode.removeChild(frameBreaker);
    document.addEventListener("DOMContentLoaded", initiatePkceFlow);
} else {
    top.location = self.location;
}

class AuthInitUrlParams {
    constructor(private readonly searchParams: URLSearchParams) {}

    action(this: AuthInitUrlParams): string {
        return this.searchParams.get("action") == 'signup' ? 'signup' : 'login'
    }

    postLoginRedirect(this: AuthInitUrlParams) : string{
        const rawUnsafe = this.searchParams.get("postLoginRedirect")
        if (validFrontRedirects.includes(rawUnsafe)) {
            return rawUnsafe
        }
        throw new Error(`Invalid redirect given: ${rawUnsafe}`)
    }
}

const sanitizedUrlParams = new AuthInitUrlParams(new URLSearchParams(window.location.search))

function setPostLoginRedirect(r){        
    sessionStorage.setItem("postLoginRedirect", r)
}

const callbackUrlEncoded = encodeURIComponent(`${env.selfOrigin}/auth/handle/index.html`)                        

async function initiatePkceFlow() {
    const action = sanitizedUrlParams.action
    const code_challenge_promise = generateVerifierReturnChallenge()
    const state_promise = generateRandomHexString()
    const code_challenge = await code_challenge_promise
    const state = await state_promise
    sessionStorage.setItem("state", state)
    const callCognitoUrl = `${env.cognitoOrigin}/${action}?client_id=${env.cognitoClientId}&response_type=code&scope=openid&redirect_uri=${callbackUrlEncoded}&code_challenge_method=S256&code_challenge=${code_challenge}&state=${state}`
    const postLoginRedirect = sanitizedUrlParams.postLoginRedirect()
    console.log(`Remembering post-login redirect: ${postLoginRedirect}`)
    setPostLoginRedirect(postLoginRedirect)
    console.log("Redirecting to Cognito...");
    setWindowLocation(callCognitoUrl)
}

async function generateVerifierReturnChallenge(){
    const code_verifier = await generateRandomHexString()
    sessionStorage.setItem("code_verifier", code_verifier)
    return base64URLEncode(await sha256(code_verifier))                 
}  

const sha256 = async (str) => { 
    const encoded = new TextEncoder().encode(str)
    return await crypto.subtle.digest("SHA-256", encoded); 
};

const generateRandomHexString = async () => { 
    const seedVals = crypto.getRandomValues(new Uint32Array(4))
    const seedString = seedVals.toString()
    const hashBuffer = await sha256(seedString); 
    const bufferCopyByteArray = new Uint8Array(hashBuffer)
    const untypedByteArray = Array.from(bufferCopyByteArray); 
    const hexPairsArray = untypedByteArray.map((b) => b.toString(16).padStart(2, "0"))
    const randomString = hexPairsArray.join("")
    return randomString; 
}; 

const base64URLEncode = (arrayBuffer) => { 
    const byteArray = new Uint8Array(arrayBuffer)
    const binaryByteString = String.fromCharCode(...byteArray)
    const asciiBase64String = btoa(binaryByteString)
    return asciiBase64String
        .replace(/\+/g, "-") 
        .replace(/\//g, "_") 
        .replace(/=+$/, ""); 
}; 