validFrontRedirects = ["/app", "/app/dashboard", "/app/create"]

function getIdToken(){
    const token = localStorage.getItem("id_token")
    if(!!token){
        return token
    }
    throw new Error("ID token not found")
}