import Subscription from '../models/Subscription';

// Web-push subscription management. Each consuming app calls subscribe()
// when the user opts into notifications, registers the service worker,
// and stores the resulting endpoint via Subscription.upsert().
//
// Mobile (Capacitor) push is a separate concern — wrap with a layer-level
// "send via web-push OR APNs/FCM" pattern when the time comes.
//
// Requires:
//   - VAPID public key in `runtimeConfig.public.vapidPublicKey`
//   - A service worker at /sw.js (consuming app provides it)

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function useNotifications() {
  const config = useRuntimeConfig();

  const isSupported = computed(() =>
    import.meta.client &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );

  async function registerServiceWorker(path = '/sw.js') {
    if (!import.meta.client || !('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register(path);
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      consoleError('useNotifications.registerServiceWorker', error);
      return null;
    }
  }

  async function subscribe(userId) {
    if (!isSupported.value || !userId) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = config.public.vapidPublicKey;
      if (!vapidKey) {
        consoleError('useNotifications.subscribe', 'VAPID public key not configured (runtimeConfig.public.vapidPublicKey)');
        return false;
      }

      // Replace any existing subscription on this device with a fresh one.
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const { endpoint, keys } = subscription.toJSON();
      await Subscription.upsert(userId, endpoint, keys.p256dh, keys.auth);
      return true;
    } catch (error) {
      consoleError('useNotifications.subscribe', error);
      return false;
    }
  }

  async function unsubscribe(userId) {
    if (!import.meta.client || !('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await Subscription.deleteForUser(userId, subscription.endpoint);
        await subscription.unsubscribe();
      }
    } catch (error) {
      consoleError('useNotifications.unsubscribe', error);
    }
  }

  return { isSupported, registerServiceWorker, subscribe, unsubscribe };
}
