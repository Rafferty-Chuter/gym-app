# Food data

## cofid.json

McCance and Widdowson's *The Composition of Foods Integrated Dataset* (CoFID) 2021, Public Health England. Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Source page: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid

One row per food from the "1.3 Proximates" sheet, per 100 g as eaten: `[code, name, group, kcal, proteinG, fatG, carbsG, fibreG | null, sodiumMg | null, sugarG | null, satFatG | null, alcoholG | null]`. Sugars (total, as monosaccharide equivalents), saturated fat and alcohol are from "1.3 Proximates"; sodium is from "1.4 Inorganics", joined by food code (IN6). Trace values are 0; a blank or "N" is null (not known, never zero). Foods without complete energy and macros are left out (34 of 2,760).

Rebuild after a new CoFID release:

```
npx tsx scripts/build-cofid.ts /path/to/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx
```

Household portions for these foods live in `lib/food/portions.ts`, not here: CoFID has no portion sizes.

## Products

Packaged foods come from [Open Food Facts](https://world.openfoodfacts.org) at request time through `/api/food/search` and `/api/food/barcode` (`lib/server/off.ts`), data licensed under the Open Database License. Nothing from it is stored here.
