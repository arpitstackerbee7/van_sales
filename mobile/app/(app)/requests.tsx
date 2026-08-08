import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Requests"
      subtitle="Material Requests"
      summary="Replenishment requests raised by vans, queued into tomorrow’s pick wave."
      bullets={[
        "Van par levels drive the requested quantity",
        "Approve or adjust before it reaches the wave",
        "Track from request through transfer to van receipt"
      ]}
    />
  );
}
