/**
 * User preferences for rest-timer completion alerts.
 * Both default to enabled; user can disable from the profile page.
 */

export type RestTimerSettings = {
  vibrate: boolean;
  sound: boolean;
};

const KEY = "restTimerNotifySettings";

export const REST_TIMER_SETTINGS_EVENT = "gym:restTimerSettingsChanged";

const DEFAULT_SETTINGS: RestTimerSettings = { vibrate: true, sound: true };

export function getRestTimerSettings(): RestTimerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RestTimerSettings>;
    return {
      vibrate: typeof parsed.vibrate === "boolean" ? parsed.vibrate : DEFAULT_SETTINGS.vibrate,
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULT_SETTINGS.sound,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setRestTimerSettings(next: Partial<RestTimerSettings>): void {
  if (typeof window === "undefined") return;
  const current = getRestTimerSettings();
  const merged: RestTimerSettings = {
    vibrate: typeof next.vibrate === "boolean" ? next.vibrate : current.vibrate,
    sound: typeof next.sound === "boolean" ? next.sound : current.sound,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event(REST_TIMER_SETTINGS_EVENT));
  } catch {
    /* ignore */
  }
}
