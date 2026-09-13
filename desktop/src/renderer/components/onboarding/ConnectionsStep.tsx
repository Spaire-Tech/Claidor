import React from 'react';

import ConnectionsCatalog from '../connections/ConnectionsCatalog';

/**
 * Screen 5, « Some more connections »: the catalogue Settings → Apps
 * shares, with its own header, count and search.
 */
const ConnectionsStep: React.FC = () => (
  <div className="maties-ob-step flex w-full flex-col">
    <ConnectionsCatalog />
  </div>
);

export default ConnectionsStep;
