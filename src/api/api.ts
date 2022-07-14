import { envType } from "../envType";

declare var env:envType

if (window != top && window.parent === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    frameBreaker.parentNode.removeChild(frameBreaker);
    document.addEventListener("DOMContentLoaded", initHandshake);                
} else {
    throw new Error("Invalid framing context detected.")
}

function initHandshake(){
    const yipFrontOrigin = env.yipFrontOrigin
    const handshakeChannel = new MessageChannel();
    handshakeChannel.port1.onmessage = handleHandshakeResponse                
    console.log("Hub ready to listen. Posting status...")
    window.top.postMessage("readyToListen", yipFrontOrigin, [handshakeChannel.port2])                  
}

//////////////////////////////// HANDLE: MAIN

const loginRequestLabel = "requestLoginStatus"
const apiRequestLabel = "apiRequest"
var isHandshakeError = false

const handleHandshakeResponse = (msgEvent) => {
    const data = msgEvent.data;
    if(!isLabelValid(data)){
        throw new Error("Bad message data - invalid or missing label.")
    }
    const label = data.label
    switch (label) {
        case "listen":
            const messagingPort = msgEvent.ports[0]
            completeHandshake(messagingPort)
            break;
        case "handshakeError":
            isHandshakeError = true
            throw new Error("Handshake error occurred.")
        default:
            throw new Error("Unexpected response returned during handshake")                        
    }                
}

var frontMessagingPort = null

function completeHandshake(messagingPort){
    if(!!frontMessagingPort || isHandshakeError){
        //Remove any previous handler as we can no longer trust the channel
        frontMessagingPort.onmessage = null
        isHandshakeError = true
        throw new Error("Attempt to complete handshake but port already exists. Possibly security violation. Detatched listener from existing port.")
    } else{
        frontMessagingPort = messagingPort
        console.log("...Hub received command to listen")
        messagingPort.onmessage = handleFrontMessage
        console.log("Hub is listening. Posting status...")
        messagingPort.postMessage("listening")
    }                
}

function handleFrontMessage(msgEvent) { 
    if(isHandshakeError)          {
        throw new Error("Handshake error occcurred. Cannot process message.")
    }
    const data = msgEvent.data;
    if(!isLabelValid(data)){
        throw new Error("Bad message data - invalid or missing label.")
    }
    const label = data.label
    const responsePort = msgEvent.ports[0]
    console.log(`Message received from Front. Processing: ${label}...`);
    switch (label) {
        case loginRequestLabel:
            handleLoginRequest(responsePort)
            break;
        case apiRequestLabel:
            if(!isValidApiRequest(data)){
                throw new Error("Bad message data - invalid API request.")                            
            }
            const payload = extractApiRequestPayload(data)
            if(!!payload.body){
                handleApiRequestWithBody(responsePort, payload)
            }
            else{
                handleApiRequestWithoutBody(responsePort, payload)
            }           
            break;
        default:
            const errorMsg = "Unhandled message data received from Front";
            throw new Error(errorMsg);
    }
    console.log(`...finished processing message from Front: : ${label}`);
}

//////////////////////////////// HANDLE: LOGIN

function handleLoginRequest(responsePort){
    console.log("Posting login status from Hub...")
    const isLoggedIn = getIsLoggedIn()
    const status = isLoggedIn ? "userIsLoggedIn" : "userNotLoggedIn"
    responsePort.postMessage({label: status})
    console.log("...Hub finished posting login status")
}

function getIsLoggedIn(){
    const id_token = localStorage.getItem("id_token")
    const expiry_time = Number(localStorage.getItem("expiry_time"))
    const current_time = Date.now()
    const threshold = 100000
    const delta = expiry_time - current_time
    return !!id_token && (delta > threshold)
}

//////////////////////////////// HANDLE: API-REQUEST

const HttpStatusOk = 200
const apiResponseLabel = "apiResponse"
const apiResponseErrorLabel = "apiResponseError"

const getMethod = "GET"

function getIdToken(){
    const token = localStorage.getItem("id_token")
    if(!!token){
        return token
    }
    throw new Error("ID token not found")
}

const allowedMethods = [getMethod]

function handleApiRequestWithBody(responsePort, requestPayload){
    throw new Error("Not Implemented")
}

function handleApiRequestWithoutBody(responsePort, requestPayload){
    const method = requestPayload.method
    const path = requestPayload.path
    const requestUrl = `${env.apiGatewayOrigin}${path}`
    sendApiRequestAndForwardResponse(requestUrl, method, responsePort)
}

function sendApiRequestAndForwardResponse(requestUrl, method, responsePort){
    fetch(requestUrl, {
        method: method,
        headers: {
            'Authorization': `Bearer ${getIdToken()}`,
        }
    })
    .then(res => res.text().then(text => [res.status, text]))
    .then(([status, text]) => {
            responsePort.postMessage({
                label: apiResponseLabel,
                payload:{
                    status: status,
                    body: text
                }
            })
        },
        reason => {
            responsePort.postMessage({label: apiResponseErrorLabel})                            
        }
    )
    .catch(e => {
        responsePort.postMessage({label: apiResponseErrorLabel})
    })
}

//////////////////////////////// SANITIZATION

function isLabelValid(unsafeData){
    if(!isSimpleProperty(unsafeData, "label")){
        return false
    }
    const label = unsafeData.label
    return isString(label)
}

function extractApiRequestPayload(data){
    const payload = data.payload
    if(!!payload.body){
        return {
            method: payload.method,
            path: payload.path,
            body: payload.body
        }
    }
    return {
        method: payload.method,
        path: payload.path,                
    }
}

function isValidApiRequest(unsafeData){
    if(!isSimpleProperty(unsafeData, "payload")){
        return false
    }
    const unsafePaylod = unsafeData.payload
    let expectedStringProperties = ["method", "path"]
    const bodyStr = "body"
    if(isProperty(unsafeData, bodyStr)){
        expectedStringProperties.push(bodyStr)
    }
    if(!areSimpleProperties(unsafePaylod, expectedStringProperties)){
        console.error("Invalid API request: some expected simple properties not found")
        return false
    }
    if(!areStrings(expectedStringProperties)){
        console.error("Invalid API request: some properties are not strings")
        return false
    }
    if(!allowedMethods.includes(unsafePaylod.method)){
        console.error("Invalid API request: Invalid method")
        return false
    }
    return true
}

function areSimpleProperties(obj, properties){
    for(const prop of properties){
        if(!isSimpleProperty(obj, prop)){
            return false
        }
    }
    return true
}

function isProperty(obj, property){
    return !!Object.getOwnPropertyDescriptor(obj, property)
}

function isSimpleProperty(obj, property){
    const desc = Object.getOwnPropertyDescriptor(obj, property)
    if(!!desc){
        if(!desc.get && !desc.set){
            return true
        }
    }
    return false
}

function areStrings(objs){
    for(const obj of objs){
        if(!isString(obj)){
            return false
        }
    }
    return true
}

function isString(obj){
    return (typeof obj === 'string' || obj instanceof String)
}