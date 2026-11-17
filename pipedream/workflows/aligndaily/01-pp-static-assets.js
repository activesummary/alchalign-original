export default defineComponent({
  async run() {
    // ===== SOY POLICY (data only) =====
    const SOY_POLICY = {
      allow_in: {
        omnivore:      false,
        pescatarian:   false,
        vegetarian:    true,
        vegan:         true
      },
      caps: {
        default_per_week: 2,
        staple_per_week:  4
      },
      staple_cuisines: ["japanese","chinese","korean"],
      grocery_fallback: "chickpeas",
      meal_fallbacks: {
        breakfast: [
          "protein shake (pattern-appropriate protein powder + allowed liquid + add-ins)",
          "eggs",
          "smoked salmon",
          "black beans",
          "oats + hemp hearts"
        ],
        lunch:  ["chicken breast","lentils","tuna","white fish"],
        dinner: ["chicken breast","white fish","lentils","shrimp"]
      },
      condiment_fallbacks: {
        "soy sauce": "coconut aminos",
        tamari:      "coconut aminos",
        shoyu:       "coconut aminos",
        miso:        "chickpea miso"
      }
    };

    // ===== PROTEIN SHAKES (data only) =====
    const PROTEIN_SHAKES = {
      min_protein_g: 30,
      per_week_cap_breakfast: 2,
      powders: {
        omnivore:     ["whey protein", "pea protein"],
        pescatarian:  ["whey protein", "pea protein"],
        vegetarian:   ["whey protein", "pea protein"],
        vegan:        ["pea protein"]
      },
      liquids: {
        dairy:   ["milk"],
        nondairy:["unsweetened almond milk", "unsweetened oat milk", "unsweetened coconut milk"]
      },
      add_ins_allowed: [
        "peanut butter","almond butter",
        "chia seeds","hemp hearts","ground flax",
        "banana","berries","mango","dates","celery","ginger",
        "oats","spinach","kale","cocoa powder","cinnamon","vanilla extract"
      ],
      no_go_add_ins: [
        "artificial sweetener","zero-calorie syrup","sugar-free syrup"
      ]
    };

    // Floor used by breakfast rules downstream
    const BREAKFAST_PROTEIN_MIN = 30;

    // ===== FLAVOR PACKS (data only) =====
    const FLAVOR_PACKS = {
      american: {
        herbs:["parsley","chives"], fats:["olive oil","butter"], acids:["lemon","apple cider vinegar"],
        condiments:["mustard","hot sauce"], carbs:["rice","potatoes","oats","bread"],
        proteins:["chicken","turkey","salmon","eggs","beans"]
      },
      american_bbq: {
        herbs:["parsley"], fats:["olive oil"], acids:["apple cider vinegar"],
        condiments:["smoked paprika","bbq spice (low sugar)","mustard"], carbs:["corn","potatoes","rice"],
        proteins:["chicken","turkey","lean beef","pork tenderloin"]
      },
      chinese: {
        herbs:["scallion"],
        fats:["sesame oil"],
        acids:["rice vinegar"],
        condiments:["soy sauce","tamari","ginger","garlic"],
        carbs:["rice","rice noodles","congee"],
        proteins:["chicken","shrimp","eggs","tofu"]
      },
      ethiopian: {
        herbs:["parsley"], fats:["olive oil"], acids:["lemon"],
        condiments:["berbere (mild)","garlic"], carbs:["injera (teff)","rice"],
        proteins:["lentils","chickpeas","chicken","eggs"]
      },
      greek: {
        herbs:["oregano","dill","mint"], fats:["olive oil"], acids:["lemon","red wine vinegar"],
        condiments:["garlic"], carbs:["pita","orzo","potatoes"],
        proteins:["chicken","white fish","eggs","beans","yogurt"]
      },
      hawaiian: {
        herbs:["scallion"], fats:["sesame oil","olive oil"], acids:["lime"],
        condiments:["shoyu","tamari","ginger"], carbs:["rice","sweet potato"],
        proteins:["tuna","salmon","chicken"]
      },
      italian: {
        herbs:["basil","oregano"], fats:["olive oil"], acids:["balsamic","lemon"],
        condiments:["garlic","tomato sauce"], carbs:["pasta","farro","polenta"],
        proteins:["chicken","turkey","white beans","tuna","eggs","mozzarella"]
      },
      japanese: {
        herbs:["scallion"], fats:["sesame oil"], acids:["rice vinegar"],
        condiments:["miso","soy sauce","tamari","ginger"], carbs:["rice","soba"],
        proteins:["salmon","tuna","eggs","edamame","chicken","tofu"]
      },
      korean: {
        herbs:["scallion","sesame"], fats:["sesame oil"], acids:["rice vinegar"],
        condiments:["gochujang (mild)","soy/tamari","garlic","ginger"], carbs:["rice","sweet potato"],
        proteins:["beef","pork","tofu","eggs","chicken"]
      },
      lowcountry: {
        herbs:["parsley"], fats:["olive oil"], acids:["lemon","apple cider vinegar"],
        condiments:["old bay","garlic"], carbs:["grits","rice","corn"],
        proteins:["shrimp","white fish","chicken","beans"]
      },
      mexican: {
        herbs:["cilantro","oregano"], fats:["olive oil","avocado"], acids:["lime"],
        condiments:["salsa","cumin"], carbs:["corn tortillas","rice","beans","sweet potato"],
        proteins:["chicken","beef (lean)","black beans","eggs"]
      },
      raw_food: {
        herbs:["basil","mint","cilantro"], fats:["olive oil","avocado","coconut oil"], acids:["lemon","lime"],
        condiments:["tahini","nutritional yeast"], carbs:["zoodles","sprouted grains","fruit"],
        proteins:["nuts","seeds","sprouted legumes","hemp tofu (if allowed)"]
      },
      soul_food: {
        herbs:["parsley","thyme"], fats:["olive oil"], acids:["apple cider vinegar","lemon"],
        condiments:["smoked paprika","garlic","onion powder"], carbs:["cornbread","rice","sweet potato"],
        proteins:["chicken","turkey","black-eyed peas","eggs","white fish", "trout", "whiting"]
      },
      thai: {
        herbs:["cilantro","thai basil"], fats:["coconut oil"], acids:["lime","rice vinegar"],
        condiments:["fish sauce","tamari","chili (mild)","ginger"], carbs:["jasmine rice","rice noodles"],
        proteins:["shrimp","chicken","eggs"]
      },
      mediterranean: {
        herbs:["oregano","basil","parsley","dill"], fats:["olive oil"], acids:["lemon","red wine vinegar"],
        condiments:["garlic","olive","capers"], carbs:["farro","quinoa","pita","rice","potatoes"],
        proteins:["chicken","salmon","tuna","lentils","chickpeas","eggs"]
      }
    };

    // ===== CUISINE_FAMILIES (data only) =====
    const CUISINE_FAMILIES = {
      mediterranean:{protein_families:{white_fish:["cod","hake","sea bass","snapper","sole","branzino"],oily_fish:["sardine","anchovy","mackerel","tuna","salmon"],shellfish:["shrimp","mussel","clam","scallop","octopus","squid"],poultry:["chicken","turkey"],pork_beef:["pork tenderloin","lean beef"],dairy:["yogurt","ricotta","feta","halloumi"],legumes:["chickpeas","lentils","white beans"],eggs:["eggs"]}},
      american:{protein_families:{poultry:["chicken","turkey"],beef:["lean beef (sirloin, round)"],pork:["pork tenderloin","pork loin"],fish:["salmon","cod","tilapia","tuna","white fish"],legumes:["black beans","kidney beans"],eggs:["eggs"]}},
      american_bbq:{protein_families:{poultry:["chicken (skinless)","turkey breast"],beef:["lean brisket (trimmed)","sirloin"],pork:["pork tenderloin"],fish_shell:["salmon","shrimp"],eggs:["eggs"]}},
      italian:{protein_families:{white_fish:["cod","hake","branzino","sole"],oily_fish:["anchovy","sardine","tuna","salmon"],shellfish:["shrimp","clam","mussel","scallop","octopus","squid"],poultry:["chicken","turkey"],pork_beef:["pork tenderloin","lean beef","veal (lean)"],dairy:["ricotta","mozzarella","parmigiano-reggiano","pecorino"],legumes:["cannellini beans","chickpeas","lentils"],eggs:["eggs"]}},
      mexican:{protein_families:{poultry:["chicken","turkey"],pork_beef:["pork (loin)","beef (sirloin)"],white_fish:["cod","tilapia","mahi"],crustaceans:["shrimp"],legumes:["black beans","pinto beans","lentils"],eggs:["eggs"]}},
      indian:{protein_families:{poultry:["chicken"],fish:["white fish"],eggs:["eggs"],dairy:["paneer","yogurt"],legumes:["lentils","chickpeas","kidney beans (rajma)"]}},
      thai:{protein_families:{white_fish:["cod","tilapia"],oily_fish:["salmon"],crustaceans:["shrimp"],poultry:["chicken"],pork:["pork tenderloin"],eggs:["eggs"],soy:["tofu"]}},
      japanese:{protein_families:{pelagic_fish:["tuna","mackerel","sardine","yellowtail","bonito"],white_fish:["cod","flounder","sea bass","snapper"],cephalopods:["octopus","squid"],bivalves:["clam","mussel","scallop","oyster"],crustaceans:["shrimp","crab","lobster"],poultry:["chicken"],pork_beef:["pork (lean)","beef (lean)"],soy_legumes:["tofu","edamame","natto"],eggs:["eggs"]}},
      korean:{protein_families:{beef:["lean beef (bulgogi cuts)"],pork:["pork tenderloin"],poultry:["chicken"],oily_fish:["mackerel","sardine","salmon"],white_fish:["cod"],cephalopods:["squid"],crustaceans:["shrimp"],soy:["tofu"],eggs:["eggs"]}},
      vietnamese:{protein_families:{white_fish:["cod","snapper"],oily_fish:["salmon"],crustaceans:["shrimp"],poultry:["chicken"],pork:["pork tenderloin"],soy:["tofu"],eggs:["eggs"]}},
      middle_eastern:{protein_families:{poultry:["chicken","turkey"],lamb:["lamb (lean)"],fish:["white fish","salmon"],legumes:["chickpeas","lentils","fava"],dairy:["yogurt","labneh"],eggs:["eggs"]}},
      greek:{protein_families:{poultry:["chicken","turkey"],pork:["pork tenderloin"],white_fish:["cod","sea bass"],oily_fish:["salmon","sardine"],dairy:["yogurt","feta"],legumes:["chickpeas","lentils"],eggs:["eggs"]}},
      spanish:{protein_families:{white_fish:["cod","hake"],oily_fish:["salmon","tuna","sardine"],shellfish:["shrimp","mussel","clam"],poultry:["chicken"],pork:["lean pork","jamón (light use)"],legumes:["chickpeas","lentils"],eggs:["eggs"]}},
      french:{protein_families:{poultry:["chicken","turkey"],fish:["white fish","salmon","tuna"],shellfish:["shrimp","mussel","scallop"],beef_pork:["lean beef","pork tenderloin"],dairy:["yogurt","cheese (light)"],legumes:["lentils","beans"],eggs:["eggs"]}},
      caribbean:{protein_families:{white_fish:["snapper","mahi"],oily_fish:["salmon"],crustaceans:["shrimp","crab"],poultry:["chicken","turkey"],legumes:["black beans","kidney beans"],eggs:["eggs"]}},
      latin:{protein_families:{poultry:["chicken","turkey"],pork_beef:["pork tenderloin","beef (sirloin)"],white_fish:["cod","tilapia"],crustaceans:["shrimp"],legumes:["black beans","pinto beans"],eggs:["eggs"]}},
      chinese:{protein_families:{poultry:["chicken"],pork:["pork (loin, tenderloin)"],beef:["lean beef (flank, sirloin)"],crustaceans:["shrimp"],white_fish:["cod"],eggs:["eggs"],soy:["tofu","firm tofu"]}},
      ethiopian:{protein_families:{legumes:["lentils","chickpeas","split peas"],poultry:["chicken (lean)"],eggs:["eggs"],fish:["white fish"]}},
      hawaiian:{protein_families:{pelagic_fish:["ahi tuna","salmon"],white_fish:["mahi","cod"],crustaceans:["shrimp"],poultry:["chicken"],pork:["pork tenderloin"],eggs:["eggs"]}},
      lowcountry:{protein_families:{crustaceans:["shrimp","crab (optional)"],shellfish:["oysters (optional)"],white_fish:["catfish","cod","flounder"],poultry:["chicken","turkey"],legumes:["black-eyed peas"],eggs:["eggs"]}},
      soul_food:{protein_families:{poultry:["chicken (baked/air-fried)","turkey"],white_fish:["catfish (baked)","cod"],crustaceans:["shrimp"],legumes:["black-eyed peas","kidney beans"],eggs:["eggs"]}},
      raw_food:{protein_families:{seafood_raw:["sashimi-grade fish","ceviche (cured)"],soy_raw:["tofu"],legumes_raw:["sprouted lentils","sprouted chickpeas"],nuts_seeds:["almonds","walnuts","pumpkin seeds","hemp seeds","chia"],dairy:["yogurt (if allowed)"],eggs:["no raw eggs (food safety)"]}}
    };

    // ===== Global & Cuisine Pantry (data only) =====
    const GLOBAL_PANTRY = {
      aromatics: ["onion","garlic","scallion","celery","carrot","ginger"],
      acids: ["lemon","lime","apple cider vinegar","red wine vinegar","rice vinegar"],
      oils: ["olive oil","avocado oil","coconut oil"],
      starches: ["rice","potatoes","sweet potato","cornmeal","grits","oats"],
      herbs_spices: ["black pepper","bay leaf","thyme","oregano","smoked paprika","paprika","cayenne","allspice"],
      add_ins: ["tomato paste","canned tomatoes","vegetable broth","mustard","hot sauce","tahini"]
    };
    const CUISINE_PANTRY = {
  american: [
    "garlic","onion","black pepper","paprika","olive oil","apple cider vinegar",
    "mustard","hot sauce","oats","rice","sweet potato","leafy greens","beans","nuts","berries"
  ],

  american_bbq: [
    "smoked paprika","black pepper","garlic powder","brown sugar","apple cider vinegar",
    "chili powder","onion powder","cayenne","molasses","tomato paste","mustard","honey",
    "cornmeal","pinto beans","rice"
  ],

  mediterranean: [
    "olive oil","lemon","garlic","parsley","oregano","thyme","tomato paste",
    "canned tomatoes","chickpeas","lentils","olives","capers","couscous","rice","nuts"
  ],

  greek: [
    "olive oil","lemon","oregano","dill","mint","parsley","garlic",
    "tomato paste","olives","caper","chickpeas","lentils","rice","yogurt (optional)"
  ],

  italian: [
    "basil","oregano","garlic","tomato paste","canned tomatoes","capers",
    "olive","balsamic vinegar","olive oil","farro","polenta","pasta","parsley","thyme"
  ],

  spanish: [
    "olive oil","garlic","onion","paprika","pimentón","saffron","bay leaf",
    "parsley","tomatoes","chickpeas","lentils","rice","almonds","sherry vinegar"
  ],

  french: [
    "olive oil","shallot","thyme","tarragon","bay leaf","dijon mustard",
    "white wine vinegar","leeks","carrots","lentils","potatoes","herbes de provence"
  ],

  mexican: [
    "onion","garlic","cilantro","lime","cumin","chili powder","oregano",
    "tomatoes","tomato paste","corn tortillas","black beans","pinto beans",
    "rice","avocado","pepitas","hot sauce (mild)"
  ],

  caribbean: [
    "scallion","thyme","garlic","ginger","lime","allspice","coconut milk (light)",
    "plantain","callaloo","rice","black beans","pigeon peas","pumpkin","vinegar","pepper sauce (mild)"
  ],

  latin: [
    "garlic","onion","cilantro","cumin","lime","oregano","tomatoes","bay leaf",
    "black beans","pinto beans","rice","plantain","cornmeal","vinegar","aji (mild)"
  ],

  middle_eastern: [
    "olive oil","lemon","garlic","cumin","sumac","parsley","mint","tahini",
    "chickpeas","lentils","bulgur","rice","flatbread","yogurt (optional)"
  ],

  indian: [
    "ginger","garlic","cumin","turmeric","coriander","mustard seed","cardamom",
    "clove","cinnamon","chili (mild)","tomatoes","lentils","basmati rice","ghee (optional)"
  ],

  japanese: [
    "soy sauce","miso","ginger","dashi granules","mirin","rice vinegar",
    "sesame","scallion","nori","short-grain rice","tofu","pickled ginger","green tea"
  ],

  chinese: [
    "soy sauce","ginger","garlic","scallion","rice vinegar","sesame oil",
    "light soy","chili flakes (mild)","oyster sauce (optional)","rice","tofu",
    "bok choy","mushrooms","bamboo shoots"
  ],

  korean: [
    "garlic","soy sauce","gochugaru (mild)","sesame oil","doenjang","gochujang (mild)",
    "scallion","ginger","kimchi","tofu","short-grain rice","seaweed"
  ],

  thai: [
    "lemongrass","lime","fish sauce (mild)","basil","cilantro","ginger",
    "garlic","chili (mild)","coconut milk (light)","rice","rice noodles","peanuts","palm sugar"
  ],

  vietnamese: [
    "fish sauce (mild)","lime","ginger","garlic","shallot","herbs (mint,basil)",
    "chili (mild)","rice","rice noodles","pickled veg","bean sprouts","scallion","nuoc cham base"
  ],

  ethiopian: [
    "berbere (mild)","garlic","ginger","onion","niter kibbeh or oil",
    "lentils","chickpeas","teff flour (injera)","collard greens","cabbage","tomato paste"
  ],

  hawaiian: [
    "shoyu (soy sauce)","ginger","scallion","sesame oil","rice","pineapple",
    "seaweed","macadamia nuts","lime","coconut (optional)"
  ],

  lowcountry: [
    "celery","onion","bell pepper","paprika","bay leaf","thyme",
    "black pepper","garlic","okra","rice","cornmeal","vinegar hot sauce (mild)"
  ],

  soul_food: [
    "collard greens","mustard greens","okra","black-eyed peas","kidney beans",
    "corn","rice","sweet potato","scallion","bell pepper","celery","tomatoes",
    "bay leaf","thyme","smoked paprika","paprika","cayenne","allspice",
    "apple cider vinegar","molasses","pickled peppers","filé powder"
  ],

  raw_food: [
    "lemon","ginger","garlic (raw)","herbs","tahini","avocado","nuts","seeds",
    "dates","cacao nibs","sprouted legumes","cold-pressed oils"
  ],

  health_conscious: [
    "olive oil","lemon","garlic","herbs","tahini","vinegar","nuts","seeds",
    "quinoa","brown rice","sweet potato","leafy greens","berries"
  ]
};

// ===== Cuisine defaults (data only) =====
const CUISINE_DEFAULTS = {

  // --- Dairy gate baseline ---
  dairy_allowed_by_default: {
    health_conscious: true,
    american: true,
    american_bbq: true,
    caribbean: false,
    chinese: false,
    ethiopian: false,
    french: true,
    greek: true,
    hawaiian: false,
    indian: true,
    italian: true,
    japanese: false,
    korean: false,
    latin: false,
    lowcountry: false,
    mediterranean: true,
    mexican: false,
    middle_eastern: true,
    raw_food: false,
    soul_food: false,
    spanish: true,
    thai: false,
    vietnamese: false
  },

  // --- Default cooking fat / oil preference ---
  oil_base: {
    american: "olive oil",
    american_bbq: "clean high-heat oil",
    mediterranean: "olive oil",
    greek: "olive oil",
    italian: "olive oil",
    spanish: "olive oil",
    french: "olive oil or light butter",
    mexican: "clean high-heat oil",
    caribbean: "coconut oil (light)",
    latin: "clean high-heat oil",
    middle_eastern: "olive oil",
    indian: "clean high-heat oil or ghee",
    japanese: "clean high-heat oil",
    chinese: "clean high-heat oil",
    korean: "clean high-heat oil + sesame finish",
    thai: "clean high-heat oil + coconut milk (light)",
    vietnamese: "clean high-heat oil",
    ethiopian: "niter kibbeh or clean high-heat oil",
    hawaiian: "clean high-heat oil + sesame finish",
    lowcountry: "clean high-heat oil or butter",
    soul_food: "clean high-heat oil",
    raw_food: "cold-pressed oil",
    health_conscious: "olive oil or clean high-heat oil"
  },

  // --- Primary starch / grain bias (used if model skips starch) ---
  starch_default: {
    american: "rice or potatoes",
    american_bbq: "rice or cornbread",
    mediterranean: "rice or couscous",
    greek: "rice or bread",
    italian: "pasta or polenta",
    spanish: "rice or potatoes",
    french: "potatoes or bread",
    mexican: "rice or corn tortillas",
    caribbean: "rice or plantain",
    latin: "rice or beans",
    middle_eastern: "rice or bulgur",
    indian: "rice or chapati",
    japanese: "short-grain rice",
    chinese: "rice or noodles",
    korean: "rice",
    thai: "rice or rice noodles",
    vietnamese: "rice or rice noodles",
    ethiopian: "injera",
    hawaiian: "rice",
    lowcountry: "rice or grits",
    soul_food: "rice or sweet potato",
    raw_food: "sprouted seeds or zucchini noodles",
    health_conscious: "quinoa or brown rice"
  },

  // --- Heat / spice bias (0 = none, 1 = mild, 2 = medium) ---
  heat_bias: {
    american: 0,
    american_bbq: 1,
    mediterranean: 0,
    greek: 0,
    italian: 0,
    spanish: 0,
    french: 0,
    mexican: 2,
    caribbean: 2,
    latin: 1,
    middle_eastern: 1,
    indian: 2,
    japanese: 0,
    chinese: 1,
    korean: 2,
    thai: 2,
    vietnamese: 1,
    ethiopian: 2,
    hawaiian: 0,
    lowcountry: 1,
    soul_food: 1,
    raw_food: 0,
    health_conscious: 0
  },

  // --- Breakfast protein bias (helps model pick eggs vs legumes vs fish) ---
  breakfast_protein_default: {
    american: "eggs",
    american_bbq: "eggs",
    mediterranean: "eggs or yogurt",
    greek: "eggs or yogurt",
    italian: "eggs",
    spanish: "eggs",
    french: "eggs or yogurt",
    mexican: "eggs",
    caribbean: "eggs",
    latin: "eggs",
    middle_eastern: "eggs",
    indian: "eggs or legumes",
    japanese: "fish or eggs",
    chinese: "eggs or tofu",
    korean: "eggs",
    thai: "eggs or tofu",
    vietnamese: "eggs or tofu",
    ethiopian: "eggs",
    hawaiian: "eggs or fish",
    lowcountry: "eggs",
    soul_food: "eggs",
    raw_food: "nuts or seeds",
    health_conscious: "eggs"
  }
};

    // ===== Forbidden ingredients (data only) =====
    const FORBIDDEN_INGREDIENTS = [
      "PB powder", "PB2",
      "zero-calorie syrup", "sugar-free syrup", "artificial sweetener"
    ];

// ===== Eggs by cuisine (data only) =====
// Conventions:
// - Light oil by default; no cheese unless user explicitly allows dairy
// - "mild" means gentle spice/salt; scaleable by downstream logic
// - Keep entries short, dish-like strings for reliable rendering

const EGGS_BY_CUISINE = {
  american:        ["soft scramble with chives", "veggie omelet (peppers, onion)"],
  american_bbq:    ["soft scramble with smoked paprika", "herb omelet (light oil)"],
  mediterranean:   ["olive-oil fried eggs", "herb omelet (parsley, dill)"],
  greek:           ["olive-oil fried eggs with oregano", "herb omelet (parsley, dill)"],
  italian:         ["vegetable frittata (light)", "olive-oil fried eggs with herbs"],
  spanish:         ["tortilla española (light oil)", "olive-oil fried eggs with pimentón (mild)"],
  french:          ["omelette fines herbes", "oeufs en cocotte (light)"],
  mexican:         ["huevos a la mexicana (mild)", "baked huevos rancheros (light oil)"],
  caribbean:       ["callaloo omelet (light)", "soft scramble with scallion"],
  latin:           ["huevos con nopales (mild)", "huevos revueltos con tomate (light)"],
  middle_eastern:  ["shakshuka (mild)", "herb omelet (parsley, mint)"],
  indian:          ["masala omelet (mild)", "egg bhurji (mild oil)"],
  japanese:        ["tamagoyaki (lightly sweet/savory)", "onsen-style soft eggs (light)"],
  chinese:         ["tomato-and-egg stir-fry (mild oil)", "tea eggs with plain congee (light)"],
  korean:          ["gyeran-jjim (steamed egg)", "scallion egg pan-fry (light)"],
  thai:            ["kai jeow (mild; light oil)", "soft scramble with fish sauce (mild)"],
  vietnamese:      ["ốp la (pan eggs, light)", "herb omelet (rau thơm, mild)"],
  ethiopian:       ["egg firfir (light berbere; skip if ‘mild only’)", "soft scramble with berbere (very mild)"],
  hawaiian:        ["pan-fried egg with shoyu & scallion (light)", "soft scramble with green onion (light)"],
  lowcountry:      ["soft scramble with scallion", "tomato–pepper omelet (light)"],
  soul_food:       ["soft scramble with bell peppers & onion", "okra–tomato omelet (light)"],
  raw_food:        [],
  health_conscious:["poached eggs with herbs", "soft scramble with herbs (light oil)"]
};

// === Cultural Profiles (Upgraded) ===
// Notes:
// - protein_canon: {name, weight} where weight ~ relative frequency (0.1–1.0)
// - prep_methods.*: dish-building techniques, not full recipes
// - *_bias: 0 none, 1 low, 2 medium, 3 high
// - Strings kept short for stable rendering; gates can strip items post-select.

const CULTURAL_PROFILES = {
  american: {
    fidelity: 0.65,
    carb_staples: ["potatoes", "rice", "oats", "bread"],
    protein_canon: [
      {name:"chicken breast/thigh", weight:0.35},
      {name:"turkey",               weight:0.15},
      {name:"salmon/white fish",    weight:0.2},
      {name:"eggs",                 weight:0.15},
      {name:"lean beef",            weight:0.1},
      {name:"beans/legumes",        weight:0.05}
    ],
    fats_oils: ["olive oil", "neutral oil"],
    aromatics: ["garlic", "onion", "black pepper"],
    condiments: ["mustard", "hot sauce (mild)", "vinegar"],
    heat_default: 1, dairy_bias: 1, sweetness_bias: 1,
    fermentation: false, pickles: true,
    prep_methods: {
      breakfast: ["soft scramble", "oatmeal", "pan-fry potatoes (light)"],
      lunch: ["grill", "bake", "salad bowl"],
      dinner: ["bake/roast", "skillet sear + finish", "sheet-pan"]
    },
    breakfast_patterns: ["eggs + potatoes + greens", "oatmeal + fruit + nuts"],
    snack_patterns: ["fruit + nuts", "yogurt (optional)", "veggies + dip"],
    forbidden_crossovers: ["sushi burger with peanut butter"]
  },

  american_bbq: {
    fidelity: 0.8,
    carb_staples: ["cornbread", "potato", "rice", "slaw veg"],
    protein_canon: [
      {name:"chicken (smoked/grilled)", weight:0.3},
      {name:"turkey breast",            weight:0.15},
      {name:"beef brisket",             weight:0.2},
      {name:"pork shoulder/ribs",       weight:0.2},
      {name:"fish (grilled)",           weight:0.1},
      {name:"beans/legumes",            weight:0.05}
    ],
    fats_oils: ["neutral oil", "butter (optional)"],
    aromatics: ["garlic", "onion", "smoked paprika", "black pepper"],
    condiments: ["BBQ sauce (regional; mild)", "vinegar", "mustard"],
    heat_default: 1, dairy_bias: 0, sweetness_bias: 2,
    fermentation: false, pickles: true,
    prep_methods: {
      breakfast: ["scramble + peppers/onion", "grits (optional) + egg"],
      lunch: ["smoke", "grill", "dry-rub roast"],
      dinner: ["smoke", "grill + glaze", "slow-roast"]
    },
    breakfast_patterns: ["eggs + roasted potatoes", "scramble + peppers + onions"],
    snack_patterns: ["cucumber + vinegar", "fruit", "nuts"],
    forbidden_crossovers: ["shoyu-brined brisket parfait"]
  },

  mediterranean: {
    fidelity: 0.85,
    carb_staples: ["bread", "rice", "couscous", "bulgur"],
    protein_canon: [
      {name:"white fish",      weight:0.3},
      {name:"sardine/mackerel",weight:0.1},
      {name:"chicken",         weight:0.25},
      {name:"legumes",         weight:0.25},
      {name:"eggs",            weight:0.1}
    ],
    fats_oils: ["olive oil"],
    aromatics: ["garlic", "lemon", "parsley", "oregano"],
    condiments: ["tahini", "olive tapenade", "yogurt (optional)"],
    heat_default: 1, dairy_bias: 1, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["olive-oil fry", "yogurt + toppings", "toast + tomato"],
      lunch: ["grill", "roast + olive oil", "salad bowl"],
      dinner: ["bake fish + herbs", "braise legumes + greens"]
    },
    breakfast_patterns: ["yogurt + nuts + honey", "olive-oil toast + tomato"],
    snack_patterns: ["olives", "fruit", "nuts"],
    forbidden_crossovers: ["soy sauce hummus"]
  },

  greek: {
    fidelity: 0.85,
    carb_staples: ["bread", "rice", "orzo", "greens"],
    protein_canon: [
      {name:"white fish", weight:0.3},
      {name:"chicken",    weight:0.25},
      {name:"legumes",    weight:0.25},
      {name:"eggs",       weight:0.1},
      {name:"lamb",       weight:0.1}
    ],
    fats_oils: ["olive oil"],
    aromatics: ["lemon", "oregano", "garlic", "dill"],
    condiments: ["tzatziki (optional)", "olive paste", "wine vinegar"],
    heat_default: 1, dairy_bias: 1, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["olive-oil fry", "yogurt + nuts + honey"],
      lunch: ["grill", "legume stew", "salad + protein"],
      dinner: ["bake fish + lemon-oregano", "braise greens + beans"]
    },
    breakfast_patterns: ["eggs + tomato + olive oil", "yogurt bowl"],
    snack_patterns: ["olives", "fruit", "nuts"],
    forbidden_crossovers: ["tzatziki with soy sauce reduction"]
  },

  italian: {
    fidelity: 0.8,
    carb_staples: ["pasta", "rice", "polenta", "bread"],
    protein_canon: [
      {name:"white fish", weight:0.2},
      {name:"shellfish",  weight:0.1},
      {name:"chicken",    weight:0.2},
      {name:"eggs",       weight:0.1},
      {name:"legumes",    weight:0.25},
      {name:"beef",       weight:0.15}
    ],
    fats_oils: ["olive oil"],
    aromatics: ["garlic", "parsley", "basil", "chile flakes"],
    condiments: ["tomato passata", "vinaigrette", "pesto (optional)"],
    heat_default: 1, dairy_bias: 1, sweetness_bias: 0,
    fermentation: true, pickles: false,
    prep_methods: {
      breakfast: ["frittata", "olive-oil toast + tomato"],
      lunch: ["grill", "sauté + olive oil", "minestrone"],
      dinner: ["braise legumes", "bake fish + herbs", "risotto (light)"]
    },
    breakfast_patterns: ["frittata slice + greens", "toast + olive oil + tomato"],
    snack_patterns: ["fruit", "nuts", "olives"],
    forbidden_crossovers: ["sashimi carbonara"]
  },

  spanish: {
    fidelity: 0.8,
    carb_staples: ["rice", "bread", "potatoes"],
    protein_canon: [
      {name:"white fish", weight:0.25},
      {name:"tuna",       weight:0.15},
      {name:"eggs",       weight:0.2},
      {name:"chicken",    weight:0.2},
      {name:"legumes",    weight:0.2}
    ],
    fats_oils: ["olive oil"],
    aromatics: ["pimentón", "garlic", "parsley", "saffron"],
    condiments: ["sherry vinegar", "alioli (optional)"],
    heat_default: 1, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["tortilla", "pan con tomate"],
      lunch: ["plancha grill", "legume stew", "rice pan (light)"],
      dinner: ["bake fish + olive oil", "roast chicken + peppers"]
    },
    breakfast_patterns: ["tortilla slice + tomato", "pan con tomate"],
    snack_patterns: ["olives", "almonds", "fruit"],
    forbidden_crossovers: ["paella with peanut sauce"]
  },

  french: {
    fidelity: 0.8,
    carb_staples: ["bread", "potatoes", "greens"],
    protein_canon: [
      {name:"white fish", weight:0.25},
      {name:"eggs",       weight:0.2},
      {name:"chicken",    weight:0.25},
      {name:"legumes",    weight:0.15},
      {name:"beef",       weight:0.15}
    ],
    fats_oils: ["olive oil", "butter (optional)"],
    aromatics: ["shallot", "thyme", "tarragon", "dijon"],
    condiments: ["vinaigrette", "cornichon"],
    heat_default: 0, dairy_bias: 1, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["omelette fines herbes", "yogurt (optional)"],
      lunch: ["poach", "pan-sear + deglaze", "salad composed"],
      dinner: ["braise", "roast chicken + herbs", "steam fish + veg"]
    },
    breakfast_patterns: ["omelette", "yogurt + fruit (optional)"],
    snack_patterns: ["fruit", "nuts"],
    forbidden_crossovers: ["beef bourguignon sushi"]
  },

  mexican: {
    fidelity: 0.85,
    carb_staples: ["corn tortillas", "rice", "beans", "squash"],
    protein_canon: [
      {name:"eggs",       weight:0.2},
      {name:"chicken",    weight:0.25},
      {name:"white fish", weight:0.2},
      {name:"pork",       weight:0.15},
      {name:"beef",       weight:0.1},
      {name:"legumes",    weight:0.1}
    ],
    fats_oils: ["neutral oil", "lard (optional)"],
    aromatics: ["onion", "cilantro", "lime", "mild chiles"],
    condiments: ["salsa (mild)", "escabeche", "crema (optional)"],
    heat_default: 2, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["egg griddle fry", "scramble a la mexicana (mild)"],
      lunch: ["griddle (plancha)", "stew (guiso)", "grill"],
      dinner: ["grill + salsa", "braise (mild)", "steam/poach fish"]
    },
    breakfast_patterns: ["huevos + beans + salsa", "huevos a la mexicana (mild)"],
    snack_patterns: ["jicama + lime", "fruit", "pepitas"],
    forbidden_crossovers: ["mole alfredo pasta"]
  },

  caribbean: {
    fidelity: 0.8,
    carb_staples: ["rice", "plantain", "pumpkin", "callaloo"],
    protein_canon: [
      {name:"white fish", weight:0.3},
      {name:"chicken",    weight:0.25},
      {name:"eggs",       weight:0.15},
      {name:"legumes",    weight:0.2},
      {name:"pork",       weight:0.1}
    ],
    fats_oils: ["coconut oil (light)", "neutral oil"],
    aromatics: ["scallion", "thyme", "allspice", "lime"],
    condiments: ["pepper sauce (mild)", "pickled veg"],
    heat_default: 2, dairy_bias: 0, sweetness_bias: 1,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["callaloo omelet", "plantain pan-fry (light) + egg"],
      lunch: ["grill", "coconut stew (light)", "rice bowl"],
      dinner: ["grill fish + herbs", "braise chicken + veg"]
    },
    breakfast_patterns: ["eggs + plantain", "soft scramble + scallion"],
    snack_patterns: ["fruit", "nuts", "coconut chips"],
    forbidden_crossovers: ["jerk sashimi bowl"]
  },

  latin: {
    fidelity: 0.75,
    carb_staples: ["rice", "beans", "plantain", "corn"],
    protein_canon: [
      {name:"chicken",    weight:0.3},
      {name:"eggs",       weight:0.15},
      {name:"white fish", weight:0.2},
      {name:"beef",       weight:0.15},
      {name:"pork",       weight:0.1},
      {name:"legumes",    weight:0.1}
    ],
    fats_oils: ["neutral oil", "olive oil"],
    aromatics: ["cilantro", "cumin", "garlic", "lime"],
    condiments: ["aji (mild)", "escabeche"],
    heat_default: 1, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["egg sauté + tomato/onion", "arepa + egg (light)"],
      lunch: ["grill", "stew (guiso)", "rice bowl"],
      dinner: ["roast chicken + veg", "grill fish + herbs"]
    },
    breakfast_patterns: ["eggs + tomato + onion", "arepa + eggs (light)"],
    snack_patterns: ["fruit", "nuts", "cucumber + lime"],
    forbidden_crossovers: ["ceviche Alfredo"]
  },

  middle_eastern: {
    fidelity: 0.85,
    carb_staples: ["flatbread", "rice", "bulgur"],
    protein_canon: [
      {name:"legumes",    weight:0.3},
      {name:"chicken",    weight:0.25},
      {name:"eggs",       weight:0.15},
      {name:"white fish", weight:0.2},
      {name:"lamb",       weight:0.1}
    ],
    fats_oils: ["olive oil"],
    aromatics: ["cumin", "sumac", "parsley", "mint", "lemon"],
    condiments: ["tahini", "yogurt (optional)", "am ba (optional)"],
    heat_default: 1, dairy_bias: 1, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["shakshuka (mild)", "olive-oil fry + herbs"],
      lunch: ["grill", "braise legumes", "rice pilaf + protein"],
      dinner: ["bake fish + herbs", "stew + greens"]
    },
    breakfast_patterns: ["eggs + tomato + herbs", "shakshuka (mild)"],
    snack_patterns: ["olives", "fruit", "nuts"],
    forbidden_crossovers: ["tahini soy-sauce carbonara"]
  },

  indian: {
    fidelity: 0.85,
    carb_staples: ["rice", "flatbreads", "lentils"],
    protein_canon: [
      {name:"legumes",    weight:0.35},
      {name:"eggs",       weight:0.15},
      {name:"chicken",    weight:0.2},
      {name:"paneer",     weight:0.1},
      {name:"white fish", weight:0.2}
    ],
    fats_oils: ["neutral oil", "ghee (optional)"],
    aromatics: ["ginger", "garlic", "cumin", "turmeric"],
    condiments: ["raita (optional)", "lime pickle"],
    heat_default: 2, dairy_bias: 1, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["masala omelet (mild)", "upma/poha (light)"],
      lunch: ["tarka + simmer", "grill/roast tandoor-style (light)"],
      dinner: ["mild curry simmer", "steam/poach fish + spices"]
    },
    breakfast_patterns: ["masala omelet", "poha (light)"],
    snack_patterns: ["fruit", "roasted chana", "nuts"],
    forbidden_crossovers: ["sambar Alfredo"]
  },

  japanese: {
    fidelity: 0.9,
    carb_staples: ["rice", "noodles (soba/udon)", "miso"],
    protein_canon: [
      {name:"grilled fish (saba/salmon)", weight:0.35},
      {name:"tofu",                        weight:0.2},
      {name:"eggs (tamago)",               weight:0.2},
      {name:"white fish/shellfish",        weight:0.15},
      {name:"chicken (teriyaki/shio)",     weight:0.1}
    ],
    fats_oils: ["neutral oil", "sesame oil (light)"],
    aromatics: ["dashi", "ginger", "soy sauce", "scallion"],
    condiments: ["ponzu", "miso", "nori/sesame"],
    heat_default: 0, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["grill fish", "miso soup", "tamagoyaki"],
      lunch: ["simmer (nimono)", "soba bowl", "donburi"],
      dinner: ["grill/steam fish", "nabe", "tofu simmer"]
    },
    breakfast_patterns: ["miso + rice + grilled fish", "tamago + rice + pickles"],
    snack_patterns: ["edamame", "fruit", "green tea"],
    forbidden_crossovers: ["peanut butter sushi", "alfredo udon"]
  },

  chinese: {
    fidelity: 0.8,
    carb_staples: ["rice", "noodles", "congee"],
    protein_canon: [
      {name:"eggs",       weight:0.2},
      {name:"chicken",    weight:0.25},
      {name:"tofu",       weight:0.25},
      {name:"white fish", weight:0.2},
      {name:"pork",       weight:0.1}
    ],
    fats_oils: ["neutral oil", "sesame oil (finishing)"],
    aromatics: ["ginger", "garlic", "scallion", "soy sauce"],
    condiments: ["chinkiang vinegar", "light soy", "oyster sauce (optional)"],
    heat_default: 1, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["congee + toppings", "tomato–egg stir-fry"],
      lunch: ["stir-fry (mild oil)", "steam/poach", "braise (light)"],
      dinner: ["steam fish + ginger", "tofu + mushrooms + rice"]
    },
    breakfast_patterns: ["tomato–egg + rice", "plain congee + egg/tofu"],
    snack_patterns: ["fruit", "soy milk (unsweetened)", "nuts"],
    forbidden_crossovers: ["mapo tofu Alfredo"]
  },

  korean: {
    fidelity: 0.85,
    carb_staples: ["rice", "kimchi", "leafy veg"],
    protein_canon: [
      {name:"eggs",       weight:0.2},
      {name:"white fish", weight:0.2},
      {name:"tofu",       weight:0.2},
      {name:"chicken",    weight:0.2},
      {name:"beef",       weight:0.2}
    ],
    fats_oils: ["neutral oil", "sesame oil (finishing)"],
    aromatics: ["garlic", "gochugaru (mild)", "soy sauce", "doenjang"],
    condiments: ["gochujang (mild)", "kimchi juice (mild)"],
    heat_default: 2, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["steam egg (gyeran-jjim)", "mild tofu soup + rice"],
      lunch: ["stir-fry", "grill/fry pan", "jjigae (mild)"],
      dinner: ["doenjang stew + rice", "grill fish + banchan"]
    },
    breakfast_patterns: ["gyeran-jjim + rice", "tofu soup + rice (mild)"],
    snack_patterns: ["fruit", "roasted seaweed", "nuts"],
    forbidden_crossovers: ["kimchi Alfredo pasta"]
  },

  thai: {
    fidelity: 0.8,
    carb_staples: ["rice", "rice noodles"],
    protein_canon: [
      {name:"chicken",    weight:0.3},
      {name:"eggs",       weight:0.15},
      {name:"tofu",       weight:0.25},
      {name:"white fish", weight:0.2},
      {name:"shrimp",     weight:0.1}
    ],
    fats_oils: ["neutral oil", "coconut milk (light, optional)"],
    aromatics: ["lemongrass", "lime", "fish sauce (mild)", "basil"],
    condiments: ["nam prik (mild)", "lime-chile dip (mild)"],
    heat_default: 2, dairy_bias: 0, sweetness_bias: 1,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["kai jeow (mild)", "rice porridge + egg/tofu"],
      lunch: ["stir-fry basil (mild)", "clear soup + veg + protein"],
      dinner: ["herb steam/grill fish", "green veg curry (mild)"]
    },
    breakfast_patterns: ["kai jeow (mild)", "rice porridge + egg/tofu (light)"],
    snack_patterns: ["fruit", "nuts", "herbal tea"],
    forbidden_crossovers: ["pad thai with cheddar"]
  },

  vietnamese: {
    fidelity: 0.85,
    carb_staples: ["rice", "rice noodles", "herbs"],
    protein_canon: [
      {name:"white fish", weight:0.25},
      {name:"chicken",    weight:0.25},
      {name:"tofu",       weight:0.25},
      {name:"eggs",       weight:0.15},
      {name:"pork",       weight:0.1}
    ],
    fats_oils: ["neutral oil"],
    aromatics: ["fish sauce (mild)", "lime", "ginger", "herbs"],
    condiments: ["nuoc cham (mild)", "pickled veg"],
    heat_default: 1, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["ốp la (pan eggs)", "congee/noodle soup (light)"],
      lunch: ["grill + herbs", "stir-fry (light oil)", "vermicelli bowl"],
      dinner: ["steam fish + herbs", "canh (veg soup) + rice"]
    },
    breakfast_patterns: ["ốp la + herbs", "rice porridge + egg/tofu"],
    snack_patterns: ["fruit", "herbal tea", "nuts"],
    forbidden_crossovers: ["pho Alfredo"]
  },

  ethiopian: {
    fidelity: 0.85,
    carb_staples: ["injera", "lentils", "greens"],
    protein_canon: [
      {name:"legumes",    weight:0.35},
      {name:"eggs",       weight:0.15},
      {name:"chicken",    weight:0.25},
      {name:"white fish", weight:0.15},
      {name:"beef (mild tibs)", weight:0.1}
    ],
    fats_oils: ["niter kibbeh/oil"],
    aromatics: ["berbere (mild)", "garlic", "ginger"],
    condiments: ["awaze (mild)", "pickled veg"],
    heat_default: 2, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["egg firfir (mild)", "chechebsa (light oil)"],
      lunch: ["wot (mild) + veg", "tibs (mild) + injera"],
      dinner: ["shiro + greens + injera", "fish + veg + injera"]
    },
    breakfast_patterns: ["egg firfir", "chechebsa (light)"],
    snack_patterns: ["fruit", "roasted chickpeas", "tea"],
    forbidden_crossovers: ["injera sushi roll"]
  },

  hawaiian: {
    fidelity: 0.7,
    carb_staples: ["rice", "seaweed", "tropical fruit"],
    protein_canon: [
      {name:"ahi/white fish", weight:0.35},
      {name:"chicken",        weight:0.2},
      {name:"eggs",           weight:0.15},
      {name:"tofu",           weight:0.15},
      {name:"pork",           weight:0.15}
    ],
    fats_oils: ["neutral oil", "sesame oil (light)"],
    aromatics: ["shoyu", "scallion", "ginger", "sesame"],
    condiments: ["furikake", "ponzu"],
    heat_default: 0, dairy_bias: 0, sweetness_bias: 1,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["pan egg + shoyu", "soft scramble + scallion"],
      lunch: ["poke-style (light)", "grill + rice bowl"],
      dinner: ["grill fish/chicken", "stir-fry tofu + veg + rice"]
    },
    breakfast_patterns: ["pan egg + rice", "soft scramble + fruit"],
    snack_patterns: ["pineapple", "macadamias", "seaweed"],
    forbidden_crossovers: ["poke with Alfredo sauce"]
  },

  lowcountry: {
    fidelity: 0.75,
    carb_staples: ["rice", "corn", "okra"],
    protein_canon: [
      {name:"shrimp",      weight:0.3},
      {name:"white fish",  weight:0.25},
      {name:"chicken",     weight:0.2},
      {name:"eggs",        weight:0.15},
      {name:"legumes",     weight:0.1}
    ],
    fats_oils: ["neutral oil", "butter (optional)"],
    aromatics: ["celery", "onion", "bell pepper", "paprika"],
    condiments: ["vinegar hot sauce (mild)", "pickle relish"],
    heat_default: 1, dairy_bias: 1, sweetness_bias: 0,
    fermentation: false, pickles: true,
    prep_methods: {
      breakfast: ["soft scramble + scallion", "tomato–okra sauté + egg"],
      lunch: ["pan-fry (light)", "stew (light)", "rice bowl"],
      dinner: ["grill fish/shrimp", "stew + rice + veg"]
    },
    breakfast_patterns: ["scramble + grits (optional)", "eggs + tomatoes + greens"],
    snack_patterns: ["fruit", "pecans", "cucumber salad"],
    forbidden_crossovers: ["okra sashimi bowl"]
  },

  soul_food: {
    fidelity: 0.75,
    carb_staples: ["rice", "sweet potato", "greens"],
    protein_canon: [
      {name:"chicken",    weight:0.3},
      {name:"white fish", weight:0.25},
      {name:"eggs",       weight:0.15},
      {name:"legumes",    weight:0.2},
      {name:"pork",       weight:0.1}
    ],
    fats_oils: ["neutral oil", "olive oil"],
    aromatics: ["onion", "garlic", "paprika", "pepper"],
    condiments: ["vinegar", "pickle relish", "hot sauce (mild)"],
    heat_default: 1, dairy_bias: 0, sweetness_bias: 0,
    fermentation: false, pickles: true,
    prep_methods: {
      breakfast: ["soft scramble + peppers/onions", "sweet potato hash + egg"],
      lunch: ["bake/roast", "stew (light oil)", "rice bowl"],
      dinner: ["bake fish + okra", "roast chicken + greens"]
    },
    breakfast_patterns: ["eggs + sweet potato hash", "scramble + peppers + onions"],
    snack_patterns: ["fruit", "nuts", "cucumber + vinegar"],
    forbidden_crossovers: ["collard green sushi"]
  },

  raw_food: {
    fidelity: 0.9,
    carb_staples: ["fruits", "leafy greens"],
    protein_canon: [
      {name:"nuts",            weight:0.45},
      {name:"seeds",           weight:0.35},
      {name:"sprouted legumes",weight:0.2}
    ],
    fats_oils: ["no heat oils", "avocado"],
    aromatics: ["lemon", "herbs", "ginger"],
    condiments: ["tahini", "cold-pressed dressings"],
    heat_default: 0, dairy_bias: 0, sweetness_bias: 1,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["fruit bowl", "chia pudding (plant milk)"],
      lunch: ["zoodle salad", "sprouted lentil salad"],
      dinner: ["big salad + seeds", "collard wrap + veg + tahini"]
    },
    breakfast_patterns: ["fruit + nuts", "chia pudding"],
    snack_patterns: ["trail mix", "veggie sticks + tahini"],
    forbidden_crossovers: ["raw chicken tartare"]
  },

  health_conscious: {
    fidelity: 0.65,
    carb_staples: ["leafy greens", "quinoa", "sweet potato", "berries"],
    protein_canon: [
      {name:"white fish", weight:0.25},
      {name:"chicken",    weight:0.25},
      {name:"eggs",       weight:0.2},
      {name:"tofu",       weight:0.2},
      {name:"legumes",    weight:0.1}
    ],
    fats_oils: ["olive oil", "avocado oil"],
    aromatics: ["lemon", "herbs", "garlic"],
    condiments: ["tahini", "vinaigrette"],
    heat_default: 0, dairy_bias: 0, sweetness_bias: 0,
    fermentation: true, pickles: true,
    prep_methods: {
      breakfast: ["protein scramble + greens", "yogurt bowl (optional)"],
      lunch: ["grill/bake", "salad bowl", "quinoa bowl"],
      dinner: ["bake fish/chicken", "tofu + greens stir (light)"]
    },
    breakfast_patterns: ["protein scramble", "Greek yogurt + fruit (opt)"],
    snack_patterns: ["fruit", "nuts", "veggies + hummus"],
    forbidden_crossovers: ["sushi with ranch dip"]
  }
};

