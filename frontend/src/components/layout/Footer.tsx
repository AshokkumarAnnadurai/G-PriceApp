import React from 'react';
import { BRAND } from '../../constants';

export const Footer: React.FC = () => {
  return (
    <footer
      className="h-12 flex items-center justify-center px-8 text-xs font-medium shrink-0"
      style={{
        backgroundColor: BRAND.WHITE,
        borderTop: `1px solid ${BRAND.RED_BORDER}`,
        color: BRAND.GRAY_TEXT,
      }}
    >
      © 2026 Geekeyy Engineering Co., All Rights Reserved
    </footer>
  );
};
