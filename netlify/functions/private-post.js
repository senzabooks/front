// netlify/functions/private-post.js  (or whatever your current filename is)
const { createClient: createSupabase } = require("@supabase/supabase-js");
const { createClient: createSanity } = require("@sanity/client");

function hasUnlockCookie(event) {
  const cookie = event.headers?.cookie || event.headers?.Cookie || "";
  return /(?:^|;\s*)private_ui=1(?:;|$)/.test(cookie);
}

const sanity = createSanity({
  projectId: process.env.SANITY_PROJECT_ID || "88b6ol4q",
  dataset: process.env.SANITY_DATASET || "production",
  apiVersion: "2025-01-01",
  token: process.env.SANITY_READ_TOKEN, // ✅ set this in Netlify env vars
  useCdn: false,
});

exports.handler = async (event) => {
  if (!hasUnlockCookie(event)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const slug = event.queryStringParameters?.slug;
  if (!slug) return { statusCode: 400, body: "Missing slug" };

  // 1) Try Supabase first (if you have private_posts there)
  try {
    const supabase = createSupabase(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: sb, error: sbErr } = await supabase
      .from("private_posts")
      .select("slug,title,post_date,post_description,content,creditbox")
      .eq("slug", slug)
      .maybeSingle(); // ✅ doesn't throw if not found

    if (sbErr) {
      return { statusCode: 500, body: "Supabase error" };
    }

    if (sb) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          ...sb,
          // also provide camelCase so your React client can be flexible
          postDate: sb.post_date,
          postDescription: sb.post_description,
          postType: "work",
          isHidden: true,
        }),
      };
    }
  } catch {
    // ignore and fall through to Sanity
  }

  // 2) Fallback to Sanity hidden work
  if (!process.env.SANITY_READ_TOKEN) {
    // Without a token, this function cannot securely read hidden Sanity content
    return { statusCode: 404, body: "Not found" };
  }

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

  if (!s) return { statusCode: 404, body: "Not found" };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      slug: s.slug,
      title: s.title,
      postDate: s.postDate,
      postDescription: s.postDescription,
      content: s.content,
      creditbox: s.creditbox,
      postType: "work",
      isHidden: true,

      // also include snake_case for older code paths
      post_date: s.postDate,
      post_description: s.postDescription,
    }),
  };
};
