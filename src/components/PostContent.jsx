import { useEffect, useRef, useState } from "react";
import { PortableText } from "@portabletext/react";
import { urlFor } from "../lib/sanity";

/* -------------------------------
   IDS + SIDE PICK
-------------------------------- */

/* stable id from content (FNV-1a 32-bit) */
function fnv1a32(input) {
  const s = String(input ?? "");
  let h = 0x811c9dc5; // 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // 16777619
  }
  return h >>> 0;
}

/* short DOM-safe id */
function footnoteId(key) {
  return `fn-${fnv1a32(key).toString(36)}`;
}

/* stable left/right based on key */
function footnoteSide(key) {
  return (fnv1a32(key) & 1) === 1 ? "right" : "left";
}

/* -------------------------------
   IMAGE RENDERER
-------------------------------- */
function SanityImage({ value }) {
  const img = value?.image ?? value;

  const size =
    value?._type === "contentImage" ? value?.size || "l" : value?.size || "l";

  const alt = img?.alt || img?.caption || "";
  const caption = img?.caption || null;

  let src = img?.url || "";
  if (!src && img?.asset) {
    src = urlFor(img.asset).width(1800).auto("format").quality(85).url();
  }

  if (!src) return null;

  const widthPct = size === "s" ? "33.333%" : size === "m" ? "66.666%" : "100%";

  return (
    <figure
      className={`pt-image pt-image--${size}`}
      style={{ width: widthPct, margin: "8px auto" }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        data-caption={caption ?? ""}
        style={{
          width: "100%",
          height: "auto",
          objectFit: "contain",
          display: "block",
          borderRadius: "var(--br)",
        }}
      />
      {caption && <figcaption className="pt-caption">{caption}</figcaption>}
    </figure>
  );
}

/* -------------------------------
   LINK MARK
-------------------------------- */
const LinkMark = ({ children, value }) => {
  const href = value?.href;
  if (!href) return <>{children}</>;

  const isExternal = href.startsWith("http");
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      style={{ textDecoration: "underline" }}
    >
      {children}
    </a>
  );
};

/* -------------------------------
   FOOTNOTE PORTABLETEXT
-------------------------------- */
const footnoteComponents = {
  types: { image: SanityImage },
  block: {
    normal: ({ children }) => (
      <span className="fn-inline-block">{children}</span>
    ),
    blockquote: ({ children }) => (
      <span className="fn-inline-block">{children}</span>
    ),
    h1: ({ children }) => <span className="fn-inline-block">{children}</span>,
  },
  marks: { link: LinkMark },
};

