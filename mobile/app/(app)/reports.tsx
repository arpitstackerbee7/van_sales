import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Reports"
      subtitle="Operational"
      summary="Daily reconciliation across vehicle loads, deliveries, collections and returns."
      bullets={[
        "Vehicle-wise and driver-wise daily reconciliation",
        "Collection summaries, cash versus credit",
        "Export or share as PDF"
      ]}
    />
  );
}
