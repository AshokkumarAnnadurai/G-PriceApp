import React,{ useState } from 'react';
import { BRAND } from '../../constants';

interface HeaderProps {
  username: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ username, onLogout }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <header
      className="h-[68px] bg-white flex items-center justify-end px-8 shrink-0 relative gap-3"
      style={{ borderBottom: `1px solid ${BRAND.BORDER}` }}
    >
      <span className="text-sm font-semibold text-gray-700">{username || 'Admin'}</span>
      <div className="relative">
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none border border-gray-200 shadow-sm"
          aria-label="User menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>

        {isProfileOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsProfileOpen(false)}
            ></div>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 border border-gray-100 z-50 transform origin-top-right transition-all">
              <div className="px-4 py-3 border-b border-gray-100 mb-1">
                <p className="text-xs text-gray-500 font-medium mb-0.5">Signed in as</p>
                <p className="text-sm font-bold text-gray-800 truncate">
                  {username || 'Admin'}
                </p>
              </div>
              <button
                onClick={onLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold transition-colors"
              >
                Logout
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
