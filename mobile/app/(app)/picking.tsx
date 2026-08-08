import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Picking"
      subtitle="Pick List"
      summary="Bin-sequenced, FEFO-ordered picking against the Pick List the sales orders generated."
      bullets={[
        "Walk order follows bin sequence, batches follow earliest expiry",
        "Scan each carton to confirm the pick",
        "Raise a shortage to the purchaser without leaving the screen"
      ]}
    />
  );
}
