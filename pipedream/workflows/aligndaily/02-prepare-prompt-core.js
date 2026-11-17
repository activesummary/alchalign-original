export default defineComponent({
  async run({ steps, $ }) {
    const b = steps.trigger.event.body;

const ASSETS = steps.pp_static_assets?.$return_value || {};
const {
  FLAVOR_PACKS, CUISINE_FAMILIES, GLOBAL_PANTRY, CUISINE_PANTRY,
  FLOW_BANK: FLOW_BANK_DATA, KEYSTONE_BANKS, SOY_POLICY,
  PROTEIN_SHAKES, EGGS_BY_CUISINE,
  BREAKFAST_PROTEIN_MIN, CULTURAL_PROFILES
} = ASSETS || {};

const norm = s => String(s||"").trim().toLowerCase();
const hasRegex = (arr = [], rx) => (arr || []).some(x => rx.test(String(x)));

const inList = (v, list = []) => {
  const nv = norm(v);
  for (const item of (list || [])) if (norm(item) === nv) return true;
  return false;
};

function seededRng(seedStr = "aligndaily") {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 2 ** 32;
}

function getDairyAllowance({ eatingPattern, foodRestrictions = [] }) {
  const pat = norm(eatingPattern);
  const dairyFree = hasRegex(foodRestrictions, /dairy\-?free|no\s*dairy|lactose/i);
  const allowed = pat !== "vegan" && !dairyFree;
  const cap = allowed ? 7 : 0;

  const reason =
    !allowed && pat === "vegan"   ? "vegan_pattern" :
    !allowed && dairyFree         ? "user_dairy_free" :
    allowed                       ? "allowed_simple" :
                                    "blocked";

  return { allowed, cap_per_week_breakfast: cap, reason };
}

function getSoyAllowance({ eatingPattern, foodRestrictions = [], cuisine = "" }) {
  const pat = norm(eatingPattern);
  const czn = norm(cuisine);
  const soyFree = hasRegex(foodRestrictions, /soy\-?free|no\s*soy/i);

  let proteinAllowed = !!(SOY_POLICY?.allow_in?.[pat]); 
  if (soyFree) proteinAllowed = false;
  if (!soyFree && inList(czn, SOY_POLICY?.staple_cuisines || [])) proteinAllowed = true;

  const proteinCap = proteinAllowed
    ? (inList(czn, SOY_POLICY?.staple_cuisines || []) ? SOY_POLICY?.caps?.staple_per_week : SOY_POLICY?.caps?.default_per_week)
    : 0;

  const condimentAllowed = !soyFree;

  return {
    protein_allowed: !!proteinAllowed,
    protein_cap_per_week: Number(proteinCap || 0),
    condiment_allowed: !!condimentAllowed,
    grocery_fallback: SOY_POLICY?.grocery_fallback,
    condiment_fallbacks: SOY_POLICY?.condiment_fallbacks || {}
  };
}

function getShakeAllowance({ eatingPattern, foodRestrictions = [] }) {
  const pat = norm(eatingPattern);
  const r = (foodRestrictions || []).map(x => norm(x));
  const soyFree   = r.some(x => /soy\-?free|no\s*soy/.test(x));
  const dairyFree = r.some(x => /dairy\-?free|no\s*dairy/.test(x));
  const vegan     = pat === "vegan";

  let powders = (PROTEIN_SHAKES?.powders?.[pat] || []).slice();
  if (vegan || dairyFree) powders = powders.filter(p => !/whey|casein/i.test(p));
  if (soyFree)            powders = powders.filter(p => !/soy/i.test(p));

  let liquids = [].concat(PROTEIN_SHAKES?.liquids?.nondairy || []);
  if (!vegan && !dairyFree) liquids = (PROTEIN_SHAKES?.liquids?.dairy || []).concat(liquids);

  return {
    powders,
    liquids,
    add_ins: PROTEIN_SHAKES?.add_ins_allowed || [],
    min_protein_g: PROTEIN_SHAKES?.min_protein_g || 30,
    per_week_cap_breakfast: PROTEIN_SHAKES?.per_week_cap_breakfast || 2
  };
}

function getCuisineProteins(cuisine) {
  const c = CUISINE_FAMILIES?.[norm(cuisine)];
  if (!c) return [];
  const families = Object.values(c.protein_families || {});
  return [...new Set(families.flat())];
}

function filterByDiet(items = [], { eatingPattern, foodRestrictions = [] } = {}) {
  const pat = norm(eatingPattern);
  const vegan = pat === "vegan";
  const vegetarian = pat === "vegetarian";
  const pesc = pat === "pescatarian";
  const dairyFree = hasRegex(foodRestrictions, /\b(?:dairy-?free|no\s*dairy)\b/i);
  const eggFree   = hasRegex(foodRestrictions, /\b(?:egg-?free|no\s*eggs?)\b/i);

  const R = {
    egg: /\begg(s)?\b/i,
    dairy: /\b(yogurt|cheese|kefir|milk|ricotta|mozzarella|feta|halloumi|labneh|skyr|cottage)\b/i,
    poultry: /\b(chicken|turkey)\b/i,
    redMeat: /\b(beef|veal|lamb)\b/i,
    pork: /\bpork\b/i,
    fish: /\b(white\s*fish|cod|hake|sole|tilapia|snapper|mahi|branzino|sea\s*bass|salmon|tuna|mackerel|sardine)\b/i,
    shellfish: /\b(shrimp|prawn|mussel|clam|scallop|oyster|crab|lobster|octopus|squid)\b/i
  };

  return (items || []).filter(x => {
    const s = String(x);
    if (vegan && (R.egg.test(s) || R.dairy.test(s) || R.poultry.test(s) || R.redMeat.test(s) || R.pork.test(s) || R.fish.test(s) || R.shellfish.test(s))) return false;
    if (vegetarian && (R.poultry.test(s) || R.redMeat.test(s) || R.pork.test(s) || R.shellfish.test(s) || R.fish.test(s))) return false;
    if (pesc && (R.poultry.test(s) || R.redMeat.test(s) || R.pork.test(s))) return false;
    if (dairyFree && R.dairy.test(s)) return false;
    if (eggFree && R.egg.test(s)) return false;
    return true;
  });
}

function eggsByCuisineSafe(cuisine, { eatingPattern, foodRestrictions = [] }) {
  const pat = norm(eatingPattern);
  const eggBanned = hasRegex(foodRestrictions, /\b(?:egg-?free|no\s*eggs?)\b/i);
  if (pat === "vegan" || eggBanned) return [];
  return EGGS_BY_CUISINE?.[norm(cuisine)] || [];
}

function makeDietSafeProteinShortlist(form, max = 12) {
  const raw = getCuisineProteins(form?.cuisine);
  const allowed = filterByDiet(raw, { eatingPattern: form?.eatingPattern, foodRestrictions: form?.foodRestrictions });
  return [...new Set(allowed)].slice(0, max);
}

const compiled = compileConstraints({
  foodRestrictions: b.foodRestrictions,
  foodPreferences:  b.foodPreferences,
  goal:             b.goal,
  equipment:        b.equipment,
  workoutRestrictions: b.workoutRestrictions,
  cuisine:          b.cuisine,
  eatingPattern:    b.eatingPattern
});
            
    function compileConstraints(form) {
  const norm = s => String(s||"").trim().toLowerCase();
  const arr  = v => Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
  const flat = list => list.map(norm).filter(Boolean);

  const eatingPattern = norm((arr(form.eatingPattern)[0] || ""));

      const DIET_PREF_MAP = [[/^vegan$/, 'vegan'], [/^vegetarian$/, 'vegetarian'], [/^pescatarian$/, 'pescatarian']];
      const FOOD_RESTRICTION_MAP = [
        [/(no\s*)?red\s*meat|^no\s*meat$|^meat\-?free$/, ['beef','pork','lamb','poultry']],
        [/no\s*pork|pork\-?free/, ['pork']],
        [/no\s*beef|beef\-?free|red\s*meat\-?free/, ['beef']],
        [/no\s*lamb|lamb\-?free/, ['lamb']],
        [/no\s*poultry|chicken\-?free|turkey\-?free/, ['poultry']],
        [/dairy\-?free|no\s*dairy|lactose/i, ['dairy']],
        [/egg\-?free|no\s*eggs?/i, ['eggs']],
        [/shellfish\-?free|no\s*shell\s*fish|no\s*shrimp|no\s*crab|no\s*lobster/i, ['shellfish']],
        [/fish\-?free|no\s*fish/i, ['fish']],
        [/gluten\-?free/i, ['gluten']],
        [/soy\-?free/i, ['soy']],
        [/nut\-?free|no\s*nuts/i, ['nuts']],
        [/nightshade\-?free/i, ['nightshades']],
        [/no\s*added\s*sugar|low\s*sugar|minimal\s*sugar/i, ['added_sugar']],
        [/low\s*sodium|no\s*sodium|salt\s*restricted/i, ['sodium']],
        [/low\s*fodmap/i, ['high_fodmap']],
        [/no\s*processed\s*meat/i, ['processed_meat']],
        [/no\s*spicy|mild\s*only/i, ['spicy','mild']]
      ];
      const FOOD_PREFERENCE_MAP = [
        [/high\s*protein/i, ['pref_high_protein']],
        [/low\s*carb/i, ['pref_low_carb']],
        [/low\s*fat/i, ['pref_low_fat']],
        [/whole\s*foods|anti[-\s]*inflammatory|gut[-\s]*friendly/i, ['pref_whole_foods']],
        [/quick\s*prep|fast|minimal\s*prep/i, ['pref_quick']],
        [/fermented/i, ['pref_fermented']],
        [/seasonal/i, ['pref_seasonal']],
        [/bone\s*broth/i, ['pref_bone_broth']],
        [/glucose|blood\s*sugar/i, ['pref_glucose_stable']],
        [/vegan/i, ['vegan']],
        [/vegetarian/i, ['vegetarian']],
        [/pescatarian/i, ['pescatarian']],
      ];
      const WORKOUT_RESTRICTION_MAP = [
        [/no\s*jump|low\s*impact|easily\s*winded|breathing\s*issues|chronic\s*fatigue/i, ['no_jump','low_impact']],
        [/avoid\s*kneel|knee\s*replacement|kneel|kneeling|bad\s*knees?/i, ['no_kneel','knee_sensitive']],
        [/avoid\s*overhead|shoulder|rotator\s*cuff|wrist\s*strain|sensitive\s*wrists/i, ['no_overhead','wrist_sensitive','shoulder_sensitive']],
        [/(hip|hips)/i, ['hip_cautious']],
        [/back|sciatica/i, ['back_sensitive']],
        [/no\s*floor|pregnancy/i, ['no_floor','pregnancy_safe']],
        [/balance\s*issues/i, ['balance_care']],
        [/post[-\s]*surgery|recovery/i, ['post_surgery']]
      ];
      const EQUIPMENT_CANON = {
        'dumbbells':'dumbbells','kettlebells':'kettlebells','resistance bands':'bands',
        'pull-up bar':'pullup_bar','sliders':'sliders','trx straps':'trx','treadmill':'treadmill',
        'stationary bike':'bike','rowing machine':'rower','barbell':'barbell','foam roller':'roller',
        'stability ball':'stability_ball','jump rope':'jump_rope','medicine ball':'med_ball',
        'yoga mat':'yoga_mat','none / bodyweight only':'bodyweight','step platform':'step',
        'plyo box':'box','cable machine':'cable','ankle weights':'ankle_weights','bench':'bench',
        'leg press':'leg_press','leg curl':'leg_curl','leg extension':'leg_extension','smith machine':'smith_machine','lat pulldown':'lat_pulldown','seated row':'seated_row'
      };

  const restrictions = flat(arr(form.foodRestrictions));
  const preferences  = flat(arr(form.foodPreferences));
  const goal         = (arr(form.goal)[0]||"").toString();
  const equipInput   = flat(arr(form.equipment));
  const wrxRestrict  = flat(arr(form.workoutRestrictions));

  const bans = new Set();
  const prefs = new Set();
  const workout = new Set();

  let dietModeFromPrefs = null;
  for (const [rx, tag] of DIET_PREF_MAP) {
    if (rx.test(preferences.join(' '))) { dietModeFromPrefs = tag; break; }
  }

  const allText  = restrictions.join(' ');
  const prefText = preferences.join(' ');

  for (const [rx, tagList] of FOOD_RESTRICTION_MAP) if (rx.test(allText)) tagList.forEach(t => bans.add(t));
  for (const [rx, tagList] of FOOD_PREFERENCE_MAP)  if (rx.test(prefText)) tagList.forEach(t => prefs.add(t));

  const wrxText = wrxRestrict.join(' ');
  for (const [rx, tagList] of WORKOUT_RESTRICTION_MAP) if (rx.test(wrxText)) tagList.forEach(t => workout.add(t));

  let finalDiet;
  if (eatingPattern === "vegan" || eatingPattern === "vegetarian" || eatingPattern === "pescatarian" || eatingPattern === "omnivore") {
    finalDiet = eatingPattern || "omnivore";
  } else {
    const wantsVegan =
      dietModeFromPrefs === 'vegan' ||
      /vegan/i.test(prefText) ||
      ['beef','pork','lamb','poultry','fish','shellfish','eggs','dairy'].every(k => bans.has(k));

    const wantsVegetarian = !wantsVegan && (
      dietModeFromPrefs === 'vegetarian' ||
      /vegetarian/i.test(prefText) ||
      ['beef','pork','lamb','poultry','fish','shellfish'].every(k => bans.has(k))
    );

    const wantsPesc = !wantsVegan && !wantsVegetarian && (
      dietModeFromPrefs === 'pescatarian' ||
      /pescatarian/i.test(prefText) ||
      ['beef','pork','lamb','poultry'].every(k => bans.has(k))
    );

    finalDiet = wantsVegan ? 'vegan' : wantsVegetarian ? 'vegetarian' : wantsPesc ? 'pescatarian' : 'omnivore';
  }

  if (finalDiet === 'vegan')       ['beef','pork','lamb','poultry','fish','shellfish','eggs','dairy'].forEach(k => bans.add(k));
  else if (finalDiet === 'vegetarian') ['beef','pork','lamb','poultry','fish','shellfish'].forEach(k => bans.add(k));
  else if (finalDiet === 'pescatarian') ['beef','pork','lamb','poultry'].forEach(k => bans.add(k));

  const style = {
    mild: bans.has('spicy'),
    lean: /fat|lose|cut|lean/i.test(goal) || /health/i.test(String(form.cuisine||"")),
    raw_only: /raw\s*food/i.test(String(form.cuisine||'')) || prefs.has('pref_raw') || false,
    lower_sodium: bans.has('sodium') || false,
    low_added_sugar: bans.has('added_sugar') || prefs.has('pref_glucose_stable') || false,
  };

  const equipment = [];
  for (const e of equipInput) {
    const key = EQUIPMENT_CANON[e] || EQUIPMENT_CANON[e?.toLowerCase?.()] || e;
    if (key && !equipment.includes(key)) equipment.push(key);
  }

  return {
    diet_mode: finalDiet,             
    bans: Array.from(bans),
    prefs: Array.from(prefs),
    workout_flags: Array.from(workout),
    style_modifiers: style,
    equipment
  };
}

const req = steps.trigger?.event?.body || {};
const fr = (req.foodRestrictions || []).map(s => String(s||"").toLowerCase());

function sanitize(text) {
      const flat = Array.isArray(text) ? text.join(", ") : text;
      return (flat || "").toString().replace(/[^\w\s\-,.'’]/g, "").trim();
    }
    const formatNumeric = (value, unit) => value ? `${value} ${unit}` : "not provided";
    const toNumber = v => Number(String(v||"").replace(/[^\d.]/g,"")) || 0;
    const lbToKg = lb => lb ? Math.round(lb * 0.453592 * 10)/10 : 0;
    const inToCm = inch => inch ? Math.round(inch * 2.54) : 0;
    function parseHeight(h) {
      const s = String(h||"").trim();
      if (/cm/i.test(s)) return { cm: toNumber(s) };
      const feetIn = s.replace(/[’”″]/g,"'").match(/(\d+)\s*'?(\d+)?/);
      if (feetIn) {
        const ft = toNumber(feetIn[1]);
        const inch = toNumber(feetIn[2]||0);
        return { cm: inToCm(ft*12 + inch) };
      }
      const n = toNumber(s);
      if (n>48 && n<90) return { cm: inToCm(n) };
      return { cm: 0 };
    }
    function maintenanceKcal({gender, cm, kg, age}) {
      const s = (gender||"").toLowerCase();
      const base = (10*kg) + (6.25*cm) - (5*age) + (s==="female" ? -161 : 5);
      return Math.round(base * 1.35);
    }
    function goalAdjust(maint, goal) {
      const g = (goal||"").toLowerCase();
      if (/fat|lose|cut|lean/.test(g)) return Math.round(maint * 0.85);
      if (/gain|muscle|bulk|hypert/.test(g)) return Math.round(maint * 1.08);
      if (/recomp|tone/.test(g)) return Math.round(maint * 0.98);
      return maint;
    }
    function proteinTarget({kg, age, goal}) {
      const g = (goal||"").toLowerCase();
      let gPerKg = /gain|muscle|recomp/.test(g) ? 2.0 : /fat|lose|cut|lean/.test(g) ? 1.8 : 1.6;
      if (age>=55) gPerKg = Math.max(gPerKg, 1.6);
      return Math.round(kg * gPerKg);
    }
    function splitTemplate(days) {
      if (days<=2) return "FB,FB";
      if (days===3) return "ULF";
      if (days===4) return "ULUF";
      if (days===5) return "PPL+Full";
      return "Custom-Rotate";
    }
    function safeList(arr){ return (Array.isArray(arr)?arr:[arr].filter(Boolean)).map(s=>String(s||"").trim()).filter(Boolean); }

    function filterByExcludes(items = [], excludes = []) {
      const keys = new Set([...(excludes || []).map(s => String(s).toLowerCase())]);
      const regs = [];
      if (keys.has('beef')) regs.push(/beef|steak|ground\s*beef/i);
      if (keys.has('pork')) regs.push(/pork/i);
      if (keys.has('lamb')) regs.push(/lamb/i);
      if (keys.has('poultry')) regs.push(/chicken|turkey/i);
      if (keys.has('fish')) regs.push(/salmon|tuna|cod|mackerel|sardine|yellowtail|branzino|white\s*fish/i);
      if (keys.has('shellfish')) regs.push(/shrimp|scallop|squid|octopus|mussels|clams|crab|lobster/i);
      if (keys.has('eggs')) regs.push(/egg(s)?/i);
      if (keys.has('dairy')) regs.push(/ricotta|mozzarella|parmesan|parmigiano|pecorino|yogurt|halloumi|cheese|butter/i);
      if (keys.has('gluten')) regs.push(/wheat|barley|farro|pasta|bread|bulgur/i);
      if (keys.has('soy')) regs.push(/tofu|tempeh|soy\b|edamame|natto|miso|\bsoy\s*sauce\b|tamari|shoyu/i);
      if (keys.has('nuts')) regs.push(/almonds?|walnuts?|pecans?|cashews?|peanuts?/i);
      if (keys.has('nightshades')) regs.push(/\b(tomato(es)?|eggplant|bell\s*pepper|paprika|chili|chile|tomatillo)\b/i);
      if (!regs.length) return items.slice();
      return items.filter(x => !regs.some(rx => rx.test(String(x))));
    }
 
     const CUISINE_ALIASES = {
      "health conscious":"health conscious"
    };
    
    function normalizeCuisine(raw){
    const t = String(raw||"").trim().toLowerCase();
    return (CUISINE_ALIASES && CUISINE_ALIASES[t]) ? CUISINE_ALIASES[t] : t;
    }

    function inferMildPreference(str=""){ return /no spicy|mild only/i.test(str); }
    function filteredFlavorPack(pack, excludes=[]){
      const ban = (excludes||[]).map(s=>String(s||"").toLowerCase());
      const dropIf = (item) => ban.some(b => item.toLowerCase().includes(b));
      const clean = {};
      for (const [k, arr] of Object.entries(pack||{})) clean[k] = (arr||[]).filter(x => !dropIf(x));
      return clean;
    }
    function deriveStyleModifiers(rawCuisine, goalText){
      const mods = { lean:false, low_added_sugar:true, lower_sodium:true, raw_only:false, mild:false };
      if (String(rawCuisine||"").toLowerCase().includes("health")) mods.lean = true;
      if (/fat|lose|cut|lean/i.test(String(goalText||""))) mods.lean = true;
      if (normalizeCuisine(rawCuisine)==="raw_food") mods.raw_only = true;
      return mods;
    }
  function gentleCuisineTag(tag){ return tag; }
   
    // ---------- normalize inputs ----------
    const workoutDaysRaw = b["workoutDays[]"] || b.workoutDays || [];
    const workoutDaysArray = Array.isArray(workoutDaysRaw) ? workoutDaysRaw : [workoutDaysRaw];
    const workoutDaysString = workoutDaysArray.join(', ');
    const goalText = sanitize(Array.isArray(b.goal) ? b.goal[0] : b.goal || "");
    const locationText = sanitize(Array.isArray(b.location) ? b.location[0] : b.location || "");
    let equipmentArray = Array.isArray(b.equipment) ? b.equipment : [b.equipment || ""];
    if (equipmentArray.length > 5) equipmentArray = equipmentArray.slice(0, 5);
    let workoutRestrictionsArray = Array.isArray(b.workoutRestrictions) ? b.workoutRestrictions : [b.workoutRestrictions || ""];
    if (workoutRestrictionsArray.length > 5) workoutRestrictionsArray = workoutRestrictionsArray.slice(0, 5);
    let workoutPreferencesArray = Array.isArray(b.workoutPreferences) ? b.workoutPreferences : [b.workoutPreferences || ""];
    if (workoutPreferencesArray.length > 5) workoutPreferencesArray = workoutPreferencesArray.slice(0, 5);
    let foodRestrictionsArray = Array.isArray(b.foodRestrictions) ? b.foodRestrictions : [b.foodRestrictions || ""];
    if (foodRestrictionsArray.length > 5) foodRestrictionsArray = foodRestrictionsArray.slice(0, 5);
    let foodPreferencesArray = Array.isArray(b.foodPreferences) ? b.foodPreferences : [b.foodPreferences || ""];

    const a = parseInt(b.age) || 0;
    const duration = parseInt(b.duration) || 0;

const foodRestrict = safeList(foodRestrictionsArray).slice(0,5);
const foodPrefs    = safeList(foodPreferencesArray).slice(0,5);
    
const bans = new Set(compiled.bans || []);
const dairyBanned     = bans.has("dairy");
const eggsBanned      = bans.has("eggs");
const poultryBanned   = bans.has("poultry");
const porkBanned      = bans.has("pork");
const beefBanned      = bans.has("beef");
const fishBanned      = bans.has("fish");
const shellfishBanned = bans.has("shellfish");
const soyBanned       = bans.has("soy");
const meatAllBanned   = poultryBanned && porkBanned && beefBanned;
    
    // ---------- time-split ----------
    function classifyGoals(goalText = "") {
      const g = goalText.toLowerCase();
      return {
        isMuscle: /muscle|strength|build|bulk|resistance|toning|tone|hypertrophy/.test(g),
        isWeightLoss: /lose|weight loss|fat loss|lean|cut|burn fat|drop pounds|shred/.test(g),
        isEndurance: /run|marathon|5k|10k|bike|triathlon|swim|cardio|aerobic/.test(g),
        isEnergy: /energy|fatigue|burnout|vitality|tired|exhaust|restore|regain/.test(g),
        isBoneDensity: /bone|osteoporosis|fracture|density|strengthen bones/.test(g),
        isFlexibility: /mobility|flexibility|yoga|stretch|range of motion/.test(g),
        isPainRelief: /pain|injury|joint|back|knee|shoulder|rehab|recover|physical therapy/.test(g),
        isStressRelief: /stress|anxiety|mental|nervous system|calm|regulate|relax/.test(g)
      };
    }
    function getWorkoutTimeSplitV2(age, fitness, goalText, totalMinutes) {
      const a = parseInt(age) || 0;
      const duration = parseInt(totalMinutes) || 0;
      const goalFlags = classifyGoals(goalText);
      const fitnessLevel = (fitness || "").toLowerCase();

      let warmUpRatio = 0.10, foundationRatio = 0.40, coreRatio = 0.25, finisherRatio = 0.25;
      if (fitnessLevel === "beginner") { warmUpRatio+=0.05; foundationRatio-=0.05; finisherRatio-=0.05; coreRatio+=0.05; }
      else if (fitnessLevel === "intermediate") { warmUpRatio+=0.02; foundationRatio+=0.02; finisherRatio-=0.02; }
      else if (fitnessLevel === "advanced") { foundationRatio+=0.05; coreRatio-=0.05; }

      if (goalFlags.isWeightLoss || goalFlags.isEndurance) { finisherRatio+=0.05; foundationRatio+=0.05; coreRatio-=0.05; }
      if (goalFlags.isEnergy || a >= 55) { warmUpRatio+=0.05; coreRatio+=0.05; finisherRatio-=0.05; }
      if (goalFlags.isFlexibility) { coreRatio+=0.10; finisherRatio-=0.10; }
      if (goalFlags.isBoneDensity) { foundationRatio+=0.10; finisherRatio-=0.05; coreRatio-=0.05; }
      if (goalFlags.isPainRelief) { coreRatio+=0.10; foundationRatio-=0.05; finisherRatio-=0.05; }
      if (goalFlags.isStressRelief) { warmUpRatio+=0.05; coreRatio+=0.05; finisherRatio-=0.05; }

      const totalRatio = warmUpRatio + foundationRatio + coreRatio + finisherRatio;
      warmUpRatio/=totalRatio; foundationRatio/=totalRatio; coreRatio/=totalRatio; finisherRatio = 1 - (warmUpRatio + foundationRatio + coreRatio);

      const warmUp = Math.round(duration * warmUpRatio);
      const foundation = Math.round(duration * foundationRatio);
      const core = Math.round(duration * coreRatio);
      const finisher = duration - warmUp - foundation - core;
      return { warmUp, foundation, core, finisher };
    }
    const { warmUp, foundation, core, finisher } = getWorkoutTimeSplitV2(a, b.fitnessLevel, goalText, duration);

    const daysCount = workoutDaysArray.filter(Boolean).length || 0;
    const split = splitTemplate(daysCount);
    
    const mild = inferMildPreference([...foodRestrict, ...foodPrefs].join(" "));
    const cuisineTagResolved = gentleCuisineTag(normalizeCuisine(b.cuisine), mild);
let styleMods = { ...deriveStyleModifiers(b.cuisine, goalText), ...compiled.style_modifiers };
if (mild) styleMods.mild = true; // uses mild from step #2

const CULTURE = (ASSETS?.CULTURAL_PROFILES && ASSETS.CULTURAL_PROFILES[cuisineTagResolved]) || null;
const cultureFidelity = Number(CULTURE?.fidelity ?? 0.75);

const culturalHints = CULTURE ? {
  staples: (CULTURE.staples || []).slice(0, 10),
  proteins: (CULTURE.proteins || []).slice(0, 10),
  flavor_base: (CULTURE.flavor_base || []).slice(0, 10),
  meal_patterns: {
    breakfast: (CULTURE.meal_patterns?.breakfast || []).slice(0, 6),
    lunch:     (CULTURE.meal_patterns?.lunch || []).slice(0, 6),
    dinner:    (CULTURE.meal_patterns?.dinner || []).slice(0, 6),
    snacks:    (CULTURE.meal_patterns?.snacks || []).slice(0, 6)
  },
  forbidden_crossovers: (CULTURE.forbidden_crossovers || []).slice(0, 8)
} : null;
  
    const age = parseInt(b.age)||0;
    const gender = sanitize(b.gender);
    const heightParsed = parseHeight(b.height);
    const weightLb = toNumber(b.weight);
    const kg = lbToKg(weightLb);
    const cm = heightParsed.cm || toNumber(b.height);
    const maint = maintenanceKcal({ gender, cm, kg, age });
    const calTarget = goalAdjust(maint, goalText);
    const proteinG = proteinTarget({ kg, age, goal: goalText });

    const wrxRestrict = safeList(workoutRestrictionsArray).slice(0,5);
    const wrxPrefs = safeList(workoutPreferencesArray).slice(0,5);
    const constraints = { no_overhead: /overhead/i.test(wrxRestrict.join(" ")), no_deep_knee: /(deep\s*knee|kneel|full\s*squat)/i.test(wrxRestrict.join(" ")) };
    for (const tag of compiled.workout_flags) constraints[tag] = true;
    
function guardrailsFrom(constraints = {}) {
  const g = { banned: [], prefer: [], notes: [] };

  if (constraints.no_jump || constraints.knee_sensitive || constraints.post_surgery) {
    g.banned.push("jumping jacks","box jumps","burpees","jump squats","jump lunges","running");
    g.prefer.push("marching jacks","step-ups to high box (low height)","elevated walk-outs","tempo box squats","incline walk","farmer carry (light)");
    g.notes.push("No jumping/plyometrics; quiet, controlled landings.");
  }
  if (constraints.knee_sensitive || constraints.no_kneel || constraints.no_deep_knee) {
    g.banned.push("deep squats","walking lunges","jump lunges","pistol squats","deep wall sits","kneeling exercises");
    g.prefer.push("box squat to high box","supported split-stance hip hinge","low step-ups","supine glute bridge","good mornings (light)");
    g.notes.push("Avoid deep knee flexion; prefer hinges/box-supported; no kneeling.");
  }
  if (constraints.no_overhead || constraints.shoulder_sensitive) {
    g.banned.push("overhead press","snatch/jerk","kipping","handstand push-ups");
    g.prefer.push("landmine or incline press","neutral-grip row","band face pulls","scapular plane raises");
    g.notes.push("No overhead pressing; neutral grips in scapular plane.");
  }
  if (constraints.back_sensitive) {
  g.banned.push("loaded Jefferson curl","heavy good mornings","heavy RDLs","barbell deadlift","kettlebell swings","twisting sit-ups","any loaded spinal flexion");
  g.prefer.push("supported split squats (bench/chair assist)","box squat to bench","hip hinge with dowel (neutral spine)","glute bridge / hip thrust (light)","bird-dog","dead bug","Pallof press (anti-rotation)","machine row or cable row (supported chest pad)");
  g.notes.push("Keep spine neutral; reduce hinge depth; choose supported positions; avoid twisting under load.");
}
  if (constraints.wrist_sensitive) {
    g.banned.push("long holds with extended wrists","handstand holds");
    g.prefer.push("neutral-handle push-ups","forearm plank","DB handles for neutral wrist");
    g.notes.push("Favor neutral wrists; forearm planks.");
  }
  if (constraints.no_floor) {
    g.banned.push("prone/supine floor work");
    g.prefer.push("standing/wall/bench-supported variations");
    g.notes.push("Avoid floor-based positions; use standing/wall variants.");
  }
  if (constraints.balance_care) {
    g.prefer.push("wall/chair support for single-leg work","reduced ROM and tempo");
    g.notes.push("Prioritize stability; add external support freely.");
  }

  g.banned = Array.from(new Set(g.banned)).filter(Boolean);
  g.prefer = Array.from(new Set(g.prefer)).filter(Boolean);
  g.notes  = Array.from(new Set(g.notes)).filter(Boolean);
  return g;
}
const GUARDS = guardrailsFrom(constraints);
    
const GYM_DEFAULTS = [
  "light_dumbbells",
  "moderate_dumbbells",
  "heavy_dumbbells",
  "barbell",
  "kettlebells",
  "medicine_ball",

  "flat_bench",
  "incline_bench",
  "adjustable_bench",
  "squat_rack_or_power_rack",
  "smith_machine",

  "cable_machine",
  "lat_pulldown",
  "seated_row",

  "leg_press",
  "leg_curl_machine",
  "leg_extension_machine",
  "hip_abductor_machine",
  "hip_adductor_machine",

  "stability_ball",
  "foam_roller",
  "step_or_box",
  "trx_or_suspension_trainer",
  "pullup_bar",

  "treadmill",
  "stationary_bike",
  "rower",
  "elliptical",
  "stair_climber"
];
    const isGym = /gym/i.test(locationText);
    if (isGym) {
      const userGear = (compiled.equipment && compiled.equipment.length) ? compiled.equipment : equipmentArray;
      const hasUserGear = Array.isArray(userGear) && userGear.filter(Boolean).length > 0;
      if (!hasUserGear) compiled.equipment = GYM_DEFAULTS.slice(0, 12);
    }
    const equipmentList = (compiled.equipment || []).slice(0, 12);
    const PANTRY_GLOBAL = filterByExcludes(
      [
        ...(GLOBAL_PANTRY.aromatics || []),
        ...(GLOBAL_PANTRY.acids || []),
        ...(GLOBAL_PANTRY.oils || []),
        ...(GLOBAL_PANTRY.starches || []),
        ...(GLOBAL_PANTRY.herbs_spices || []),
        ...(GLOBAL_PANTRY.add_ins || []),
      ],
      foodRestrict
    );

   const PANTRY_CUISINE = filterByExcludes(
  (CUISINE_PANTRY?.[cuisineTagResolved] || []),
  foodRestrict
);
    function isYes(v){ return String(v||"").trim().toLowerCase()==="yes"; }
    const keystoneEnabled = isYes(Array.isArray(b.keystone) ? b.keystone[0] : b.keystone);

    function keystonePool(goal="") {
      const g = goal.toLowerCase();
      if (/muscle|gain|strength|hypertrophy/.test(g)) return KEYSTONE_BANKS.muscle_strength || [];
      if (/fat|loss|cut|lean|shred/.test(g)) return KEYSTONE_BANKS.fat_loss_leanness || [];
      if (/recomp|tone|toning/.test(g)) return KEYSTONE_BANKS.recomposition_tone || [];
      if (/energy|fatigue|burnout|vital/.test(g)) return KEYSTONE_BANKS.energy_burnout || [];
      if (/stress|anxiety|nervous|calm|regulate/.test(g)) return KEYSTONE_BANKS.stress_nervous || [];
      if (/pain|injury|joint|back|knee|shoulder|rehab|recover|physical therapy/.test(g)) return KEYSTONE_BANKS.pain_joint_rehab || [];
      if (/run|marathon|5k|10k|bike|triathlon|swim|cardio|aerobic/.test(g)) return KEYSTONE_BANKS.endurance_cardio || [];
      if (/bone|osteoporosis|fracture|density/.test(g)) return KEYSTONE_BANKS.bone_density || [];
      if (/mobility|flexibility|range of motion|yoga|stretch/.test(g)) return KEYSTONE_BANKS.mobility_flexibility || [];
      if (/glucose|blood\s*sugar|insulin|metabolic/.test(g)) return KEYSTONE_BANKS.glucose_stability || [];
      return KEYSTONE_BANKS.universal || [];
    }

    const isVegMode = compiled.diet_mode === "vegan" || compiled.diet_mode === "vegetarian";
    const seedHint = String(b.userId||b.email||"") + "|" + String(b.weekStart||"");    
    const keystone_variants = keystoneEnabled ? keystonePool(goalText) : [];
    const keystones_by_day = keystoneEnabled ? selectWeeklyKeystones(goalText, seedHint) : [];

    function selectWeeklyKeystones(goal="", seedHint="") {
      const pool = keystonePool(goal);
      const universal = keystonePool("universal");
      const bank = Array.from(new Set([...pool, ...universal]));

      const themes = [
        { day: "Monday",    key:"placement",  rx: /(set|place|put|block|book|prep|batch|note|decide|kit|schedule|calendar|make tomorrow)/i },
        { day: "Tuesday",   key:"breath",     rx: /(inhale|exhale|breath|nasal|box|slow|five slow|exhale-longer|shoulders down)/i },
        { day: "Wednesday", key:"protein",    rx: /(protein|25–30|≥20|palm|anchor|first meal|before coffee|eat within 60)/i },
        { day: "Thursday",  key:"mobility",   rx: /(stretch|open book|hips|ankles|hang|lat|hinge|car|carries|stance|balance)/i },
        { day: "Friday",    key:"environment",rx: /(night shift|lamps|close the kitchen|sweets out of sight|fruit bowl|phone|screens|light|visible)/i },
        { day: "Saturday",  key:"sleep",      rx: /(wind[- ]?down|before bed|90 minutes|warm shower|dim|no doom|timer at night)/i },
        { day: "Sunday",    key:"consistency",rx: /(book|block|tomorrow|plan|smallest win|finish it completely|log|note)/i },
      ];

      const rng = seededRng(`${seedHint}|ks`);
      const used = new Set();
      const pickFrom = (arr) => {
        const candidates = arr.filter(x => !used.has(x));
        if (!candidates.length) return null;
        const idx = Math.floor(rng() * candidates.length);
        const v = candidates[idx];
        used.add(v);
        return v;
      };

      const picks = [];
      for (const t of themes) {
        const themed = bank.filter(x => t.rx.test(x));
        let line = pickFrom(themed);
        if (!line) line = pickFrom(bank);
        if (!line) line = bank[Math.floor(rng()*bank.length)];
        picks.push(line);
      }
      return picks;
    }

function pickFlowproofingTips() {
  const bank = Array.isArray(FLOW_BANK_DATA) ? FLOW_BANK_DATA.slice() : [];
  if (!bank.length) return [];
  return bank.sort(() => Math.random() - 0.5)
             .slice(0, 4)
             .map(x => x.t.trim());
}
const flowproofing = pickFlowproofingTips();
const flowproofing_html = `
<div class="flowproofing">
  <h2>Flowproofing</h2>
  ${flowproofing.map(t => `<div class="note-tip">${t}</div>`).join("")}
</div>`.trim();

const dairyPolicy = getDairyAllowance({
  eatingPattern: compiled.diet_mode,
  foodRestrictions: foodRestrict,
  cuisine: cuisineTagResolved
});
const dairyEffectivelyBanned = !dairyPolicy.allowed;

const soyAllowance = getSoyAllowance({
  eatingPattern: compiled.diet_mode,
  foodRestrictions: foodRestrict,
  cuisine: cuisineTagResolved
});

const basePack   = (FLAVOR_PACKS?.[cuisineTagResolved]) || (FLAVOR_PACKS?.mediterranean) || {};
const flavorPack = filteredFlavorPack(basePack, foodRestrict);

const isPesca = compiled.diet_mode === "pescatarian";

const protein_pool = makeDietSafeProteinShortlist({
  cuisine: cuisineTagResolved,
  eatingPattern: compiled.diet_mode,
  foodRestrictions: foodRestrict
});
      
const families = CUISINE_FAMILIES[cuisineTagResolved]?.protein_families || {};
    
let familiesPreferred = isVegMode
  ? ["dairy_high_protein", "soy_legumes", "legumes", "nuts_seeds"]
  : isPesca
    ? ["dairy_high_protein", "fish_light", "legumes", "nuts_seeds"]
    : ["dairy_high_protein", "poultry_lean_breakfast", "legumes", "nuts_seeds"];

const shakeAllowance = getShakeAllowance({
  eatingPattern: compiled.diet_mode,
  foodRestrictions: foodRestrict
});
  
const variety_caps = {
  per_protein_max: 2,
  soy_weekly_max: soyAllowance.protein_allowed ? soyAllowance.protein_cap_per_week : 0,
  min_distinct_primary_proteins: (isVegMode ? 4 : 5),
  dominant_spice_max_per_week: 2,

  breakfast_egg_max: eggsBanned ? 0 : 3,
  breakfast_non_egg_min: eggsBanned ? 7 : 3,
  breakfast_shake_max: 2,

  allow_breakfast_meat: !isVegMode && !meatAllBanned,
  breakfast_meat_max: (!isVegMode && !meatAllBanned) ? 2 : 0,

  allow_breakfast_seafood: (isPesca || cuisineTagResolved === "japanese") && !fishBanned && !shellfishBanned,
  breakfast_seafood_max: ((isPesca || cuisineTagResolved === "japanese") && !fishBanned && !shellfishBanned) ? 1 : 0
};

const soy_policy = {
  protein_allowed: soyAllowance.protein_allowed,
  protein_cap_per_week: soyAllowance.protein_cap_per_week,
  condiment_allowed: soyAllowance.condiment_allowed,
  condiment_fallbacks: soyAllowance.condiment_fallbacks
};

const breakfast_policy = {
  protein_floor_g: 30,
  families_preferred: familiesPreferred,  
  exemplars: {
    dairy_high_protein: dairyEffectivelyBanned ? [] : ["Greek yogurt","skyr","cottage cheese","labneh (unsweetened)"],
    poultry_lean_breakfast: (poultryBanned || !variety_caps.allow_breakfast_meat) ? [] : ["turkey sausage (lean)","chicken sausage (lean)"],
    fish_light: (!variety_caps.allow_breakfast_seafood) ? [] : ["grilled salmon (Japanese set)","smoked white fish (light)"],
    soy_legumes: soyBanned ? [] : ["tofu scramble","tempeh hash","unsweetened soy yogurt"],
    legumes: ["black-eyed peas bowl","lentil breakfast bowl"],
    nuts_seeds: ["chia + plant yogurt parfait","nuts + fruit cup"],
  },
  shake_bases: shakeAllowance.powders,
  shake_liquids: shakeAllowance.liquids,
  shake_min_protein_g: shakeAllowance.min_protein_g,
  shake_cap_per_week: shakeAllowance.per_week_cap_breakfast
};
    
const SPEC = {
  profile: { age, gender: sanitize(b.gender), ht_cm: cm, wt_kg: kg, level: sanitize(b.fitnessLevel) },
  goal:    { type: goalText.toLowerCase(), cal_target: calTarget, protein_g: proteinG },
  training: {
    days: daysCount,
    minutes: duration,
    split, 
    blocks: { warmup: warmUp, foundation, stability_core: core, finisher_or_reset: finisher },
    constraints,               
    equipment: equipmentList,    
    style_bias: wrxPrefs,        
    location: locationText.toLowerCase(),
    workout_day_names: workoutDaysArray
  },
  food: {
    cuisine: cuisineTagResolved, 
    excludes: foodRestrict,      
    prefs: foodPrefs,           
    flavor_pack: flavorPack,     
    style_modifiers: styleMods,  
    protein_pool,                
    families,                    
    pantry: PANTRY_GLOBAL,
    cuisine_pantry: PANTRY_CUISINE,
    culture: {
      cuisine: cuisineTagResolved,
      fidelity: cultureFidelity,          
      hints: culturalHints                
    },
    dairy_policy: dairyPolicy,   
    strict_mode: false,
    allow_improv: true,
    variety_caps,                
    soy_policy,                 
    breakfast_policy             
  },
  flags: {
    breakfast_requires_protein: true,
    age55_protein_floor: age >= 55
  },
  extras: {
    flowproofing,               
    keystone_variants,           
    keystones_by_day             
  }
};
  
SPEC.food.dairy_policy = dairyPolicy;
    
SPEC.food.soy_policy = {
  protein_allowed: !!soyAllowance.protein_allowed,
  protein_cap_per_week: Number(soyAllowance.protein_cap_per_week || 0),
  condiment_allowed: !!soyAllowance.condiment_allowed,
  condiment_fallbacks: soyAllowance.condiment_fallbacks || {}
};
    if (keystone_variants?.length) SPEC.extras.keystone_variants = keystone_variants;
    if (keystones_by_day?.length === 7) SPEC.extras.keystones_by_day = keystones_by_day;

SPEC.training.guardrails = {
  banned_moves: GUARDS.banned,
  preferred_swaps: GUARDS.prefer
};

const eggExemplars = eggsByCuisineSafe(
  cuisineTagResolved,
  { eatingPattern: compiled.diet_mode, foodRestrictions: foodRestrict }
);
    
if (dairyEffectivelyBanned) familiesPreferred = familiesPreferred.filter(f => f !== "dairy_high_protein");
if (soyBanned)   familiesPreferred = familiesPreferred.filter(f => f !== "soy_legumes");
if (poultryBanned || !SPEC.food.variety_caps.allow_breakfast_meat)
  familiesPreferred = familiesPreferred.filter(f => f !== "poultry_lean_breakfast");
if (!SPEC.food.variety_caps.allow_breakfast_seafood)
  familiesPreferred = familiesPreferred.filter(f => f !== "fish_light");

const liquidsFinal = dairyPolicy.allowed
  ? (shakeAllowance.liquids || [])
  : (shakeAllowance.liquids || []).filter(x => !/^milk$/i.test(String(x || "")));
  
SPEC.food.breakfast_policy = {
  protein_floor_g: Number(BREAKFAST_PROTEIN_MIN || 30),
  families_preferred: Array.isArray(familiesPreferred) ? familiesPreferred : [],
  exemplars: {
    eggs_traditional: Array.isArray(eggExemplars) ? eggExemplars : []
  },
  shake_bases: shakeAllowance.powders || [],
  shake_liquids: liquidsFinal,
  shake_min_protein_g: Number(shakeAllowance.min_protein_g || 30),
  shake_cap_per_week: Number(shakeAllowance.per_week_cap_breakfast || 2),
  add_ins_allowed: PROTEIN_SHAKES?.add_ins_allowed || [],
  no_go_add_ins: PROTEIN_SHAKES?.no_go_add_ins || []
};
    
    const header = `
Instructions for GPT (concise):
- Fill a fixed 7-day plan using the provided SPEC (JSON below).
- Output workouts only on these days: ${workoutDaysString}. Use exact minute budgets from SPEC.training.blocks.
- Bold ONLY: “Protein:”, “Micronutrients:”, and meal name labels (“Breakfast:”, “Lunch:”, “Dinner:”, “Snacks:”).
- Italicize ONLY the words “Substitute:” and “Variation:”.
- Render clean HTML only (no markdown, no <br>), follow the exact wrappers and class names.
- For knee- or shoulder-sensitive flags, keep ranges shallow and provide hinge/box-supported alternatives to knee-dominant patterns.

${JSON.stringify({
  goal: SPEC?.goal ?? null,
  cuisine: SPEC?.food?.cuisine ?? cuisineTagResolved ?? null,
  eatingPattern: compiled?.diet_mode ?? null,
  bans: Array.from(bans || []),
  soyPolicy: SPEC?.food?.soy_policy ?? null,
  dairyPolicy: SPEC?.food?.dairy_policy ?? null,
  breakfastFloor: SPEC?.food?.breakfast_policy?.protein_floor_g ?? null,
  proteinFamilies: SPEC?.food?.families ?? null,
  pantry: (SPEC?.food?.cuisine_pantry || []).slice(0, 15),
  flavorPack: Object.keys(SPEC?.food?.flavor_pack || {}),

  culture: {
    cuisine: cuisineTagResolved ?? null,
    fidelity: cultureFidelity ?? 0.75,
    hints: culturalHints
      ? {
          staples: culturalHints.staples,
          proteins: culturalHints.proteins,
          flavor_base: culturalHints.flavor_base,
          meal_patterns: culturalHints.meal_patterns
        }
      : null
  },
  training: {
    profile: {
      age,
      gender: sanitize(b.gender),
      level: sanitize(b.fitnessLevel),
      location: locationText.toLowerCase()
    },
    days: daysCount,
    minutes: duration,
    split, // string like "ULF", "FB,FB", "Custom-Rotate"
    blocks: {
      warmup: warmUp,
      foundation,
      stability_core: core,
      finisher_or_reset: finisher
    },
    constraints, 
    guardrails: {
      banned_moves: GUARDS.banned,
      preferred_swaps: GUARDS.prefer
    },
    equipment: equipmentList,
    style_bias: wrxPrefs 
  },

  keystone_enabled: !!keystoneEnabled,
  keystones_by_day: keystones_by_day || []
})}
`.trim();

const keystoneRule = keystoneEnabled
  ? `
Keystone output:
- If and only if keystone_enabled === true, then after each day-block (Mon–Sun) output:
  <div class="keystone">
    <h5>Keystone</h5>
    <p>[use keystones_by_day[dayIndex]; Monday=0 … Sunday=6; do not rewrite text]</p>
  </div>
- Never place <div class="keystone"> inside a <div class="workout-block"> or inside a <div class="day-block">.
- Place the Keystone immediately after the closing </div> of each <div class="day-block"> when enabled.
`
  : `
- Do not output any element with class "keystone" anywhere in the plan (no placeholders).
`;

const prompt = `
${header}

You are a structured system for grounded realignment. Your role is to generate practical, 7-day fitness and nutrition plans designed to help the user rebuild physical rhythm, metabolic energy, and daily stability. No theory, motivation, or fluff.
At the very top of your response, output a single line (no spaces before it, no other text before or after it):
LEDGER_JSON=<JSON>
Where <JSON> is a single valid JSON object with this shape (example):

{"days":[
  {
    "name":"Monday",
    "meals":{
      "breakfast":{"ingredients":[{"item":"egg","cat":"Protein"},{"item":"shallot","cat":"Produce"}]},
      "lunch":{"ingredients":[{"item":"chicken breast","cat":"Protein"}]},
      "dinner":{"ingredients":[{"item":"salmon","cat":"Protein"}]},
      "snacks":[
        {"ingredients":[{"item":"apple","cat":"Produce"}]},
        {"ingredients":[{"item":"almonds","cat":"Pantry"}]}
      ]
    }
  }
]}

Rules:
- Do NOT include ellipses ("...") anywhere in the JSON.
- Do NOT include comments or extra keys.
- Every ingredient object MUST have both fields: "item" (string) and "cat" (one of EXACTLY):
  "Produce","Protein","Grains","Dairy / Alternatives","Healthy Fats","Pantry".
- After that single LEDGER_JSON line, start the HTML plan on the very next line.
---
Formatting rules:
- Render EXACTLY seven day blocks in this order: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Each day of the plan must be wrapped in this structure:
<div class="day-block">
  <h3>[Day Name]</h3>
  [Workout or REST DAY]
  [Meals]
</div>
${keystoneRule}
Do not skip this structure. Do not omit the wrapper. It is required for every day.
- After the complete Sunday <div class="day-block"> closes, append the following tail sections in this exact order and with these exact wrappers (no other blocks in between):
  1) <div class="force-break"><div class="grocery-list"><h2>Grocery List</h2></div></div>
  2) <div class="grocery-grid">…</div>  (empty <ul>s)
  3) <div class="flowproofing"><h2>Flowproofing</h2><div class="note-tip">…</div>×4</div>
  4) <div class="disclaimer-block"><h5>Disclaimer</h5><p>…</p></div>
- Use <h2> for section labels: Grocery List, Flowproofing
- Use <h3> for each day label (Monday–Sunday)
- Use <h4> for sections: Workout, Meals
- Use <h5> for section labels: Disclaimer, Keystone
- Use <ol> or <ul class="no-bullets"> for list structure — no visible bullets or numbers
- Use <p> for all standard paragraphs
- Use <strong> only for: “Protein:”, “Micronutrients:”, and meal name labels (“Breakfast:”, “Lunch:”, “Dinner:”, “Snacks:”)
- Use <em> only for the words “Substitute:” and “Variation:”
- Do not use <br> tags, markdown syntax, summary intros, or bullet emojis.
- Render the Grocery List shell exactly once, immediately after Sunday.
- Only output <div class="grocery-grid"> … </div> one time.
- Do not output any <div class="grocery-category"> or any standalone category headings like
<p><strong>Produce:</strong></p> anywhere outside that single .grocery-grid.
---
Workout Instructions:
You have a "training" object in the JSON above with:
- training.profile.age, training.profile.level, training.profile.location
- training.days, training.minutes, training.split
- training.blocks.{warmup, foundation, stability_core, finisher_or_reset}
- training.constraints (boolean flags like no_jump, knee_sensitive, back_sensitive, no_overhead, no_floor, balance_care)
- training.guardrails.banned_moves and training.guardrails.preferred_swaps
- training.equipment (tools the user actually has access to)
- training.style_bias (user workout preferences)

Use it as follows:

1. Schedule & REST
- Only include a <div class="workout-block"> on the following days: ${workoutDaysString}.
- On all other days, under that day’s <h3>, output only:
  <p><strong>REST DAY</strong></p>
- Do not add any workout instructions on non-workout days.

2. Time & Structure
- Respect training.blocks for every workout day:
  - Warm-Up ≈ training.blocks.warmup minutes
  - Foundation ≈ training.blocks.foundation minutes
  - Stability + Core ≈ training.blocks.stability_core minutes
  - Finisher or Reset ≈ training.blocks.finisher_or_reset minutes
- Keep each block within ±2 minutes of its assigned time. Do not create extra blocks or merge them.

3. Fitness level behavior
- Beginner (training.profile.level == "beginner"):
  - Use simple, stable patterns (hinges, supported squats, basic pushes/pulls).
  - 2–3 Foundation movements, usually 2–3 sets of 8–12 reps.
  - Warm-Up is gentle and slightly longer; Finisher is low impact (walking, breathing, light mobility).
- Intermediate:
  - 3–4 Foundation movements, mostly 3 sets of 8–12 reps.
  - You may include short conditioning elements in Finisher (e.g. step-based intervals, light circuits).
- Advanced:
  - You may increase density slightly (3–4 Foundation movements, sometimes with higher effort),
    but still respect the minutes budget and any safety constraints.

4. Safety & constraints (always obey these):
Use training.constraints and training.guardrails as hard safety rails:
- If training.constraints.no_jump or training.constraints.low_impact or training.constraints.post_surgery:
  - Do NOT program jumping/plyometric moves: no box jumps, burpees, jump squats, jump lunges, broad jumps, sprints.
  - Prefer step-ups, marches, tempo squats to a box, incline walking, loaded carries, and other quiet, controlled patterns.
- If training.constraints.knee_sensitive or training.constraints.no_kneel or training.constraints.no_deep_knee:
  - Avoid deep knee flexion and kneeling: no deep squats, no walking lunges, no jump lunges, no kneeling positions.
  - Prefer hip hinges, box squats to a high box, supported split-stance work, bridges, and short-range step-ups.
- If training.constraints.no_overhead or training.constraints.shoulder_sensitive:
  - Do NOT include overhead presses, snatches/jerks, handstand work, or kipping variations.
  - Prefer neutral-grip presses and rows, landmine-style presses, band face pulls, and scapular-plane raises.
- If training.constraints.back_sensitive:
  - Avoid heavy spinal flexion and rotation (e.g. heavy sit-ups, loaded Jefferson curls, twisting crunches).
  - Prefer neutral-spine hinges, bird-dogs, dead bugs, anti-rotation core (paloff press, side planks).
- If training.constraints.wrist_sensitive:
  - Avoid long holds in deep wrist extension (e.g. long plank holds on palms, handstand work).
  - Prefer neutral-handle push-ups, forearm planks, and dumbbell handles that keep the wrist neutral.
- If training.constraints.no_floor or training.constraints.pregnancy_safe:
  - Do NOT use prone or supine floor-based positions.
  - Use standing, wall-based, or bench-supported movements instead.
- If training.constraints.balance_care:
  - Always give an external support option (wall/chair/bench) for single-leg or unstable positions.

When choosing exercises:
- NEVER use any movement names from training.guardrails.banned_moves.
- When you need an alternative, prefer exercises whose descriptions match training.guardrails.preferred_swaps.
- Keep movement names natural and recognizable (e.g. “goblet squat”, “Romanian deadlift”, “side plank”).

5. Equipment & location
- Treat training.equipment as the user’s confirmed tools. When training.profile.location is "at home" or "outside", only use tools listed in training.equipment (or bodyweight).
- When training.profile.location includes "gym":
  - If training.equipment is empty, assume a standard commercial gym with access to: dumbbells, barbells, flat/incline bench, cable machine, lat pulldown, seated row, leg press, leg curl, leg extension, Smith machine, kettlebells, pull-up bar, TRX, foam roller, bike, rower, treadmill.
  - If training.equipment has items, treat those as priority tools but you may also use the standard gym tools above.

### Workout Block Format (Only include on workout days):
<div class="workout-block">
  <h4>Workout</h4>
  <p><strong>Type:</strong> [e.g. Strength] • <strong>Target Area:</strong> [e.g. Lower Body &amp; Core] • <strong>Duration:</strong> ${formatNumeric(sanitize(b.duration),"minutes")}</p>
  <ol class="no-bullets">
    <li>
      <p><strong>Warm-Up (Activation – ${warmUp} minutes)</strong></p>
      <ul class="no-bullets">
        <li> Drill — name + 1–2 simple cues; describe duration as “about 30–45 seconds” or “around 1 minute” (never 0:30 or 30s). Choose values so all warm-up drills together roughly add up to ${warmUp} minutes.</li>
        <li> Drill — same pattern with a slightly different time range (for example “about 45 seconds” or “around 1 minute”) and 1–2 cues.</li>
        <li> Drill — same pattern; vary movement and cues so it does not read like a copy of the previous lines.</li>
        <li> Drill — same pattern; keep the total warm-up time approximately ${warmUp} minutes across all drills.</li>
      </ul>
    </li>
    <li>
      <p><strong>Foundation (Compound Movements – ${foundation} minutes)</strong></p>
      <ul class="no-bullets">
        <li> Movement — describe sets and reps in clear language such as “3 sets of 8–12 reps with 45–60 seconds rest” (never 3x10 or 3x8–12). Include 1–2 form cues (posture, range, bracing). Choose set/rep patterns so all Foundation movements together roughly fit ${foundation} minutes.</li>
        <li> Movement — same pattern, but vary the exact set/rep description (for example “2–3 sets of 10–12 reps” or “3 sets of about 10 controlled reps”) and adjust rest so time stays realistic.</li>
        <li> Movement — same pattern; keep a realistic work-to-rest balance and include 1–2 concise cues.</li>
        <li> Movement — same pattern; avoid repeating identical phrasing or the exact same rep scheme across all Foundation items.</li>
      </ul>
    </li>
    <li>
      <p><strong>Stability + Core – ${core} minutes</strong></p>
      <ul class="no-bullets">
        <li> Movement — describe as “2–3 sets of 8–12 reps” or “2–3 sets of about 30–45 seconds”. Aim so all core work together roughly fits ${core} minutes.</li>
        <li> Movement — same pattern with slightly different set/rep structure and a clear stability cue.</li>
        <li> Movement — same pattern; keep wording concise and avoid repeating identical phrasing from previous lines.</li>
      </ul>
    </li>
    <li>
      <p><strong>Finisher or Reset – ${finisher} minutes</strong></p>
      <ul class="no-bullets">
        <li> Item — describe as “2–3 rounds of about 30–60 seconds" or “about 1 minute of continuous effort”; include a clear “push” or “reset” cue. Together, these items should roughly match ${finisher} minutes.</li>
        <li> Item — same pattern; choose a contrasting finisher or nervous-system reset and describe in simple language.</li>
      </ul>
    </li>
  </ol>
  <p><em>Variation:</em> [tip to simplify or scale based on ability and constraints]</p>
</div>

Movement patterns (keep choices inside these families):
- Hinge (e.g. hip hinge, Romanian deadlift, light kettlebell deadlift)
- Squat (e.g. goblet squat, box squat, supported squat)
- Lunge / step (e.g. reverse lunge, split squat, step-up)
- Push (e.g. incline push-up, dumbbell press, floor press)
- Pull (e.g. dumbbell row, band row, supported single-arm row)
- Core / anti-movement (e.g. dead bug, bird dog, side plank, pallof press)
- Carry (e.g. suitcase carry, farmer carry)
- Conditioning (e.g. brisk or incline walk, bike intervals, light swings)
- Mobility / regulation (e.g. cat–cow, 90/90 hips, chest opener, simple breathing)

When building each workout:
- Use 1–2 patterns from hinge/squat/lunge in Foundation that match the goal.
- Use core / anti-movement and carries in Stability + Core.
- Use conditioning and mobility / regulation for the Finisher or Reset, staying low-impact if any no_jump, knee_sensitive, back_sensitive, or balance_care flags are true.
- Always adapt patterns to training.equipment, training.profile.level, location, and training.guardrails (banned_moves, preferred_swaps).
---
Meals Instructions:
Each day must include:
- Breakfast
- Lunch
- Dinner
- 2–3 Snacks

- Keep meals culturally authentic to the chosen ${sanitize(b.cuisine)}. Use SPEC.extras.culture.fidelity (0..1) as a steering knob: higher = stricter authenticity; lower = more flexible but still recognizable.
- Use SPEC.extras.culture.hints.* as examples, not hard limits. Do not violate user restrictions or soy/dairy policies to satisfy authenticity.
- Consider the Cuisine Preference: ${sanitize(b.cuisine)}. Use herbs/spices/sides as flavor without breaking exclusions or targets.
- Draw from food.pantry and food.cuisine_pantry as needed; they are not strict whitelists.
- You may introduce other authentic ingredients for the cuisine, **but they must still obey eatingPattern, bans, soyPolicy, and dairyPolicy**.
- Enforce protein floors (unless restricted): Breakfast ≥ SPEC.food.breakfast_policy.protein_floor_g; Lunch ≥ 25 g; Dinner ≥ 30 g.
- Strictly exclude ingredients listed in ${sanitize(b.foodRestrictions)}. Never mention them anywhere.
- Respect soy policy:
 • Soy **proteins** (tofu, tempeh, edamame, natto, soy milks/yogurts) are allowed only if food.soy_policy.protein_allowed; cap mains to food.variety_caps.soy_weekly_max per week.
 • Soy **condiments** (soy sauce/tamari/shoyu/miso) are allowed **unless** the user is soy-free. If condiments are not allowed, use food.soy_policy.condiment_fallbacks (e.g., coconut aminos, chickpea miso).
- If dairy is disallowed by food.dairy_policy, you must not include any dairy tokens anywhere (including ledgers). Use unsweetened plant alternatives when needed (oat/almond/coconut milk; plant-based yogurt; plant-based butter), and ledger those instead.
- Rotate breakfast proteins using SPEC.food.variety_caps and food.dairy_policy:
  • Eggs as the primary protein ≤ breakfast_egg_max per week; include ≥ breakfast_non_egg_min non-egg breakfasts across the week.
  • Protein shakes allowed ≤ breakfast_shake_max per week. If used, treat them as a full meal: pair the shake with at least one whole-food side (fruit, nuts, or a small grain serving), and include the powder and key add-ins in LEDGER_JSON and the hidden ingredients ledger. Choose a base from SPEC.food.breakfast_policy.shake_bases.
  • Yogurt-based breakfasts (dairy or plant) are limited to at most food.dairy_policy.cap_per_week_breakfast across all 7 days (if cap_per_week_breakfast is missing, assume a maximum of 2). Never schedule yogurt-based breakfasts on back-to-back days.
  • When you use yogurt (dairy or plant) as a main component, build it as a complete meal, not a light snack:
    – Anchor it with a clear primary protein count (the yogurt itself and/or an additional protein such as eggs, legumes, or higher-protein toppings).  
    – Add a visible complex carbohydrate or fiber source (e.g., whole grains, oats, or substantial fruit, not just a token slice).  
    – Include a healthy fat source (nuts, seeds, nut butter, or similar).  
    The description must read like a composed breakfast bowl or plate, not “just yogurt with a few toppings.”
  • If allow_breakfast_meat is true, lean breakfast meats (turkey/chicken sausage, Canadian bacon/lean pork loin) are allowed ≤ breakfast_meat_max per week. Never fried.
  • Seafood at breakfast only if allow_breakfast_seafood is true, and ≤ breakfast_seafood_max per week.
  • Across the 7 days, include at least 3 breakfasts that are warm or savory plates (for example: egg plates, warm grain bowls, or skillet-style combinations) so the week does not feel like repeated cold bowls.
- If eggs or dairy are listed under ${sanitize(b.foodRestrictions)}, treat their caps as 0 and do not include them in any breakfast; use alternatives from SPEC.food.breakfast_policy (e.g., legume/soy options respecting soy caps, plant-protein shakes).
- Variety rules:
  • No identical meal name more than once in the entire week.
  • No single primaryProtein appears more than SPEC.food.variety_caps.per_protein_max times total.
  • Across the 7 days, vary breakfast formats: a mix of warm bowls, smoothies, savory plates, and egg-based or fish-based options when compatible with the eating pattern. Do not repeat the same core structure (grain + yogurt + seeds + fruit) more than 2 times per week.
- Every meal, side, and grocery item must reflect the flavor logic of that cuisine tag (e.g., spices, cooking oils, grains, vegetables).
- Respect SPEC.food.dairy_policy and SPEC.food.soy_policy: if a policy disallows dairy or soy, remove them fully.
- Keep meals satisfying: combine a clear protein, a carbohydrate or fiber source, and healthy fat or greens.
- Enforce food.variety_caps: no primary protein > per_protein_max/week; soy mains ≤ soy_weekly_max; ≥ min_distinct_primary_proteins across Mon–Sun.
- CRITICAL: Every <li> in hidden ingredients lists MUST include a data-cat attribute
- Valid data-cat values: "Produce", "Protein", "Grains", "Dairy / Alternatives", "Healthy Fats", "Pantry"
- Example: <li data-cat="Protein">eggs</li> NOT <li>eggs</li>

Diet rules (must obey eatingPattern and bans):
- If eatingPattern === "vegan":
  • No meat, fish, shellfish, eggs, dairy, gelatin, or animal-derived fats anywhere (meals, snacks, or LEDGER_JSON).
- If eatingPattern === "vegetarian":
  • No meat, fish, or shellfish anywhere. Eggs and dairy are allowed unless the user’s restrictions ban them.
- If eatingPattern === "pescatarian":
  • Fish and shellfish are allowed.
  • Do NOT include beef, pork, lamb, or poultry anywhere (meals, snacks, or LEDGER_JSON), even if the cuisine usually uses them.
  • Eggs and dairy are allowed unless explicitly banned by user restrictions or dairyPolicy.
- If eatingPattern === "omnivore":
  • All proteins are allowed except anything forbidden by bans or user foodRestrictions.
In all cases:
- Never include an ingredient that contradicts these diet rules, even if it is typical for the cuisine.
- Never include a banned protein token (beef, pork, lamb, poultry, etc.) in LEDGER_JSON when they are not allowed.
- Always list at least 2 micronutrients (e.g., Magnesium, Folate, Vitamin C). Never leave this blank.

Each Meals section for each of the seven days must begin with: <h4 class="meal-heading">Meals</h4>
Meal wrapper:
<div class="meal-block">
  <p class="meal-title"><strong>[Meal Name]:</strong> [description]</p>
  <p>Prep instructions or basic preparation method.</p>
  <p><strong>Protein:</strong> [main source] (~[grams]) • <strong>Micronutrients:</strong> [2–3 key nutrients] • ~[kcal]</p>
  <p class="substitute"><em>Substitute:</em> [simple alternative]</p>
   <!-- Ingredients ledger: nouns only, one item per <li>. No verbs, no adjectives, no combos. -->
   <ul class="ingredients no-bullets" style="display:none;">
  <li data-cat="Protein">chicken breast</li>
  <li data-cat="Produce">spinach</li>
  <li data-cat="Grains">brown rice</li>
  <li data-cat="Dairy / Alternatives">coconut milk</li>
  <li data-cat="Healthy Fats">olive oil</li>
  <li data-cat="Pantry">spices</li>
</ul>
</div>

Snacks wrapper:
<div class="meal-block">
  <p class="meal-title"><strong>Snacks:</strong></p>
  <ul class="no-bullets">
    <li>[Snack 1]</li>
    <li>[Snack 2]</li>
    <li>[Snack 3]</li>
  </ul>
  <p class="snack-tip"><em>Tip:</em> [Optional brief idea]</p>
   <!-- Ingredients ledger for snacks (same rules) -->
  <ul class="ingredients no-bullets" style="display:none;">
  <li data-cat="Protein">snack protein</li>
  <li data-cat="Produce">snack produce</li>
  <li data-cat="Pantry">snack pantry item</li>
</ul>
</div>
---
After Sunday, render Grocery List EXACTLY ONCE with this structure:
<div class="force-break">
<div class="grocery-list">
<h2>Grocery List</h2></div>
</div>
<div class="grocery-grid">
  <div class="grocery-category">
    <p><strong>Produce:</strong></p>
    <ul class="no-bullets"></ul>
  </div>
  <div class="grocery-category">
    <p><strong>Protein:</strong></p>
    <ul class="no-bullets"></ul>
  </div>
  <div class="grocery-category">
    <p><strong>Grains:</strong></p>
    <ul class="no-bullets"></ul>
  </div>
  <div class="grocery-category">
    <p><strong>Dairy / Alternatives:</strong></p>
    <ul class="no-bullets"></ul>
  </div>
  <div class="grocery-category">
    <p><strong>Healthy Fats:</strong></p>
    <ul class="no-bullets"></ul>
  </div>
  <div class="grocery-category">
    <p><strong>Pantry:</strong></p>
    <ul class="no-bullets"></ul>
  </div>
</div>

CRITICAL RULES:
- Output the <div class="grocery-grid"> structure EXACTLY ONCE and ONLY ONCE
- Leave all <ul> elements empty - do not add any <li> items
- The system will automatically populate the lists from your LEDGER_JSON
- Always include the hidden ingredients ledger <ul class="ingredients no-bullets" style="display:none;"> in every meal and snacks block. Do not remove or restyle it. Do not render any visible ingredient list outside this hidden UL.

After the Grocery List, render Flowproofing exactly as follows
(copy this HTML and text exactly; do not rewrite any of the sentences):

<div class="flowproofing">
  <h2>Flowproofing</h2>
  <div class="note-tip">${(flowproofing[0] || "").replace(/<\/?[^>]+>/g, "")}</div>
  <div class="note-tip">${(flowproofing[1] || "").replace(/<\/?[^>]+>/g, "")}</div>
  <div class="note-tip">${(flowproofing[2] || "").replace(/<\/?[^>]+>/g, "")}</div>
  <div class="note-tip">${(flowproofing[3] || "").replace(/<\/?[^>]+>/g, "")}</div>
</div>

After Flowproofing, render the Disclaimer:
<div class="disclaimer-block">
  <h5>Disclaimer</h5>
  <p>This plan is crafted to inspire healthier rhythms in body and life. It is not intended as medical advice and may not be suitable for all individuals. Please consult a trusted healthcare provider before making changes to your fitness or nutrition routines.</p>
</div>
`.trim();

const promptText = String(prompt || "").trim();
const ad_prompt_len = promptText.length;
const ad_prompt_preview = promptText.slice(0, 300);

$.export("debug_prompt_generation", {
  headerLength: header ? header.length : 0,
  headerPreview: header ? header.slice(0, 200) : "NO HEADER",
  promptLength: prompt ? prompt.length : 0,
  promptPreview: prompt ? prompt.slice(0, 300) : "NO PROMPT",
  promptTextLength: promptText ? promptText.length : 0,
  promptTextPreview: promptText ? promptText.slice(0, 300) : "NO PROMPTTEXT"
});

return {
  prompt: promptText,

  promptSpec: {
    model: process.env.OPENAI_MODEL || "gpt-4.1",
    messages: [{ role: "user", content: promptText }],
    input: promptText,
    temperature: 0.65
  },
  ad_prompt_len,
  ad_prompt_preview,
  diet_mode: compiled.diet_mode,                 
  cuisine: SPEC.food.cuisine,
  workout_flags: SPEC.training.constraints,
  minutesSplit: { warmUp, foundation, core, finisher },
  dairy_policy: SPEC.food.dairy_policy,
  soy_policy_runtime: SPEC.food.soy_policy,
  breakfast_protein_floor_g: SPEC.food.breakfast_policy.protein_floor_g,
  breakfast_policy: {
    shake_bases: SPEC.food.breakfast_policy.shake_bases,
    shake_liquids: SPEC.food.breakfast_policy.shake_liquids,
    shake_min_protein_g: SPEC.food.breakfast_policy.shake_min_protein_g,
    shake_cap_per_week: SPEC.food.breakfast_policy.shake_cap_per_week,
    add_ins_allowed: SPEC.food.breakfast_policy.add_ins_allowed || [],
    no_go_add_ins: SPEC.food.breakfast_policy.no_go_add_ins || []
  },
  variety_caps: SPEC.food.variety_caps,
  keystone_enabled: keystoneEnabled,
  keystones_by_day,
  flowproofing_html,
  pantry_hints: {
    global: GLOBAL_PANTRY,
    cuisine: SPEC.food.cuisine_pantry
  },
  culture_fidelity: cultureFidelity,
  cultural_profile_present: !!CULTURE
};

  }
});