// helper for random selection using your seeded RNG
function pickSeeded(arr = [], rng) {
  return arr.length ? arr[Math.floor(rng() * arr.length)] : "";
}


    // ===== Flowproofing bank (data only) =====
    const FLOW_BANK = [
      { k:"nature-light",   t:"Let daylight touch your eyes before any screen claims your mind." },
      { k:"nature-breath",  t:"Step outside for five breaths—no phone, no goal, just this." },
      { k:"nature-ground",  t:"Stand barefoot or touch a tree for a few moments." },
      { k:"nature-horizon", t:"Find a horizon and rest your gaze there until your body softens" },
      { k:"create-small",   t:"Do one small creative act with your hands—a sketch, a note, a meal arranged beautifully." },
      { k:"create-sound",   t:"Play something that makes you feel like yourself and let your body respond." },
      { k:"create-letter",  t:"Write a three-line note to someone you appreciate; no explanation needed." },
      { k:"create-image",   t:"Take one photo today that notices beauty you nearly missed." },
      { k:"connect-kind",   t:"Reach out to one person without agenda just to remind them they exist in your world." },
      { k:"connect-eye",    t:"Make real eye contact with someone you love for one full breath." },
      { k:"connect-table",  t:"Share something you made—tea, fruit, a story—and savor it together." },
      { k:"connect-listen", t:"Listen without fixing...let one silence last longer than usual." },
      { k:"space-clear",    t:"Clear one surface today so your mind has a place to land." },
      { k:"space-silence",  t:"Take three silent minutes—no sound, no scrolling, no improvement plan." },
      { k:"space-light",    t:"Light a candle or lamp intentionally and let the shift mark a boundary in your day." },
      { k:"space-threshold",t:"Open a door or window and breathe at the edge between inside and out." },
      { k:"body-sway",      t:"Let music move you for one song—nothing counted, nothing tracked." },
      { k:"body-water",     t:"Drink a full glass of water slowly, noticing its temperature as it enters." },
      { k:"body-pace",      t:"Walk without a destination for five minutes and feel what shifts." },
      { k:"body-stretch",   t:"Let your shoulders and jaw soften with each breath." },
      { k:"sense-scene",    t:"Arrange something ordinary to look beautiful—a desk, a meal, a corner." },
      { k:"sense-smell",    t:"Invite a scent that wakes a memory and let it travel the room." },
      { k:"sense-texture",  t:"Touch wood, fabric, or stone and notice the texture without words." },
      { k:"sense-light",    t:"Dim one light and let the room soften around you." },
      { k:"reflect-true",   t:"Name one thing that felt right in your body today and let that be enough." },
      { k:"reflect-shed",   t:"Ask what could be simpler, then let something small fall away." },
      { k:"reflect-ease",   t:"Notice where you're forcing effort and shift one degree toward ease." },
      { k:"reflect-note",   t:"Write down one clear idea from today and place it where you'll see it." },
      { k:"wonder-sky",     t:"Look up for sixty seconds and let the sky answer a question you can’t." },
      { k:"wonder-small",   t:"Study a small living thing until it feels enormous." },
      { k:"wonder-grat",    t:"Acknowledge one good thing from today and let it settle." },
      { k:"wonder-ritual",  t:"Make a tiny ritual of something ordinary—timer set, candle lit, begin." },
      { k:"home-fabric",    t:"Clear a surface, stack some books. Make space for order, not perfection." },
      { k:"home-greens",    t:"Water a plant or talk to one." },
      { k:"home-table",     t:"Set a small table beautifully—even for one—and sit with it." },
      { k:"home-thanks",    t:"Thank your space out loud for holding you today." }
    ];

    // ===== Keystone banks (data only) =====
    const KEYSTONE_BANKS = {
      universal: [
        "Put a glass of water where you'll see it first thing in the morning—drink it before your coffee.",
        "Get outside within 30 minutes of waking up, even if it's just for two minutes of daylight.",
        "Take five slow breaths before you eat—let your shoulders relax as you exhale.",
        "Turn one phone call into a short walk—even three to ten minutes counts.",
        "Stop eating 90 minutes before bed; a cup of tea can be your last thing.",
        "Decide what you'll eat for breakfast tomorrow and write it down tonight.",
        "Stand up once an hour and move around for a minute or two.",
        "Chop enough greens for three days and put them front and center in your fridge.",
        "Hide the sweets in a cabinet and keep the fruit bowl somewhere you'll actually see it."
      ],
      muscle_strength: [
        "Get 25 to 30 grams of protein at breakfast before you touch your coffee—no negotiating.",
        "On your first working set, take three slow seconds on the way down and keep your attention on the pattern.",
        "Finish your last set with five clean partial reps, without sacrificing form.",
        "Take a gentle five-minute walk after dinner to kickstart your recovery.",
        "Open with one light warm-up set at about half your normal load to get your body ready.",
        "Build each meal around protein: at least a palm-sized portion on every plate.",
        "Sip electrolytes throughout your workout—small amounts, consistently.",
        "Hold that final rep for 20 seconds and really own the position.",
        "Block out tomorrow's training time right now and put it on your calendar."
      ],
      fat_loss_leanness: [
        "Close the kitchen at 8:00 pm—let a cup of tea be your goodnight.",
        "Add a fist-sized serving of vegetables to lunch and keep your starches consistent.",
        "Walk for five minutes after your biggest meal. It's simple and it helps.",
        "Portion out today's snacks this morning. Whatever's in the bowl is all you get.",
        "Drink a full glass of water before each meal and take a breath.",
        "Make sure breakfast has at least 20 grams of protein. Decide what that'll be now.",
        "Skip the creamy sauces today and use lemon and herbs instead.",
        "Fill your plate in this order: protein, then vegetables, then starch. And eat that way too.",
        "Take your first and last bites without any screens. Pay attention to both.",
        "If you're hungry late at night, make some tea and wait ten minutes."
      ],
      recomposition_tone: [
        "Make protein the foundation of every meal; at least a palm-sized portion.",
        "Finish your workout with five slow breaths through your nose to calm your system down.",
        "Pause between sets in a stability position, 20 to 30 seconds, perfectly still.",
        "Take an 8 to 12 minute walk at lunch, ideally somewhere with natural light.",
        "Cut your dinner starch in half and add more vegetables instead.",
        "Block off tomorrow's workout time and treat it like an actual appointment.",
        "Push one set to about an 8 out of 10. Check your ego and prioritize form.",
        "Start each meal with something crunchy like salad or raw vegetables to slow yourself down.",
        "Prep a protein for tomorrow tonight—eggs, tofu, or chicken ready to go.",
        "Swap late-night scrolling for a shower and dimmer lights."
      ],
      energy_burnout: [
        "Replace one cup of coffee with water and a pinch of salt this morning.",
        "Get outside into natural light for 2 to 5 minutes soon after you wake up.",
        "Reset at midday with three box breaths: breathe in for 4, hold for 4, breathe out for 6.",
        "Keep your workout intensity at 7 out of 10 or lower, leave something in reserve.",
        "Eat something within an hour of waking up and make sure it has protein.",
        "Give yourself an hour to wind down before bed - soft lighting and easy topics only.",
        "Take a 15-minute break after lunch with no caffeine.",
        "Fit in a micro-rest. Even 8 to 12 minutes with your eyes closed makes a difference.",
        "Drink a glass of water before every caffeinated drink.",
        "Pick one small task and finish it completely."
      ],
      stress_nervous: [
        "Focus on longer exhales today: breathe in for 4, out for 6, one minute at a time. Do it three times.",
        "Switch your screens to night mode in the evening and use lamps instead of overhead lights.",
        "Stand barefoot on the ground or put your hand on a tree for one quiet minute.",
        "Breathe through your entire workout—inhale through your nose and keep your jaw relaxed.",
        "Take your first five bites without looking at a screen. It'll help you slow down.",
        "Check in with yourself before training—tight, tired, wired—and adjust your weights accordingly.",
        "Take a warm shower before bed, then keep your bedroom cool.",
        "Keep a pen next to your bed and write down one thing that's worrying you.",
        "If you're feeling wound up, lean forward against a wall and breathe for 60 seconds.",
        "No doom-scrolling after 9 pm—charge your phone somewhere you can't reach it from bed."
      ],
      pain_joint_rehab: [
        "Keep all knee exercises completely pain-free. Stop one rep before anything hurts.",
        "Stick with hip hinges instead of deep squats; use a box squat if you're not sure.",
        "Keep your wrists neutral when pushing. Avoid holding them in extended positions for too long.",
        "Keep your spine neutral during hinges and skip any exercises that load your spine in flexion.",
        "Pick one sore spot tonight and alternate heat and cold—keep it short and gentle.",
        "After your walk, add a gentle 60-second stretch for your calves or hamstrings.",
        "Do landmine or incline presses instead of overhead pressing today.",
        "Swap lunges for supported split squats and keep the range of motion shallow.",
        "Carry something light for 60 seconds. Stand tall and keep it easy.",
        "Write down what triggered any pain and what felt completely fine right after your workout."
      ],
      endurance_cardio: [
        "Walk for 10 minutes at an easy pace after breakfast.",
        "Keep easy workouts easy. Breathe through your nose and make sure you can hold a conversation.",
        "Schedule tomorrow's long easy session right now.",
        "If your workout goes longer than 45 minutes, eat small amounts of carbs consistently throughout.",
        "Check your cadence—quick, light steps with quiet landings.",
        "Cool down with two very easy minutes. Just walk it out.",
        "Put your shoes by the door and lay out your gear tonight.",
        "Spend three minutes warming up your ankles and hips before you start.",
        "On hills, focus on maintaining effort, not pace—keep your breathing calm.",
        "Stretch each calf for 60 seconds before bed."
      ],
      bone_density: [
        "Add one set of loaded carries: keep the weight light and stand tall.",
        "Do three sets of 8 to 10 box squats to a comfortable height.",
        "Replace jumping exercises with step-ups and control the way down.",
        "If you take calcium, have it in the evening with some protein.",
        "Get at least a minute of direct sunlight on your skin today.",
        "Do a sled push or walk uphill—short, smooth strides.",
        "Pause at the bottom of each squat for one full breath.",
        "Test your grip—hold dumbbells for 20 to 30 seconds and notice how hard you're working.",
        "Practice balancing on one leg for 30 seconds per side.",
        "Don't go for max effort. Focus on clean reps you can repeat consistently."
      ],
      mobility_flexibility: [
        "End your day with three quiet minutes of hip and thoracic spine mobility tonight.",
        "Between sets, spend 20 seconds doing slow, controlled joint rotations.",
        "Do one breathing squat—keep your heels down and chest up—and take three long breaths.",
        "Replace sit-ups with dead bugs and move slowly and smoothly.",
        "Hang from a bar for 60 seconds or do a gentle banded lat stretch after work.",
        "Start with your ankles: do ten knee-to-wall reps on each side.",
        "After sitting for a while, ease into a psoas stretch for 40 to 60 seconds.",
        "Tune up your neck mobility—slowly nod yes, shake no, and tilt maybe for a minute.",
        "Practice hip hinges with a dowel on your back—five clean reps.",
        "Lie on your side and do open book stretches—six per side with deep breaths."
      ],
      glucose_stability: [
        "Make sure your first meal has protein and fiber. Decide what that'll be now.",
        "Take a 5 to 10 minute walk after meals with a lot of carbs.",
        "Drink water before you have caffeine, and eat something within an hour of waking up.",
        "If you have dessert, pair it with protein or take a walk afterward.",
        "Eat more protein earlier in the day and keep your evenings lighter.",
        "Eat whole fruit today, not juice.",
        "Don't eat carbs by themselves. Add protein or fat to every snack.",
        "Buy plain yogurt and add your own fruit to sweeten it.",
        "Stop eating 90 minutes before bed.",
        "Keep your dinner starch portion about the size of your palm and load up on vegetables."
      ]
    };

    // ======= Return only data (no functions) =======
    return {
      FLAVOR_PACKS,
      CULTURAL_PROFILES,
      pickSeeded,
      CUISINE_FAMILIES,
      GLOBAL_PANTRY,
      CUISINE_PANTRY,
      FLOW_BANK,
      KEYSTONE_BANKS,
      SOY_POLICY,
      CUISINE_DEFAULTS,
      FORBIDDEN_INGREDIENTS,
      PROTEIN_SHAKES,
      EGGS_BY_CUISINE,
      BREAKFAST_PROTEIN_MIN
    };
  }
});
