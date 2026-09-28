// Connector only. Cloudflare needs this file here; the code lives in the Public/ and erp/ folders.
// build.py collects both folders into _server/ before every build, wherever the folders are.
export { onRequest } from "../_server/middleware.js";
