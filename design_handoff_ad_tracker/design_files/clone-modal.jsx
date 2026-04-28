// Clone flow — 3 steps: Context → Confirm Text → Generate
const Stepper = ({ step }) => {
  const labels = ["Add context", "Confirm text", "Generate video"];
  return (
    <div className="stepper">
      {labels.map((l, i) => (
        <React.Fragment key={i}>
          <div className={`step ${step === i ? "active" : (step > i ? "done" : "")}`}>
            <div className="num">{step > i ? <Icon name="check" size={13}/> : (i + 1)}</div>
            <div className="lbl">{l}</div>
          </div>
          {i < labels.length - 1 && <div className="step-bar"/>}
        </React.Fragment>
      ))}
    </div>
  );
};

// Step 1
const StepContext = ({ ad, state, setState }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const products = window.AdData.products;
  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const selectedProduct = products.find(p => p.id === state.productId);

  return (
    <div style={{ padding: "24px 26px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="field">
          <label className="field-label">Your product</label>
          <div className="dropdown">
            <button
              className="select"
              style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
              onClick={() => setOpen(o => !o)}
            >
              {selectedProduct ? (
                <>
                  <div className="brand-icon" style={{ background: selectedProduct.thumb, width: 18, height: 18, borderRadius: 4, fontSize: 9 }}>
                    {selectedProduct.sku.slice(0, 2)}
                  </div>
                  <span style={{ flex: 1 }}>{selectedProduct.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{selectedProduct.sku}</span>
                </>
              ) : (
                <span style={{ color: "var(--ink-3)" }}>Select a product to clone for…</span>
              )}
            </button>
            {open && (
              <div className="dropdown-menu">
                <input
                  className="dropdown-search"
                  placeholder="Search products…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
                {filtered.map(p => (
                  <div
                    key={p.id}
                    className="dropdown-item"
                    onClick={() => { setState({ ...state, productId: p.id }); setOpen(false); setSearch(""); }}
                  >
                    <div className="brand-icon" style={{ background: p.thumb, width: 22, height: 22, fontSize: 10 }}>
                      {p.sku.slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div>{p.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{p.sku}</div>
                    </div>
                  </div>
                ))}
                <div className="dropdown-item add" onClick={() => setOpen(false)}>
                  <Icon name="plus" size={13}/> Add new product
                </div>
              </div>
            )}
          </div>
          <div className="field-help">The script will be re-written to feature this product's positioning.</div>
        </div>

        <div className="field">
          <label className="field-label">Clone style</label>
          <div className="choice-grid">
            <div
              className={`choice ${state.style === "precise" ? "selected" : ""}`}
              onClick={() => setState({ ...state, style: "precise" })}
            >
              <div className="radio"/>
              <div>
                <h4 className="h">Precise clone</h4>
                <p className="p">Match the original beat-for-beat. Same hook structure, same pacing — only the product changes.</p>
              </div>
            </div>
            <div
              className={`choice ${state.style === "reimagine" ? "selected" : ""}`}
              onClick={() => setState({ ...state, style: "reimagine" })}
            >
              <div className="radio"/>
              <div>
                <h4 className="h">Reimagine</h4>
                <p className="p">Keep the angle and emotional beats, but rewrite voice and structure to fit your brand.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Additional context <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional)</span></label>
          <textarea
            className="textarea"
            placeholder="e.g. Lean into a 'dermatologist-recommended' angle. Avoid mentioning sensitive skin. Discount code is FRESH20."
            value={state.notes}
            onChange={e => setState({ ...state, notes: e.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label">Tone & voice</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Honest UGC", "Founder POV", "Expert authority", "Playful", "Minimal"].map(t => (
              <button
                key={t}
                className="btn btn-sm"
                style={{
                  border: "1px solid " + (state.tone === t ? "var(--accent)" : "var(--border)"),
                  background: state.tone === t ? "var(--accent-soft)" : "var(--surface)",
                  color: state.tone === t ? "var(--accent-strong)" : "var(--ink-2)",
                }}
                onClick={() => setState({ ...state, tone: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div className="section-title">Source ad</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 70, flexShrink: 0, borderRadius: 8, overflow: "hidden", aspectRatio: "9/16" }}>
              <ThumbSVG seed={ad.seed} brand={ad.brand.short} label="9:16"/>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{ad.brand.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                {ad.platform} · {ad.duration}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.4 }}>
                "{ad.hook.slice(0, 90)}{ad.hook.length > 90 ? "…" : ""}"
              </div>
            </div>
          </div>
        </div>

        <div className="note">
          <span className="ico"><Icon name="info" size={14}/></span>
          <div>
            Clones inherit the hook, pacing, and CTA shape — but never the brand assets. Always disclose paid promotion per platform rules.
          </div>
        </div>
      </aside>
    </div>
  );
};

// Step 2 — script editor
const StepConfirmText = ({ ad, state, setState }) => {
  const editing = state.editing;
  return (
    <div style={{ padding: "20px 26px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>Script · {state.lines.length} lines</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Left column is the original transcript. Edit the right column line-by-line — each line maps 1:1 to a scene.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {state.generated && (
            <span className="success-pill">
              <span className="check"><Icon name="check" size={9}/></span>
              Text generated successfully
            </span>
          )}
          <button className="btn btn-secondary btn-sm">
            <Icon name="spark" size={12}/> Regenerate
          </button>
        </div>
      </div>

      <div className="script-table">
        <div className="script-head">
          <div>#</div>
          <div>Original ad text</div>
          <div>Adapted for {state.productLabel || "your product"}</div>
          <div></div>
        </div>
        {state.lines.map((line, i) => (
          <div className="script-row" key={i}>
            <div className="num">{String(i + 1).padStart(2, "0")}</div>
            <div className="original">{line.original}</div>
            <div className="edited">
              <input
                value={line.edited}
                onChange={e => {
                  const lines = [...state.lines];
                  lines[i] = { ...lines[i], edited: e.target.value };
                  setState({ ...state, lines });
                }}
                onFocus={() => setState({ ...state, editing: i })}
                onBlur={() => setState({ ...state, editing: null })}
              />
            </div>
            <button className="pencil" title="Edit line">
              <Icon name="pencil" size={13}/>
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)", display: "flex", gap: 14, alignItems: "center" }}>
        <span><span className="kbd">Tab</span> to next line</span>
        <span><span className="kbd">⌘</span> + <span className="kbd">↵</span> to save</span>
        {editing != null && <span style={{ color: "var(--accent)" }}>Editing line {editing + 1}</span>}
      </div>
    </div>
  );
};

// Step 3 — generate
const StepGenerate = ({ ad, state, setState }) => {
  const product = window.AdData.products.find(p => p.id === state.productId);
  return (
    <div className="gen-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="field">
          <label className="field-label">Product imagery</label>
          <div className="field-help">Upload 3–6 product shots. We'll cut them into the scenes that mention the product.</div>
          <div className="image-grid" style={{ marginTop: 10 }}>
            {state.images.map((img, i) => (
              <div key={i} className="image-tile" style={{ background: img }}>
                <button className="remove" onClick={() => {
                  const images = state.images.filter((_, idx) => idx !== i);
                  setState({ ...state, images });
                }}>
                  <Icon name="x" size={11}/>
                </button>
              </div>
            ))}
            {state.images.length < 6 && (
              <div className="upload-tile" onClick={() => {
                const colors = ["#c98b8b", "#a47a7a", "#d3a6a6", "#e7c2c2", "#b58a8a"];
                const next = colors[state.images.length % colors.length];
                setState({ ...state, images: [...state.images, `linear-gradient(135deg, ${next}, ${next}aa)`] });
              }}>
                <Icon name="upload" size={18}/>
                <div>Click to upload</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7 }}>PNG · JPG · max 8MB</div>
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Render preset</label>
          <div className="choice-grid">
            <div className={`choice ${state.preset === "tiktok" ? "selected" : ""}`} onClick={() => setState({ ...state, preset: "tiktok" })}>
              <div className="radio"/>
              <div>
                <h4 className="h">Vertical · 9:16</h4>
                <p className="p">TikTok / Reels / Shorts. 1080×1920.</p>
              </div>
            </div>
            <div className={`choice ${state.preset === "square" ? "selected" : ""}`} onClick={() => setState({ ...state, preset: "square" })}>
              <div className="radio"/>
              <div>
                <h4 className="h">Square · 1:1</h4>
                <p className="p">Feed-friendly. 1080×1080.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Final instructions <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional)</span></label>
          <textarea
            className="textarea"
            placeholder="e.g. Match the energy of the original. Use warm grading. Avoid on-screen text larger than 32pt."
            value={state.finalNotes || ""}
            onChange={e => setState({ ...state, finalNotes: e.target.value })}
          />
        </div>
      </div>

      <aside className="preview-card">
        <h4>Render summary</h4>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: 8, background: product?.thumb || "#ccc", display: "grid", placeItems: "center", color: "white", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13 }}>
            {product?.sku.slice(0, 2) || "—"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{product?.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{product?.sku}</div>
          </div>
        </div>

        <div className="summary-list">
          <div className="summary-row"><span className="l">Source</span><span className="v">{ad.brand.name}</span></div>
          <div className="summary-row"><span className="l">Style</span><span className="v" style={{ textTransform: "capitalize" }}>{state.style}</span></div>
          <div className="summary-row"><span className="l">Tone</span><span className="v">{state.tone}</span></div>
          <div className="summary-row"><span className="l">Aspect</span><span className="v">{state.preset === "tiktok" ? "9:16" : "1:1"}</span></div>
          <div className="summary-row"><span className="l">Lines</span><span className="v">{state.lines.length}</span></div>
          <div className="summary-row"><span className="l">Est. render</span><span className="v">~2 min 40s</span></div>
        </div>

        <div>
          <div className="section-title" style={{ margin: "0 0 8px" }}>Final script</div>
          <div className="preview-script">
            {state.lines.map((l, i) => (
              <div className="ln" key={i}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                {l.edited}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

const CloneModal = ({ ad, onClose, onComplete }) => {
  const [step, setStep] = React.useState(0);
  const [analyzing, setAnalyzing] = React.useState(true);
  const [generatingText, setGeneratingText] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const initialLines = window.AdData.sampleScript.map(s => ({ original: s, edited: "" }));

  const [state, setState] = React.useState({
    productId: "p1",
    style: "precise",
    tone: "Honest UGC",
    notes: "",
    finalNotes: "",
    lines: initialLines,
    generated: false,
    preset: "tiktok",
    images: ["linear-gradient(135deg, #c98b8b, #a47a7a)", "linear-gradient(135deg, #d3a6a6, #b58a8a)"],
    productLabel: "Lumen Vitamin C Serum",
    editing: null,
  });

  // Simulate "analyzing ad reference" on open
  React.useEffect(() => {
    const t = setTimeout(() => setAnalyzing(false), 1400);
    return () => clearTimeout(t);
  }, []);

  const product = window.AdData.products.find(p => p.id === state.productId);

  const handleNext = () => {
    if (step === 0) {
      // Generate adapted text
      setGeneratingText(true);
      const adapted = [
        "I tried six vitamin C serums in two months. Six.",
        "Most of them either pilled, oxidized, or made my skin smell vaguely citric.",
        "But this one — Lumen's Serum 04 — actually does what the bottle promises.",
        "Fifteen percent L-ascorbic, ferulic acid, no fragrance theater.",
        "And the dropper doesn't slide off my bathroom shelf, which, you know, matters.",
        "Use code FRESH20 for twenty percent off your first bottle.",
        "I'll be honest — I reordered before I finished filming this.",
      ];
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          lines: prev.lines.map((l, i) => ({ ...l, edited: adapted[i] || "" })),
          generated: true,
          productLabel: product?.name.split("—")[1]?.trim() || "your product",
        }));
        setGeneratingText(false);
        setStep(1);
      }, 1600);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setRendering(true);
      setTimeout(() => {
        setRendering(false);
        setDone(true);
        setTimeout(() => onComplete(), 1400);
      }, 2200);
    }
  };

  const handleBack = () => { if (step > 0) setStep(step - 1); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1080, width: "100%" }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title"><Icon name="wand" size={14}/> &nbsp;Clone "{ad.brand.name}" ad</h3>
          <div style={{ flex: 1 }}/>
          {analyzing && step === 0 && (
            <span className="status-row"><span className="spinner"/> Analyzing ad reference… a few seconds</span>
          )}
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={15}/></button>
        </div>

        <Stepper step={step}/>

        <div className="modal-body">
          {step === 0 && <StepContext ad={ad} state={state} setState={setState}/>}
          {step === 1 && <StepConfirmText ad={ad} state={state} setState={setState}/>}
          {step === 2 && <StepGenerate ad={ad} state={state} setState={setState}/>}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={step === 0 ? onClose : handleBack}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {step === 0 && (
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                Step 1 of 3
              </span>
            )}
            {done ? (
              <span className="success-pill">
                <span className="check"><Icon name="check" size={9}/></span>
                Render queued
              </span>
            ) : rendering ? (
              <button className="btn btn-primary btn-lg" disabled>
                <span className="spinner" style={{ borderTopColor: "white", borderColor: "rgba(255,255,255,0.4)" }}/>
                Queueing render…
              </button>
            ) : generatingText ? (
              <button className="btn btn-primary btn-lg" disabled>
                <span className="spinner" style={{ borderTopColor: "white", borderColor: "rgba(255,255,255,0.4)" }}/>
                Generating text…
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={handleNext} disabled={analyzing && step === 0}>
                {step === 0 && (<>Generate text <Icon name="spark" size={13}/></>)}
                {step === 1 && (<>Confirm text →</>)}
                {step === 2 && (<>Generate video <Icon name="wand" size={13}/></>)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

window.CloneModal = CloneModal;
