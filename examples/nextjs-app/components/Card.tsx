import React, { type ReactNode } from 'react';

export interface CardProps {
  title: string;
  badge?: string;
  badgeColor?: string;
  children: ReactNode;
}

export function Card({ title, badge, badgeColor = '#38bdf8', children }: CardProps) {
  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '10px',
        padding: '20px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{title}</h2>
        {badge && (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '6px',
              background: `${badgeColor}20`,
              color: badgeColor,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
