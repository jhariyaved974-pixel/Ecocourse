import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i;

/**
 * Renders admin-authored Markdown safely: raw HTML is NOT rendered (no
 * rehype-raw), and links are restricted to http(s), mailto, tel and on-site paths.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ?? 'prose-store text-sm'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (SAFE_URL.test(url) ? url : '')}
        components={{
          a: ({ href, children: c }) => {
            const external = href?.startsWith('http');
            return (
              <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer nofollow' : undefined}>
                {c}
              </a>
            );
          },
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
