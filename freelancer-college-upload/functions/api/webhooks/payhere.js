// Connector only. Cloudflare needs this file here; the code lives in the Public/ and erp/ folders.
// build.py collects both folders into _server/ before every build, wherever the folders are.
export { onRequestPost } from "../../../_server/api-payhere-webhook.js";
