// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The iPhone app's privacy files (TR5): `ios/App/App/PrivacyInfo.xcprivacy`
 * uses only Apple's keys and reason codes, is bundled by the Xcode
 * project, and covers every native plugin; Info.plist keeps the Health
 * purpose strings and the export-compliance answer; the app never writes
 * to Apple Health. A new native plugin fails here until someone has checked
 * its required-reason APIs (docs/plan/testers/testflight.md §1).
 */

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── A small XML plist reader (dict, array, key, string, true, false, integer) ──

type Plist = string | number | boolean | Plist[] | { [k: string]: Plist };

function parsePlist(xml: string): Plist {
  const tokens = xml
    .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, "")
    .match(/<[^>]+>|[^<]+/g)!
    .map((t) => t.trim())
    .filter(Boolean);
  let i = 0;
  const text = (tag: string) => {
    if (tokens[i] === `</${tag}>`) {
      i++;
      return "";
    }
    const v = tokens[i++];
    expect(tokens[i++]).toBe(`</${tag}>`);
    return v;
  };
  const value = (): Plist => {
    const t = tokens[i++];
    if (t === "<true/>") return true;
    if (t === "<false/>") return false;
    if (t === "<array/>") return [];
    if (t === "<dict/>") return {};
    if (t === "<string>") return text("string");
    if (t === "<integer>") return Number(text("integer"));
    if (t === "<array>") {
      const out: Plist[] = [];
      while (tokens[i] !== "</array>") out.push(value());
      i++;
      return out;
    }
    if (t === "<dict>") {
      const out: Record<string, Plist> = {};
      while (tokens[i] !== "</dict>") {
        expect(tokens[i++]).toBe("<key>");
        const k = text("key");
        out[k] = value();
      }
      i++;
      return out;
    }
    throw new Error(`Unexpected plist token ${t}`);
  };
  expect(tokens[i++]).toMatch(/^<plist/);
  const root = value();
  expect(tokens[i]).toBe("</plist>");
  return root;
}

// ── Apple's allowed values (developer.apple.com, bundleresources, checked 2026-10-21) ──

const DATA_TYPES = new Set(
  "Name EmailAddress PhoneNumber PhysicalAddress OtherUserContactInfo Health Fitness PaymentInfo CreditInfo OtherFinancialInfo PreciseLocation CoarseLocation SensitiveInfo Contacts EmailsOrTextMessages PhotosorVideos AudioData GameplayContent CustomerSupport OtherUserContent BrowsingHistory SearchHistory UserID DeviceID PurchaseHistory ProductInteraction AdvertisingData OtherUsageData CrashData PerformanceData OtherDiagnosticData EnvironmentScanning Hands Head OtherDataTypes"
    .split(" ")
    .map((t) => `NSPrivacyCollectedDataType${t}`),
);
const PURPOSES = new Set(
  ["ThirdPartyAdvertising", "DeveloperAdvertising", "Analytics", "ProductPersonalization", "AppFunctionality", "Other"].map((p) => `NSPrivacyCollectedDataTypePurpose${p}`),
);
const API_REASONS: Record<string, readonly string[]> = {
  NSPrivacyAccessedAPICategoryFileTimestamp: ["DDA9.1", "C617.1", "3B52.1", "0A2A.1"],
  NSPrivacyAccessedAPICategorySystemBootTime: ["35F9.1", "8FFB.1", "3D61.1"],
  NSPrivacyAccessedAPICategoryDiskSpace: ["85F4.1", "E174.1", "7D9E.1", "B728.1"],
  NSPrivacyAccessedAPICategoryActiveKeyboards: ["3EC4.1", "54BD.1"],
  NSPrivacyAccessedAPICategoryUserDefaults: ["CA92.1", "1C8F.1", "C56D.1", "AC6B.1"],
};

/**
 * Every Capacitor package in package.json and the required-reason API
 * categories its native code uses that our manifest must declare. Checked
 * by reading each package's Swift source (testflight.md §1).
 */
const NATIVE_PACKAGES: Record<string, readonly string[]> = {
  // JS only.
  "@capacitor/core": [],
  // Ships as Apple-signed xcframeworks with their own manifests (they declare nothing).
  "@capacitor/ios": [],
  // Build tool, not in the app.
  "@capacitor/cli": [],
  // IONFilesystemLib reads creation and modification dates (attributesOfItem) for stat and readdir.
  "@capacitor/filesystem": ["NSPrivacyAccessedAPICategoryFileTimestamp"],
  // HealthKit only: no UserDefaults, file timestamps, boot time, disk space or keyboards.
  "@capgo/capacitor-health": [],
  // UserNotifications only (TR11, checked 22 Oct 2026): no UserDefaults, file timestamps, boot time, disk space or keyboards.
  "@capacitor/local-notifications": [],
};

