// Sidebar + Topnav
const Sidebar = ({ activeNav, setActiveNav, activeSub, setActiveSub }) => {
  const sections = [
    {
      id: "main",
      items: [
        { id: "home", label: "Home", icon: "home" },
      ],
    },
    {
      id: "research",
      title: "Research",
      items: [
        { id: "discovery", label: "Ad Discovery", icon: "compass", subnav: [
          { id: "all", label: "Discovery" },
          { id: "tracked", label: "Tracked Brands" },
          { id: "similar", label: "Similar Brands" },
          { id: "top", label: "Top Picks" },
        ]},
        { id: "trends", label: "Trends", icon: "trending" },
        { id: "library", label: "Saved Library", icon: "folder" },
      ],
    },
    {
      id: "create",
      title: "Create",
      items: [
        { id: "scripts", label: "Scripts", icon: "list" },
        { id: "renders", label: "Renders", icon: "layers" },
      ],
    },
    {
      id: "measure",
      title: "Measure",
      items: [
        { id: "analytics", label: "Analytics", icon: "chart" },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">V</div>
        <span>Vantage</span>
      </div>

      {sections.map(sec => (
        <React.Fragment key={sec.id}>
          {sec.title && <div className="nav-section">{sec.title}</div>}
          {sec.items.map(item => {
            const isActive = activeNav === item.id;
            return (
              <React.Fragment key={item.id}>
                <div
                  className={`nav-item ${isActive ? "active expanded" : ""}`}
                  onClick={() => setActiveNav(item.id)}
                >
                  <span className="ico"><Icon name={item.icon} size={15}/></span>
                  <span>{item.label}</span>
                  {item.subnav && <span className="chev"><Icon name="chev" size={12}/></span>}
                </div>
                {item.subnav && isActive && (
                  <div className="subnav">
                    {item.subnav.map(s => (
                      <div
                        key={s.id}
                        className={`subnav-item ${activeSub === s.id ? "active" : ""}`}
                        onClick={() => setActiveSub(s.id)}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}

      <div className="sidebar-footer">
        <div className="avatar">MR</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "white", fontWeight: 500, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Maya Rojas</div>
          <div style={{ fontSize: 11, color: "var(--sidebar-ink-dim)" }}>Lumen Skincare · Pro</div>
        </div>
        <button className="icon-btn" style={{ color: "var(--sidebar-ink-dim)" }}>
          <Icon name="settings" size={14}/>
        </button>
      </div>
    </aside>
  );
};

const TopNav = ({ search, setSearch }) => (
  <header className="topnav">
    <div className="search">
      <span className="ico"><Icon name="search" size={15}/></span>
      <input
        placeholder="Search ads by brand, keyword, or hook…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
    </div>
    <div className="spacer"/>
    <div className="actions">
      <button className="icon-btn" title="Help"><Icon name="help" size={16}/></button>
      <button className="icon-btn" title="Notifications"><Icon name="bell" size={16}/></button>
      <button className="btn btn-primary">
        <Icon name="plus" size={14}/>
        Track a brand
      </button>
    </div>
  </header>
);

window.Sidebar = Sidebar;
window.TopNav = TopNav;
