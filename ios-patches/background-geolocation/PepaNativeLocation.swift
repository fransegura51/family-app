// PEPA-PATCH: ubicación en iPhone con la app CERRADA (contrapartida de BackgroundGeolocationService.java en Android).
//
// Cuando la persona cierra PEPA deslizándola, iOS mata el proceso y deja de dar posiciones. Lo único que iOS permite para volver a despertar la app es
// «cambios significativos de ubicación» (~500 m) y las regiones: al detectarlos relanza la app en segundo plano (launchOptions[.location]). Aquí:
//  1. JavaScript guarda dirección del servidor + llave de este móvil (setNativeUpload) en UserDefaults;
//  2. se vigilan los cambios significativos (despierta la app cerrada) y, ya despierta, se pide ubicación continua con filtro de distancia;
//  3. cada posición se manda sola a report_device_location (migración 0253), igual que en Android;
//  4. si el servidor contesta «off» o «revoked», se para y se borra la configuración.
// AppDelegate llama a resumeIfConfigured() al arrancar, también cuando el arranque lo provoca un cambio de ubicación.
//
// BORDES DE LUGARES (16/10/2026): los cambios significativos solo despiertan la app tras ~500 m, y casa y el cole pueden estar a menos (439 m: no salió ningún
// aviso). Por eso JavaScript también entrega la lista de lugares con aviso de llegada/salida (setNativeRegions) y aquí se vigilan como regiones circulares:
// iOS relanza la app cerrada al cruzar el borde de cualquiera y entonces se pide ubicación continua para mandar la posición hasta llegar (el servidor decide
// el aviso con el radio real del lugar). Para no gastar batería, la ubicación continua se apaga sola tras unos minutos sin moverse.
import CoreLocation
import Foundation
import UIKit

public final class PepaNativeLocation: NSObject, CLLocationManagerDelegate {
    public static let shared = PepaNativeLocation()

    private static let keyUrl = "pepa.nativeUpload.url"
    private static let keyApikey = "pepa.nativeUpload.apikey"
    private static let keyToken = "pepa.nativeUpload.token"
    private static let keyDistance = "pepa.nativeUpload.distance"
    private static let keyRegions = "pepa.nativeUpload.regions"
    // Prefijo de las regiones propias: así solo se tocan estas y nunca las de otro complemento.
    private static let regionPrefix = "pepa-"
    // Sin ninguna posición nueva durante este tiempo (estás quieta), se apaga la ubicación continua; los bordes y los cambios significativos siguen vigilando.
    private static let idleStopSeconds: TimeInterval = 180
    // Mismos límites que Android: no más de un envío cada 10 s y se descartan posiciones peores de 100 m de precisión.
    private static let minUploadGap: TimeInterval = 10
    private static let maxAccuracy: CLLocationAccuracy = 100
    // Saltos de GPS (iPhone, 16/10/2026): una posición suelta a 245 m que 4 s después se corrigió generó un aviso falso de salida y de llegada. Una posición que
    // se aleja más de jumpMeters de la última enviada hace menos de jumpWindowSeconds NO se envía hasta que la siguiente lectura (en menos de jumpConfirmSeconds)
    // la confirma a menos de jumpConfirmMeters; si la siguiente vuelve a la zona de antes, el salto se descarta. Un desplazamiento real (coche, a pie) se confirma
    // con la lectura siguiente; si pasó más tiempo desde el último envío (por ejemplo, tras despertar por un cambio significativo) se envía sin esperar.
    private static let jumpMeters: CLLocationDistance = 150
    private static let jumpWindowSeconds: TimeInterval = 120
    private static let jumpConfirmMeters: CLLocationDistance = 100
    private static let jumpConfirmSeconds: TimeInterval = 60

