// netlify/functions/private-post.js
const { createClient: createSupabase } = require("@supabase/supabase-js");
const { createClient: createSanity } = require("@sanity/client");

function hasUnlockCookie(event) {
  const cookie = event.headers?.cookie || event.headers?.Cookie || "";
  return /(?:^|;\s*)private_ui=1(?:;|$)/.test(cookie);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

const sanity = createSanity({
  projectId:
    process.env.SANITY_PROJECT_ID ||
    process.env.PUBLIC_SANITY_PROJECT_ID ||
    "88b6ol4q",
  dataset:
    process.env.SANITY_DATASET ||
    process.env.PUBLIC_SANITY_DATASET ||
    "production",
  apiVersion: "2025-01-01",
  token: process.env.SANITY_READ_TOKEN,
  useCdn: false,
});

exports.handler = async (event) => {
  if (!hasUnlockCookie(event)) return json(401, { error: "Unauthorized" });

  const slug = event.queryStringParameters?.slug;
  if (!slug) return json(400, { error: "Missing slug" });

  // ----------------------------
  // 1) Supabase (optional)
  // If Supabase isn't ready yet, DO NOT block Sanity.
  // ----------------------------
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createSupabase(supabaseUrl, supabaseKey);

      const { data: sb, error: sbErr } = await supabase
        .from("private_posts")
        .select("slug,title,post_date,post_description,content,creditbox")
        .eq("slug", slug)
        .maybeSingle();

      if (!sbErr && sb) {
        return json(200, {
          ...sb,
          postType: "work",
          isHidden: true,
          // compat + nicer camelCase too
          postDate: sb.post_date ?? null,
          postDescription: sb.post_description ?? "",
        });
      }

      if (sbErr) {
        // ✅ IMPORTANT: don't kill the request if Supabase isn't set up yet
        console.warn(
          "Supabase private_posts error (falling back to Sanity):",
          sbErr,
        );
      }
    } catch (e) {
      console.warn("Supabase crashed (falling back to Sanity):", e);
    }
  }

  // ----------------------------
  // 2) Sanity fallback (hidden works)
  // ----------------------------
  if (!process.env.SANITY_READ_TOKEN) {
    return json(404, { error: "Not found" });
  }

  try {
    const s = await sanity.fetch(
      `*[_type=="post"
          && postType=="work"
          && slug.current==$slug
          && isHidden == true
          && !(_id in path("drafts.**"))
        ][0]{
          "slug": slug.current,
          title,
          postDate,
          postDescription,
          content,
          creditbox
        }`,
      { slug },
    );

    if (!s) return json(404, { error: "Not found" });

    return json(200, {
      ...s,
      postType: "work",
      isHidden: true,
      // compat
      post_date: s.postDate,
      post_description: s.postDescription,
    });
  } catch (e) {
    console.error("Sanity fetch failed:", e);
    return json(500, { error: "Sanity fetch failed" });
  }
};
