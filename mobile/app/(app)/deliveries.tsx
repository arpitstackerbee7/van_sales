import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Delivery"
      subtitle="Scan to confirm"
      summary="Line-level scan confirmation at the door, so a shortfall surfaces there rather than at day close."
      bullets={[
        "Scan each line against the Delivery Note",
        "Mark delivered only when every line is confirmed",
        "Record a partial delivery or a not-home outcome"
      ]}
    />
  );
}
