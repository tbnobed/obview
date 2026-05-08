import type { Components } from "react-markdown";

function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.errored === "1") return;
  img.dataset.errored = "1";
  img.removeAttribute("src");
  img.removeAttribute("srcset");
  img.style.display = "none";
}

function makeImg(maxHeight: number, borderClass: string): Components["img"] {
  const Img: Components["img"] = ({ node, ...props }) => (
    <img
      {...props}
      className={`max-w-full h-auto rounded-md my-1 border ${borderClass}`}
      style={{ maxHeight: `${maxHeight}px` }}
      onClick={(e) => e.stopPropagation()}
      onError={handleImgError}
    />
  );
  return Img;
}

function makeAnchor(downloadClass = "text-primary font-medium"): Components["a"] {
  const Anchor: Components["a"] = ({ node, href, ...props }) => {
    const isFileDownload = !!href && href.startsWith("/api/files/") && href.includes("/content");
    return (
      <a
        href={href}
        {...props}
        className={`${isFileDownload ? downloadClass : "text-primary"} hover:underline`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          if (isFileDownload) {
            e.preventDefault();
            window.open(href, "_blank");
          }
        }}
      >
        {isFileDownload && <span className="mr-1">📎</span>}
        {props.children}
      </a>
    );
  };
  return Anchor;
}

const Img200Dark = makeImg(200, "border-gray-200 dark:border-gray-600");
const Img300Dark = makeImg(300, "border-gray-200 dark:border-gray-600");
const Img300 = makeImg(300, "border-gray-200");
const AnchorPrimary = makeAnchor();
const AnchorBlue = makeAnchor("text-blue-600 font-medium");

export const markdownComponents200: Components = { img: Img200Dark, a: AnchorPrimary };
export const markdownComponents300: Components = { img: Img300Dark, a: AnchorPrimary };
export const markdownComponents300Light: Components = { img: Img300, a: AnchorBlue };
