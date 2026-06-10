import { Helmet } from "react-helmet-async";

interface SEOProps {
    title: string;
    description?: string;
    path?: string;
    type?: "website" | "article";
    image?: string;
    imageAlt?: string;
    jsonLd?: Record<string, unknown> | Record<string, unknown>[];
    noindex?: boolean;
    /** Pass article publish/modified dates for blog/course pages */
    publishedTime?: string;
    modifiedTime?: string;
}

const SITE = "https://zverts.app";
const DEFAULT_OG_IMAGE = `${SITE}/og-image.webp`;
const DEFAULT_OG_IMAGE_ALT = "ZverTs — Disciplined Learning, Verified Progress";
const TWITTER_HANDLE = "@zverts";

export const SEO = ({
    title,
    description,
    path = "/",
    type = "website",
    image,
    imageAlt,
    jsonLd,
    noindex = false,
    publishedTime,
    modifiedTime,
}: SEOProps) => {
    const url = `${SITE}${path}`;
    const fullTitle = title.includes("ZverTs") ? title : `${title} — ZverTs`;
    const ogImage = image ?? DEFAULT_OG_IMAGE;
    const ogImageAlt = imageAlt ?? DEFAULT_OG_IMAGE_ALT;
    const ldArr = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

    return (
        <Helmet>
            {/* Core */}
            <title>{fullTitle}</title>
            {description && <meta name="description" content={description} />}
            <link rel="canonical" href={url} />
            {noindex && <meta name="robots" content="noindex,nofollow" />}

            {/* Open Graph */}
            <meta property="og:site_name" content="ZverTs" />
            <meta property="og:title" content={fullTitle} />
            {description && <meta property="og:description" content={description} />}
            <meta property="og:url" content={url} />
            <meta property="og:type" content={type} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:image:alt" content={ogImageAlt} />
            <meta property="og:locale" content="en_US" />

            {/* Article-specific OG (blog posts, course pages) */}
            {type === "article" && publishedTime && (
                <meta property="article:published_time" content={publishedTime} />
            )}
            {type === "article" && modifiedTime && (
                <meta property="article:modified_time" content={modifiedTime} />
            )}

            {/* Twitter / X Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:site" content={TWITTER_HANDLE} />
            <meta name="twitter:title" content={fullTitle} />
            {description && <meta name="twitter:description" content={description} />}
            <meta name="twitter:image" content={ogImage} />
            <meta name="twitter:image:alt" content={ogImageAlt} />

            {/* JSON-LD */}
            {ldArr.map((ld, i) => (
                <script key={i} type="application/ld+json">
                    {JSON.stringify(ld)}
                </script>
            ))}
        </Helmet>
    );
};

export default SEO;