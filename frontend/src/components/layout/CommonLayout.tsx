import React,{ useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SessionMonitor } from '../auth/SessionMonitor';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const CommonLayout: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const username = localStorage.getItem('gk_employee_name') || localStorage.getItem('gk_username') || 'Admin';

  const handleLogout = () => {
    localStorage.removeItem('gk_logged_in');
    localStorage.removeItem('gk_username');
    localStorage.removeItem('gk_token');
    localStorage.removeItem('gk_refresh_token');
    localStorage.removeItem('gk_role');
    window.location.href = '/login';
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Reusable Sidebar Component */}
      <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Reusable Header Component */}
        <Header username={username} onLogout={handleLogout} />

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0 relative flex flex-col" id="app-scroll-container">
          <Outlet />
          
          {/* Reusable Session Monitor for Session Expiry & Auto-Refresh */}
          <SessionMonitor />

          {/* Reusable Footer Component */}
          <Footer />
        </div>
      </main>
    </div>
  );
};

export default CommonLayout;
