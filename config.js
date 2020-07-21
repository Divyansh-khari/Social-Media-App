
const baseURL = 'https://museical.herokuapp.com' // needs to be changed to museical.herokuapp.com when deployed

module.exports = {
    // The secret for the encryption of the jsonwebtoken
    JWTsecret: 'mysecret',
    baseURL: baseURL,
    port: 80,
    // The credentials and information for OAuth2
    oauth2Credentials: {
      client_id: "603204963619-jklvtgamuv2u4gjleafavj63cojk9jsj.apps.googleusercontent.com",
      project_id: "museical", // The name of your project
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_secret: process.env.GOOGLE_KEY,
      redirect_uris: [
        `${baseURL}/auth_callback`
      ],
      scopes: [
        'https://www.googleapis.com/auth/youtube.readonly',
      ]
    }
  };