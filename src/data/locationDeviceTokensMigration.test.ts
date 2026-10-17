// Ubicación con la app nativa cerrada (migración 0253 + parche del servicio de Android). Se leen los textos: la base y Android no se pueden montar aquí.
import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/0253_location_device_tokens.sql?raw'
import rollback from '../../supabase/rollbacks/0253_location_device_tokens_down.sql?raw'
import service from '../../android-patches/background-geolocation/BackgroundGeolocationService.java?raw'
import receiver from '../../android/app/src/main/java/es/pepafamilyapp/app/NativeLocationReceiver.java?raw'
import bootReceiver from '../../android/app/src/main/java/es/pepafamilyapp/app/NativeBootReceiver.java?raw'
import patchScript from '../../scripts/patch-background-geolocation.mjs?raw'
import androidWorkflow from '../../.github/workflows/android-apk.yml?raw'
import packageJson from '../../package.json?raw'
import sharing from '@/services/locationSharing.ts?raw'
import settings from '@/ui/MenuSettingsScreen.tsx?raw'
import manifest from '../../android/app/src/main/AndroidManifest.xml?raw'
import locationActions from '@/pepa/actions/locationActions.ts?raw'
import locationScreen from '@/ui/LocationScreen.tsx?raw'

describe('0253: llaves de móvil para mandar la ubicación', () => {
  it('la tabla es privada: RLS activo, sin políticas y sin acceso directo', () => {
    expect(sql).toContain('create table public.location_device_tokens')
    expect(sql).toContain('alter table public.location_device_tokens enable row level security;')
    expect(sql).toContain('revoke all on public.location_device_tokens from anon, authenticated;')
    expect(sql).not.toMatch(/create policy/i)
  })

  it('en la base solo se guarda la huella de la llave, nunca la llave', () => {
    expect(sql).toContain('token_hash text not null unique')
    expect(sql).toContain("encode(sha256(convert_to(v_token, 'utf8')), 'hex')")
    expect(sql).not.toMatch(/\btoken text\b/)
  })

  it('las tres funciones son SECURITY DEFINER con search_path vacío', () => {
    expect((sql.match(/security definer/g) ?? []).length).toBe(3)
    expect((sql.match(/set search_path = ''/g) ?? []).length).toBe(3)
  })

  it('crear y anular llaves: solo con sesión; mandar la ubicación: con la clave pública', () => {
    expect(sql).toContain('revoke execute on function public.create_location_device_token(uuid) from public, anon;')
    expect(sql).toContain('grant execute on function public.create_location_device_token(uuid) to authenticated;')
    expect(sql).toContain('revoke execute on function public.revoke_location_device_tokens() from public, anon;')
    expect(sql).toContain('grant execute on function public.report_device_location(text, double precision, double precision, timestamptz) to anon, authenticated;')
  })

  it('nadie puede pedir la llave de otra persona: tiene que ser el miembro vinculado a su cuenta', () => {
    expect(sql).toContain('where fm.id = p_member_id and fm.linked_profile_id = auth.uid()')
  })

  it('mandar la ubicación exige llave válida, que la persona siga compartiendo y coordenadas posibles; responde off/revoked/invalid/ok', () => {
    expect(sql).toContain('length(p_token) <> 64')
    expect(sql).toContain('t.revoked_at is null')
    expect(sql).toContain('from public.location_sharing_consent c where c.member_id = v_tok.member_id and c.enabled')
    expect(sql).toContain('p_latitude not between -90 and 90')
    for (const answer of ["'off'", "'revoked'", "'invalid'", "'ok'"]) expect(sql).toContain(`return ${answer};`)
  })

  it('la hora que manda el móvil no se acepta a ciegas, y hay un freno de 8 s igual que la app abierta', () => {
    expect(sql).toContain("v_at < now() - interval '10 minutes' or v_at > now() + interval '1 minute'")
    expect(sql).toContain("v_last_live > now() - interval '8 seconds'")
  })

  it('el rastro sigue la misma regla que la app abierta: cada 5 min, o 30 m con 10 s de margen', () => {
    expect(sql).toContain("v_at - v_hist_at >= interval '5 minutes'")
    expect(sql).toContain("v_at - v_hist_at >= interval '10 seconds'")
    expect(sql).toContain('if v_dist >= 30 then')
  })

  it('tiene su marcha atrás', () => {
    expect(rollback).toContain('drop table if exists public.location_device_tokens;')
    expect(rollback).toContain('drop function if exists public.report_device_location')
  })
})

