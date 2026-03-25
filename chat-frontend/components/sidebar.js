// components/Sidebar.js
import React from 'react';
import Link from 'next/link';

const groups = [
  { id: 1, name: 'Group 1' },
  { id: 2, name: 'Group 2' },
  { id: 3, name: 'Group 3' },
];

function Sidebar() {
  return (
    <div className="sidebar">
      <h2>Groups</h2>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <Link href={`/group/${group.id}`}>
              {group.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Sidebar;
