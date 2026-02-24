// src/components/PrivatePostContent.jsx
import { useEffect, useState } from "react";
import PostContent from "./PostContent.jsx";

export default function PrivatePostClient({ slug: slugProp }) {
  const [post, setPost] = useState(null);

  // ✅ Disable right-click / context menu anywhere on this page while mounted
  useEffect(() => {
    const onContextMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // Use prop if passed, fallback to URL
        const slug =
          slugProp ||
          window.location.pathname.split("/").filter(Boolean).pop() ||
          "";

        if (!slug) {
          window.location.replace("/works");
          return;
        }

        // ✅ COOKIE gate (authoritative)
        const statusRes = await fetch("/.netlify/functions/private-ui-status", {
          credentials: "include",
          cache: "no-store",
        });

        const status = await statusRes.json().catch(() => null);
        if (!status?.unlocked) {
          window.location.replace("/works?unlock=open");
          return;
        }

        // ✅ Fetch hidden post (cookie required by function)
        const res = await fetch(
          `/.netlify/functions/private-post?slug=${encodeURIComponent(slug)}`,
          { credentials: "include", cache: "no-store" },
        );

        if (res.status === 401) {
          window.location.replace("/works?unlock=open");
          return;
        }
        if (!res.ok) {
          window.location.replace("/works");
          return;
        }

        const data = await res.json();

        // ✅ Normalize (supports both Sanity + Supabase return shapes)
        const normalized = {
          postType: "work",
          title: data.title ?? "Hidden Project",
          postDate: data.postDate ?? data.post_date ?? null,
          postDescription: data.postDescription ?? data.post_description ?? "",
          content: Array.isArray(data.content) ? data.content : [],
          creditbox: Array.isArray(data.creditbox) ? data.creditbox : [],
        };

        if (alive) setPost(normalized);
      } catch {
        window.location.replace("/works?unlock=open");
      }
    })();

    return () => {
      alive = false;
    };
  }, [slugProp]);

  if (!post) return <div className="private-loading"></div>;

  const year = post.postDate ? new Date(post.postDate).getFullYear() : "";

  return (
    <div className="post-container private-no-context-menu">
      <div className="title-bar">
        <h2>{post.title}</h2>
        <p>{year}</p>
      </div>

      {post.postDescription ? <p>{post.postDescription}</p> : null}

      <div className="post-content">
        <div className="post-body">
          <PostContent post={post} />
        </div>
      </div>
    </div>
  );
}
