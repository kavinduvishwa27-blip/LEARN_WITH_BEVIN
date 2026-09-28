// /api/admin/* -> ERP API (see admin-api.js)
import { handleAdmin } from "./admin-api.js";

export const onRequest = ({ request, env }) => handleAdmin(request, env, new URL(request.url).origin);
