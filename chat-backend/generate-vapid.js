// generate-vapid.js
const webpush = require("web-push");

const vapidKeys = webpush.generateVAPIDKeys();

console.log("Public Key:\n", vapidKeys.publicKey);
console.log("Private Key:\n", vapidKeys.privateKey);