const manifest = parsePlist(read("ios/App/App/PrivacyInfo.xcprivacy")) as Record<string, Plist>;
type Collected = { NSPrivacyCollectedDataType: string; NSPrivacyCollectedDataTypeLinked: boolean; NSPrivacyCollectedDataTypeTracking: boolean; NSPrivacyCollectedDataTypePurposes: string[] };
type Accessed = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };
const collected = manifest.NSPrivacyCollectedDataTypes as Collected[];
const accessed = manifest.NSPrivacyAccessedAPITypes as Accessed[];

describe("PrivacyInfo.xcprivacy", () => {
  it("has exactly the four top-level keys and no tracking", () => {
    expect(Object.keys(manifest).sort()).toEqual(["NSPrivacyAccessedAPITypes", "NSPrivacyCollectedDataTypes", "NSPrivacyTracking", "NSPrivacyTrackingDomains"]);
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  });

  it("uses only Apple's data types and purposes, each once, none for tracking", () => {
    const types = collected.map((c) => c.NSPrivacyCollectedDataType);
    expect(new Set(types).size).toBe(types.length);
    for (const c of collected) {
      expect(Object.keys(c).sort()).toEqual(["NSPrivacyCollectedDataType", "NSPrivacyCollectedDataTypeLinked", "NSPrivacyCollectedDataTypePurposes", "NSPrivacyCollectedDataTypeTracking"]);
      expect(DATA_TYPES.has(c.NSPrivacyCollectedDataType)).toBe(true);
      expect(c.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(c.NSPrivacyCollectedDataTypePurposes.length).toBeGreaterThan(0);
      for (const p of c.NSPrivacyCollectedDataTypePurposes) expect(PURPOSES.has(p)).toBe(true);
    }
  });

  it("declares what App Store Connect is told (testflight.md §5)", () => {
    const linked = Object.fromEntries(collected.map((c) => [c.NSPrivacyCollectedDataType.replace("NSPrivacyCollectedDataType", ""), c.NSPrivacyCollectedDataTypeLinked]));
    expect(linked).toEqual({ Health: true, Fitness: true, EmailAddress: true, UserID: true, DeviceID: false, SearchHistory: false, CrashData: false });
    for (const c of collected) expect(c.NSPrivacyCollectedDataTypePurposes).toEqual(["NSPrivacyCollectedDataTypePurposeAppFunctionality"]);
  });

  it("uses only valid reason codes for each required-reason category", () => {
    for (const a of accessed) {
      expect(Object.keys(API_REASONS)).toContain(a.NSPrivacyAccessedAPIType);
      expect(a.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
      for (const r of a.NSPrivacyAccessedAPITypeReasons) expect(API_REASONS[a.NSPrivacyAccessedAPIType]).toContain(r);
    }
  });

  it("covers every native package, and every package in package.json has been checked", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const capacitorPackages = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => /^@capacitor\/|^@capgo\/|capacitor/.test(n));
    expect(capacitorPackages.filter((n) => !(n in NATIVE_PACKAGES))).toEqual([]);
    const declared = new Set(accessed.map((a) => a.NSPrivacyAccessedAPIType));
    const needed = new Set(capacitorPackages.flatMap((n) => NATIVE_PACKAGES[n]));
    expect([...declared].sort()).toEqual([...needed].sort());
  });

  it("is a resource of the App target in the Xcode project", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    const ref = pbx.match(/(\w{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;[^}]*path = PrivacyInfo\.xcprivacy;/);
    expect(ref).not.toBeNull();
    const build = pbx.match(new RegExp(`(\\w{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref![1]} `));
    expect(build).not.toBeNull();
    const resources = pbx.match(/\/\* Begin PBXResourcesBuildPhase section \*\/([\s\S]*?)\/\* End PBXResourcesBuildPhase section \*\//)![1];
    expect(resources).toContain(`${build![1]} /* PrivacyInfo.xcprivacy in Resources */`);
  });
});

describe("Info.plist", () => {
  const info = parsePlist(read("ios/App/App/Info.plist")) as Record<string, Plist>;

  it("names each kind the app reads from Apple Health", () => {
    const share = String(info.NSHealthShareUsageDescription).toLowerCase();
    for (const kind of ["sleep", "hrv", "resting heart rate", "weight", "body fat", "steps"]) expect(share).toContain(kind);
  });

  it("keeps a truthful update string: the HealthKit framework references write APIs, so the upload check (ITMS-90683) asks for it", () => {
    expect(String(info.NSHealthUpdateUsageDescription)).toMatch(/only reads/i);
  });

  it("answers export compliance: HTTPS through the system only", () => {
    expect(info.ITSAppUsesNonExemptEncryption).toBe(false);
  });
});

describe("Apple Health is read only", () => {
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const p = join(dir, name);
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) sources.push(p);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(d);

  it("never calls the plugin's write method", () => {
    expect(sources.filter((p) => /\bsaveSample\b/.test(read(p)))).toEqual([]);
  });

  it("asks for read access only", () => {
    const calls = sources.flatMap((p) => [...read(p).matchAll(/Health\.requestAuthorization\(([^)]*)\)/g)].map((m) => m[1]));
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) expect(args).toMatch(/write:\s*\[\]/);
  });
});
