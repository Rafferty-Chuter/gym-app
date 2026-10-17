/**
 * Evidence behind each judge rule: citation keys → {title, url}, and the
 * keys each rule cites. Built from research/F-evidence-rules.md ("Judge
 * rules table" and the reference list). The UI shows these under a verdict;
 * the assistant may quote them but never adds to them.
 *
 * Pure data. `kind` follows research F: "primary" is peer-reviewed,
 * "secondary" is an app help page, article or book.
 */

import type { RuleId } from "@/lib/physique/types";

export type Citation = {
  id: string;
  /** Short author-year label shown inline ("Helms 2014"). */
  label: string;
  title: string;
  url: string;
  kind: "primary" | "secondary";
};

// ── Reference list (research F) ──

const CITATION_LIST: Citation[] = [
  // Weight-loss and gain rates
  { id: "helms2014", label: "Helms 2014", title: "Helms, Aragon, Fitschen 2014. JISSN: natural bodybuilding contest preparation", url: "https://doi.org/10.1186/1550-2783-11-20", kind: "primary" },
  { id: "garthe2011", label: "Garthe 2011", title: "Garthe et al. 2011. IJSNEM: effect of two different weight-loss rates on body composition and performance", url: "https://doi.org/10.1123/ijsnem.21.2.97", kind: "primary" },
  { id: "garthe2013", label: "Garthe 2013", title: "Garthe et al. 2013. Eur J Sport Sci: nutritional guidance and weight gain in athletes", url: "https://doi.org/10.1080/17461391.2011.643923", kind: "primary" },
  { id: "mero2010", label: "Mero 2010", title: "Mero et al. 2010. JISSN: moderate energy restriction in young women", url: "https://doi.org/10.1186/1550-2783-7-4", kind: "primary" },
  { id: "roberts2020", label: "Roberts 2020", title: "Roberts, Helms, Trexler, Fitschen 2020. J Hum Kinet: nutritional recommendations for physique athletes", url: "https://doi.org/10.2478/hukin-2019-0096", kind: "primary" },
  { id: "aragon2017", label: "Aragon 2017", title: "Aragon et al. 2017. ISSN position stand: diets and body composition", url: "https://doi.org/10.1186/s12970-017-0174-y", kind: "primary" },
  { id: "murphy2022", label: "Murphy & Koehler 2022", title: "Murphy, Koehler 2022. Scand J Med Sci Sports: energy deficiency and lean mass in resistance-trained adults", url: "https://doi.org/10.1111/sms.14075", kind: "primary" },
  { id: "iraki2019", label: "Iraki 2019", title: "Iraki et al. 2019. Sports: nutrition recommendations for bodybuilders in the off-season", url: "https://doi.org/10.3390/sports7070154", kind: "primary" },
  { id: "helms2023", label: "Helms 2023", title: "Helms et al. 2023. Sports Med Open: energy surplus and resistance training outcomes", url: "https://doi.org/10.1186/s40798-023-00651-y", kind: "primary" },
  { id: "slater2019", label: "Slater 2019", title: "Slater et al. 2019. Front Nutr: is an energy surplus required to maximise hypertrophy", url: "https://doi.org/10.3389/fnut.2019.00131", kind: "primary" },
  // Protein, fat, carbohydrate
  { id: "morton2018", label: "Morton 2018", title: "Morton et al. 2018. BJSM: protein supplementation and resistance-training gains, meta-analysis", url: "https://doi.org/10.1136/bjsports-2017-097608", kind: "primary" },
  { id: "nunes2022", label: "Nunes 2022", title: "Nunes et al. 2022. J Cachexia Sarcopenia Muscle: protein intake and lean mass", url: "https://doi.org/10.1002/jcsm.12922", kind: "primary" },
  { id: "helms2014protein", label: "Helms 2014 (protein)", title: "Helms, Zinn, Rowlands, Brown 2014. IJSNEM: protein in lean, resistance-trained athletes in a deficit", url: "https://doi.org/10.1123/ijsnem.2013-0054", kind: "primary" },
  { id: "jager2017", label: "Jäger 2017", title: "Jäger et al. 2017. ISSN position stand: protein and exercise", url: "https://doi.org/10.1186/s12970-017-0177-8", kind: "primary" },
  { id: "longland2016", label: "Longland 2016", title: "Longland et al. 2016. AJCN: higher protein during an energy deficit with exercise", url: "https://doi.org/10.3945/ajcn.115.119339", kind: "primary" },
  { id: "whittaker2021", label: "Whittaker & Wu 2021", title: "Whittaker, Wu 2021. J Steroid Biochem Mol Biol: low-fat diets and testosterone, meta-analysis (corrigendum pending)", url: "https://doi.org/10.1016/j.jsbmb.2021.105878", kind: "primary" },
  { id: "henselmans2022", label: "Henselmans 2022", title: "Henselmans et al. 2022. Nutrients: carbohydrate intake and resistance-training performance", url: "https://doi.org/10.3390/nu14040856", kind: "primary" },
  // Energy balance and expenditure
  { id: "hall2008", label: "Hall 2008", title: "Hall 2008. IJO: what is the required energy deficit per unit weight loss", url: "https://doi.org/10.1038/sj.ijo.0803720", kind: "primary" },
  { id: "hallchow2011", label: "Hall & Chow 2011", title: "Hall, Chow 2011. AJCN: estimating changes in free-living energy intake", url: "https://doi.org/10.3945/ajcn.111.014399", kind: "primary" },
  // Weight noise
  { id: "kreitzman1992", label: "Kreitzman 1992", title: "Kreitzman et al. 1992. AJCN: glycogen storage and body-weight changes", url: "https://doi.org/10.1093/ajcn/56.1.292S", kind: "primary" },
  { id: "turicchi2020", label: "Turicchi 2020", title: "Turicchi et al. 2020. PLoS One: weekly weight-cycle patterns in self-weighing", url: "https://doi.org/10.1371/journal.pone.0232152", kind: "primary" },
  { id: "white2011", label: "White 2011", title: "White et al. 2011. Obstet Gynecol Int: fluid retention over the menstrual cycle", url: "https://doi.org/10.1155/2011/138451", kind: "primary" },
  { id: "bone2017", label: "Bone 2017", title: "Bone et al. 2017. MSSE: manipulation of muscle creatine and glycogen changes DXA estimates", url: "https://doi.org/10.1249/MSS.0000000000001174", kind: "primary" },
  { id: "hultman1996", label: "Hultman 1996", title: "Hultman et al. 1996. J Appl Physiol: muscle creatine loading in men", url: "https://doi.org/10.1152/jappl.1996.81.1.232", kind: "primary" },
  // Sleep
  { id: "nedeltcheva2010", label: "Nedeltcheva 2010", title: "Nedeltcheva et al. 2010. Ann Intern Med: insufficient sleep undermines dietary efforts to reduce adiposity", url: "https://doi.org/10.7326/0003-4819-153-7-201010050-00006", kind: "primary" },
  { id: "wang2018", label: "Wang 2018", title: "Wang et al. 2018. Sleep: sleep restriction and body composition during caloric restriction", url: "https://doi.org/10.1093/sleep/zsy027", kind: "primary" },
  { id: "watson2015", label: "Watson 2015", title: "Watson et al. 2015. AASM/SRS consensus: recommended amount of sleep for adults", url: "https://doi.org/10.5664/jcsm.4758", kind: "primary" },
  { id: "knowles2018", label: "Knowles 2018", title: "Knowles et al. 2018. J Sci Med Sport: inadequate sleep and muscle strength", url: "https://doi.org/10.1016/j.jsams.2018.01.012", kind: "primary" },
  { id: "craven2022", label: "Craven 2022", title: "Craven et al. 2022. Sports Med: sleep loss and physical performance, meta-analysis", url: "https://doi.org/10.1007/s40279-022-01706-y", kind: "primary" },
  { id: "spiegel2004", label: "Spiegel 2004", title: "Spiegel et al. 2004. Ann Intern Med: sleep curtailment, leptin, ghrelin and appetite", url: "https://doi.org/10.7326/0003-4819-141-11-200412070-00008", kind: "primary" },
  { id: "alkhatib2017", label: "Al Khatib 2017", title: "Al Khatib et al. 2017. EJCN: partial sleep deprivation and energy balance, meta-analysis", url: "https://doi.org/10.1038/ejcn.2016.201", kind: "primary" },
  // Strength measurement
  { id: "grgic2020", label: "Grgic 2020", title: "Grgic et al. 2020. Sports Med Open: test-retest reliability of the one repetition maximum", url: "https://doi.org/10.1186/s40798-020-00260-z", kind: "primary" },
  { id: "halperin2022", label: "Halperin 2022", title: "Halperin et al. 2022. Sports Med: accuracy of repetitions-in-reserve", url: "https://doi.org/10.1007/s40279-021-01559-x", kind: "primary" },
  // Diet breaks and refeeds
  { id: "byrne2018", label: "Byrne 2018", title: "Byrne et al. 2018 (MATADOR). IJO: intermittent energy restriction", url: "https://doi.org/10.1038/ijo.2017.206", kind: "primary" },
  { id: "peos2021", label: "Peos 2021", title: "Peos et al. 2021 (ICECAP). MSSE: diet breaks in resistance-trained adults", url: "https://doi.org/10.1249/MSS.0000000000002636", kind: "primary" },
  { id: "siedler2023", label: "Siedler 2023", title: "Siedler et al. 2023. J Hum Kinet: diet breaks and body composition", url: "https://doi.org/10.5114/jhk/159960", kind: "primary" },
  // Safety and screening
  { id: "loucks2003", label: "Loucks 2003", title: "Loucks, Thuma 2003. JCEM: energy availability threshold", url: "https://doi.org/10.1210/jc.2002-020369", kind: "primary" },
  { id: "koehler2016", label: "Koehler 2016", title: "Koehler et al. 2016. J Sports Sci: low energy availability in exercising men", url: "https://doi.org/10.1080/02640414.2016.1142109", kind: "primary" },
  { id: "fagerberg2018", label: "Fagerberg 2018", title: "Fagerberg 2018. IJSNEM: negative consequences of low energy availability in natural male bodybuilding", url: "https://doi.org/10.1123/ijsnem.2016-0332", kind: "primary" },
  { id: "mountjoy2023", label: "Mountjoy 2023", title: "Mountjoy et al. 2023. BJSM: IOC consensus on REDs", url: "https://doi.org/10.1136/bjsports-2023-106994", kind: "primary" },
  { id: "melin2014", label: "Melin 2014", title: "Melin et al. 2014. BJSM: the LEAF questionnaire", url: "https://doi.org/10.1136/bjsports-2013-093240", kind: "primary" },
  { id: "lundy2022", label: "Lundy 2022", title: "Lundy et al. 2022. Nutrients: the LEAM questionnaire", url: "https://doi.org/10.3390/nu14091873", kind: "primary" },
  { id: "morgan1999", label: "Morgan 1999", title: "Morgan, Reid, Lacey 1999. BMJ: the SCOFF questionnaire", url: "https://doi.org/10.1136/bmj.319.7223.1467", kind: "primary" },
  { id: "nih1993", label: "NIH 1993", title: "NIH National Task Force 1993: very-low-calorie diets", url: "https://pubmed.ncbi.nlm.nih.gov/8345648/", kind: "primary" },
  { id: "who_bmi", label: "WHO BMI", title: "WHO: a healthy lifestyle, BMI categories", url: "https://www.who.int/europe/news-room/fact-sheets/item/a-healthy-lifestyle---who-recommendations", kind: "secondary" },
  // Body composition measurement and recomposition
  { id: "ross2020", label: "Ross 2020", title: "Ross et al. 2020. Nat Rev Endocrinol: waist circumference as a vital sign", url: "https://doi.org/10.1038/s41574-019-0310-7", kind: "primary" },
  { id: "verweij2013", label: "Verweij 2013", title: "Verweij et al. 2013. Public Health Nutr: measurement error of waist circumference", url: "https://doi.org/10.1017/S1368980012002741", kind: "primary" },
  { id: "barakat2020", label: "Barakat 2020", title: "Barakat et al. 2020. Strength Cond J: body recomposition in trained individuals", url: "https://doi.org/10.1519/SSC.0000000000000584", kind: "primary" },
  // Secondary sources
  { id: "macrofactor_help", label: "MacroFactor help", title: "MacroFactor help: weight trend and expenditure", url: "https://help.macrofactorapp.com/dashboard/expenditure", kind: "secondary" },
  { id: "macrofactor_bulking", label: "MacroFactor bulking", title: "Nuckols, How Fast Should You Gain Weight When Bulking, MacroFactor 2024", url: "https://macrofactor.com/bulking-calculator/", kind: "secondary" },
  { id: "mfp_floor", label: "Calorie floor (convention)", title: "Calorie-tracker floors, as reported by third parties (unverified)", url: "https://nutrola.app/en/blog/why-calorie-trackers-recommend-1200-calories-and-why-its-dangerous", kind: "secondary" },
];

