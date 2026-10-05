import React,{ useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (username.trim() && password.trim()) {
      try {
        const response = await apiClient.post('/auth/login', { username, password });
        const data = response.data;
        
        localStorage.setItem('gk_logged_in', 'true');
        localStorage.setItem('gk_username', data.user.username);
        localStorage.setItem('gk_employee_name', data.user.employeeName || data.user.username);
        localStorage.setItem('gk_token', data.token);
        localStorage.setItem('gk_refresh_token', data.refreshToken);
        localStorage.setItem('gk_role', JSON.stringify(data.user.roles || []));
        localStorage.setItem('gk_screen_permissions', JSON.stringify(data.user.screenPermissions || []));
        
        navigate(data.user.roles?.map((r: string) => r.toLowerCase()).includes('super admin') ? '/management/users' : '/items');
      } catch (err: any) {
        setError(err.message || 'Login failed. Please try again.');
      }
    } else {
      setError('Username and password are required');
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <img 
        src="/bg.png" 
        alt="Geekeyy Factory"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} 
      />
      {/* Dark Overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.50)' }}></div>
      
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '44px', width: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.40)' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '26px' }}>G</span>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '18px', color: '#111', margin: 0 }}>GEEKEYY Engineering Co.</p>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>ISO 9001:2015 · Pricing Portal</p>
            </div>
          </div>

          <hr style={{ borderColor: '#f3f4f6', borderStyle: 'solid', borderWidth: '1px 0 0 0', margin: '0 0 24px 0' }} />

          <form onSubmit={handleLogin}>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 4px 0' }}>Sign In</p>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 24px 0' }}>Enter your credentials to continue</p>

            {error && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#b91c1c', margin: 0, fontWeight: 500 }}>{error}</p>
              </div>
            )}

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Username</label>
            <input 
              type="text" 
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: '42px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0 12px', fontSize: '14px', marginBottom: '16px', outline: 'none' }} 
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Password</label>
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', height: '42px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0 40px 0 12px', fontSize: '14px', outline: 'none' }} 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>

            <button 
              type="submit"
              style={{ width: '100%', height: '44px', background: '#b91c1c', color: 'white', fontWeight: 600, fontSize: '15px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
            >
              Sign In
            </button>
          </form>

          <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', margin: '24px 0 0 0' }}>
            © 2026 Geekeyy Engineering Co. All Rights Reserved
          </p>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
