import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="My trip"
      subtitle="Delivery Trip"
      summary="The driver’s sequenced trip for today, taken from the Delivery Trip the back office planned."
      bullets={[
        "Stops in planned sequence with window and address",
        "Progress and cash collected so far",
        "Open a stop to scan out and confirm delivery"
      ]}
    />
  );
}
