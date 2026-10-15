// PEPA-PATCH: ubicación en iPhone con la app CERRADA (contrapartida de BackgroundGeolocationService.java en Android).
//
// Cuando la persona cierra PEPA deslizándola, iOS mata el proceso y deja de dar posiciones. Lo único que iOS permite para volver a despertar la app es
// «cambios significativos de ubicación» (~500 m) y las regiones: al detectarlos relanza la app en segundo plano (launchOptions[.location]). Aquí:
//  1. JavaScript guarda dirección del servidor + llave de este móvil (setNativeUpload) en UserDefaults;
//  2. se vigilan los cambios significativos (despierta la app cerrada) y, ya despierta, se pide ubicación continua con filtro de distancia;
//  3. cada posición se manda sola a report_device_location (migración 0253), igual que en Android;
//  4. si el servidor contesta «off» o «revoked», se para y se borra la configuración.
// AppDelegate llama a resumeIfConfigured() al arrancar, también cuando el arranque lo provoca un cambio de ubicación.
import CoreLocation
import Foundation
import UIKit

public final class PepaNativeLocation: NSObject, CLLocationManagerDelegate {
    public static let shared = PepaNativeLocation()

    private static let keyUrl = "pepa.nativeUpload.url"
    private static let keyApikey = "pepa.nativeUpload.apikey"
    private static let keyToken = "pepa.nativeUpload.token"
    private static let keyDistance = "pepa.nativeUpload.distance"
    // Mismos límites que Android: no más de un envío cada 10 s y se descartan posiciones peores de 100 m de precisión.
    private static let minUploadGap: TimeInterval = 10
    private static let maxAccuracy: CLLocationAccuracy = 100

    private var manager: CLLocationManager?
    private var lastUploadAt: Date = .distantPast
    private let defaults = UserDefaults.standard

    public var isConfigured: Bool {
        return defaults.string(forKey: PepaNativeLocation.keyToken) != nil && defaults.string(forKey: PepaNativeLocation.keyUrl) != nil
    }

    public func configure(url: String, apikey: String, token: String, distanceFilter: Double) {
        defaults.set(url, forKey: PepaNativeLocation.keyUrl)
        defaults.set(apikey, forKey: PepaNativeLocation.keyApikey)
        defaults.set(token, forKey: PepaNativeLocation.keyToken)
        defaults.set(distanceFilter, forKey: PepaNativeLocation.keyDistance)
        DispatchQueue.main.async { self.start() }
    }

    public func clear() {
        for key in [PepaNativeLocation.keyUrl, PepaNativeLocation.keyApikey, PepaNativeLocation.keyToken, PepaNativeLocation.keyDistance] {
            defaults.removeObject(forKey: key)
        }
        DispatchQueue.main.async { self.stop() }
    }

    // ¿Tiene la app el permiso «Siempre»? Sin él iOS no la relanza con la app cerrada.
    public static func hasAlwaysPermission() -> Bool {
        return CLLocationManager.authorizationStatus() == .authorizedAlways
    }

    // Se llama en cada arranque de la app (incluido el que provoca iOS en segundo plano por un cambio de ubicación).
    public func resumeIfConfigured() {
        guard isConfigured else { return }
        DispatchQueue.main.async { self.start() }
    }

    private func start() {
        guard isConfigured else { return }
        if manager == nil {
            let created = CLLocationManager()
            created.delegate = self
            created.allowsBackgroundLocationUpdates = true
            created.pausesLocationUpdatesAutomatically = false
            created.desiredAccuracy = kCLLocationAccuracyBest
            manager = created
        }
        guard let manager = manager else { return }
        let distance = defaults.double(forKey: PepaNativeLocation.keyDistance)
        manager.distanceFilter = distance > 0 ? distance : 25
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        }
        manager.startUpdatingLocation()
    }

    private func stop() {
        manager?.stopMonitoringSignificantLocationChanges()
        manager?.stopUpdatingLocation()
        manager = nil
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let now = Date()
        if now.timeIntervalSince(lastUploadAt) < PepaNativeLocation.minUploadGap { return }
        if location.horizontalAccuracy < 0 || location.horizontalAccuracy > PepaNativeLocation.maxAccuracy { return }
        lastUploadAt = now
        upload(location)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // locationUnknown es normal al principio; cualquier otro fallo se reintenta solo con la siguiente posición.
    }

    private func upload(_ location: CLLocation) {
        guard let urlText = defaults.string(forKey: PepaNativeLocation.keyUrl),
              let apikey = defaults.string(forKey: PepaNativeLocation.keyApikey),
              let token = defaults.string(forKey: PepaNativeLocation.keyToken),
              let url = URL(string: urlText + "/rest/v1/rpc/report_device_location") else { return }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let body: [String: Any] = [
            "p_token": token,
            "p_latitude": location.coordinate.latitude,
            "p_longitude": location.coordinate.longitude,
            "p_recorded_at": formatter.string(from: location.timestamp),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apikey, forHTTPHeaderField: "apikey")
        // Igual que en Android: las llaves nuevas (sb_publishable_…) no son JWT y no van en Authorization.
        if apikey.hasPrefix("eyJ") { request.setValue("Bearer " + apikey, forHTTPHeaderField: "Authorization") }

        // Con la app en segundo plano iOS suspende el proceso enseguida: se pide tiempo extra para terminar el envío.
        var taskId = UIBackgroundTaskIdentifier.invalid
        taskId = UIApplication.shared.beginBackgroundTask(withName: "pepa-upload") {
            UIApplication.shared.endBackgroundTask(taskId)
            taskId = .invalid
        }
        URLSession.shared.dataTask(with: request) { [weak self] responseData, _, _ in
            if let responseData = responseData, let answer = String(data: responseData, encoding: .utf8),
               answer.contains("\"off\"") || answer.contains("\"revoked\"") {
                // «off» = esa persona ya no comparte; «revoked» = llave anulada: no tiene sentido seguir.
                self?.clear()
            }
            if taskId != .invalid { UIApplication.shared.endBackgroundTask(taskId) }
        }.resume()
    }
}
