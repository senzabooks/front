exports.handler = async (event) => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  const params = new URLSearchParams(rawBody);
  const password = (params.get("password") || "").trim();
  const expected = (process.env.PRIVATE_UI_PASSWORD || "").trim();

  const ok = expected.length > 0 && password === expected;

  // ✅ set cookie when ok (server can validate later)
const cookie = ok
  ? "private_ui=1; Max-Age=600; Path=/; HttpOnly; SameSite=Lax; Secure"
  : "private_ui=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure";

  const accept = event.headers?.accept || event.headers?.Accept || "";
  const wantsJson = accept.includes("application/json");

  // ✅ AJAX mode: return JSON, no redirect
  if (wantsJson) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ ok }),
    };
  }

  // ✅ normal form submit fallback: redirect
  return {
    statusCode: 303,
    headers: {
      Location: ok ? "/works?unlock=ok" : "/works?unlock=fail",
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
