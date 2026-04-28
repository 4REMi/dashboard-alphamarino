// Mock data + helper SVG generators for ad thumbnails.
// All brands are made-up; all copy is original.

window.AdData = (function() {
  const BRANDS = [
    { name: "Fernweh Coffee",   short: "FW", color: "#7a4a2b", vertical: "DTC Coffee" },
    { name: "Lumen Skincare",   short: "LM", color: "#c98b8b", vertical: "Beauty" },
    { name: "Tilt Bikes",       short: "TB", color: "#1f3b2d", vertical: "Outdoor" },
    { name: "Quill Notebooks",  short: "QN", color: "#2b3a55", vertical: "Stationery" },
    { name: "Crustly",          short: "CR", color: "#d97343", vertical: "Frozen Pizza" },
    { name: "Mossway",          short: "MW", color: "#3f6b4e", vertical: "Houseplants" },
    { name: "Northkit",         short: "NK", color: "#4a4a4a", vertical: "Apparel" },
    { name: "Polar Lab",        short: "PL", color: "#2c5e8f", vertical: "Recovery" },
    { name: "Hum & Honey",      short: "HH", color: "#b88a2d", vertical: "Tea" },
    { name: "Roost",            short: "RT", color: "#8b4a6b", vertical: "Sleep" },
    { name: "Forge Supply",     short: "FS", color: "#5a4a3b", vertical: "Kitchenware" },
    { name: "Bramble",          short: "BR", color: "#4a6b3a", vertical: "Pet Food" },
  ];

  const HOOKS = [
    "I tried 9 cold brews so you don't have to — here's the only one I'd reorder.",
    "Why my dermatologist switched to this serum after 14 years of recommending the other one.",
    "POV: you finally find a commuter bike that fits in a studio elevator.",
    "The notebook that ended my 3-app productivity stack.",
    "Frozen pizza, but make it the kind your Italian aunt would tolerate.",
    "I killed every plant I owned. Then I bought this one.",
    "A jacket I genuinely forgot I was wearing — in a good way.",
    "10 minutes a day with this thing replaced my $180 massage gun.",
    "The tea I now drink instead of my fourth coffee.",
    "What if your mattress just… didn't get hot.",
    "The only pan I haven't returned this year.",
    "My dog is suspicious of this food. He shouldn't be.",
  ];

  const AUDIENCES = [
    "Coffee enthusiasts, 28–44, urban",
    "Skincare-curious millennials, 26–40",
    "Urban commuters, apartment-dwellers",
    "Knowledge workers, planners, students",
    "Time-poor parents, weeknight cooks",
    "First-time plant parents, 22–35",
    "Outdoor commuters, 25–44",
    "Athletes, desk workers w/ back pain",
    "Caffeine-cyclers, wellness-leaning",
    "Hot sleepers, 30–55, premium buyers",
    "Home cooks who value durability",
    "Premium pet-food shoppers",
  ];

  const LANDING = [
    "fernwehcoffee.co/cold-brew",
    "lumen.studio/serum-04",
    "tiltbikes.com/fold-1",
    "quill.supply/a5-everyday",
    "eatcrustly.com/margherita",
    "mossway.garden/starter",
    "northkit.co/utility-shell",
    "polarlab.io/percussion",
    "humandhoney.tea/oolong",
    "roost.sleep/cool-foam",
    "forgesupply.com/skillet",
    "bramble.pet/grain-free",
  ];

  function fakeAds(n) {
    const out = [];
    const sizes = [42, 56, 71, 88, 104, 119, 133, 156, 182, 211, 244, 287];
    const days = [2, 4, 6, 9, 12, 18, 24, 31, 47, 62];
    for (let i = 0; i < n; i++) {
      const b = BRANDS[i % BRANDS.length];
      out.push({
        id: "ad_" + i,
        brand: b,
        hook: HOOKS[i % HOOKS.length],
        audience: AUDIENCES[i % AUDIENCES.length],
        landing: LANDING[i % LANDING.length],
        useCount: sizes[i % sizes.length] + (i * 3),
        days: days[i % days.length],
        active: i % 7 !== 4,
        platform: i % 3 === 0 ? "TikTok" : (i % 3 === 1 ? "Meta" : "YouTube"),
        duration: ["0:18", "0:24", "0:31", "0:42", "1:02"][i % 5],
        spendTier: ["High", "Med", "Med", "High", "Low", "Med"][i % 6],
        impressions: [820, 1200, 2300, 540, 4100, 1800, 920, 3300][i % 8] + "K",
        format: i % 4 === 0 ? "UGC" : (i % 4 === 1 ? "Studio" : (i % 4 === 2 ? "Founder POV" : "Static + VO")),
        seed: i * 37 + 11,
      });
    }
    return out;
  }

  // sample script — original copy, line-by-line
  const SAMPLE_SCRIPT = [
    "Okay, I've tried nine of these. Nine.",
    "Most of them taste like wet cardboard with a personality crisis.",
    "But this one — Fernweh's slow-pulled cold brew — actually tastes like coffee.",
    "It's brewed for sixteen hours, no sugar, no weird oat-milk cosplay.",
    "And the can fits in a bike bottle holder, which, you know, matters.",
    "Use code MORNING for fifteen percent off your first three cans.",
    "I'll be honest — I bought a second case before this video finished editing.",
  ];

  const PRODUCTS = [
    { id: "p1", name: "Lumen — Vitamin C Serum 04", sku: "LM-VC04", thumb: "#c98b8b" },
    { id: "p2", name: "Lumen — Retinol Night Cream", sku: "LM-RT01", thumb: "#a47a7a" },
    { id: "p3", name: "Lumen — Hydrating Mist",     sku: "LM-HM02", thumb: "#d3a6a6" },
    { id: "p4", name: "Lumen — Eye Recovery Gel",   sku: "LM-ER03", thumb: "#b58a8a" },
  ];

  return {
    ads: fakeAds(20),
    sampleScript: SAMPLE_SCRIPT,
    products: PRODUCTS,
    BRANDS,
  };
})();
