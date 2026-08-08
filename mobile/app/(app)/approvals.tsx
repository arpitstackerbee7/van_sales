import React from 'react';

import { Planned } from '../../src/ui/Planned';

export default function Screen() {
  return (
    <Planned
      title="Approvals"
      subtitle="Team queue"
      summary="Orders waiting on this team leader, sorted by what is wrong with them rather than by time received."
      bullets={[
        "Queue of team Sales Orders in Pending Approval",
        "Flag low margin, over credit limit and price overrides first",
        "Approve, reject with a reason, or edit quantity and rate in place"
      ]}
    />
  );
}
