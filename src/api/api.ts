import { envType } from "../envType.js";

declare var env:envType

if (window != top && window.parent === top) {
    var frameBreaker = document.getElementById("frameBreaker");
    if(!!frameBreaker?.parentNode){
        frameBreaker.parentNode.removeChild(frameBreaker);
        document.addEventListener("DOMContentLoaded", initHandshake);                
    }        
} else {
    throw new Error("Invalid framing context detected.")
}

function initHandshake(){
    const yipFrontOrigin = env.yipFrontOrigin
    const handshakeChannel = new MessageChannel();
    handshakeChannel.port1.onmessage = handleHandshakeResponse                
    console.log("Hub ready to listen. Posting status...")
    if(!!window.top){
        window.top.postMessage("readyToListen", yipFrontOrigin, [handshakeChannel.port2])
    }    
}

//////////////////////////////// HANDLE: MAIN

const loginRequestLabel = "requestLoginStatus"
const apiRequestLabel = "apiRequest"
var isHandshakeError = false

const handleHandshakeResponse = (msgEvent: MessageEvent<unknown>) => {
    const data = msgEvent.data;
    if(!isFrontToHubMessage(data)){
        throw new Error("Bad message data - invalid or missing label.")
    }
    const label = data.label
    switch (label) {
        case "listen":
            const messagingPort = msgEvent.ports[0]
            if(!!messagingPort){
                completeHandshake(messagingPort)
            } else{
                throw new Error("Could not complete handshake. No port found in message.")
            } 
            break;
        case "handshakeError":
            isHandshakeError = true
            throw new Error("Handshake error occurred.")
        default:
            throw new Error("Unexpected response returned during handshake")                        
    }                
}

var frontMessagingPort: MessagePort | null = null

function completeHandshake(messagingPort: MessagePort){
    if(!!frontMessagingPort || isHandshakeError){
        if(!!frontMessagingPort){
            //Remove any previous handler as we can no longer trust the channel
            frontMessagingPort.onmessage = null
        }
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

function handleFrontMessage(msgEvent: MessageEvent<unknown>) { 
    if(isHandshakeError)          {
        throw new Error("Handshake error occcurred. Cannot process message.")
    }
    const data = msgEvent.data;
    if(!isFrontToHubMessage(data)){
        throw new Error("Bad message data - invalid or missing label.")
    }
    const label = data.label
    const responsePort = msgEvent.ports[0]
    if (!responsePort) {
        throw new Error("No response port found. Can't handle message.");        
    }
    console.log(`Message received from Front. Processing: ${label}...`);
    switch (label) {
        case loginRequestLabel:
            handleLoginRequest(responsePort)
            break;
        case apiRequestLabel:
            const unsafePayload = data.payload
            if(!isValidApiRequestPayload(unsafePayload)){
                throw new Error("Bad message data - invalid API request.")                            
            }
            const payload = extractApiRequestPayload(unsafePayload)
            if(!!payload.body){
                throw new Error("API requests with body not yet supported")
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

function handleLoginRequest(responsePort: MessagePort){
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

function handleApiRequestWithoutBody(responsePort: MessagePort, requestPayload: ApiRequestPayload){
    const method = requestPayload.method
    const path = requestPayload.path
    const requestUrl = `${env.apiGatewayOrigin}${path}`
    sendApiRequestAndForwardResponse(requestUrl, method, responsePort)
}

function sendApiRequestAndForwardResponse(requestUrl: string, method: string, responsePort: MessagePort){
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
        _reason => {
            responsePort.postMessage({label: apiResponseErrorLabel})                            
        }
    )
    .catch(_e => {
        responsePort.postMessage({label: apiResponseErrorLabel})
    })
}

//////////////////////////////// SANITIZATION

type FrontToHubMessage = {
    label: string,
    payload?: ApiRequestPayload
}

type ApiRequestPayload = {
    method: string,
    path: string,
    body?: string
}

function isFrontToHubMessage(obj: any): obj is FrontToHubMessage{
    if(!obj){
        return false
    }
    if(!isSimpleProperty(obj, "label")){
        return false
    }
    const label = obj.label
    if(!isString(label)){
        return false
    }
    if(!isSimplePropertyOrNonProperty(obj, "payload")){
        return false
    }
    const payload = obj.payload
    if(!payload){
        return true
    } else{
        return isValidApiRequestPayload(payload)
    }    
}

//Non-MVP: Validate the path too - safelist or regex
function isValidApiRequestPayload(obj: any) : obj is ApiRequestPayload{
    if(!obj){
        return false
    }
        
    let expectedStringProperties = ["method", "path"]
    const bodyStr = "body"
    if(isProperty(obj, bodyStr)){
        expectedStringProperties.push(bodyStr)
    }
    if(!areSimpleStringProperties(obj, expectedStringProperties)){
        console.error("Invalid API request: some expected simple string properties not found")
        return false
    }
    if(!allowedMethods.includes(obj.method)){
        console.error("Invalid API request: Invalid method")
        return false
    }
    return true
}

function extractApiRequestPayload(payload: ApiRequestPayload) : ApiRequestPayload{
    if(!payload){
        throw new Error("Cannot extract API request. No valid payload detected.")
    }
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

function isSimpleStringProperty(obj: any, property: PropertyKey){
    return isSimpleProperty(obj, property) && isString(obj[property])
}

function areSimpleStringProperties(obj: any, properties: PropertyKey[]){
    return properties.every(prop => isSimpleStringProperty(obj, prop))
}

function isProperty(obj: any, property: PropertyKey){
    return !!Object.getOwnPropertyDescriptor(obj, property)
}

function isSimpleProperty(obj: any, property: PropertyKey){
    const desc = Object.getOwnPropertyDescriptor(obj, property)
    if(!!desc){
        return (!desc.get && !desc.set)
    }
    return false
}

function isSimplePropertyOrNonProperty(obj: any, property: PropertyKey){
    const desc = Object.getOwnPropertyDescriptor(obj, property)
    if(!!desc){
        return (!desc.get && !desc.set)
    }
    return true
}

function isString(obj: any){
    return (!!obj && (typeof obj === 'string' || obj instanceof String))
}