/* -------------------------------
   CAROUSEL BLOCK
-------------------------------- */
function CarouselBlock({ value }) {
  const rootRef = useRef(null);
  const [caption, setCaption] = useState("");
  const [current, setCurrent] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (root.__inited) return;
    root.__inited = true;

    const imgs = Array.from(root.querySelectorAll(".pt-carousel-img"));
    if (imgs.length < 2) return;

    const items =
      (value?.images || [])
        .map((img) => {
          const ref = img?.asset?._ref || img?.asset?._id;
          if (ref) {
            return {
              url: urlFor({ _ref: ref })
                .width(1920)
                .auto("format")
                .quality(85)
                .url(),
              caption: img?.caption || "",
              alt: img?.alt || img?.caption || "",
            };
          }

          const directUrl = img?.url || img?.image?.url;
          if (directUrl) {
            return {
              url: directUrl,
              caption: img?.caption || img?.image?.caption || "",
              alt: img?.alt || img?.image?.alt || img?.caption || "",
            };
          }

          return null;
        })
        .filter(Boolean) || [];

    if (!items.length) return;

    setTotal(items.length);

    imgs.forEach((img) => {
      img.style.transition = `opacity ${800}ms ease-in-out`;
    });

    let index = 0;
    let front = imgs[0];
    let back = imgs[1];
    let locked = false;

    front.classList.remove("is-visible");
    back.classList.remove("is-visible");

    const preload = (url) =>
      new Promise((resolve, reject) => {
        const im = new Image();
        im.decoding = "async";
        im.onload = () =>
          resolve({
            url,
            w: im.naturalWidth || im.width,
            h: im.naturalHeight || im.height,
          });
        im.onerror = reject;
        im.src = url;
      });

    function applyFit(imgEl, w, h) {
      const isHorizontal = w >= h;
      imgEl.classList.toggle("fit-cover", isHorizontal);
      imgEl.classList.toggle("fit-contain", !isHorizontal);
    }

    function setCurrentItem(i) {
      const it = items[i];
      setCaption(it?.caption || "");
      setCurrent(i + 1);
    }

    (async () => {
      try {
        const loaded0 = await preload(items[0].url);
        applyFit(front, loaded0.w, loaded0.h);
        front.src = loaded0.url;
        front.alt = items[0].alt || "";
        setCurrentItem(0);

        requestAnimationFrame(() => front.classList.add("is-visible"));

        if (items.length > 1) preload(items[1].url).catch(() => {});
      } catch {
        // ignore
      }
    })();

    const advance = async () => {
      if (items.length <= 1) return;
      if (locked) return;
      locked = true;

      const next = (index + 1) % items.length;
      const nextItem = items[next];

      try {
        const loaded = await preload(nextItem.url);
        applyFit(back, loaded.w, loaded.h);
        back.src = loaded.url;
        back.alt = nextItem.alt || "";

        requestAnimationFrame(() => {
          back.classList.add("is-visible");
          front.classList.remove("is-visible");

          const tmp = front;
          front = back;
          back = tmp;

          index = next;
          setCurrentItem(index);

          back.classList.remove("is-visible");
        });

        const afterNext = items[(next + 1) % items.length]?.url;
        if (afterNext) preload(afterNext).catch(() => {});
      } finally {
        setTimeout(() => {
          locked = false;
        }, 100);
      }
    };

    const onRootClick = () => {
      advance();
    };

    root.addEventListener("click", onRootClick);

    return () => {
      root.removeEventListener("click", onRootClick);
      root.__inited = false;
    };
  }, [value]);

  return (
    <div className="pt-carousel-wrap">
      <div className="pt-carousel" ref={rootRef}>
        <img className="pt-carousel-img" alt="" decoding="async" />
        <img className="pt-carousel-img" alt="" decoding="async" />
      </div>

      {(caption || total > 0) && (
        <div className="pt-caption">
          {caption ? ` ${caption} ` : ""}
          {total > 0 ? `${current}/${total}` : ""}
        </div>
      )}
    </div>
  );
}

/* -------------------------------
   PORTABLETEXT COMPONENTS
-------------------------------- */
const components = {
  types: {
    contentImage: SanityImage,
    image: SanityImage,
    carousel: CarouselBlock,
  },
  block: {
    h1: ({ children }) => <h1>{children}</h1>,
    normal: ({ children }) => <div className="pt-block">{children}</div>,
    blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  },
  marks: {
    link: LinkMark,
    footnote: ({ children, value }) => (
      <span className="footnote">
        <span className="footnote-text">{children}</span>
        <span className="footnote-note">
          <PortableText value={value?.note} components={footnoteComponents} />
        </span>
      </span>
    ),
  },
};

