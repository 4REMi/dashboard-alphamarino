// Ad Detail modal — left: video player; right: metadata
const DetailModal = ({ ad, onClose, onStartClone }) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1080 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Ad detail</h3>
          <span className="status-row">
            <span className="kbd">ESC</span> to close
          </span>
          <div style={{ flex: 1 }}/>
          <div className="modal-actions">
            <button className="btn btn-secondary btn-sm"><Icon name="external" size={12}/> View source</button>
            <button className="btn btn-secondary btn-sm"><Icon name="share" size={12}/> Share</button>
            <button className="btn btn-secondary btn-sm"><Icon name="save" size={12}/> Save</button>
            <button className="icon-btn" onClick={onClose}><Icon name="x" size={15}/></button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-media">
            <div className="player">
              <ThumbSVG seed={ad.seed} brand={ad.brand.short} label={ad.platform + " · " + ad.duration}/>
              <div className="play-pill"><Icon name="play" size={11}/> Play preview</div>
              <div className="scrubber"><span/></div>
            </div>
          </div>

          <div className="detail-info">
            <div className="detail-brand">
              <div className="brand-icon" style={{ background: ad.brand.color }}>{ad.brand.short}</div>
              <div>
                <h2>{ad.brand.name}</h2>
                <div className="meta">{ad.platform} · {ad.format} · {ad.duration} · detected {ad.days}d ago</div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <span className="badge" style={{ background: "var(--green-soft)", color: "oklch(0.4 0.12 150)" }}>
                  <span className="dot"/> {ad.active ? "Active" : "Paused"}
                </span>
              </div>
            </div>

            <div className="detail-stats">
              <div className="detail-stat">
                <div className="num">{ad.useCount}</div>
                <div className="lbl">Variants in flight</div>
              </div>
              <div className="detail-stat">
                <div className="num">{ad.impressions}</div>
                <div className="lbl">Est. impressions</div>
              </div>
              <div className="detail-stat">
                <div className="num">{ad.spendTier}</div>
                <div className="lbl">Spend tier</div>
              </div>
            </div>

            <div className="hook-block">
              <span className="label">Hook</span>
              {ad.hook}
            </div>

            <dl className="kv">
              <dt>Landing page</dt>
              <dd><a style={{ color: "var(--accent)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: 12.5 }} href="#">{ad.landing}</a></dd>
              <dt>Target audience</dt>
              <dd>{ad.audience}</dd>
              <dt>Format tags</dt>
              <dd>
                <span className="tag">{ad.format}</span>
                <span className="tag">9:16</span>
                <span className="tag">{ad.platform}</span>
                <span className="tag">CTA: code</span>
              </dd>
              <dt>First detected</dt>
              <dd style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>2026-04-{String(27 - ad.days).padStart(2, "0")} · 09:14 UTC</dd>
            </dl>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost btn-sm">
            <Icon name="list" size={13}/> Extract ad copy
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
            <button className="btn btn-primary btn-lg" onClick={() => onStartClone(ad)}>
              <Icon name="wand" size={14}/> Clone this ad
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

window.DetailModal = DetailModal;
