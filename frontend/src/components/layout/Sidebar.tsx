import React,{ useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BRAND,NAV_LABELS,ROUTES } from '../../constants';

interface NavItem {
  label: string;
  to: string;
  badge?: number;
  icon: (className: string) => React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: 'VIEWS',
    items: [
      {
        label: NAV_LABELS.DASHBOARD,
        to: ROUTES.HOME,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.ITEM_MASTER,
        to: ROUTES.ITEM_MASTER,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.VENDOR_MASTER,
        to: ROUTES.VENDOR_MASTER,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.CUSTOMER_LIST,
        to: ROUTES.CUSTOMER_LIST,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.PRICE_HISTORY,
        to: ROUTES.PRICE_HISTORY,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.PRICING_COMPARISON,
        to: ROUTES.PRICING_COMPARISON,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'ACTIONS',
    items: [
      {
        label: NAV_LABELS.PRICING_UPDATE,
        to: ROUTES.PRICING_UPDATE,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.ITEM_PRICING_APPROVAL,
        to: ROUTES.ITEM_PRICING_APPROVAL,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },

      {
        label: NAV_LABELS.DC_RAISE_DISPUTE,
        to: ROUTES.DC_RAISE_DISPUTE,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
        ),
      },
      // TODO: Unhide when PO/SO audit is ready
      // {
      //   label: NAV_LABELS.ORDER_PRICE_AUDIT,
      //   to: ROUTES.ORDER_PRICE_AUDIT,
      //   icon: (c) => (
      //     <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      //       <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      //     </svg>
      //   ),
      // },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      {
        label: NAV_LABELS.USER_MANAGEMENT,
        to: ROUTES.USER_MANAGEMENT,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.ROLE_MANAGEMENT,
        to: ROUTES.ROLE_MANAGEMENT,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.SCREEN_MANAGEMENT,
        to: ROUTES.SCREEN_MANAGEMENT,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.API_MANAGEMENT,
        to: ROUTES.API_MANAGEMENT,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-5-2a2 2 0 012 2m-5-2a2 2 0 012 2m-5-2a2 2 0 012 2m-5-2a2 2 0 012 2m-5-2a2 2 0 012 2" />
          </svg>
        ),
      },
      {
        label: NAV_LABELS.AUDIT_LOGS,
        to: ROUTES.AUDIT_LOGS,
        icon: (c) => (
          <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ],
  },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const [toggleHovered, setToggleHovered] = useState(false);