    private var manager: CLLocationManager?
    private var lastUploadAt: Date = .distantPast
    private var lastSentLocation: CLLocation?
    private var pendingJump: CLLocation?
    private var idleTimer: Timer?
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
        for key in [PepaNativeLocation.keyUrl, PepaNativeLocation.keyApikey, PepaNativeLocation.keyToken, PepaNativeLocation.keyDistance, PepaNativeLocation.keyRegions] {
            defaults.removeObject(forKey: key)
        }
        DispatchQueue.main.async { self.stop() }
    }

    // Lista de bordes (JSON: [{id, latitude, longitude, radius}]). Se guarda y se vigila ya; al relanzar iOS la app se retoma sola en start().
    public func setRegions(json: String) {
        defaults.set(json, forKey: PepaNativeLocation.keyRegions)
        DispatchQueue.main.async { self.syncRegions() }
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
        scheduleIdleStop()
        syncRegions()
    }

    private func stop() {
        idleTimer?.invalidate()
        idleTimer = nil
        if let manager = manager {
            for region in manager.monitoredRegions where region.identifier.hasPrefix(PepaNativeLocation.regionPrefix) {
                manager.stopMonitoring(for: region)
            }
            manager.stopMonitoringSignificantLocationChanges()
            manager.stopUpdatingLocation()
        }
        manager = nil
    }

    // Registra (o vuelve a registrar) los bordes guardados. Máximo 20 (límite de iOS) y radio mínimo de 100 m (ver domain/nativeRegions.ts).
    private func syncRegions() {
        guard let manager = manager else { return }
        for region in manager.monitoredRegions where region.identifier.hasPrefix(PepaNativeLocation.regionPrefix) {
            manager.stopMonitoring(for: region)
        }
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self),
              let json = defaults.string(forKey: PepaNativeLocation.keyRegions),
              let data = json.data(using: .utf8),
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        let limit = manager.maximumRegionMonitoringDistance > 0 ? manager.maximumRegionMonitoringDistance : 100000
        for item in list.prefix(20) {
            guard let id = item["id"] as? String,
                  let latitude = (item["latitude"] as? NSNumber)?.doubleValue,
                  let longitude = (item["longitude"] as? NSNumber)?.doubleValue else { continue }
            let radius = min(max((item["radius"] as? NSNumber)?.doubleValue ?? 100, 100), limit)
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                radius: radius,
                identifier: PepaNativeLocation.regionPrefix + id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
        }
    }

    // iOS acaba de despertar la app por cruzar un borde: ubicación continua para mandar la posición hasta llegar (o irse del todo).
    private func wakeForRegion() {
        guard isConfigured else { return }
        manager?.startUpdatingLocation()
        scheduleIdleStop()
    }

    // Reinicia la cuenta atrás: sin posiciones nuevas durante un rato, la ubicación continua se apaga (los bordes siguen vigilando).
    private func scheduleIdleStop() {
        idleTimer?.invalidate()
        idleTimer = Timer.scheduledTimer(withTimeInterval: PepaNativeLocation.idleStopSeconds, repeats: false) { [weak self] _ in
            self?.manager?.stopUpdatingLocation()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        scheduleIdleStop()
        let now = Date()
        if now.timeIntervalSince(lastUploadAt) < PepaNativeLocation.minUploadGap { return }
        if location.horizontalAccuracy < 0 || location.horizontalAccuracy > PepaNativeLocation.maxAccuracy { return }
        if let last = lastSentLocation,
           location.timestamp.timeIntervalSince(last.timestamp) < PepaNativeLocation.jumpWindowSeconds,
           location.distance(from: last) > PepaNativeLocation.jumpMeters {
            let confirmed = pendingJump.map {
                location.timestamp.timeIntervalSince($0.timestamp) < PepaNativeLocation.jumpConfirmSeconds
                    && location.distance(from: $0) <= PepaNativeLocation.jumpConfirmMeters
            } ?? false
            if !confirmed {
                pendingJump = location
                return
            }
        }
        pendingJump = nil
        lastSentLocation = location
        lastUploadAt = now
        upload(location)
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        wakeForRegion()
    }

    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        wakeForRegion()
    }

    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        // Si iOS rechaza un borde (por ejemplo, por pasarse de 20), los demás y los cambios significativos siguen funcionando.
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
