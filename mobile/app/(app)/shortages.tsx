import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Shortages"
      subtitle="Purchaser notified"
      summary="What could not be picked, and the choice of how to resolve it."
      bullets={[
        "Substitute, part-deliver and backorder, or post a flagged negative",
        "Notify the purchaser through a Material Request",
        "Negative positions carry the clearing clock from Van Sales Settings"
      ]}
    />
  );
}