  return (
    <aside
      className={`bg-white flex flex-col h-full shrink-0 relative transition-all duration-300 ease-in-out ${isCollapsed ? 'w-16' : 'w-60'}`}
      style={{ borderRight: `1px solid ${BRAND.BORDER}` }}
    >
      {/* Logo Area & Collapse Toggle */}
      <div
        className={`flex items-center shrink-0 overflow-hidden transition-all duration-300 ${
          isCollapsed ? 'justify-center' : 'justify-between pl-4 pr-3.5'
        }`}
        style={{
          height: '68px',
          borderBottom: `1px solid ${BRAND.RED_BORDER}`,
          borderLeft: `4px solid ${BRAND.RED}`,
        }}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-10 h-10 shrink-0">
              <defs>
                <mask id="logo-mask">
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  <polygon
                    points="35,10 90,10 90,42 80,50 90,58 90,90 35,90"
                    fill="black"
                    stroke="black"
                    strokeWidth="6"
                    strokeLinejoin="miter"
                  />
                </mask>
              </defs>
              <path
                d="M 60 25 L 60 18 A 8 8 0 0 0 52 10 L 18 10 A 8 8 0 0 0 10 18 L 10 82 A 8 8 0 0 0 18 90 L 52 90 A 8 8 0 0 0 60 82 L 60 70 L 25 70"
                fill="none"
                stroke={BRAND.RED}
                strokeWidth="8"
                strokeLinecap="square"
                strokeLinejoin="miter"
                mask="url(#logo-mask)"
              />
              <polygon
                points="35,10 90,10 90,42 80,50 90,58 90,90 35,90"
                fill={BRAND.RED}
              />
            </svg>
            <div className="flex flex-col">
              <span className="font-bold text-base leading-none tracking-wider text-gray-900 whitespace-nowrap">GEEKEYY</span>
              <span className="text-xs font-medium leading-tight mt-0.5 whitespace-nowrap text-gray-500">Engineering Co.</span>
              <span className="text-xs tracking-wider uppercase font-semibold mt-0.5 whitespace-nowrap text-gray-500">ISO 9001:2015</span>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          onMouseEnter={() => setToggleHovered(true)}
          onMouseLeave={() => setToggleHovered(false)}
          style={{
            color: toggleHovered ? BRAND.RED_HOVER : BRAND.RED,
            transition: 'color 0.15s',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '1.25rem',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isCollapsed ? '»' : '«'}
        </button>
      </div>

      {/* Sidebar Navigation Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-white">
        <nav className="flex-1 py-3 overflow-y-auto min-h-0">
          {(() => {
            const rolesJson = localStorage.getItem('gk_role');
            let roles: string[] = [];
            if (rolesJson) {
              try {
                const parsed = JSON.parse(rolesJson);
                roles = Array.isArray(parsed) ? parsed : [parsed];
              } catch {
                roles = [rolesJson];
              }
            }
            const isAdmin = roles.map((r: string) => r.toLowerCase()).includes('super admin');
            
            const permissionsJson = localStorage.getItem('gk_screen_permissions');
            let permissions: any[] = [];
            if (permissionsJson) {
              try {
                permissions = JSON.parse(permissionsJson);
              } catch {
                permissions = [];
              }
            }

            const hasPermission = (to: string): boolean => {
              if (isAdmin) return true;
              if (to === ROUTES.PRICING_COMPARISON) return true;
              
              let screenName = '';
              if (to === ROUTES.HOME) screenName = 'Dashboard';
              else if (to === ROUTES.ITEM_MASTER) screenName = 'Item Master';
              else if (to === ROUTES.VENDOR_MASTER) screenName = 'Vendor Master';
              else if (to === ROUTES.CUSTOMER_LIST) screenName = 'Customer List';
              else if (to === ROUTES.RM_MASTER) screenName = 'RM Master';
              else if (to === ROUTES.PRICE_HISTORY) screenName = 'Price History';
              else if (to === ROUTES.PRICING_COMPARISON) screenName = 'Pricing Comparison';
              else if (to === ROUTES.PRICING_UPDATE) screenName = 'Pricing Update';
              else if (to === ROUTES.ITEM_PRICING_APPROVAL) screenName = 'Pricing Approval';
              else if (to === ROUTES.CUSTOMER_PRICING) screenName = 'Customer Pricing Upload';
              else if (to === ROUTES.DC_RAISE_DISPUTE) screenName = 'Dispute Register';
              else if (to === ROUTES.ORDER_PRICE_AUDIT) screenName = 'Order Price Audit';
              else if (to === ROUTES.USER_MANAGEMENT) screenName = 'User Management';
              else if (to === ROUTES.ROLE_MANAGEMENT) screenName = 'Role Management';
              else if (to === ROUTES.SCREEN_MANAGEMENT) screenName = 'Screen Management';
              else if (to === ROUTES.API_MANAGEMENT) screenName = 'API Permission Management';
              else if (to === ROUTES.AUDIT_LOGS) screenName = 'Audit Logs';
              
              if (!screenName) return true;
              
              const perm = permissions.find((p: any) => p.screenName === screenName);
              return perm ? !!perm.canView : false;
            };

            return NAV_SECTIONS.map((section, si) => {
              const filteredItems = section.items.filter(item => hasPermission(item.to));
              if (filteredItems.length === 0) return null;

              return (
                <div key={section.title} className={si > 0 ? 'mt-4' : ''}>
                  <div className={`transition-all duration-300 overflow-hidden ${isCollapsed ? 'h-0 opacity-0' : 'h-auto opacity-100'}`}>
                    <p className="px-5 pb-2 pt-2 text-[13px] font-bold tracking-widest uppercase text-gray-800">
                      {section.title}
                    </p>
                  </div>

                  {filteredItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '0.9rem',
                        transition: 'background-color 0.15s, color 0.15s',
                        borderRadius: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        justifyContent: isCollapsed ? 'center' : undefined,
                        padding: isCollapsed ? '0.625rem 0' : '0.625rem 1.25rem',
                        backgroundColor: isActive ? BRAND.RED : undefined,
                        color: isActive ? BRAND.WHITE : '#374151',
                        fontWeight: isActive ? 600 : 500,
                        textDecoration: 'none',
                      })}
                    >
                      {({ isActive }) => (
                        <>
                          {item.icon(`w-4 h-4 shrink-0`)}
                          <span className={`transition-all duration-300 origin-left ${
                            isCollapsed ? 'w-0 opacity-0 scale-0 overflow-hidden' : 'flex-1 ml-3 w-auto opacity-100 scale-100'
                          }`}>
                            {item.label}
                          </span>
                          {item.badge !== undefined && !isCollapsed && (
                            <span
                              className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: isActive ? 'rgba(255,255,255,0.3)' : BRAND.RED, color: '#fff', minWidth: '20px', textAlign: 'center' }}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              );
            });
          })()}
        </nav>
      </div>
    </aside>
  );
};