/* -------------------------------
   MAIN
-------------------------------- */
export default function PostContent({ post }) {
  const containerRef = useRef(null);
  const scrollYRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ---------------------------
       LIGHTBOX
    ---------------------------- */
    let lightbox = document.querySelector(".pt-lightbox");
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "pt-lightbox";
      lightbox.innerHTML = `
        <div class="pt-lightbox__backdrop"></div>
        <div class="pt-lightbox__content">
          <img class="pt-lightbox__img" alt="" />
          <div class="pt-lightbox__caption"></div>
        </div>
      `;
      document.body.appendChild(lightbox);
    }

    const lbImg = lightbox.querySelector(".pt-lightbox__img");
    const lbCap = lightbox.querySelector(".pt-lightbox__caption");
    const backdrop = lightbox.querySelector(".pt-lightbox__backdrop");

    const lockScroll = () => {
      const y = window.scrollY || 0;
      scrollYRef.current = y;

      document.body.style.position = "fixed";
      document.body.style.top = `-${y}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    };

    const unlockScroll = () => {
      const y = scrollYRef.current || 0;

      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";

      window.scrollTo(0, y);
    };

    const openLightbox = (src, alt = "", caption = "") => {
      if (!src) return;

      const alreadyOpen = lightbox.classList.contains("is-open");
      if (!alreadyOpen) lockScroll();

      lbImg.src = src;
      lbImg.alt = alt;

      if (lbCap) {
        lbCap.textContent = caption || "";
        lbCap.style.display = caption ? "block" : "none";
      }

      lbImg.classList.remove("is-horizontal", "is-vertical");
      const tmp = new Image();
      tmp.onload = () => {
        const horiz = (tmp.naturalWidth || 1) >= (tmp.naturalHeight || 1);
        lbImg.classList.add(horiz ? "is-horizontal" : "is-vertical");
      };
      tmp.src = src;

      lightbox.classList.add("is-open");
    };

    const closeLightbox = () => {
      if (!lightbox.classList.contains("is-open")) return;
      lightbox.classList.remove("is-open");
      lbImg.src = "";
      if (lbCap) lbCap.textContent = "";
      unlockScroll();
    };

    const onContainerClickForZoom = (e) => {
      if (window.matchMedia("(max-width: 768px)").matches) return;
      if (e.target?.closest?.(".pt-carousel-wrap")) return;

      const img = e.target.closest("img");
      if (!img) return;
      if (!container.contains(img)) return;
      if (img.classList.contains("pt-carousel-img")) return;
      if (img.classList.contains("material-symbols-outlined")) return;

      const a = img.closest("a");
      if (a) {
        e.preventDefault();
        e.stopPropagation();
      }

      const src = img.currentSrc || img.src;
      if (!src) return;

      const caption =
        img.dataset.caption ||
        img
          .closest("figure")
          ?.querySelector("figcaption")
          ?.textContent?.trim() ||
        "";

      openLightbox(src, img.alt || "", caption);
    };

    const onLightboxClick = (e) => {
      if (e.target === backdrop || e.target === lbImg) closeLightbox();
    };

    container.addEventListener("click", onContainerClickForZoom);
    lightbox.addEventListener("click", onLightboxClick);

    const onBeforeSwap = () => closeLightbox();
    document.addEventListener("astro:before-swap", onBeforeSwap);

    /* ---------------------------
       FOOTNOTES
    ---------------------------- */
    const mql = window.matchMedia("(max-width: 768px)");
    let cleanupCurrentMode = null;

    const setupMobile = () => {
      const footnotes = container.querySelectorAll(".footnote");
      let activeInline = null;

      const hideInline = () => {
        if (activeInline?.parentNode)
          activeInline.parentNode.removeChild(activeInline);
        activeInline = null;
      };

      footnotes.forEach((fn) => {
        const noteEl = fn.querySelector(".footnote-note");
        if (!noteEl) return;

        fn.style.cursor = "pointer";
        fn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          if (activeInline && activeInline.__host === fn) {
            hideInline();
            return;
          }

          hideInline();

          const span = document.createElement("span");
          span.className = "inline-footnote";
          span.innerHTML = noteEl.innerHTML || "";
          span.__host = fn;

          fn.insertAdjacentElement("afterend", span);
          activeInline = span;
        };
      });

      const clickOutside = (ev) => {
        const t = ev.target;
        if (t?.closest?.(".footnote") || t?.closest?.(".inline-footnote"))
          return;
        hideInline();
      };

      container.addEventListener("click", clickOutside);

      return () => {
        hideInline();
        container.removeEventListener("click", clickOutside);
        footnotes.forEach((fn) => (fn.onclick = null));
      };
    };

    const setupDesktop = () => {
      let rightLayer = container.querySelector(".footnote-layer--right");
      if (!rightLayer) {
        rightLayer = document.createElement("div");
        rightLayer.className = "footnote-layer footnote-layer--right";
        container.appendChild(rightLayer);
      }

      let leftLayer = container.querySelector(".footnote-layer--left");
      if (!leftLayer) {
        leftLayer = document.createElement("div");
        leftLayer.className = "footnote-layer footnote-layer--left";
        container.appendChild(leftLayer);
      }

      let activeId = null;

      const hideAllNotes = () => {
        container
          .querySelectorAll(".margin-note--visible")
          .forEach((n) => n.classList.remove("margin-note--visible"));
      };

      const closeAllNotes = () => {
        hideAllNotes();
        activeId = null;
      };

      const showActiveIfAny = () => {
        if (activeId == null) return;
        const target = container.querySelector(
          `.margin-note[data-footnote-id="${activeId}"]`
        );
        target?.classList.add("margin-note--visible");
      };

      const layoutNotes = () => {
        rightLayer.innerHTML = "";
        leftLayer.innerHTML = "";

        const rectContainer = container.getBoundingClientRect();
        const footnotes = container.querySelectorAll(".footnote");

        footnotes.forEach((fn) => {
          const textEl = fn.querySelector(".footnote-text");
          const noteEl = fn.querySelector(".footnote-note");
          if (!textEl || !noteEl) return;

          const rectText = textEl.getBoundingClientRect();
          const top = rectText.top - rectContainer.top;

          const text = textEl.textContent?.trim() || "";
          const noteHTML = noteEl.innerHTML || "";
          const key = `${text}||${noteHTML}`;

          const id = footnoteId(key);
          const isRight = footnoteSide(key) === "right";

          const div = document.createElement("div");
          div.className = `margin-note ${
            isRight ? "margin-note--right" : "margin-note--left"
          }`;
          div.innerHTML = noteEl.innerHTML || "";
          div.dataset.footnoteId = id;
          div.style.top = `${top}px`;

          fn.dataset.footnoteId = id;
          fn.style.cursor = "pointer";

          if (isRight) rightLayer.appendChild(div);
          else leftLayer.appendChild(div);

          fn.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const alreadyActive = activeId === id;
            hideAllNotes();

            if (alreadyActive) {
              activeId = null;
              return;
            }

            const target = container.querySelector(
              `.margin-note[data-footnote-id="${id}"]`
            );
            if (target) {
              target.classList.add("margin-note--visible");
              activeId = id;
            }
          };
        });

        showActiveIfAny();
      };

      layoutNotes();
      window.addEventListener("resize", layoutNotes);

      /* relayout on media/font/layout shifts */
      let raf = 0;
      const scheduleLayout = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(layoutNotes);
      };

      const ro = new ResizeObserver(scheduleLayout);
      ro.observe(container);

      const imgs = Array.from(container.querySelectorAll("img"));
      const onImg = () => scheduleLayout();
      imgs.forEach((img) => {
        if (img.complete) return;
        img.addEventListener("load", onImg, { once: true });
        img.addEventListener("error", onImg, { once: true });
      });

      if (document.fonts?.ready) {
        document.fonts.ready.then(scheduleLayout).catch(() => {});
      }

      const containerClickHandler = (ev) => {
        const t = ev.target;
        if (t?.closest?.(".footnote")) return;
        closeAllNotes();
      };

      container.addEventListener("click", containerClickHandler);

      return () => {
        window.removeEventListener("resize", layoutNotes);
        container.removeEventListener("click", containerClickHandler);

        cancelAnimationFrame(raf);
        ro.disconnect();
        imgs.forEach((img) => {
          img.removeEventListener("load", onImg);
          img.removeEventListener("error", onImg);
        });

        container
          .querySelectorAll(".footnote")
          .forEach((fn) => (fn.onclick = null));

        rightLayer?.remove();
        leftLayer?.remove();
      };
    };

    const setupForCurrentMode = () => {
      cleanupCurrentMode?.();
      cleanupCurrentMode = mql.matches ? setupMobile() : setupDesktop();
    };

    setupForCurrentMode();

    const onMqlChange = () => setupForCurrentMode();
    if (mql.addEventListener) mql.addEventListener("change", onMqlChange);
    else mql.addListener(onMqlChange);

    /* ---------------------------
       CLEANUP
    ---------------------------- */
    return () => {
      container.removeEventListener("click", onContainerClickForZoom);
      lightbox.removeEventListener("click", onLightboxClick);
      document.removeEventListener("astro:before-swap", onBeforeSwap);

      if (mql.removeEventListener)
        mql.removeEventListener("change", onMqlChange);
      else mql.removeListener(onMqlChange);

      cleanupCurrentMode?.();
      cleanupCurrentMode = null;

      closeLightbox();
    };
  }, [post]);

  return (
    <div className="post-content" ref={containerRef}>
      {post?.content && (
        <PortableText value={post.content} components={components} />
      )}
    </div>
  );
}
