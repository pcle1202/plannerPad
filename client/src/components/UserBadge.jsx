import React from 'react';

/**
 * Colored presence pill for a single connected user.
 * Border, dot, and text all inherit the user's assigned color.
 */
export function UserBadge({ name, color = '#C084FC' }) {
  return (
    <span className="user-badge" style={{ borderColor: color, color }}>
      <span className="user-badge__dot" style={{ background: color }} />
      {name}
    </span>
  );
}

/**
 * Renders a row of UserBadge pills for all connected users.
 */
export function UserList({ users = [] }) {
  if (!users.length) return null;
  return (
    <div className="users">
      {users.map((u, i) => (
        <UserBadge key={i} name={u.name} color={u.color} />
      ))}
    </div>
  );
}
