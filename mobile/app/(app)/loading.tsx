import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Van loading"
      subtitle="Reverse route order"
      summary="Staging and loading the van in reverse stop order, so the driver unloads front-first at every stop."
      bullets={[
        "Stops listed last-to-first for loading",
        "Confirm each stop’s cartons onto the van",
        "Handover to the driver with a seal number"
      ]}
    />
  );
}
