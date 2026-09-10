import React from 'react';

/**
 * The head of a page that is not the chat (docs/maties/design.md, section
 * 6): the title in Newsreader 23px at 28 36, one line of explanation in 14px
 * #86868b under it, and the page's one primary action at the top right.
 * Inside the settings sheet the same title sits at the top of the content
 * with the sheet's own padding, so the offset is a prop.
 */
interface PageTitleProps {
  title: string;
  description?: string;
  /** The one blue pill of the page, or a small group of pills. */
  action?: React.ReactNode;
  /** Flush with the container's own padding (the settings sheet). */
  flush?: boolean;
  className?: string;
  id?: string;
}

const PageTitle: React.FC<PageTitleProps> = ({ title, description, action, flush = false, className, id }) => (
  <header
    className={`flex items-start justify-between gap-6 ${flush ? '' : 'px-9 pt-7'} ${className ?? ''}`.trim()}
  >
    <div className="min-w-0">
      <h1 id={id} className="maties-page-title truncate">{title}</h1>
      {description && <p className="maties-subtitle mt-1.5 max-w-[68ch]">{description}</p>}
    </div>
    {action && <div className="flex shrink-0 items-center gap-2 pt-0.5">{action}</div>}
  </header>
);

export default PageTitle;
