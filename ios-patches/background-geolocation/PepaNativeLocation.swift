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
    // Saltos de GPS (iPhone): una lectura lejana NO se envía mientras no haya pruebas de movimiento real, porque en el servidor dispara un aviso FALSO de
    // «se ha ido de Casa». Casos reales: 16/10/2026 (posición a 245 m que se corrigió 4 s después) y 21/10/2026 (una posición de RED mal colocada a ~400 m,
    // las mismas coordenadas una y otra vez con la hora al día, 242 lecturas lejanas en un día, avisos de salida y llegada alternados). Un salto que se «confirma»
    // con una segunda lectura igual de falsa no sirve; por eso la misma regla que Android (NativeLocationReceiver.acceptAfterJumpCheck) y la app abierta
    // (src/domain/gpsJump.ts): una lectura a más de jumpMeters de la última enviada (si es de hace menos de un día) se RETIENE y solo se acepta con
    //   · dos lecturas seguidas CON velocidad (≥ minMovingSpeed; una posición de red no trae velocidad), o
    //   · tres lecturas seguidas, cada una más lejos de la última enviada que la anterior (un camino de verdad se aleja; una posición que baila, no), o
    //   · 30 min seguida en el mismo sitio (una mudanza real).
    // Si la lectura vuelve a la zona de antes, la retenida se descarta.
    // Causa del 17/10/2026: al relanzar iOS la app cerrada, la PRIMERA lectura es a menudo la última posición guardada (antigua) y el servidor, que cambia por
    // «ahora» toda hora de hace más de 10 minutos, la daba por reciente. Una lectura de más de maxReadingAgeSeconds de antigüedad no se envía; y la última
    // posición enviada se guarda en el móvil para que el filtro valga también tras relanzar.
    private static let maxReadingAgeSeconds: TimeInterval = 15
    private static let keyLastLat = "pepa.nativeUpload.lastLat"
    private static let keyLastLon = "pepa.nativeUpload.lastLon"
    private static let keyLastAt = "pepa.nativeUpload.lastAt"
    private static let jumpMeters: CLLocationDistance = 150
    // Entre lecturas retenidas seguidas (mismo recorrido): más lejos que esto no se consideran del mismo sitio.
    private static let jumpStepRadius: CLLocationDistance = 100
    private static let jumpHoldGapSeconds: TimeInterval = 600
    // El último punto enviado puede ser de hace horas (quieta en casa no llegan lecturas): el filtro SIGUE valiendo hasta un día.
    private static let jumpCheckWindowSeconds: TimeInterval = 86_400
    private static let jumpPersistSeconds: TimeInterval = 1_800
    private static let minMovingSpeed: CLLocationSpeed = 0.5
    private static let jumpMinAwayStep: CLLocationDistance = 15
    private static let jumpSpeedReadings = 2
    private static let jumpAwayReadings = 3

    private var manager: CLLocationManager?
    private var lastUploadAt: Date = .distantPast
    private var lastSentLocation: CLLocation? {
        get {
            guard let lat = defaults.object(forKey: PepaNativeLocation.keyLastLat) as? Double,
                  let lon = defaults.object(forKey: PepaNativeLocation.keyLastLon) as? Double,
                  let at = defaults.object(forKey: PepaNativeLocation.keyLastAt) as? Double else { return nil }
            return CLLocation(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), altitude: 0, horizontalAccuracy: 0, verticalAccuracy: -1, timestamp: Date(timeIntervalSince1970: at))
        }
        set {
            if let location = newValue {
                defaults.set(location.coordinate.latitude, forKey: PepaNativeLocation.keyLastLat)
                defaults.set(location.coordinate.longitude, forKey: PepaNativeLocation.keyLastLon)
                defaults.set(location.timestamp.timeIntervalSince1970, forKey: PepaNativeLocation.keyLastAt)
            } else {
                for key in [PepaNativeLocation.keyLastLat, PepaNativeLocation.keyLastLon, PepaNativeLocation.keyLastAt] { defaults.removeObject(forKey: key) }
            }
        }
    }
    private struct HeldJump {
        var first: CLLocation
        var last: CLLocation
        var speedReadings: Int
        var awayReadings: Int
    }
    private var heldJump: HeldJump?
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
        for key in [PepaNativeLocation.keyUrl, PepaNativeLocation.keyApikey, PepaNativeLocation.keyToken, PepaNativeLocation.keyDistance, PepaNativeLocation.keyRegions,
                    PepaNativeLocation.keyLastLat, PepaNativeLocation.keyLastLon, PepaNativeLocation.keyLastAt] {
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
        if now.timeIntervalSince(location.timestamp) > PepaNativeLocation.maxReadingAgeSeconds { return }
        if !acceptAfterJumpCheck(location) { return }
        lastUploadAt = now
        upload(location)
    }

    private func markAccepted(_ location: CLLocation) -> Bool {
        heldJump = nil
        lastSentLocation = location
        return true
    }

    // true = enviar esta lectura; false = retenida (posible posición falsa). Misma regla que Android y que src/domain/gpsJump.ts.
    private func acceptAfterJumpCheck(_ location: CLLocation) -> Bool {
        guard let last = lastSentLocation else { return markAccepted(location) }
        let sinceLast = location.timestamp.timeIntervalSince(last.timestamp)
        if sinceLast < 0 || sinceLast > PepaNativeLocation.jumpCheckWindowSeconds { return markAccepted(location) }
        let fromLast = location.distance(from: last)
        if fromLast <= PepaNativeLocation.jumpMeters { return markAccepted(location) }

        // Lectura lejana.
        guard let held = heldJump,
              location.timestamp.timeIntervalSince(held.last.timestamp) >= 0,
              location.timestamp.timeIntervalSince(held.last.timestamp) <= PepaNativeLocation.jumpHoldGapSeconds,
              location.distance(from: held.last) <= PepaNativeLocation.jumpStepRadius else {
            heldJump = HeldJump(first: location, last: location, speedReadings: 0, awayReadings: 0)
            return false
        }
        let previousFar = last.distance(from: held.last)
        let moving = location.speed >= PepaNativeLocation.minMovingSpeed
        let next = HeldJump(
            first: held.first,
            last: location,
            speedReadings: moving ? held.speedReadings + 1 : 0,
            awayReadings: fromLast - previousFar >= PepaNativeLocation.jumpMinAwayStep ? held.awayReadings + 1 : 0
        )
        heldJump = next
        if next.speedReadings >= PepaNativeLocation.jumpSpeedReadings
            || next.awayReadings >= PepaNativeLocation.jumpAwayReadings
            || location.timestamp.timeIntervalSince(next.first.timestamp) >= PepaNativeLocation.jumpPersistSeconds {
            return markAccepted(location)
        }
        return false
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
