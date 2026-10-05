import React,{ useEffect,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export const SessionMonitor: React.FC = () => {
  const [showPopup, setShowPopup] = useState(false);
  const navigate = useNavigate();
  const isRefreshingRef = useRef(false);
  const shownTokensRef = useRef<Set<string>>(new Set());
  const hasUserCancelledRef = useRef<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('gk_logged_in');
    localStorage.removeItem('gk_username');
    localStorage.removeItem('gk_token');
    localStorage.removeItem('gk_refresh_token');
    localStorage.removeItem('gk_role');
    setShowPopup(false);
    navigate('/login');
  };

  const handleContinue = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    const refreshToken = localStorage.getItem('gk_refresh_token');
    if (!refreshToken) {
      handleLogout();
      isRefreshingRef.current = false;
      return;
    }

    try {
      const response = await apiClient.post('/auth/refresh', { refreshToken });
      const { token: newToken, refreshToken: newRefreshToken } = response.data as any;

      localStorage.setItem('gk_token', newToken);
      localStorage.setItem('gk_refresh_token', newRefreshToken);
      
      // Reset flow flags
      setShowPopup(false);
      isRefreshingRef.current = false;
    } catch (err) {
      console.error('Failed to refresh token:', err);
      handleLogout();
      isRefreshingRef.current = false;
    }
  };

  const handleCancel = () => {
    setShowPopup(false);
    // Mark this token as cancelled by the user so we don't prompt again
    const token = localStorage.getItem('gk_token');
    if (token) {
      hasUserCancelledRef.current = token;
    }
  };

  useEffect(() => {
    const checkTokenExpiry = () => {
      const token = localStorage.getItem('gk_token');
      if (!token) {
        if (showPopup) setShowPopup(false);
        return;
      }

      const decoded = parseJwt(token);
      if (!decoded || !decoded.exp) {
        return;
      }

      const expTime = decoded.exp * 1000;
      const now = Date.now();
      const timeLeft = expTime - now;

      // 1. If token is completely expired, automatically log out
      if (timeLeft <= 0) {
        handleLogout();
        return;
      }

      // 2. Warning popup exactly 5 minutes (300,000 ms) before expiry
      // If user cancelled, do not show popup again for this token
      const WARNING_BUFFER = 5 * 60 * 1000; // 5 minutes
      if (timeLeft <= WARNING_BUFFER) {
        if (hasUserCancelledRef.current !== token && !shownTokensRef.current.has(token)) {
          shownTokensRef.current.add(token);
          setShowPopup(true);
        }
      }
    };

    // Check immediately and then every 2 seconds for high accuracy
    checkTokenExpiry();
    const interval = setInterval(checkTokenExpiry, 2000);

    return () => clearInterval(interval);
  }, [navigate, showPopup]);

  if (!showPopup) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-100 transform scale-100 transition-transform duration-300"
        style={{ animation: 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Warning Header/Icon */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Session Expiring</h3>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Geekeyy Engineering Co.</p>
          </div>
        </div>

        {/* Message */}
        <p className="text-gray-600 text-sm leading-relaxed mb-6">
          Your session is about to expire in 5 minutes. Would you like to continue your session?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-sm hover:shadow transition-all duration-150"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
export default SessionMonitor;
