import React, { Suspense, useEffect, useState } from 'react';

/**
 * Mounts the design preview over the app while the URL hash is
 * `#maties-preview` (docs/maties/design.md, section 8). The preview is a
 * separate chunk, loaded only then; nothing in the app links to it.
 */
export const MATIES_PREVIEW_HASH = '#maties-preview';

const ConversationPreview = React.lazy(() => import('./ConversationPreview'));

const isPreviewHash = (): boolean => (
  typeof window !== 'undefined' && window.location.hash === MATIES_PREVIEW_HASH
);

const PreviewGate: React.FC = () => {
  const [active, setActive] = useState<boolean>(() => isPreviewHash());

  useEffect(() => {
    const onHashChange = () => setActive(isPreviewHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <ConversationPreview />
    </Suspense>
  );
};

export default PreviewGate;