describe('servicio de Android que sigue con la app cerrada', () => {
  it('no se apaga al cerrar la app si hay envío nativo, y se levanta solo si el sistema lo mata', () => {
    expect(service).toContain('return START_STICKY;')
    expect(service).toContain('public void onRebind(Intent intent)')
    expect(service).toMatch(/if \(hasNativeUpload\(\)\) \{\s*startNativeWatcher\(\);\s*return true;/)
    expect(service).toMatch(/if \(!hasNativeUpload\(\)\) \{\s*BackgroundGeolocationService\.this\.stopSelf\(\);/)
  })

  it('el receptor manda a report_device_location con la llave, sin más datos que la posición, y reintenta una vez', () => {
    expect(receiver).toContain('/rest/v1/rpc/report_device_location')
    for (const field of ['p_token', 'p_latitude', 'p_longitude', 'p_recorded_at']) expect(receiver).toContain(`"${field}"`)
    expect(receiver).toContain('attempt <= 2')
  })

  it('las posiciones llegan por un PendingIntent que sobrevive a que Android mate el proceso, y el receptor está declarado', () => {
    expect(service).toContain('client.requestLocationUpdates(locationRequest, pendingIntent)')
    expect(service).toContain('es.pepafamilyapp.app.NativeLocationReceiver')
    expect(manifest).toContain('android:name=".NativeLocationReceiver"')
    expect(receiver).toContain('goAsync()')
    expect(receiver).toContain('LocationResult.hasResult(intent)')
  })

  it('no se apaga por una sola respuesta «off»/«revoked»: hacen falta varias seguidas', () => {
    expect(receiver).toContain('MAX_BAD_ANSWERS = 3')
    expect(receiver).toContain('answer.contains("\\"off\\"") || answer.contains("\\"revoked\\"")')
    expect(receiver).toContain('bad >= MAX_BAD_ANSWERS')
  })

  it('descarta posiciones imprecisas y respeta un mínimo entre envíos', () => {
    expect(receiver).toContain('MAX_ACCURACY_M = 100f')
    expect(receiver).toContain('MIN_UPLOAD_GAP_MS = 10_000L')
  })

  it('anota en un registro del móvil los reinicios, los permisos que faltan y los errores, para subirlos al abrir la app', () => {
    for (const line of ['Android reinicia el servicio tras matar el proceso', 'SIN PERMISO de ubicación para el envío nativo', 'no se pudo pasar a primer plano', 'app deslizada de recientes']) {
      expect(service).toContain(line)
    }
    expect(receiver).toContain('receptor: envío fallido')
    expect(patchScript).toContain('getNativeDiagnostics')
  })

  it('tras reiniciar el móvil o actualizar la app se vuelve a registrar el envío nativo (Play Services lo olvida)', () => {
    expect(manifest).toContain('android:name=".NativeBootReceiver"')
    expect(manifest).toContain('android.intent.action.BOOT_COMPLETED')
    expect(manifest).toContain('android.intent.action.MY_PACKAGE_REPLACED')
    expect(manifest).toContain('android.permission.RECEIVE_BOOT_COMPLETED')
    expect(bootReceiver).toContain('requestLocationUpdates(request, NativeLocationReceiver.pendingIntent(context))')
    expect(bootReceiver).toContain('if (token == null || token.isEmpty())')
  })

  it('el receptor intenta relanzar el servicio en primer plano (en segundo plano Android espacia las posiciones) y el servicio lo atiende', () => {
    expect(receiver).toContain('static void tryStartForegroundService(Context context, boolean force)')
    expect(receiver).toContain('Android no deja relanzar el servicio en primer plano')
    expect(service).toContain('ACTION_START_NATIVE.equals(intent.getAction())')
    expect(service).toContain('"fgs_pid"')
  })

  it('al volver a abrir la app se retira el envío nativo (no hay envíos duplicados)', () => {
    expect(service).toContain('removeWatcherById(NATIVE_WATCHER_ID);')
    expect(service).toMatch(/public IBinder onBind\(Intent intent\) \{\s*appIsBack\(\);/)
  })

  it('pide «Permitir siempre»: permiso en el manifiesto, método nativo para comprobarlo y tarjeta en Configuración → Avisos', () => {
    expect(manifest).toContain('android.permission.ACCESS_BACKGROUND_LOCATION')
    expect(patchScript).toContain('getBackgroundLocationStatus')
    expect(settings).toContain('<BackgroundLocationCard />')
  })

  it('el parche comprueba la versión y la huella del original, y se aplica al instalar y al construir el APK', () => {
    expect(patchScript).toContain("EXPECTED_VERSION = '1.2.26'")
    expect(patchScript).toContain('3eda3d169b3e16346b7e30bb037998f34aa3f2021a826dee61a4e472deeaec8c')
    expect(packageJson).toContain('node scripts/patch-background-geolocation.mjs --soft')
    expect(androidWorkflow).toContain('node scripts/patch-background-geolocation.mjs')
  })
})

describe('la app entrega y retira la llave en el momento justo', () => {
  it('al empezar a compartir se entrega la llave y al dejar de compartir se anula', () => {
    expect(sharing).toContain('void enableNativeUpload(memberId)')
    expect(sharing).toContain('void disableNativeUpload()')
  })
  it('al cerrar sesión se anula la llave antes de salir', () => {
    expect(settings).toMatch(/await disableNativeUpload\(\)\s*await supabase\.auth\.signOut\(\)/)
  })
})

describe('el aviso por distancia es de 50 m por defecto', () => {
  it('lugares nuevos con 50 m, en Pepa y en los formularios', () => {
    expect(locationActions).toContain('const DEFAULT_RADIUS_M = 50')
    expect(locationScreen).toContain('const [radiusM, setRadiusM] = useState(50)')
    expect(locationScreen).toContain('radiusM: 50, notifyArrivals: true')
  })
})
