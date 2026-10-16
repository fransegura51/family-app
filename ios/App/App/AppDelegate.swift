import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import CapacitorCommunityBackgroundGeolocation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Avisos: Firebase solo se arranca si la compilación lleva GoogleService-Info.plist (en la comprobación de GitHub, sin firmar y sin secretos,
        // no lo lleva y la app arranca igual, sin avisos). El archivo va como secreto del repositorio, nunca en el código.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        // Ubicación con la app cerrada: si ya hay llave guardada, se retoma la vigilancia. Es lo que hace iOS al relanzar la app en segundo plano
        // por un cambio significativo de ubicación (launchOptions[.location]), aunque la persona la hubiera deslizado para cerrarla.
        PepaNativeLocation.shared.resumeIfConfigured()
        return true
    }

    // Apple entrega el identificador del iPhone (APNs); Firebase lo cambia por el token de FCM, que es el que guarda PEPA como «fcm:<token>»
    // (igual que en Android). El plugin de avisos de Capacitor recibe el resultado por estas dos notificaciones.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else {
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                            object: NSError(domain: "PEPA", code: 1, userInfo: [NSLocalizedDescriptionKey: "Avisos sin configurar (falta GoogleService-Info.plist)"]))
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        // Si Firebase no contesta, que el aviso de la pantalla diga en qué paso se ha quedado (Apple ya respondió; el que falla es Firebase).
        var finished = false
        let limit = DispatchWorkItem {
            guard !finished else { return }
            finished = true
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                            object: NSError(domain: "PEPA", code: 2, userInfo: [NSLocalizedDescriptionKey: "Apple ya ha registrado este iPhone, pero Firebase no ha devuelto el token en 10 segundos"]))
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: limit)
        Messaging.messaging().token { token, error in
            DispatchQueue.main.async {
                guard !finished else { return }
                finished = true
                limit.cancel()
                if let error = error {
                    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                                    object: NSError(domain: "PEPA", code: 3, userInfo: [NSLocalizedDescriptionKey: "Firebase no ha dado el token: \(error.localizedDescription)"]))
                } else if let token = token {
                    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
                }
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                        object: NSError(domain: "PEPA", code: 4, userInfo: [NSLocalizedDescriptionKey: "Apple no ha podido registrar este iPhone para avisos: \(error.localizedDescription)"]))
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {

        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

}
