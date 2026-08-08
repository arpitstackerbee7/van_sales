import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Collections"
      subtitle="Draft payment entries"
      summary="What the driver has collected today, all of it still draft until the cashier finalises."
      bullets={[
        "Record cash and cheque against a customer",
        "Allocate oldest invoice first, or leave on account",
        "Running total that matches what the cashier will count"
      ]}
    />
  );
}
