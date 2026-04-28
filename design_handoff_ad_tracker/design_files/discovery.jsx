// Discovery grid
const Toolbar = ({ filter, setFilter, sort, setSort, count }) => {
  const filters = [
    { id: "all", label: "All ads" },
    { id: "tracked", label: "Tracked brands" },
    { id: "similar", label: "Similar brands" },
    { id: "top", label: "Top picks" },
  ];
  return (
    <div className="toolbar">
      <div className="pills">
        {filters.map(f => (
          <button key={f.id} className={`pill ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="toolbar-right">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{count} ads</span>
        <button className="select-mini">
          <Icon name="filter" size={13}/> Filters
        </button>
        <button className="select-mini" onClick={() => setSort(sort === "recent" ? "top" : "recent")}>
          <Icon name={sort === "recent" ? "clock" : "trending"} size={13}/>
          {sort === "recent" ? "Most recent" : "Most used"}
          <Icon name="chev" size={11} className="" />
        </button>
      </div>
    </div>
  );
};

const AdCard = ({ ad, onClick, onClone }) => (
  <div className="card" onClick={onClick}>
    <div className="thumb">
      <ThumbSVG seed={ad.seed} brand={ad.brand.short} label={ad.platform + " · " + ad.duration}/>
      <div className="thumb-overlay">
        <div className="badge">
          {ad.active ? <span className="dot"/> : <span className="dot" style={{ background: "oklch(0.7 0.005 80)", boxShadow: "0 0 0 3px oklch(0.7 0.005 80 / 0.18)" }}/>}
          {ad.active ? "Active" : "Paused"}
        </div>
        <div className="thumb-meta">
          <Icon name="play" size={9}/> {ad.duration}
        </div>
      </div>
      <button
        className="clone-fab"
        onClick={(e) => { e.stopPropagation(); onClone(ad); }}
      >
        <Icon name="wand" size={12}/> Clone
      </button>
    </div>
    <div className="card-body">
      <div className="card-row">
        <div className="brand-icon" style={{ background: ad.brand.color }}>{ad.brand.short}</div>
        <div className="card-brand">{ad.brand.name}</div>
        <div className="card-time" title={`Detected ${ad.days} days ago`}>{ad.days}d</div>
      </div>
      <div className="card-stats">
        <span className="stat"><strong>{ad.useCount}</strong> ads use this</span>
        <span style={{ marginLeft: "auto" }} className="stat"><Icon name="eye" size={11}/> {ad.impressions}</span>
      </div>
    </div>
  </div>
);

const Discovery = ({ ads, onOpen, onClone }) => {
  const [filter, setFilter] = React.useState("all");
  const [sort, setSort] = React.useState("recent");

  const sorted = React.useMemo(() => {
    const arr = [...ads];
    if (sort === "recent") arr.sort((a, b) => a.days - b.days);
    else arr.sort((a, b) => b.useCount - a.useCount);
    return arr;
  }, [ads, sort]);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Ad Discovery</h1>
          <p className="page-sub">Browse what's working across tracked competitors. Open any ad to see metadata, hook, and audience — or clone the script for your product.</p>
        </div>
        <button className="btn btn-secondary">
          <Icon name="plus" size={13}/> New collection
        </button>
      </div>

      <Toolbar filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} count={sorted.length}/>

      <div className="grid">
        {sorted.map(ad => (
          <AdCard key={ad.id} ad={ad} onClick={() => onOpen(ad)} onClone={onClone}/>
        ))}
      </div>
    </div>
  );
};

window.Discovery = Discovery;