export const CITATIONS: Readonly<Record<string, Citation>> = Object.fromEntries(CITATION_LIST.map((c) => [c.id, c]));

// ── Rule → citations (research F "Judge rules table"; 02 §7.3 and §8.2 D) ──

export const RULE_EVIDENCE: Readonly<Record<RuleId, readonly string[]>> = {
  "SAFE-0": ["mountjoy2023"],
  "SAFE-1": ["nih1993", "mfp_floor"],
  "SAFE-2": ["loucks2003", "fagerberg2018", "koehler2016", "mountjoy2023"],
  "SAFE-3": ["mountjoy2023", "lundy2022", "melin2014"],
  "SAFE-4": ["mero2010", "who_bmi"],
  "SAFE-5": ["morgan1999"],
  "NO-GOAL": [],
  "DATA-PARTIAL": ["macrofactor_help"],
  "DATA-HOLD": ["macrofactor_help"],
  "DATA-RATE": ["turicchi2020", "kreitzman1992"],
  "DATA-EXP": ["hallchow2011", "macrofactor_help"],
  "G-EXP-2": ["macrofactor_help"],
  "DB-1": ["peos2021", "siedler2023", "byrne2018", "kreitzman1992"],
  "ADH-1": ["macrofactor_help"],
  "LOSS-1": ["helms2014", "garthe2011", "mero2010", "murphy2022", "roberts2020"],
  "LOSS-2": ["garthe2011", "helms2014"],
  "LOSS-2u": ["garthe2011", "helms2014"],
  "LOSS-3": ["mero2010", "garthe2011", "fagerberg2018"],
  "LOSS-4": ["garthe2011", "roberts2020", "aragon2017"],
  "LOSS-6": ["helms2014", "hall2008"],
  "GAIN-1": ["iraki2019", "helms2023", "garthe2013", "macrofactor_bulking"],
  "GAIN-2": ["iraki2019", "slater2019"],
  "GAIN-3": ["helms2023", "murphy2022"],
  "GAIN-4": ["verweij2013", "ross2020"],
  "RECOMP-1": ["barakat2020", "murphy2022", "garthe2011", "helms2023"],
  "RECOMP-WAIST": ["barakat2020", "ross2020"],
  "STR-1": ["grgic2020", "halperin2022", "murphy2022"],
  "STR-2": ["murphy2022", "grgic2020"],
  "SLEEP-1": ["nedeltcheva2010", "wang2018", "watson2015", "knowles2018"],
  "SLEEP-1i": ["nedeltcheva2010", "wang2018", "watson2015"],
  "SLEEP-2": ["alkhatib2017", "spiegel2004"],
  "SLEEP-3": ["knowles2018", "craven2022"],
  "PRO-1": ["helms2014protein", "roberts2020", "longland2016", "jager2017"],
  "PRO-2": ["morton2018", "nunes2022", "iraki2019"],
  "FAT-1": ["iraki2019", "helms2014", "whittaker2021"],
  "ON-TRACK": ["helms2014", "turicchi2020"],
  "NO-CHANGE": [],
};

/** The citations a rule rests on, in the order research F lists them. */
export function evidenceFor(id: RuleId): Citation[] {
  return (RULE_EVIDENCE[id] ?? []).map((key) => CITATIONS[key]).filter((c): c is Citation => !!c);
}

/** Inline labels for a verdict's evidence ("Helms 2014; Garthe 2011"). */
export function evidenceLabels(ids: readonly string[]): string {
  return ids
    .map((key) => CITATIONS[key]?.label)
    .filter((s): s is string => !!s)
    .join("; ");
}
