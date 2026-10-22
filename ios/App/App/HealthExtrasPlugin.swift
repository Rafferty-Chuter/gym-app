import Foundation
import Capacitor
import HealthKit

/// IN8: the Apple Health reads `@capgo/capacitor-health` lacks: caffeine,
/// sodium and drinks as day sums, and menstrual flow (only when the person
/// opts in, which the web code decides). It also asks for every kind the app
/// reads in one permission sheet, since a HealthKit permission belongs to the
/// app, whichever plugin reads. Read only: nothing is written to Health.
///
/// JavaScript reaches it as `HealthExtras` (lib/physique/io/nativeHealth.ts),
/// registered by `AppViewController` below.
@objc(HealthExtrasPlugin)
public class HealthExtrasPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthExtrasPlugin"
    public let jsName = "HealthExtras"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryDailySums", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMenstrualFlow", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// The kinds by the names the web code uses: the HealthKit plugin's names, then this plugin's own.
    private func objectType(_ name: String) -> HKObjectType? {
        switch name {
        case "sleep": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        case "weight": return HKObjectType.quantityType(forIdentifier: .bodyMass)
        case "bodyFat": return HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)
        case "heartRateVariability": return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
        case "restingHeartRate": return HKObjectType.quantityType(forIdentifier: .restingHeartRate)
        case "steps": return HKObjectType.quantityType(forIdentifier: .stepCount)
        case "calories": return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
        case "dietaryWater": return HKObjectType.quantityType(forIdentifier: .dietaryWater)
        case "workouts": return HKObjectType.workoutType()
        case "appleSleepingWristTemperature":
            if #available(iOS 16.0, *) { return HKObjectType.quantityType(forIdentifier: .appleSleepingWristTemperature) }
            return nil
        case "menstrualFlow": return HKObjectType.categoryType(forIdentifier: .menstrualFlow)
        default: return sumType(name)
        }
    }

    /// The kinds read as day sums, and the unit each is returned in.
    private func sumType(_ name: String) -> HKQuantityType? {
        switch name {
        case "dietaryCaffeine": return HKObjectType.quantityType(forIdentifier: .dietaryCaffeine)
        case "dietarySodium": return HKObjectType.quantityType(forIdentifier: .dietarySodium)
        case "numberOfAlcoholicBeverages": return HKObjectType.quantityType(forIdentifier: .numberOfAlcoholicBeverages)
        default: return nil
        }
    }

    private func sumUnit(_ name: String) -> HKUnit {
        name == "numberOfAlcoholicBeverages" ? HKUnit.count() : HKUnit.gramUnit(with: .milli)
    }

    private func dates(_ call: CAPPluginCall) -> (Date, Date)? {
        guard let s = call.getString("startDate"), let e = call.getString("endDate"),
              let start = iso.date(from: s) ?? ISO8601DateFormatter().date(from: s),
              let end = iso.date(from: e) ?? ISO8601DateFormatter().date(from: e),
              start < end else { return nil }
        return (start, end)
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device.")
            return
        }
        let names = (call.getArray("read") ?? []).compactMap { $0 as? String }
        let read = Set(names.compactMap { objectType($0) })
        store.requestAuthorization(toShare: nil, read: read) { _, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                } else {
                    call.resolve()
                }
            }
        }
    }

    /// Day sums in the phone's calendar, from local midnight; days with nothing logged are left out.
    @objc func queryDailySums(_ call: CAPPluginCall) {
        let name = call.getString("dataType") ?? ""
        guard let type = sumType(name) else {
            call.reject("Unsupported data type: \(name).")
            return
        }
        guard let (start, end) = dates(call) else {
            call.reject("A start before the end is needed.")
            return
        }
        let calendar = Calendar.current
        let anchor = calendar.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum, anchorDate: anchor, intervalComponents: DateComponents(day: 1))
        let unit = sumUnit(name)
        query.initialResultsHandler = { [weak self] _, collection, error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async { call.reject(error.localizedDescription, nil, error) }
                return
            }
            var samples: [[String: Any]] = []
            collection?.enumerateStatistics(from: anchor, to: end) { stats, _ in
                guard let sum = stats.sumQuantity() else { return }
                samples.append([
                    "startDate": self.iso.string(from: stats.startDate),
                    "endDate": self.iso.string(from: stats.endDate),
                    "value": sum.doubleValue(for: unit)
                ])
            }
            DispatchQueue.main.async { call.resolve(["samples": samples]) }
        }
        store.execute(query)
    }

    /// Menstrual flow entries: HealthKit's category value (1 unspecified, 2 light, 3 medium, 4 heavy, 5 none) and the cycle-start flag.
    @objc func readMenstrualFlow(_ call: CAPPluginCall) {
        guard let type = HKObjectType.categoryType(forIdentifier: .menstrualFlow) else {
            call.reject("Menstrual flow is not available on this device.")
            return
        }
        guard let (start, end) = dates(call) else {
            call.reject("A start before the end is needed.")
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, results, error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async { call.reject(error.localizedDescription, nil, error) }
                return
            }
            let samples: [[String: Any]] = (results as? [HKCategorySample] ?? []).map { s in
                [
                    "startDate": self.iso.string(from: s.startDate),
                    "endDate": self.iso.string(from: s.endDate),
                    "value": s.value,
                    "cycleStart": (s.metadata?[HKMetadataKeyMenstrualCycleStart] as? NSNumber)?.boolValue ?? false
                ]
            }
            DispatchQueue.main.async { call.resolve(["samples": samples]) }
        }
        store.execute(query)
    }
}

/// The app's bridge: Capacitor's own, with the app's local plugins registered.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthExtrasPlugin())
    }
}
